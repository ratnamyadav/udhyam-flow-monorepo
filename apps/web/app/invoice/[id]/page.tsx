import { formatInr, GST_STATES } from '@udyamflow/api/gst';
import { documentTitle, getPublicInvoice } from '@udyamflow/api/invoicing';
import { db } from '@udyamflow/db';
import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { PrintButton } from './print-button';

// Public, printable invoice for the built-in GST provider. The URL carries
// the invoice's random UUID, which is the only credential — same model as
// Stripe's hosted invoice links. Always light-themed so it prints cleanly;
// "Download PDF" is the browser's print-to-PDF.

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { title: 'Invoice', robots: { index: false, follow: false } };

function stateLabel(code: string | null): string {
  if (!code) return '—';
  return `${GST_STATES[code] ?? 'Unknown'} (${code})`;
}

export default async function InvoicePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const data = await getPublicInvoice(db, id);
  if (!data || data.invoice.status === 'pending') notFound();
  const { invoice: inv, booking, tenant, serviceName } = data;

  const title = documentTitle(inv.documentType);
  const isInr = inv.currency === 'INR';
  const amt = (cents: number | null) =>
    isInr ? `₹${formatInr(cents ?? 0)}` : `${inv.currency} ${((cents ?? 0) / 100).toFixed(2)}`;
  const issued = (inv.issuedAt ?? inv.createdAt).toLocaleDateString('en-IN', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    timeZone: 'Asia/Kolkata',
  });
  const serviceDate = booking.slotStart.toLocaleString('en-IN', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    timeZone: 'Asia/Kolkata',
  });
  const taxInvoice = inv.documentType === 'tax_invoice';
  const interState = (inv.igstCents ?? 0) > 0;
  const rate = (inv.gstRateBps ?? 0) / 100;

  return (
    <div className="min-h-screen bg-neutral-100 py-10 print:bg-white print:py-0 text-neutral-900">
      <div className="max-w-[820px] mx-auto mb-4 flex justify-end print:hidden">
        <PrintButton />
      </div>
      <article className="max-w-[820px] mx-auto bg-white shadow-sm print:shadow-none p-10 text-[13px]">
        <header className="flex justify-between items-start border-b border-neutral-200 pb-6">
          <div>
            {tenant.logoUrl && (
              <img src={tenant.logoUrl} alt="" className="h-10 mb-3 object-contain" />
            )}
            <div className="text-[18px] font-semibold">{tenant.legalName || tenant.name}</div>
            {tenant.billingAddress && (
              <div className="whitespace-pre-line text-neutral-600 mt-1">
                {tenant.billingAddress}
              </div>
            )}
            {tenant.gstStateCode && (
              <div className="text-neutral-600">State: {stateLabel(tenant.gstStateCode)}</div>
            )}
            {inv.supplierGstin && <div className="mt-1 font-mono">GSTIN: {inv.supplierGstin}</div>}
          </div>
          <div className="text-right">
            <div
              className="text-[22px] font-semibold tracking-tight"
              style={{ color: tenant.accent ?? undefined }}
            >
              {title}
            </div>
            <div className="mt-2 font-mono">{inv.number}</div>
            <div className="text-neutral-600">Date: {issued}</div>
            <div
              className={`inline-block mt-2 text-[11px] uppercase tracking-wider px-2 py-0.5 rounded ${
                inv.status === 'paid'
                  ? 'bg-emerald-100 text-emerald-800'
                  : 'bg-amber-100 text-amber-800'
              }`}
            >
              {inv.status === 'paid' ? 'Paid' : 'Payment due'}
            </div>
          </div>
        </header>

        <section className="grid grid-cols-2 gap-6 py-6 border-b border-neutral-200">
          <div>
            <div className="text-[11px] uppercase tracking-wider text-neutral-500 mb-1">
              Billed to
            </div>
            <div className="font-medium">{booking.customerName}</div>
            {booking.customerEmail && (
              <div className="text-neutral-600">{booking.customerEmail}</div>
            )}
            {booking.customerPhone && (
              <div className="text-neutral-600">{booking.customerPhone}</div>
            )}
            {inv.customerGstin && <div className="mt-1 font-mono">GSTIN: {inv.customerGstin}</div>}
          </div>
          {inv.documentType !== 'invoice' && (
            <div className="text-right">
              <div className="text-[11px] uppercase tracking-wider text-neutral-500 mb-1">
                Place of supply
              </div>
              <div>{stateLabel(inv.placeOfSupply)}</div>
              {taxInvoice && <div className="text-neutral-600 mt-1">Reverse charge: No</div>}
            </div>
          )}
        </section>

        <table className="w-full mt-6">
          <thead>
            <tr className="text-left text-[11px] uppercase tracking-wider text-neutral-500 border-b border-neutral-200">
              <th className="py-2 font-medium">Description</th>
              <th className="py-2 font-medium">SAC</th>
              <th className="py-2 font-medium text-right">
                {taxInvoice ? 'Taxable value' : 'Amount'}
              </th>
              {taxInvoice && <th className="py-2 font-medium text-right">GST</th>}
            </tr>
          </thead>
          <tbody>
            <tr className="border-b border-neutral-100 align-top">
              <td className="py-3">
                <div className="font-medium">{serviceName}</div>
                <div className="text-neutral-600">{serviceDate}</div>
              </td>
              <td className="py-3 font-mono">{inv.sacCode ?? '—'}</td>
              <td className="py-3 text-right font-mono">
                {amt(inv.taxableCents ?? inv.amountCents)}
              </td>
              {taxInvoice && <td className="py-3 text-right font-mono">{rate}%</td>}
            </tr>
          </tbody>
        </table>

        <div className="flex justify-end mt-6">
          <dl className="w-[300px] space-y-1.5">
            {taxInvoice && (
              <>
                <Row label="Taxable value" value={amt(inv.taxableCents)} />
                {interState ? (
                  <Row label={`IGST @ ${rate}%`} value={amt(inv.igstCents)} />
                ) : (
                  <>
                    <Row label={`CGST @ ${rate / 2}%`} value={amt(inv.cgstCents)} />
                    <Row label={`SGST @ ${rate / 2}%`} value={amt(inv.sgstCents)} />
                  </>
                )}
              </>
            )}
            <div className="flex justify-between border-t border-neutral-300 pt-2 text-[15px] font-semibold">
              <dt>Total</dt>
              <dd className="font-mono">{amt(inv.amountCents)}</dd>
            </div>
          </dl>
        </div>

        <footer className="mt-10 pt-6 border-t border-neutral-200 text-[11px] text-neutral-500 space-y-1">
          {inv.documentType === 'bill_of_supply' && (
            <div>
              {inv.supplierGstin
                ? 'Exempt supply — no GST charged.'
                : 'Supplier not registered under GST — no GST charged.'}
            </div>
          )}
          {taxInvoice && <div>Amounts are inclusive of GST.</div>}
          <div>This is a computer-generated document and does not require a signature.</div>
        </footer>
      </article>
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between text-neutral-700">
      <dt>{label}</dt>
      <dd className="font-mono">{value}</dd>
    </div>
  );
}
