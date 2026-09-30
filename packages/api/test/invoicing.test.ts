import type Stripe from 'stripe';
import { beforeAll, describe, expect, it, vi } from 'vitest';
import {
  exchangeFreshbooksToken,
  FreshBooksClient,
  FreshBooksError,
  freshbooksAuthorizeUrl,
} from '../src/invoicing/freshbooks';
import { centsToDecimalString, isoDate } from '../src/invoicing/money';
import { createOAuthState, verifyOAuthState } from '../src/invoicing/oauth-state';
import { issueStripeInvoice, mapStripeInvoiceStatus } from '../src/invoicing/stripe';
import type { InvoiceDraft } from '../src/invoicing/types';

beforeAll(() => {
  process.env.BETTER_AUTH_SECRET = 'unit-test-secret-thirty-two-chars-min-x';
});

function draft(overrides: Partial<InvoiceDraft> = {}): InvoiceDraft {
  return {
    bookingId: 'bk_1',
    organizationId: 'org_1',
    customer: { name: 'Asha Rao Kumar', email: 'asha@example.com', phone: '+919800000000' },
    line: { name: 'Deep tissue 60m', description: '2026-10-01 10:00 UTC', amountCents: 4550 },
    currency: 'USD',
    alreadyPaid: null,
    send: true,
    dueDays: 7,
    ...overrides,
  };
}

describe('money helpers', () => {
  it('formats minor units as a 2dp decimal string', () => {
    expect(centsToDecimalString(4550)).toBe('45.50');
    expect(centsToDecimalString(5)).toBe('0.05');
    expect(centsToDecimalString(100000)).toBe('1000.00');
    expect(centsToDecimalString(-250)).toBe('-2.50');
  });

  it('formats dates as UTC YYYY-MM-DD', () => {
    expect(isoDate(new Date('2026-09-30T23:59:59Z'))).toBe('2026-09-30');
  });
});

describe('OAuth state', () => {
  it('round-trips org + user', () => {
    const state = createOAuthState({ organizationId: 'org_1', userId: 'u_1' });
    expect(verifyOAuthState(state, 'u_1')).toEqual({ organizationId: 'org_1', userId: 'u_1' });
  });

  it('rejects a different user', () => {
    const state = createOAuthState({ organizationId: 'org_1', userId: 'u_1' });
    expect(() => verifyOAuthState(state, 'u_2')).toThrow(/different user/);
  });

  it('rejects expired state', () => {
    const state = createOAuthState({ organizationId: 'org_1', userId: 'u_1' }, 0);
    expect(() => verifyOAuthState(state, 'u_1')).toThrow(/expired/);
  });

  it('rejects plaintext and tampered state', () => {
    expect(() =>
      verifyOAuthState(JSON.stringify({ o: 'org_1', u: 'u_1', e: Date.now() + 1e6 }), 'u_1'),
    ).toThrow(/Invalid/);
    const state = createOAuthState({ organizationId: 'org_1', userId: 'u_1' });
    const flipped = `${state.slice(0, -2)}${state.endsWith('00') ? '11' : '00'}`;
    expect(() => verifyOAuthState(flipped, 'u_1')).toThrow(/Invalid/);
  });
});

type Call = { url: string; method: string; body: unknown };

function mockFetch(routes: Array<[RegExp, number, unknown]>) {
  const calls: Call[] = [];
  const fn = vi.fn(async (url: string | URL | Request, init?: RequestInit) => {
    const u = String(url);
    const method = init?.method ?? 'GET';
    calls.push({ url: u, method, body: init?.body ? JSON.parse(String(init.body)) : undefined });
    const hit = routes.find(([re]) => re.test(`${method} ${u}`));
    if (!hit) return new Response('not mocked', { status: 500 });
    return new Response(JSON.stringify(hit[2]), { status: hit[1] });
  });
  return { fetch: fn as unknown as typeof fetch, calls };
}

