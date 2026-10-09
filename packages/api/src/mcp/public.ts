import { McpServer } from '@modelcontextprotocol/server';
import { TRPCError } from '@trpc/server';
import { type Db, schema } from '@udyamflow/db';
import { and, eq, ilike, inArray, isNull, ne, or } from 'drizzle-orm';
import { z } from 'zod';
import { formatInTz, hhmmToMinutes, wallTimeToUtc } from '../lib/time';
import { dateStr, hhmm } from '../lib/validate';
import { appRouter } from '../router';
import { bookingUrlFor } from '../source';
import type { Context } from '../trpc';
import { money, run } from './shared';

// The public MCP server: lets a customer's own assistant (ChatGPT, Claude,
// …) find a business and book it, with no sign-in — the same things the
// public booking page offers, through the same public procedures and rate
// limits. Businesses can opt out (tenant_settings.assistant_booking).
//
// ponytail: rate limits key on the caller's IP, which for hosted assistants
// is the platform's shared egress — e.g. 5 bookings/min per business from
// all ChatGPT users. Fine at small-business volume; key on the assistant's
// verified identity if it ever bites.

const READ = { readOnlyHint: true, openWorldHint: false } as const;
const business = z.string().min(1).max(100).describe('The business id from find_business.');

export function createPublicMcpServer(opts: {
  db: Db;
  headers: Headers;
  appUrl: string;
}): McpServer {
  const { db } = opts;
  const caller = appRouter.createCaller({
    db,
    headers: opts.headers,
    session: null,
  } as Context);

  // Opted-out businesses are invisible here (their booking page still works).
  async function assertListed(slug: string) {
    const [row] = await db
      .select({ enabled: schema.tenantSettings.assistantBooking })
      .from(schema.organization)
      .leftJoin(
        schema.tenantSettings,
        eq(schema.tenantSettings.organizationId, schema.organization.id),
      )
      .where(eq(schema.organization.slug, slug));
    if (!row || row.enabled === false) {
      throw new TRPCError({ code: 'NOT_FOUND', message: 'Business not found.' });
    }
  }

  const server = new McpServer(
    { name: 'udyamflow-booking', title: 'UdyamFlow booking', version: '1.0.0' },
    {
      instructions: [
        'Book appointments at clinics, tutors, salons, sports venues and other businesses that use UdyamFlow.',
        'Use find_business, then get_booking_options, find_open_times and book_appointment.',
        "Dates are YYYY-MM-DD and times 24-hour HH:mm in the business's local time.",
        "Before booking, confirm the business, service, time and the customer's name and phone or email with the user.",
      ].join(' '),
    },
  );

  server.registerTool(
    'find_business',
    {
      title: 'Find a business',
      description:
        'Search UdyamFlow businesses by name. Returns up to 5 matches with their id, type and locations.',
      inputSchema: z.object({ query: z.string().trim().min(2).max(100) }),
      annotations: READ,
    },
    ({ query }) =>
      run(async () => {
        const like = `%${query.replace(/[%_\\]/g, (c) => `\\${c}`)}%`;
        const orgs = await db
          .select({
            id: schema.organization.id,
            slug: schema.organization.slug,
            name: schema.organization.name,
            profession: schema.tenantSettings.profession,
          })
          .from(schema.organization)
          .leftJoin(
            schema.tenantSettings,
            eq(schema.tenantSettings.organizationId, schema.organization.id),
          )
          .where(
            and(
              or(ilike(schema.organization.name, like), eq(schema.organization.slug, query)),
              or(
                isNull(schema.tenantSettings.assistantBooking),
                ne(schema.tenantSettings.assistantBooking, false),
              ),
            ),
          )
          .limit(5);
        const locations = orgs.length
          ? await db
              .select({
                organizationId: schema.location.organizationId,
                name: schema.location.name,
                address: schema.location.address,
              })
              .from(schema.location)
              .where(
                and(
                  inArray(
                    schema.location.organizationId,
                    orgs.map((o) => o.id),
                  ),
                  isNull(schema.location.archivedAt),
                ),
              )
          : [];
        return orgs.map((o) => ({
          business: o.slug,
          name: o.name,
          type: o.profession ?? null,
          bookingPage: bookingUrlFor(opts.appUrl, o.slug),
          locations: locations
            .filter((l) => l.organizationId === o.id)
            .map((l) => ({ name: l.name, address: l.address })),
        }));
      }),
  );

  server.registerTool(
    'get_booking_options',
    {
      title: 'Services and staff',
      description: "A business's locations, staff (staffId) and services (serviceId) with prices.",
      inputSchema: z.object({ business }),
      annotations: READ,
    },
    ({ business: slug }) =>
      run(async () => {
        await assertListed(slug);
        const [locations, staff, services] = await Promise.all([
          caller.location.listForTenant({ orgSlug: slug }),
          caller.resource.listForTenant({ orgSlug: slug }),
          caller.service.listForTenant({ orgSlug: slug }),
        ]);
        return {
          locations: locations.map((l) => ({
            locationId: l.id,
            name: l.name,
            address: l.address,
            timezone: l.timezone,
          })),
          staff: staff.map((r) => ({
            staffId: r.id,
            name: r.name,
            title: r.title,
            locationId: r.locationId,
          })),
          services: services.map((s) => ({
            serviceId: s.id,
            name: s.name,
            description: s.description,
            durationMin: s.durationMin,
            price: money(s.priceCents, s.currency) ?? 'free',
            online: s.isOnline,
            // Empty = every staff member offers it.
            staffIds: s.resourceIds,
          })),
        };
      }),
  );

  server.registerTool(
    'find_open_times',
    {
      title: 'Free times',
      description:
        'Free appointment times on a date (up to 90 days ahead), per staff member. Pass a serviceId when the business has services.',
      inputSchema: z.object({
        business,
        date: dateStr,
        serviceId: z.string().optional(),
        staffId: z.string().optional(),
      }),
      annotations: READ,
    },
    ({ business: slug, date, serviceId, staffId }) =>
      run(async () => {
        await assertListed(slug);
        const [staff, services] = await Promise.all([
          caller.resource.listForTenant({ orgSlug: slug }),
          caller.service.listForTenant({ orgSlug: slug }),
        ]);
        const service = serviceId ? services.find((s) => s.id === serviceId) : undefined;
        if (serviceId && !service) {
          throw new TRPCError({ code: 'NOT_FOUND', message: 'That service is not offered.' });
        }
        const eligible = staff
          .filter((r) => !staffId || r.id === staffId)
          .filter(
            (r) =>
              !service || service.resourceIds.length === 0 || service.resourceIds.includes(r.id),
          )
          .slice(0, 10);
        const results = [];
        for (const r of eligible) {
          const res = await caller.booking.listSlots({
            orgSlug: slug,
            locationId: r.locationId,
            resourceId: r.id,
            serviceId,
            date,
          });
          results.push({
            staffId: r.id,
            name: r.name,
            timezone: res.timezone,
            times: res.slots.map((s) => s.displayTime),
          });
        }
        return { date, staff: results };
      }),
  );

  server.registerTool(
    'book_appointment',
    {
      title: 'Book an appointment',
      description:
        "Book one of the free times from find_open_times for the user. Needs the customer's name and a phone number or email. Paid services return a payment link the customer must open to confirm.",
      inputSchema: z
        .object({
          business,
          staffId: z.string(),
          serviceId: z.string().optional(),
          date: dateStr,
          time: hhmm,
          customerName: z.string().trim().min(2).max(120),
          customerPhone: z.string().trim().min(6).max(32).optional(),
          customerEmail: z.email().optional(),
        })
        .refine((v) => v.customerPhone || v.customerEmail, {
          message: 'Give a phone number or an email so the business can reach the customer.',
        }),
      annotations: { readOnlyHint: false, destructiveHint: false, openWorldHint: true },
    },
    (input) =>
      run(async () => {
        await assertListed(input.business);
        const [staff, locations] = await Promise.all([
          caller.resource.listForTenant({ orgSlug: input.business }),
          caller.location.listForTenant({ orgSlug: input.business }),
        ]);
        const resource = staff.find((r) => r.id === input.staffId);
        const location = locations.find((l) => l.id === resource?.locationId);
        if (!resource || !location) {
          throw new TRPCError({ code: 'NOT_FOUND', message: 'That staff member was not found.' });
        }
        const start = wallTimeToUtc(input.date, hhmmToMinutes(input.time), location.timezone);
        const res = await caller.booking.create({
          orgSlug: input.business,
          locationId: location.id,
          resourceId: resource.id,
          serviceId: input.serviceId,
          customerName: input.customerName,
          customerPhone: input.customerPhone,
          customerEmail: input.customerEmail,
          slotStart: start.toISOString(),
          source: 'ai-assistant',
        });
        const app = opts.appUrl.replace(/\/+$/, '');
        return {
          bookingId: res.id,
          reference: res.referenceCode,
          status: res.status,
          with: resource.name,
          date: input.date,
          time: input.time,
          timezone: location.timezone,
          price: money(res.amountCents, res.currency),
          meetingUrl: res.meetingUrl,
          ...(res.requiresPayment
            ? {
                payUrl: `${app}/pay/${res.id}`,
                payBefore: res.holdExpiresAt
                  ? formatInTz(res.holdExpiresAt, location.timezone, 'yyyy-MM-dd HH:mm')
                  : null,
                note: 'The time is held until payment; it is released if not paid in time.',
              }
            : {}),
          statusPage: `${app}/book/${encodeURIComponent(input.business)}/confirmation?booking=${encodeURIComponent(res.id)}`,
        };
      }),
  );

  server.registerTool(
    'check_booking',
    {
      title: 'Booking status',
      description: 'Status of a booking made with book_appointment.',
      inputSchema: z.object({ bookingId: z.string().min(1).max(100) }),
      annotations: READ,
    },
    ({ bookingId }) =>
      run(async () => {
        const b = await caller.booking.publicStatus({ bookingId });
        return {
          bookingId: b.id,
          reference: b.referenceCode,
          business: b.orgName,
          status: b.status,
          payment: b.paymentStatus,
          with: b.resourceName,
          service: b.serviceName,
          date: formatInTz(b.slotStart, b.timezone, 'yyyy-MM-dd'),
          time: formatInTz(b.slotStart, b.timezone, 'HH:mm'),
          timezone: b.timezone,
          meetingUrl: b.meetingUrl,
        };
      }),
  );

  return server;
}
