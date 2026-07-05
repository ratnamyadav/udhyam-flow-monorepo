import { randomUUID } from 'node:crypto';
import { TRPCError } from '@trpc/server';
import { type Db, schema } from '@udyamflow/db';
import { sendSMS, sendWhatsApp } from '@udyamflow/notifications';
import { PROFESSIONS, type ProfessionId } from '@udyamflow/tokens';
import { addDays, addMinutes, startOfDay } from 'date-fns';
import { fromZonedTime, toZonedTime } from 'date-fns-tz';
import { and, eq, gte, lt, ne } from 'drizzle-orm';
import { z } from 'zod';
import { enforceRateLimit, ipKeyFromHeaders } from '../rate-limit';
import { publicProcedure, router, tenantProcedure } from '../trpc';
import { upsertCustomer } from './customer';

// A slot returned to the booking page. `start`/`end` are the canonical UTC ISO
// strings the create mutation expects; `displayTime` is the HH:mm in the
// location's timezone for rendering.
type Slot = { start: string; end: string; displayTime: string };

export const bookingRouter = router({
  listSlots: publicProcedure
    .input(
      z.object({
        orgSlug: z.string(),
        locationId: z.string(),
        resourceId: z.string(),
        serviceId: z.string().optional(),
        date: z.string().optional(), // YYYY-MM-DD, defaults to today in the location's tz
      }),
    )
    .query(async ({ ctx, input }): Promise<{ slots: Slot[]; timezone: string }> => {
      await enforceRateLimit({
        key: `slots:${ipKeyFromHeaders(ctx.headers)}:${input.orgSlug}`,
        limit: 30,
        windowSec: 60,
      });
      // 1. Resolve org + tenant settings + location.
      const [row] = await ctx.db
        .select({
          orgId: schema.organization.id,
          profession: schema.tenantSettings.profession,
          timezone: schema.location.timezone,
        })
        .from(schema.organization)
        .innerJoin(
          schema.tenantSettings,
          eq(schema.tenantSettings.organizationId, schema.organization.id),
        )
        .innerJoin(schema.location, eq(schema.location.id, input.locationId))
        .where(eq(schema.organization.slug, input.orgSlug));
      if (!row) return { slots: [], timezone: 'UTC' };

      const profession = PROFESSIONS[row.profession as ProfessionId] ?? PROFESSIONS.doctor;
      // Slot duration: per-service if specified, otherwise the profession default.
      let slotMin = profession.slotDuration;
      if (input.serviceId) {
        const [svc] = await ctx.db
          .select({ duration: schema.service.durationMin })
          .from(schema.service)
          .where(
            and(
              eq(schema.service.id, input.serviceId),
              eq(schema.service.organizationId, row.orgId),
            ),
          );
        if (svc) slotMin = svc.duration;
      }

      // 2. Pick the target date and the day-of-week in the location's tz.
      const tz = row.timezone;
      const referenceDate = input.date ? new Date(`${input.date}T00:00:00.000Z`) : new Date();
      const zonedToday = toZonedTime(referenceDate, tz);
      const dayOfWeek = zonedToday.getDay(); // 0=Sun..6=Sat

      // 3. Read the resource's working hours for that day (fallback 9–18).
      const hoursRows = await ctx.db
        .select()
        .from(schema.resourceHours)
        .where(
          and(
            eq(schema.resourceHours.resourceId, input.resourceId),
            eq(schema.resourceHours.dayOfWeek, dayOfWeek),
          ),
        );
      const hours = hoursRows[0];
      if (!hours) return { slots: [], timezone: tz };

      // 4. Day window in UTC (so DB comparisons are unambiguous).
      const zonedDayStart = startOfDay(zonedToday);
      const dayStartUtc = fromZonedTime(zonedDayStart, tz);
      const dayEndUtc = addDays(dayStartUtc, 1);

      // 5. Existing non-cancelled bookings in that window for this resource.
      const taken = await ctx.db
        .select({ slotStart: schema.booking.slotStart, slotEnd: schema.booking.slotEnd })
        .from(schema.booking)
        .where(
          and(
            eq(schema.booking.resourceId, input.resourceId),
            gte(schema.booking.slotStart, dayStartUtc),
            lt(schema.booking.slotStart, dayEndUtc),
            ne(schema.booking.status, 'cancelled'),
          ),
        );
      const takenStarts = new Set(taken.map((t) => t.slotStart.getTime()));

      // 6. Generate slot candidates and filter out the taken ones.
      const slots: Slot[] = [];
      for (let m = hours.openMin; m + slotMin <= hours.closeMin; m += slotMin) {
        const zonedSlot = addMinutes(zonedDayStart, m);
        const utcSlot = fromZonedTime(zonedSlot, tz);
        if (takenStarts.has(utcSlot.getTime())) continue;
        slots.push({
          start: utcSlot.toISOString(),
          end: addMinutes(utcSlot, slotMin).toISOString(),
          displayTime: `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`,
        });
      }

      return { slots, timezone: tz };
    }),

  create: publicProcedure
    .input(
      z.object({
        orgSlug: z.string(),
        resourceId: z.string(),
        locationId: z.string(),
        serviceId: z.string().optional(),
        customerName: z.string().min(2),
        customerEmail: z.email().optional(),
        customerPhone: z.string().optional(),
        slotStart: z.iso.datetime(),
        slotEnd: z.iso.datetime(),
        intake: z.record(z.string(), z.unknown()).optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      await enforceRateLimit({
        key: `create:${ipKeyFromHeaders(ctx.headers)}:${input.orgSlug}`,
        limit: 5,
        windowSec: 60,
        message: 'Too many booking attempts from your network. Please try again in a minute.',
      });

      const [org] = await ctx.db
        .select({ id: schema.organization.id })
        .from(schema.organization)
        .where(eq(schema.organization.slug, input.orgSlug));
      if (!org) throw new Error('Tenant not found');

      const slotStart = new Date(input.slotStart);
      const slotEnd = new Date(input.slotEnd);

      // Race recheck: if another customer claimed this slot between the
      // listSlots query and now, abort cleanly instead of double-booking.
      const conflict = await ctx.db
        .select({ id: schema.booking.id })
        .from(schema.booking)
        .where(
          and(
            eq(schema.booking.resourceId, input.resourceId),
            eq(schema.booking.slotStart, slotStart),
            ne(schema.booking.status, 'cancelled'),
          ),
        );
      if (conflict.length > 0) {
        throw new Error('That slot was just taken — please pick another.');
      }

      // Dedupe + link customer first so /customers shows them and repeat
      // bookers don't get duplicate rows. Errors here would block the
      // booking, so we let them propagate — bad data is worse than a clean
      // failure the user can retry.
      const customerId = await upsertCustomer(ctx.db, org.id, {
        name: input.customerName,
        email: input.customerEmail,
        phone: input.customerPhone,
      });

      const id = `bkg_${randomUUID()}`;
      await ctx.db.insert(schema.booking).values({
        id,
        organizationId: org.id,
        resourceId: input.resourceId,
        locationId: input.locationId,
        serviceId: input.serviceId,
        customerId,
        customerName: input.customerName,
        customerEmail: input.customerEmail,
        customerPhone: input.customerPhone,
        slotStart,
        slotEnd,
        intake: input.intake,
        status: 'confirmed',
      });

      const referenceCode = id.slice(-6).toUpperCase();
      // Fire notifications best-effort — never block the booking write.
      void notifyConfirmed(ctx.db, {
        organizationId: org.id,
        resourceId: input.resourceId,
        customerName: input.customerName,
        customerPhone: input.customerPhone,
        slotStart,
        referenceCode,
      });
      return { id, referenceCode };
    }),

  listToday: tenantProcedure.query(async ({ ctx }) => {
    const start = new Date();
    start.setHours(0, 0, 0, 0);
    const end = new Date(start);
    end.setDate(end.getDate() + 1);
    return ctx.db
      .select()
      .from(schema.booking)
      .where(
        and(
          eq(schema.booking.organizationId, ctx.organizationId),
          gte(schema.booking.slotStart, start),
          lt(schema.booking.slotStart, end),
          ne(schema.booking.status, 'cancelled'),
        ),
      );
  }),

  list: tenantProcedure
    .input(
      z
        .object({
          from: z.iso.datetime().optional(),
          to: z.iso.datetime().optional(),
          resourceId: z.string().optional(),
          status: z.enum(['confirmed', 'cancelled', 'completed', 'no_show']).optional(),
          limit: z.number().int().min(1).max(200).default(100),
        })
        .default({ limit: 100 }),
    )
    .query(async ({ ctx, input }) => {
      // Default window = last 30 days through 30 days out.
      const now = new Date();
      const from = input.from
        ? new Date(input.from)
        : new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
      const to = input.to ? new Date(input.to) : new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);

      const conditions = [
        eq(schema.booking.organizationId, ctx.organizationId),
        gte(schema.booking.slotStart, from),
        lt(schema.booking.slotStart, to),
      ];
      if (input.resourceId) {
        conditions.push(eq(schema.booking.resourceId, input.resourceId));
      }
      if (input.status) {
        conditions.push(eq(schema.booking.status, input.status));
      }

      return ctx.db
        .select()
        .from(schema.booking)
        .where(and(...conditions))
        .orderBy(schema.booking.slotStart)
        .limit(input.limit);
    }),

  cancel: tenantProcedure
    .input(z.object({ id: z.string(), reason: z.string().optional() }))
    .mutation(async ({ ctx, input }) => {
      const result = await updateStatus(ctx, input.id, 'cancelled');
      // Best-effort cancellation notice.
      void notifyCancelled(ctx.db, ctx.organizationId, input.id);
      return result;
    }),

  markNoShow: tenantProcedure
    .input(z.object({ id: z.string() }))
    .mutation(({ ctx, input }) => updateStatus(ctx, input.id, 'no_show')),

  markComplete: tenantProcedure
    .input(z.object({ id: z.string() }))
    .mutation(({ ctx, input }) => updateStatus(ctx, input.id, 'completed')),
});

