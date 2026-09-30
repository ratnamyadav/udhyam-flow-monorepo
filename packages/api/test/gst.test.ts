import { describe, expect, it, vi } from 'vitest';
import { DEFAULT_TALLY_LEDGERS, type ExportRow, toCsv, toTallyXml } from '../src/export/accounting';
import {
  computeGst,
  financialYear,
  formatInr,
  formatInvoiceNumber,
  sanitizeInvoicePrefix,
} from '../src/gst/tax';
import type { InvoiceDraft } from '../src/invoicing/types';
import { isZohoHost, pickZohoTax, ZohoBooksClient, zohoAuthorizeUrl } from '../src/invoicing/zoho';

const supplier = { registered: true, gstin: '27AAPFU0939F1ZV', stateCode: '27' };
const b2c = { gstin: null, stateCode: null };

describe('computeGst', () => {
  it('backs intra-state CGST/SGST out of a tax-inclusive price', () => {
    const g = computeGst({
      amountCents: 118_000,
      rateBps: 1800,
      exempt: false,
      supplier,
      customer: b2c,
    });
    expect(g).toMatchObject({
      documentType: 'tax_invoice',
      taxableCents: 100_000,
      cgstCents: 9_000,
      sgstCents: 9_000,
      igstCents: 0,
      placeOfSupply: '27',
      interState: false,
    });
  });

  it('charges IGST when the customer is in another state', () => {
    const g = computeGst({
      amountCents: 105_000,
      rateBps: 500,
      exempt: false,
      supplier,
      customer: { gstin: '29AAPFU0939F1ZR', stateCode: null },
    });
    expect(g).toMatchObject({
      igstCents: 5_000,
      cgstCents: 0,
      placeOfSupply: '29',
      interState: true,
    });
  });

  it('always sums back to the amount paid, even with odd paise', () => {
    for (const amount of [999, 1, 12_345, 49_950, 100_001]) {
      const g = computeGst({
        amountCents: amount,
        rateBps: 1800,
        exempt: false,
        supplier,
        customer: b2c,
      });
      expect(g.taxableCents + g.cgstCents + g.sgstCents + g.igstCents).toBe(amount);
      expect(Math.abs(g.cgstCents - g.sgstCents)).toBeLessThanOrEqual(1);
    }
  });

  it('issues a Bill of Supply when exempt or unregistered', () => {
    const exempt = computeGst({
      amountCents: 50_000,
      rateBps: 1800,
      exempt: true,
      supplier,
      customer: b2c,
    });
    expect(exempt).toMatchObject({
      documentType: 'bill_of_supply',
      taxableCents: 50_000,
      cgstCents: 0,
    });
    const unregistered = computeGst({
      amountCents: 50_000,
      rateBps: 1800,
      exempt: false,
      supplier: { registered: false, gstin: null, stateCode: '07' },
      customer: b2c,
    });
    expect(unregistered.documentType).toBe('bill_of_supply');
  });

  it('issues a plain invoice outside India', () => {
    const g = computeGst({
      amountCents: 5_000,
      rateBps: 1800,
      exempt: false,
      supplier: { registered: false, gstin: null, stateCode: null },
      customer: b2c,
    });
    expect(g).toMatchObject({ documentType: 'invoice', taxableCents: 5_000, placeOfSupply: null });
  });
});

describe('invoice numbering', () => {
  it('uses the Indian financial year in IST', () => {
    expect(financialYear(new Date('2026-03-31T18:29:00Z'))).toBe('25-26'); // 23:59 IST 31 Mar
    expect(financialYear(new Date('2026-03-31T18:31:00Z'))).toBe('26-27'); // 00:01 IST 1 Apr
    expect(financialYear(new Date('2099-12-01T00:00:00Z'))).toBe('99-00');
  });

  it('formats GST-safe numbers of at most 16 chars', () => {
    expect(formatInvoiceNumber('inv', '26-27', 1)).toBe('INV/26-27/0001');
    expect(formatInvoiceNumber('ab#cd!e', '26-27', 12345)).toBe('ABCD/26-27/12345');
    expect(formatInvoiceNumber('ABCD', '26-27', 123456)).toBe('26-27/123456');
    expect(sanitizeInvoicePrefix('***')).toBe('INV');
  });

  it('formats rupees with Indian grouping', () => {
    expect(formatInr(12_345_650)).toBe('1,23,456.50');
  });
});