describe('FreshBooks', () => {
  it('builds the authorize URL with scopes and state', () => {
    const url = new URL(
      freshbooksAuthorizeUrl({ clientId: 'cid', redirectUri: 'https://x/cb', state: 's' }),
    );
    expect(url.origin + url.pathname).toBe('https://auth.freshbooks.com/oauth/authorize');
    expect(url.searchParams.get('response_type')).toBe('code');
    expect(url.searchParams.get('scope')).toContain('user:invoices:write');
    expect(url.searchParams.get('state')).toBe('s');
  });

  it('exchanges a code and computes expiry from created_at', async () => {
    const { fetch, calls } = mockFetch([
      [
        /POST .*\/auth\/oauth\/token$/,
        200,
        { access_token: 'at', refresh_token: 'rt', expires_in: 43200, created_at: 1_700_000_000 },
      ],
    ]);
    const t = await exchangeFreshbooksToken(
      { clientId: 'c', clientSecret: 's', redirectUri: 'https://x/cb', code: 'abc' },
      fetch,
    );
    expect(t).toEqual({
      accessToken: 'at',
      refreshToken: 'rt',
      expiresAt: new Date((1_700_000_000 + 43200) * 1000),
    });
    expect(calls[0]!.body).toMatchObject({ grant_type: 'authorization_code', code: 'abc' });
  });

  it('surfaces FreshBooks error messages', async () => {
    const { fetch } = mockFetch([
      [/token$/, 400, { error: 'invalid_grant', error_description: 'Code already used' }],
    ]);
    await expect(
      exchangeFreshbooksToken(
        { clientId: 'c', clientSecret: 's', redirectUri: 'r', refreshToken: 'old' },
        fetch,
      ),
    ).rejects.toThrow(new FreshBooksError(400, 'Code already used'));
  });

  it('lists businesses with accounting accounts', async () => {
    const { fetch } = mockFetch([
      [
        /users\/me$/,
        200,
        {
          response: {
            business_memberships: [
              { business: { id: 77, name: 'Asha Clinic', account_id: 'Ab12' } },
              { business: { id: 78, name: 'No books', account_id: null } },
            ],
          },
        },
      ],
    ]);
    const list = await new FreshBooksClient('at', fetch).listBusinesses();
    expect(list).toEqual([{ accountId: 'Ab12', businessId: '77', name: 'Asha Clinic' }]);
  });

  it('creates a client + invoice and emails an unpaid invoice', async () => {
    const { fetch, calls } = mockFetch([
      [/GET .*users\/clients\?search/, 200, { response: { result: { clients: [] } } }],
      [/POST .*users\/clients$/, 200, { response: { result: { client: { id: 501 } } } }],
      [
        /POST .*invoices\/invoices$/,
        200,
        { response: { result: { invoice: { id: 9001, invoice_number: '0000042' } } } },
      ],
      [/PUT .*invoices\/invoices\/9001$/, 200, { response: { result: { invoice: {} } } }],
      [
        /GET .*share_link/,
        200,
        { response: { result: { share_link: { share_link: 'https://fb/share/x' } } } },
      ],
    ]);
    const issued = await new FreshBooksClient('at', fetch).issueInvoice(
      'Ab12',
      draft(),
      new Date('2026-09-30T10:00:00Z'),
    );
    expect(issued).toEqual({
      externalId: '9001',
      number: '0000042',
      status: 'open',
      hostedUrl: 'https://fb/share/x',
    });

    const clientCreate = calls.find((c) => c.method === 'POST' && c.url.endsWith('/clients'));
    expect(clientCreate!.body).toMatchObject({
      client: { fname: 'Asha', lname: 'Rao Kumar', email: 'asha@example.com' },
    });
    const invCreate = calls.find((c) => c.method === 'POST' && c.url.endsWith('/invoices'));
    expect(invCreate!.url).toContain('/accounting/account/Ab12/');
    expect(invCreate!.body).toMatchObject({
      invoice: {
        customerid: 501,
        create_date: '2026-09-30',
        due_offset_days: 7,
        currency_code: 'USD',
        lines: [{ type: 0, qty: 1, unit_cost: { amount: '45.50', code: 'USD' } }],
      },
    });
    const send = calls.find((c) => c.method === 'PUT');
    expect(send!.body).toEqual({
      invoice: { action_email: true, email_recipients: ['asha@example.com'] },
    });
  });

  it('reuses an existing client and records a payment for paid bookings', async () => {
    const { fetch, calls } = mockFetch([
      [/GET .*users\/clients\?search/, 200, { response: { result: { clients: [{ id: 12 }] } } }],
      [
        /POST .*invoices\/invoices$/,
        200,
        { response: { result: { invoice: { id: 9002, invoice_number: '43' } } } },
      ],
      [/POST .*payments\/payments$/, 200, { response: { result: { payment: { id: 1 } } } }],
      [/GET .*share_link/, 500, {}],
    ]);
    const issued = await new FreshBooksClient('at', fetch).issueInvoice(
      'Ab12',
      draft({ alreadyPaid: { via: 'stripe' } }),
    );
    expect(issued.status).toBe('paid');
    expect(issued.hostedUrl).toBeNull(); // share-link failure is non-fatal
    expect(calls.some((c) => c.method === 'POST' && c.url.endsWith('/clients'))).toBe(false);
    expect(calls.some((c) => c.method === 'PUT')).toBe(false);
    const pay = calls.find((c) => c.url.endsWith('/payments/payments'));
    expect(pay!.body).toMatchObject({
      payment: { invoiceid: 9002, amount: { amount: '45.50' }, type: 'Credit Card' },
    });
  });
});

