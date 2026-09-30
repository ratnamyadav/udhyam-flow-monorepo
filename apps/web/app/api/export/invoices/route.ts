import {
  DEFAULT_TALLY_LEDGERS,
  loadExportRows,
  type TallyLedgers,
  toCsv,
  toTallyXml,
} from '@udyamflow/api/export';
import { requireOrgAdmin } from '@udyamflow/api/invoicing';
import { db } from '@udyamflow/db';
import type { NextRequest } from 'next/server';
import { getActiveOrgId, getSession } from '@/lib/auth-server';

// Authed download of issued invoices for the tenant's accountant:
//   GET /api/export/invoices?format=csv|tally&from=YYYY-MM-DD&to=YYYY-MM-DD
// Optional Tally ledger names: sales, cgst, sgst, igst, receipts.

const DAY = /^\d{4}-\d{2}-\d{2}$/;

export async function GET(req: NextRequest) {
  const session = await getSession();
  if (!session) return new Response('Unauthorized', { status: 401 });
  const orgId = await getActiveOrgId();
  if (!orgId) return new Response('No active organization', { status: 412 });
  try {
    await requireOrgAdmin(db, orgId, session.user.id);
  } catch {
    return new Response('Only owners and admins can export invoices', { status: 403 });
  }

  const p = req.nextUrl.searchParams;
  const format = p.get('format') === 'tally' ? 'tally' : 'csv';
  const fromStr = p.get('from') ?? '';
  const toStr = p.get('to') ?? '';
  if (!DAY.test(fromStr) || !DAY.test(toStr)) {
    return new Response('from and to must be YYYY-MM-DD', { status: 400 });
  }
  // Dates are IST calendar days; `to` is inclusive.
  const from = new Date(`${fromStr}T00:00:00+05:30`);
  const to = new Date(new Date(`${toStr}T00:00:00+05:30`).getTime() + 24 * 60 * 60 * 1000);
  if (Number.isNaN(from.getTime()) || Number.isNaN(to.getTime()) || to <= from) {
    return new Response('Invalid date range', { status: 400 });
  }

  const rows = await loadExportRows(db, orgId, from, to);
  const name = `invoices_${fromStr}_${toStr}`;
  if (format === 'csv') {
    return new Response(toCsv(rows), {
      headers: {
        'Content-Type': 'text/csv; charset=utf-8',
        'Content-Disposition': `attachment; filename="${name}.csv"`,
      },
    });
  }

  const ledgers = { ...DEFAULT_TALLY_LEDGERS };
  for (const k of Object.keys(ledgers) as (keyof TallyLedgers)[]) {
    const v = p.get(k)?.trim();
    if (v) ledgers[k] = v.slice(0, 100);
  }
  return new Response(toTallyXml(rows, ledgers), {
    headers: {
      'Content-Type': 'application/xml; charset=utf-8',
      'Content-Disposition': `attachment; filename="${name}_tally.xml"`,
    },
  });
}
