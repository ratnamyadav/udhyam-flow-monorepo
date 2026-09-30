// Built-in GST invoices ("UdyamFlow invoices"). No third-party account:
// we number the invoice, compute the GST split, and host a printable page
// at /invoice/[id]. This is the default for Indian tenants who don't use
// accounting software.
//
// Numbering is sequential per tenant per financial year, which is what
// GST rule 46 expects. The counter bump is a single atomic upsert.

import { type Db, schema } from '@udyamflow/db';
import { sendEmail } from '@udyamflow/notifications';
import { sql } from 'drizzle-orm';
import { financialYear, formatInr, formatInvoiceNumber } from '../gst/tax';
import type { InvoiceDraft, IssuedInvoice } from './types';

const APP_URL = process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000';

export function invoicePageUrl(invoiceId: string): string {
  return `${APP_URL}/invoice/${invoiceId}`;
}

export async function nextInvoiceNumber(
  db: Db,
  organizationId: string,
  prefix: string,
  now = new Date(),
): Promise<string> {
  const fy = financialYear(now);
  const [row] = await db
    .insert(schema.invoiceSequence)
    .values({ organizationId, financialYear: fy, lastNumber: 1 })
    .onConflictDoUpdate({
      target: [schema.invoiceSequence.organizationId, schema.invoiceSequence.financialYear],
      set: { lastNumber: sql`${schema.invoiceSequence.lastNumber} + 1` },
    })
    .returning({ n: schema.invoiceSequence.lastNumber });
  return formatInvoiceNumber(prefix, fy, row!.n);
}

const DOC_TITLE = {
  tax_invoice: 'Tax Invoice',
  bill_of_supply: 'Bill of Supply',
  invoice: 'Invoice',
} as const;

export function documentTitle(type: string | null): string {
  return DOC_TITLE[(type ?? 'invoice') as keyof typeof DOC_TITLE] ?? 'Invoice';
}

export async function issueBuiltinInvoice(
  db: Db,
  args: { invoiceId: string; prefix: string; businessName: string },
  draft: InvoiceDraft,
): Promise<IssuedInvoice> {
  const number = await nextInvoiceNumber(db, draft.organizationId, args.prefix);
  const hostedUrl = invoicePageUrl(args.invoiceId);

  if (draft.send && draft.customer.email) {
    const title = documentTitle(draft.tax.gst.documentType);
    const amount =
      draft.currency === 'INR'
        ? `₹${formatInr(draft.line.amountCents)}`
        : `${draft.currency} ${(draft.line.amountCents / 100).toFixed(2)}`;
    // Email failure shouldn't un-issue a numbered invoice; the tenant can
    // share the link from the bookings page.
    await sendEmail({
      to: draft.customer.email,
      subject: `${title} ${number} from ${args.businessName}`,
      html: `<p>Hi ${escapeHtml(draft.customer.name.split(' ')[0] ?? '')},</p>
<p>Your ${title.toLowerCase()} <strong>${number}</strong> for ${escapeHtml(draft.line.name)} (${amount}) is ready.</p>
<p><a href="${hostedUrl}">View / download ${title.toLowerCase()}</a></p>
<p>— ${escapeHtml(args.businessName)}</p>`,
    }).catch((err) => console.error(`[invoicing] invoice email failed for ${number}:`, err));
  }

  return {
    externalId: args.invoiceId,
    number,
    status: draft.alreadyPaid ? 'paid' : 'open',
    hostedUrl,
  };
}

export function escapeHtml(s: string): string {
  return s.replace(
    /[&<>"']/g,
    (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!,
  );
}
