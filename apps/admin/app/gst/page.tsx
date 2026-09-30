import {
  financialYearRange,
  formatLakh,
  GST_LIMIT_SERVICES_CENTS,
  resolveTurnoverLimit,
  turnoverLevel,
} from '@udyamflow/api/gst';
import { getFyTurnover } from '@udyamflow/api/gst-turnover';
import { db, schema } from '@udyamflow/db';
import { asc, eq } from 'drizzle-orm';
import Link from 'next/link';
import { requireAdmin } from '@/lib/admin';
import { setPlatformTurnoverLimit, setStoreTurnoverLimit } from './actions';

// GST registration limits: the platform default (₹20 lakh unless changed)
// and per-store overrides, with each store's financial-year turnover
// through UdyamFlow. Stores over their limit without a GSTIN are listed
// first. Stores can also set their own limit in Settings → Invoicing.

export const dynamic = 'force-dynamic';

const inputCls =
  'h-9 rounded-md border border-border bg-surface px-2.5 text-[13px] text-ink w-32 font-mono';

const SOURCE = {
  store: 'store setting',
  state: 'state rule (₹10 lakh)',
  platform: 'platform default',
  statutory: 'statutory',
} as const;

export default async function GstAdminPage({
  searchParams,
}: {
  searchParams: Promise<{ saved?: string; error?: string }>;
}) {
  await requireAdmin();
  const { saved, error } = await searchParams;
  const fy = financialYearRange(new Date());

  const [[platform], rows, turnover] = await Promise.all([
    db
      .select({ cents: schema.platformSettings.gstTurnoverLimitCents })
      .from(schema.platformSettings)
      .where(eq(schema.platformSettings.id, schema.PLATFORM_SETTINGS_ID)),
    db
      .select({
        id: schema.organization.id,
        name: schema.organization.name,
        slug: schema.organization.slug,
        registered: schema.tenantSettings.gstRegistered,
        gstin: schema.tenantSettings.gstin,
        stateCode: schema.tenantSettings.gstStateCode,
        storeCents: schema.tenantSettings.gstTurnoverLimitCents,
      })
      .from(schema.organization)
      .leftJoin(
        schema.tenantSettings,
        eq(schema.tenantSettings.organizationId, schema.organization.id),
      )
      .orderBy(asc(schema.organization.name)),
    getFyTurnover(db),
  ]);
  const platformCents = platform?.cents ?? null;

  const RANK = { exceeded: 0, approaching: 1, ok: 2 } as const;
  const stores = rows
    .map((s) => {
      const limit = resolveTurnoverLimit({
        storeCents: s.storeCents,
        platformCents,
        stateCode: s.stateCode,
      });
      const cents = turnover.get(s.id) ?? 0;
      return {
        ...s,
        ...limit,
        turnoverCents: cents,
        level: turnoverLevel(cents, limit.limitCents),
      };
    })
    .sort((a, b) => {
      // Unregistered stores that need attention first.
      const ra = a.registered ? 3 : RANK[a.level];
      const rb = b.registered ? 3 : RANK[b.level];
      return ra - rb || b.turnoverCents - a.turnoverCents;
    });
  const mustRegister = stores.filter((s) => !s.registered && s.level === 'exceeded').length;

  return (
    <div className="min-h-screen bg-bg">
      <div className="px-12 py-10 max-w-[1100px] mx-auto space-y-8">
        <div>
          <Link href="/dashboard" className="text-[12px] text-ink-mute hover:text-ink font-mono">
            ← Dashboard
          </Link>
          <h1 className="text-[32px] font-medium tracking-tight text-ink mt-3">
            GST registration limits
          </h1>
          <p className="text-[14px] text-ink-mute mt-2 max-w-[700px] leading-relaxed">
            Service businesses must register for GST within 30 days of their turnover crossing the
            limit in a financial year — ₹20 lakh, or ₹10 lakh in Manipur, Mizoram, Nagaland and
            Tripura. Unregistered stores issue Bills of Supply and are warned at 80% and when they
            cross; registered stores charge GST on every invoice. Turnover below is FY {fy.label},
            from paid INR bookings and membership payments through UdyamFlow only.
          </p>
        </div>

        {error && <div className="text-[13px] text-danger">{error}</div>}
        {mustRegister > 0 && (
          <div className="text-[13px] text-danger">
            {mustRegister} store{mustRegister === 1 ? ' has' : 's have'} crossed the limit without a
            GSTIN.
          </div>
        )}

        <form
          action={setPlatformTurnoverLimit}
          className="bg-surface border border-border rounded-xl p-5 flex items-end gap-4"
        >
          <div>
            <div className="text-[15px] font-medium text-ink">Platform default</div>
            <div className="text-[12px] text-ink-mute mt-1">
              Currently {formatLakh(platformCents ?? GST_LIMIT_SERVICES_CENTS)}
              {platformCents ? '' : ' (statutory)'}. Leave empty for the statutory ₹20 lakh. The ₹10
              lakh state rule and store settings take precedence.
            </div>
          </div>
          <label className="ml-auto flex items-center gap-2 text-[13px] text-ink">
            ₹
            <input
              name="limit"
              inputMode="decimal"
              placeholder="2000000"
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
          <div className="grid grid-cols-[1fr_150px_170px_170px_1fr] px-5 py-3 border-b border-border text-[10px] uppercase tracking-wider text-ink-soft font-mono">
            <div>Store</div>
            <div>GST</div>
            <div>FY turnover</div>
            <div>Limit</div>
            <div>Store limit override</div>
          </div>
          {stores.length === 0 && (
            <div className="p-10 text-center text-[13px] text-ink-mute">No stores yet.</div>
          )}
          {stores.map((s) => {
            const flag = !s.registered && s.level !== 'ok';
            return (
              <form
                key={s.id}
                action={setStoreTurnoverLimit}
                className="grid grid-cols-[1fr_150px_170px_170px_1fr] px-5 py-3 border-t border-border first:border-t-0 items-center gap-2"
              >
                <input type="hidden" name="organizationId" value={s.id} />
                <div>
                  <div className="text-[14px] font-medium text-ink">{s.name}</div>
                  <div className="text-[12px] text-ink-mute font-mono">{s.slug}</div>
                </div>
                <div className="text-[12px] text-ink-mute">
                  {s.registered ? <span className="font-mono">{s.gstin}</span> : 'Not registered'}
                </div>
                <div className={`text-[13px] ${flag ? 'text-danger' : 'text-ink'}`}>
                  {formatLakh(s.turnoverCents)}
                  {flag && (
                    <div className="text-[11px]">
                      {s.level === 'exceeded' ? 'Must register' : 'Approaching limit'}
                    </div>
                  )}
                </div>
                <div className="text-[13px] text-ink">
                  {formatLakh(s.limitCents)}
                  <div className="text-[11px] text-ink-soft">{SOURCE[s.source]}</div>
                </div>
                <div className="flex items-center gap-2 text-[12px] text-ink">
                  ₹
                  <input
                    name="limit"
                    inputMode="decimal"
                    placeholder="default"
                    defaultValue={s.storeCents ? String(s.storeCents / 100) : ''}
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
