// Accountant exports for issued invoices:
//   • CSV — one row per invoice with the GST columns a CA needs for GSTR-1.
//   • Tally XML — an "Import Data → Vouchers" envelope TallyPrime imports
//     via Gateway of Tally → Import → Transactions. It creates party
//     ledgers (under Sundry Debtors), a Sales voucher per invoice, and a
//     Receipt voucher for invoices already paid online.
//
// Tally sign convention: debits are negative with ISDEEMEDPOSITIVE=Yes,
// credits positive with ISDEEMEDPOSITIVE=No; each voucher nets to zero.

import { type Db, schema } from '@udyamflow/db';
import { and, eq, gte, lt, notInArray } from 'drizzle-orm';

export type ExportRow = {
  number: string;
  issuedAt: Date;
  documentType: string;
  customerName: string;
  customerGstin: string | null;
  placeOfSupply: string | null;
  sacCode: string | null;
  rateBps: number;
  taxableCents: number;
  cgstCents: number;
  sgstCents: number;
  igstCents: number;
  totalCents: number;
  currency: string;
  status: string;
  provider: string;
  paidVia: string | null;
};

export type TallyLedgers = {
  sales: string;
  cgst: string;
  sgst: string;
  igst: string;
  // Where online payments land, for Receipt vouchers (e.g. "Cashfree").
  receipts: string;
};

export const DEFAULT_TALLY_LEDGERS: TallyLedgers = {
  sales: 'Sales - Services',
  cgst: 'Output CGST',
  sgst: 'Output SGST',
  igst: 'Output IGST',
  receipts: 'Payment Gateway',
};

export async function loadExportRows(
  db: Db,
  organizationId: string,
  from: Date,
  to: Date,
): Promise<ExportRow[]> {
  const rows = await db
    .select({
      inv: schema.invoice,
      customerName: schema.booking.customerName,
      paymentStatus: schema.booking.paymentStatus,
      paymentProvider: schema.booking.paymentProvider,
    })
    .from(schema.invoice)
    .innerJoin(schema.booking, eq(schema.booking.id, schema.invoice.bookingId))
    .where(
      and(
        eq(schema.invoice.organizationId, organizationId),
        gte(schema.invoice.createdAt, from),
        lt(schema.invoice.createdAt, to),
        notInArray(schema.invoice.status, ['pending', 'void']),
      ),
    )
    .orderBy(schema.invoice.createdAt);

  return rows.map(({ inv, customerName, paymentStatus, paymentProvider }) => ({
    number: inv.number ?? inv.externalId ?? inv.id,
    issuedAt: inv.issuedAt ?? inv.createdAt,
    documentType: inv.documentType ?? 'invoice',
    customerName,
    customerGstin: inv.customerGstin,
    placeOfSupply: inv.placeOfSupply,
    sacCode: inv.sacCode,
    rateBps: inv.gstRateBps ?? 0,
    // Providers without our GST breakdown (Stripe, FreshBooks) export as
    // untaxed totals.
    taxableCents: inv.taxableCents ?? inv.amountCents,
    cgstCents: inv.cgstCents ?? 0,
    sgstCents: inv.sgstCents ?? 0,
    igstCents: inv.igstCents ?? 0,
    totalCents: inv.amountCents,
    currency: inv.currency,
    status: inv.status,
    provider: inv.provider,
    paidVia:
      inv.status === 'paid' || paymentStatus === 'paid' ? (paymentProvider ?? 'online') : null,
  }));
}

const money = (cents: number) => (cents / 100).toFixed(2);

// YYYYMMDD / YYYY-MM-DD in IST — Indian books are kept in local dates.
function istParts(d: Date) {
  const ist = new Date(d.getTime() + 5.5 * 60 * 60 * 1000);
  return {
    y: String(ist.getUTCFullYear()),
    m: String(ist.getUTCMonth() + 1).padStart(2, '0'),
    d: String(ist.getUTCDate()).padStart(2, '0'),
  };
}

