import { assertAccountCanBeDeleted } from '@udyamflow/auth/account-deletion';
import { validateProductionAuth } from '@udyamflow/auth/security';
import { schema } from '@udyamflow/db';
import { eq } from 'drizzle-orm';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { scrubDiagnosticEvent } from '../../env/src/privacy';
import { bookingManagementToken, verifyBookingManagementToken } from '../src/booking-management';
import { dateStr } from '../src/lib/validate';
import { addMember, createTestDb, publicCaller, seedOrg, slotOn, uid } from './helpers/harness';

type Db = Awaited<ReturnType<typeof createTestDb>>;
let db: Db;
beforeAll(async () => {
  db = await createTestDb();
});
afterEach(() => vi.unstubAllEnvs());

const env = {
  NODE_ENV: 'production',
  BETTER_AUTH_SECRET: 'a-unique-test-only-secret-of-at-least-32-chars',
  BETTER_AUTH_URL: 'https://app.example.com',
  NEXT_PUBLIC_APP_URL: 'https://app.example.com',
  NEXT_PUBLIC_AUTH_URL: 'https://app.example.com',
};
describe('production auth', () => {
  it('migrates invitations with the timestamp required by upgraded BetterAuth', async () => {
    const f = await seedOrg(db);
    const [invite] = await db
      .insert(schema.invitation)
      .values({
        id: uid('invite'),
        email: 'invite@example.test',
        inviterId: f.ownerId,
        organizationId: f.orgId,
        expiresAt: new Date(Date.now() + 86400000),
      })
      .returning();
    expect(invite?.createdAt).toBeInstanceOf(Date);
  });
  it('scrubs customer payloads and management tokens from diagnostics', () => {
    const event = {
      user: { email: 'customer@example.test' },
      request: {
        url: 'https://example.test/manage-booking?token=private-link#fragment',
        data: { intake: 'private notes' },
        cookies: 'session=private',
        query_string: 'token=private-link',
        headers: {
          Cookie: 'session=private',
          Authorization: 'Bearer private',
          Accept: 'application/json',
        },
      },
    };
    const clean = scrubDiagnosticEvent(event);
    expect(clean.user).toBeUndefined();
    expect(clean.request).toMatchObject({
      url: 'https://example.test/manage-booking',
      data: undefined,
      cookies: undefined,
      query_string: undefined,
      headers: { Accept: 'application/json' },
    });
    expect(clean.request.headers).not.toHaveProperty('Cookie');
    expect(clean.request.headers).not.toHaveProperty('Authorization');
  });
  it('rejects missing/weak secrets and non-HTTPS endpoints', () => {
    expect(() => validateProductionAuth(env)).not.toThrow();
    expect(() => validateProductionAuth({ ...env, BETTER_AUTH_SECRET: undefined })).toThrow();
    expect(() =>
      validateProductionAuth({
        ...env,
        BETTER_AUTH_SECRET: 'change-me-this-is-an-unsafe-secret-value',
      }),
    ).toThrow();
    expect(() =>
      validateProductionAuth({ ...env, BETTER_AUTH_URL: 'http://localhost:3000' }),
    ).toThrow();
    expect(() =>
      validateProductionAuth({ ...env, ADMIN_APP_URL: 'https://user:pass@example.com' }),
    ).toThrow();
  });
  it('rejects impossible calendar dates', () => {
    expect(dateStr.safeParse('2026-02-30').success).toBe(false);
    expect(dateStr.safeParse('2028-02-29').success).toBe(true);
  });
  it('blocks deleting workspace owners and permits ordinary members', async () => {
    const f = await seedOrg(db);
    await expect(assertAccountCanBeDeleted(db, f.ownerId)).rejects.toThrow(
      'Transfer workspace ownership',
    );
    const member = uid('usr');
    await addMember(db, f.orgId, member, 'member');
    await expect(assertAccountCanBeDeleted(db, member)).resolves.toBeUndefined();
  });
});
describe('customer booking management', () => {
  it('rejects expired/tampered/wrong-booking capabilities', () => {
    vi.stubEnv('BETTER_AUTH_SECRET', env.BETTER_AUTH_SECRET);
    const start = new Date(Date.now() + 86_400_000);
    const token = bookingManagementToken('bkg_a', start)!;
    expect(verifyBookingManagementToken('bkg_a', token)).toBe(true);
    expect(verifyBookingManagementToken('bkg_b', token)).toBe(false);
    expect(verifyBookingManagementToken('bkg_a', `${token.slice(0, -1)}!`)).toBe(false);
    expect(verifyBookingManagementToken('bkg_a', token, start.getTime() + 86_400_001)).toBe(false);
    vi.stubEnv('BETTER_AUTH_SECRET', 'short');
    expect(bookingManagementToken('bkg_a', start)).toBeNull();
  });
  it('moves the same booking without changing payment snapshots, refuses occupied slots and releases cancellation', async () => {
    vi.stubEnv('BETTER_AUTH_SECRET', env.BETTER_AUTH_SECRET);
    const f = await seedOrg(db);
    const make = (hour: string) =>
      publicCaller(db).booking.create({
        orgSlug: f.slug,
        locationId: f.locationId,
        resourceId: f.resourceId,
        customerName: 'Synthetic Customer',
        slotStart: slotOn(f, 3, hour).start.toISOString(),
      });
    const booking = await make('10:00');
    const occupied = await make('11:00');
    const token = bookingManagementToken(booking.id, slotOn(f, 3, '10:00').start)!;
    const caller = publicCaller(db);
    await expect(
      caller.booking.reschedulePublic({
        bookingId: booking.id,
        token,
        slotStart: slotOn(f, 3, '11:00').start.toISOString(),
      }),
    ).rejects.toMatchObject({ code: 'CONFLICT' });
    await expect(
      caller.booking.reschedulePublic({
        bookingId: occupied.id,
        token,
        slotStart: slotOn(f, 3, '12:00').start.toISOString(),
      }),
    ).rejects.toMatchObject({ code: 'FORBIDDEN' });
    await caller.booking.reschedulePublic({
      bookingId: booking.id,
      token,
      slotStart: slotOn(f, 3, '12:00').start.toISOString(),
    });
    const [row] = await db.select().from(schema.booking).where(eq(schema.booking.id, booking.id));
    expect(row!.slotStart.toISOString()).toBe(slotOn(f, 3, '12:00').start.toISOString());
    expect(row).toMatchObject({ amountCents: 0, status: 'confirmed' });
    await caller.booking.cancelPublic({ bookingId: booking.id, token });
    await expect(
      caller.booking.cancelPublic({ bookingId: booking.id, token }),
    ).rejects.toMatchObject({ code: 'PRECONDITION_FAILED' });
    const slots = await caller.booking.listSlots({
      orgSlug: f.slug,
      locationId: f.locationId,
      resourceId: f.resourceId,
      date: slotOn(f, 3, '12:00').date,
    });
    expect(slots.slots.some((s) => s.displayTime === '12:00')).toBe(true);
  });
});
