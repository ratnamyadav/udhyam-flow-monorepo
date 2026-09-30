import { db, schema } from '@udyamflow/db';
import { asc, eq } from 'drizzle-orm';
import Link from 'next/link';
import { formatRupees, requireAdmin } from '@/lib/admin';
import { setPlatformGstThreshold, setStoreGstThreshold } from './actions';

// GST thresholds: the platform default ("charge GST only above ₹X") and
// per-store overrides. Stores can also change their own value in the main
// app (Settings → Invoicing); both edit tenant_settings.gst_threshold_cents.

export const dynamic = 'force-dynamic';

const inputCls =
  'h-9 rounded-md border border-border bg-surface px-2.5 text-[13px] text-ink w-28 font-mono';

export default async function GstAdminPage({
  searchParams,
}: {
  searchParams: Promise<{ saved?: string; error?: string }>;
}) {
  await requireAdmin();
  const { saved, error } = await searchParams;

  const [platform] = await db
    .select({ cents: schema.platformSettings.gstThresholdCents })
    .from(schema.platformSettings)
    .where(eq(schema.platformSettings.id, schema.PLATFORM_SETTINGS_ID));
  const platformCents = platform?.cents ?? null;

  const stores = await db
    .select({
      id: schema.organization.id,
      name: schema.organization.name,
      slug: schema.organization.slug,
      gstRegistered: schema.tenantSettings.gstRegistered,
      gstin: schema.tenantSettings.gstin,
      threshold: schema.tenantSettings.gstThresholdCents,
    })
    .from(schema.organization)
    .leftJoin(
      schema.tenantSettings,
      eq(schema.tenantSettings.organizationId, schema.organization.id),
    )
    .orderBy(asc(schema.organization.name));

  return (
    <div className="min-h-screen bg-bg">
      <div className="px-12 py-10 max-w-[1100px] mx-auto space-y-8">
        <div>
          <Link href="/dashboard" className="text-[12px] text-ink-mute hover:text-ink font-mono">
            ← Dashboard
          </Link>
          <h1 className="text-[32px] font-medium tracking-tight text-ink mt-3">GST thresholds</h1>
          <p className="text-[14px] text-ink-mute mt-2 max-w-[680px] leading-relaxed">
            Built-in and Zoho Books invoices charge GST only when a booking's value is above the
            threshold; at or below it they're issued as a Bill of Supply with no GST. A store's own
            setting wins over the platform default. GST-registered businesses normally owe GST on
            every taxable sale, so stores should confirm with their CA before relying on a limit.
          </p>
        </div>

        {error && <div className="text-[13px] text-danger">{error}</div>}

        <form
          action={setPlatformGstThreshold}
          className="bg-surface border border-border rounded-xl p-5 flex items-end gap-4"
        >
          <div>
            <div className="text-[15px] font-medium text-ink">Platform default</div>
            <div className="text-[12px] text-ink-mute mt-1">
              Currently{' '}
              {platformCents
                ? `only above ${formatRupees(platformCents)}`
                : 'GST on every transaction'}
              . Leave empty for every transaction.
            </div>
          </div>
          <label className="ml-auto flex items-center gap-2 text-[13px] text-ink">
            Above ₹
            <input
              name="threshold"
              inputMode="decimal"
              defaultValue={platformCents ? String(platformCents / 100) : ''}
              className={inputCls}
            />
          </label>
          <button
            type="submit"
            className="h-9 px-3 rounded-md bg-ink text-bg text-[13px] font-medium hover:bg-ink/90"
          >
            Save default
          </button>
          {saved === 'platform' && <span className="text-[12px] text-ink-mute">Saved.</span>}
        </form>

        <div className="bg-surface border border-border rounded-xl overflow-hidden">
          <div className="grid grid-cols-[1fr_180px_160px_1fr] px-5 py-3 border-b border-border text-[10px] uppercase tracking-wider text-ink-soft font-mono">
            <div>Store</div>
            <div>GST</div>
            <div>Effective limit</div>
            <div>Override</div>
          </div>
          {stores.length === 0 && (
            <div className="p-10 text-center text-[13px] text-ink-mute">No stores yet.</div>
          )}
          {stores.map((s) => {
            const inherits = s.threshold === null;
            const effective = inherits ? platformCents : s.threshold || null;
            return (
              <form
                key={s.id}
                action={setStoreGstThreshold}
                className="grid grid-cols-[1fr_180px_160px_1fr] px-5 py-3 border-t border-border first:border-t-0 items-center gap-2"
              >
                <input type="hidden" name="organizationId" value={s.id} />
                <div>
                  <div className="text-[14px] font-medium text-ink">{s.name}</div>
                  <div className="text-[12px] text-ink-mute font-mono">{s.slug}</div>
                </div>
                <div className="text-[12px] text-ink-mute">
                  {s.gstRegistered ? (
                    <span className="font-mono">{s.gstin}</span>
                  ) : (
                    'Not registered'
                  )}
                </div>
                <div className="text-[13px] text-ink">
                  {effective ? `Above ${formatRupees(effective)}` : 'Every transaction'}
                  <div className="text-[11px] text-ink-soft">
                    {inherits ? 'platform default' : 'store setting'}
                  </div>
                </div>
                <div className="flex items-center gap-2 text-[12px] text-ink">
                  <select
                    name="mode"
                    defaultValue={inherits ? 'inherit' : 'custom'}
                    className="h-9 rounded-md border border-border bg-surface px-2 text-[12px] text-ink"
                  >
                    <option value="inherit">Use default</option>
                    <option value="custom">Above ₹</option>
                  </select>
                  <input
                    name="threshold"
                    inputMode="decimal"
                    placeholder="0"
                    defaultValue={s.threshold ? String(s.threshold / 100) : ''}
                    className={inputCls}
                  />
                  <button
                    type="submit"
                    className="h-9 px-3 rounded-md border border-border-strong text-[12px] hover:bg-surface-mute"
                  >
                    Save
                  </button>
                  {saved === s.id && <span className="text-ink-mute">Saved.</span>}
                </div>
              </form>
            );
          })}
        </div>
      </div>
    </div>
  );
}