function row(o: Partial<ExportRow> = {}): ExportRow {
  return {
    number: 'INV/26-27/0001',
    issuedAt: new Date('2026-09-30T20:00:00Z'), // 1 Oct IST
    documentType: 'tax_invoice',
    customerName: 'Asha Rao',
    customerGstin: null,
    placeOfSupply: '27',
    sacCode: '999723',
    rateBps: 500,
    taxableCents: 100_000,
    cgstCents: 2_500,
    sgstCents: 2_500,
    igstCents: 0,
    totalCents: 105_000,
    currency: 'INR',
    status: 'paid',
    provider: 'udyamflow',
    paidVia: 'cashfree',
    ...o,
  };
}

describe('accountant exports', () => {
  it('writes CSV with IST dates, GST columns and formula-safe cells', () => {
    const csv = toCsv([row(), row({ number: 'INV/26-27/0002', customerName: '=HYPERLINK("x")' })]);
    const lines = csv.replace('﻿', '').trim().split('\r\n');
    expect(lines[0]).toContain('Taxable value,CGST,SGST,IGST');
    expect(lines[1]).toBe(
      'INV/26-27/0001,2026-10-01,tax_invoice,Asha Rao,,27,999723,5,1000.00,25.00,25.00,0.00,1050.00,INR,paid,cashfree,udyamflow',
    );
    expect(lines[2]).toContain(`"'=HYPERLINK(""x"")"`);
  });

  it('writes balanced Tally sales + receipt vouchers', () => {
    const xml = toTallyXml([row(), row({ number: 'INV/26-27/0002', paidVia: null })]);
    expect(xml).toContain('<TALLYREQUEST>Import Data</TALLYREQUEST>');
    expect(xml.match(/<LEDGER NAME="Asha Rao"/g)).toHaveLength(1);
    expect(xml.match(/VCHTYPE="Sales"/g)).toHaveLength(2);
    expect(xml.match(/VCHTYPE="Receipt"/g)).toHaveLength(1);
    expect(xml).toContain('<DATE>20261001</DATE>');

    // Every voucher nets to zero.
    for (const v of xml.match(/<VOUCHER[\s\S]*?<\/VOUCHER>/g) ?? []) {
      const amounts = [...v.matchAll(/<AMOUNT>(-?[\d.]+)<\/AMOUNT>/g)].map((m) => Number(m[1]));
      expect(amounts.reduce((a, b) => a + b, 0)).toBeCloseTo(0, 5);
    }
    expect(xml).toContain(`<LEDGERNAME>${DEFAULT_TALLY_LEDGERS.cgst}</LEDGERNAME>`);
    expect(xml).not.toContain(DEFAULT_TALLY_LEDGERS.igst);
  });

  it('escapes XML in names', () => {
    expect(toTallyXml([row({ customerName: 'A & B <Co>' })])).toContain('A &amp; B &lt;Co&gt;');
  });
});