describe('Stripe invoicing', () => {
  function mockStripe(finalStatus: string) {
    const inv = { id: 'in_1', number: 'ABC-0001', status: finalStatus, hosted_invoice_url: 'h' };
    const stripe = {
      customers: {
        list: vi.fn(async () => ({ data: [] })),
        create: vi.fn(async () => ({ id: 'cus_1' })),
      },
      invoices: {
        create: vi.fn(async () => ({ id: 'in_1' })),
        finalizeInvoice: vi.fn(async () => ({ ...inv, status: 'open' })),
        pay: vi.fn(async () => ({ ...inv, status: 'paid' })),
        sendInvoice: vi.fn(async () => inv),
      },
      invoiceItems: { create: vi.fn(async () => ({ id: 'ii_1' })) },
    };
    return stripe;
  }

  it('maps Stripe statuses', () => {
    expect(mapStripeInvoiceStatus('paid')).toBe('paid');
    expect(mapStripeInvoiceStatus('uncollectible')).toBe('void');
    expect(mapStripeInvoiceStatus('open')).toBe('open');
    expect(mapStripeInvoiceStatus(null)).toBe('draft');
  });

  it('issues and sends an unpaid invoice on the connected account', async () => {
    const stripe = mockStripe('open');
    const issued = await issueStripeInvoice(stripe as unknown as Stripe, 'acct_9', draft());
    expect(issued).toEqual({
      externalId: 'in_1',
      number: 'ABC-0001',
      status: 'open',
      hostedUrl: 'h',
    });
    expect(stripe.invoices.create).toHaveBeenCalledWith(
      expect.objectContaining({
        collection_method: 'send_invoice',
        days_until_due: 7,
        pending_invoice_items_behavior: 'exclude',
      }),
      { stripeAccount: 'acct_9' },
    );
    expect(stripe.invoiceItems.create).toHaveBeenCalledWith(
      expect.objectContaining({ invoice: 'in_1', amount: 4550, currency: 'usd' }),
      { stripeAccount: 'acct_9' },
    );
    expect(stripe.invoices.sendInvoice).toHaveBeenCalled();
    expect(stripe.invoices.pay).not.toHaveBeenCalled();
  });

  it('marks already-paid bookings paid out of band without emailing', async () => {
    const stripe = mockStripe('paid');
    const issued = await issueStripeInvoice(
      stripe as unknown as Stripe,
      'acct_9',
      draft({
        alreadyPaid: { via: 'cashfree' },
        customer: { name: 'A', email: null, phone: null },
      }),
    );
    expect(issued.status).toBe('paid');
    expect(stripe.invoices.create).toHaveBeenCalledWith(
      expect.objectContaining({ collection_method: 'charge_automatically', auto_advance: false }),
      expect.anything(),
    );
    expect(stripe.invoices.pay).toHaveBeenCalledWith(
      'in_1',
      { paid_out_of_band: true },
      { stripeAccount: 'acct_9' },
    );
    expect(stripe.invoices.sendInvoice).not.toHaveBeenCalled();
  });

  it('refuses to send an unpaid invoice without a customer email', async () => {
    const stripe = mockStripe('open');
    await expect(
      issueStripeInvoice(
        stripe as unknown as Stripe,
        'acct_9',
        draft({ customer: { name: 'A', email: null, phone: null } }),
      ),
    ).rejects.toThrow(/email/);
    expect(stripe.invoices.create).not.toHaveBeenCalled();
  });
});