// Resolves whether SMS/WhatsApp are enabled + sends them, swallowing all
// errors. We never want notification failure to roll back a booking write.
async function notifyConfirmed(
  db: Db,
  args: {
    organizationId: string;
    resourceId: string;
    customerName: string;
    customerPhone?: string;
    slotStart: Date;
    referenceCode: string;
  },
) {
  if (!args.customerPhone) return;
  try {
    const [settings] = await db
      .select({
        enableSms: schema.tenantSettings.enableSms,
        enableWhatsapp: schema.tenantSettings.enableWhatsapp,
      })
      .from(schema.tenantSettings)
      .where(eq(schema.tenantSettings.organizationId, args.organizationId));
    if (!settings) return;

    const [res] = await db
      .select({ name: schema.resource.name })
      .from(schema.resource)
      .where(eq(schema.resource.id, args.resourceId));
    const when = args.slotStart.toLocaleString('en-IN', {
      day: 'numeric',
      month: 'short',
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
    });

    if (settings.enableSms) {
      await sendSMS({
        to: args.customerPhone,
        body: `Hi ${args.customerName.split(' ')[0]}, your appointment with ${res?.name ?? 'us'} on ${when} is confirmed. Ref: ${args.referenceCode}`,
        variables: {
          name: args.customerName.split(' ')[0] ?? args.customerName,
          resource: res?.name ?? '',
          when,
          ref: args.referenceCode,
        },
      });
    }
    if (settings.enableWhatsapp) {
      await sendWhatsApp({
        to: args.customerPhone,
        template: 'booking_confirmed',
        params: [
          args.customerName.split(' ')[0] ?? args.customerName,
          res?.name ?? '',
          when,
          args.referenceCode,
        ],
      });
    }
  } catch (err) {
    console.error('notifyConfirmed failed', err);
  }
}