describe('Zoho Books', () => {
  const taxes = [
    { tax_id: 'g18', tax_percentage: 18, tax_type: 'tax_group' },
    { tax_id: 'i18', tax_percentage: 18, tax_type: 'tax', tax_specification: 'igst' },
    { tax_id: 'g5', tax_percentage: 5, tax_type: 'tax_group' },
    { tax_id: 'c9', tax_percentage: 9, tax_type: 'tax', tax_specification: 'cgst' },
  ];

  it('picks the tax group intra-state and IGST inter-state', () => {
    expect(pickZohoTax(taxes, 1800, false)).toBe('g18');
    expect(pickZohoTax(taxes, 1800, true)).toBe('i18');
    expect(pickZohoTax(taxes, 500, false)).toBe('g5');
    expect(pickZohoTax(taxes, 500, true)).toBeNull();
  });

  it('only trusts Zoho hosts', () => {
    expect(isZohoHost('https://accounts.zoho.in', 'accounts')).toBe(true);
    expect(isZohoHost('https://www.zohoapis.com.au', 'api')).toBe(true);
    expect(isZohoHost('https://accounts.zoho.in.evil.com', 'accounts')).toBe(false);
    expect(isZohoHost('http://accounts.zoho.in', 'accounts')).toBe(false);
    expect(isZohoHost('https://www.zohoapis.in', 'accounts')).toBe(false);
  });

  it('asks for offline access with forced consent', () => {
    const u = new URL(
      zohoAuthorizeUrl({
        accountsUrl: 'https://accounts.zoho.in',
        clientId: 'c',
        redirectUri: 'https://x/cb',
        state: 's',
      }),
    );
    expect(u.pathname).toBe('/oauth/v2/auth');
    expect(u.searchParams.get('access_type')).toBe('offline');
    expect(u.searchParams.get('prompt')).toBe('consent');
    expect(u.searchParams.get('scope')).toContain('ZohoBooks.invoices.CREATE');
  });

  function draft(o: Partial<InvoiceDraft> = {}): InvoiceDraft {
    return {
      bookingId: 'bkg_0123456789abcdef',
      organizationId: 'org_1',
      customer: { name: 'Asha Rao', email: 'asha@example.com', phone: '9876543210' },
      line: { name: 'Yoga class', description: 'Mon 7am', amountCents: 105_000 },
      currency: 'INR',
      alreadyPaid: { via: 'cashfree' },
      send: true,
      dueDays: 7,
      tax: {
        gst: computeGst({
          amountCents: 105_000,
          rateBps: 500,
          exempt: false,
          supplier,
          customer: b2c,
        }),
        sacCode: '999723',
        supplierGstin: supplier.gstin,
        customerGstin: null,
      },
      ...o,
    };
  }

  it('creates a GST-inclusive invoice and applies the online payment', async () => {
    const calls: Array<{ url: string; method: string; body: Record<string, unknown> }> = [];
    const routes: Array<[RegExp, unknown]> = [
      [/GET .*\/contacts\?/, { code: 0, contacts: [] }],
      [/POST .*\/contacts\?/, { code: 0, contact: { contact_id: 'ct1' } }],
      [/GET .*\/settings\/taxes/, { code: 0, taxes }],
      [
        /POST .*\/invoices\?.*send=false/,
        {
          code: 0,
          invoice: {
            invoice_id: 'iv1',
            invoice_number: 'INV-000042',
            invoice_url: 'https://books.zoho.in/i/x',
          },
        },
      ],
      [/POST .*\/invoices\/iv1\/status\/sent/, { code: 0 }],
      [/POST .*\/customerpayments/, { code: 0 }],
    ];
    const fetchImpl = vi.fn(async (url: string | URL | Request, init?: RequestInit) => {
      const u = String(url);
      const method = init?.method ?? 'GET';
      calls.push({ url: u, method, body: init?.body ? JSON.parse(String(init.body)) : {} });
      const hit = routes.find(([re]) => re.test(`${method} ${u}`));
      return new Response(JSON.stringify(hit ? hit[1] : { code: 1, message: `unmocked ${u}` }), {
        status: hit ? 200 : 400,
      });
    }) as unknown as typeof fetch;

    const issued = await new ZohoBooksClient(
      'at',
      'https://www.zohoapis.in',
      fetchImpl,
    ).issueInvoice('600001', draft(), new Date('2026-09-30T06:00:00Z'));
    expect(issued).toEqual({
      externalId: 'iv1',
      number: 'INV-000042',
      status: 'paid',
      hostedUrl: 'https://books.zoho.in/i/x',
    });
    for (const c of calls) expect(c.url).toContain('organization_id=600001');

    const contact = calls.find((c) => c.method === 'POST' && c.url.includes('/contacts?'))!;
    expect(contact.body).toMatchObject({ contact_type: 'customer', gst_treatment: 'consumer' });
    const inv = calls.find((c) => c.method === 'POST' && /\/invoices\?/.test(c.url))!;
    expect(inv.body).toMatchObject({
      customer_id: 'ct1',
      date: '2026-09-30',
      due_date: '2026-10-07',
      is_inclusive_tax: true,
      line_items: [{ rate: 1050, quantity: 1, tax_id: 'g5', hsn_or_sac: '999723' }],
    });
    const pay = calls.find((c) => c.url.includes('/customerpayments'))!;
    expect(pay.body).toMatchObject({
      payment_mode: 'banktransfer',
      amount: 1050,
      invoices: [{ invoice_id: 'iv1', amount_applied: 1050 }],
    });
  });

  it('refuses a taxable invoice when the org lacks the matching tax', async () => {
    const fetchImpl = vi.fn(async (url: string | URL | Request) => {
      const u = String(url);
      const body = u.includes('/contacts')
        ? { code: 0, contacts: [{ contact_id: 'ct1' }] }
        : { code: 0, taxes: [] };
      return new Response(JSON.stringify(body));
    }) as unknown as typeof fetch;
    await expect(
      new ZohoBooksClient('at', 'https://www.zohoapis.in', fetchImpl).issueInvoice('1', draft()),
    ).rejects.toThrow(/No GST 5% tax group/);
  });

  it('rejects non-Zoho API hosts', () => {
    expect(() => new ZohoBooksClient('at', 'https://evil.example')).toThrow();
  });
});