function csvCell(v: string | number | null): string {
  const s = v === null ? '' : String(v);
  // Also defuse spreadsheet formula injection from customer-entered names.
  const safe = /^[=+\-@]/.test(s) ? `'${s}` : s;
  return /[",\n\r]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe;
}

export function toCsv(rows: ExportRow[]): string {
  const header = [
    'Invoice number',
    'Date',
    'Document type',
    'Customer',
    'Customer GSTIN',
    'Place of supply',
    'SAC',
    'GST rate %',
    'Taxable value',
    'CGST',
    'SGST',
    'IGST',
    'Total',
    'Currency',
    'Status',
    'Paid via',
    'Issued with',
  ];
  const lines = rows.map((r) => {
    const { y, m, d } = istParts(r.issuedAt);
    return [
      r.number,
      `${y}-${m}-${d}`,
      r.documentType,
      r.customerName,
      r.customerGstin,
      r.placeOfSupply,
      r.sacCode,
      r.rateBps / 100,
      money(r.taxableCents),
      money(r.cgstCents),
      money(r.sgstCents),
      money(r.igstCents),
      money(r.totalCents),
      r.currency,
      r.status,
      r.paidVia,
      r.provider,
    ]
      .map(csvCell)
      .join(',');
  });
  // BOM so Excel opens ₹ / non-ASCII names correctly.
  return `﻿${[header.join(','), ...lines].join('\r\n')}\r\n`;
}

function xml(s: string): string {
  return s.replace(
    /[&<>"']/g,
    (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&apos;' })[c]!,
  );
}

function entry(ledger: string, cents: number, debit: boolean): string {
  return `<ALLLEDGERENTRIES.LIST><LEDGERNAME>${xml(ledger)}</LEDGERNAME><ISDEEMEDPOSITIVE>${debit ? 'Yes' : 'No'}</ISDEEMEDPOSITIVE><AMOUNT>${debit ? '-' : ''}${money(cents)}</AMOUNT></ALLLEDGERENTRIES.LIST>`;
}

export function toTallyXml(
  rows: ExportRow[],
  ledgers: TallyLedgers = DEFAULT_TALLY_LEDGERS,
): string {
  const messages: string[] = [];

  // Party ledger masters first. Tally reports "already exists" for ones it
  // has and carries on importing the rest.
  const parties = new Map<string, string | null>();
  for (const r of rows)
    if (!parties.has(r.customerName)) parties.set(r.customerName, r.customerGstin);
  for (const [name, gstin] of parties) {
    messages.push(
      `<LEDGER NAME="${xml(name)}" ACTION="Create"><NAME.LIST><NAME>${xml(name)}</NAME></NAME.LIST><PARENT>Sundry Debtors</PARENT>${gstin ? `<PARTYGSTIN>${xml(gstin)}</PARTYGSTIN>` : ''}</LEDGER>`,
    );
  }

  for (const r of rows) {
    const { y, m, d } = istParts(r.issuedAt);
    const date = `${y}${m}${d}`;
    const tax = [
      r.cgstCents ? entry(ledgers.cgst, r.cgstCents, false) : '',
      r.sgstCents ? entry(ledgers.sgst, r.sgstCents, false) : '',
      r.igstCents ? entry(ledgers.igst, r.igstCents, false) : '',
    ].join('');
    messages.push(
      `<VOUCHER VCHTYPE="Sales" ACTION="Create"><DATE>${date}</DATE><VOUCHERTYPENAME>Sales</VOUCHERTYPENAME><VOUCHERNUMBER>${xml(r.number)}</VOUCHERNUMBER><PARTYLEDGERNAME>${xml(r.customerName)}</PARTYLEDGERNAME><NARRATION>${xml(`${r.sacCode ? `SAC ${r.sacCode} · ` : ''}UdyamFlow ${r.documentType.replace(/_/g, ' ')}`)}</NARRATION>${entry(r.customerName, r.totalCents, true)}${entry(ledgers.sales, r.taxableCents, false)}${tax}</VOUCHER>`,
    );
    if (r.paidVia) {
      messages.push(
        `<VOUCHER VCHTYPE="Receipt" ACTION="Create"><DATE>${date}</DATE><VOUCHERTYPENAME>Receipt</VOUCHERTYPENAME><NARRATION>${xml(`Online payment via ${r.paidVia} against ${r.number}`)}</NARRATION>${entry(ledgers.receipts, r.totalCents, true)}${entry(r.customerName, r.totalCents, false)}</VOUCHER>`,
      );
    }
  }

  const body = messages
    .map((m) => `<TALLYMESSAGE xmlns:UDF="TallyUDF">${m}</TALLYMESSAGE>`)
    .join('\n');
  return `<?xml version="1.0" encoding="UTF-8"?>
<ENVELOPE>
<HEADER><TALLYREQUEST>Import Data</TALLYREQUEST></HEADER>
<BODY><IMPORTDATA><REQUESTDESC><REPORTNAME>Vouchers</REPORTNAME></REQUESTDESC><REQUESTDATA>
${body}
</REQUESTDATA></IMPORTDATA></BODY>
</ENVELOPE>
`;
}