async function notifyCancelled(db: Db, organizationId: string, bookingId: string) {
  try {
    const [b] = await db
      .select({
        customerName: schema.booking.customerName,
        customerPhone: schema.booking.customerPhone,
        slotStart: schema.booking.slotStart,
        resourceId: schema.booking.resourceId,
      })
      .from(schema.booking)
      .where(eq(schema.booking.id, bookingId));
    if (!b?.customerPhone) return;
    const [settings] = await db
      .select({
        enableSms: schema.tenantSettings.enableSms,
        enableWhatsapp: schema.tenantSettings.enableWhatsapp,
      })
      .from(schema.tenantSettings)
      .where(eq(schema.tenantSettings.organizationId, organizationId));
    if (!settings) return;

    const when = b.slotStart.toLocaleString('en-IN', {
      day: 'numeric',
      month: 'short',
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
    });

    if (settings.enableSms) {
      await sendSMS({
        to: b.customerPhone,
        body: `Hi ${b.customerName.split(' ')[0]}, your appointment on ${when} has been cancelled. Please rebook if needed.`,
      });
    }
    if (settings.enableWhatsapp) {
      await sendWhatsApp({
        to: b.customerPhone,
        template: 'booking_cancelled',
        params: [b.customerName.split(' ')[0] ?? b.customerName, when],
      });
    }
  } catch (err) {
    console.error('notifyCancelled failed', err);
  }
}

async function updateStatus(
  ctx: { db: Db; organizationId: string },
  id: string,
  status: 'cancelled' | 'completed' | 'no_show',
) {
  const [owned] = await ctx.db
    .select({ id: schema.booking.id })
    .from(schema.booking)
    .where(and(eq(schema.booking.id, id), eq(schema.booking.organizationId, ctx.organizationId)));
  if (!owned) throw new TRPCError({ code: 'NOT_FOUND', message: 'Booking not found' });
  await ctx.db.update(schema.booking).set({ status }).where(eq(schema.booking.id, id));
  return { ok: true, status };
}
