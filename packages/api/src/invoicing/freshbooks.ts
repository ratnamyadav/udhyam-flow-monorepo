// Minimal FreshBooks REST client — just the calls invoicing needs. We use
// fetch directly rather than @freshbooks/api to avoid pulling axios +
// retry deps into the serverless bundle. Endpoint shapes mirror the
// official SDK:
//   OAuth authorize   https://auth.freshbooks.com/oauth/authorize
//   OAuth token       POST https://api.freshbooks.com/auth/oauth/token
//   Identity          GET  /auth/api/v1/users/me
//   Clients           /accounting/account/{accountId}/users/clients
//   Invoices          /accounting/account/{accountId}/invoices/invoices
//   Payments          /accounting/account/{accountId}/payments/payments
//
// Access tokens live 12h. Refresh tokens are SINGLE-USE: every refresh
// returns a new pair and invalidates the old refresh token, so callers must
// persist the new pair before doing anything else.

import { centsToDecimalString, isoDate } from './money';
import type { InvoiceDraft, IssuedInvoice } from './types';

const AUTH_URL = 'https://auth.freshbooks.com/oauth/authorize';
const API_URL = 'https://api.freshbooks.com';

export const FRESHBOOKS_SCOPES = [
  'user:profile:read',
  'user:clients:read',
  'user:clients:write',
  'user:invoices:read',
  'user:invoices:write',
  'user:payments:write',
];

type FetchLike = typeof fetch;

export class FreshBooksError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
    this.name = 'FreshBooksError';
  }
}

export type FreshBooksTokens = {
  accessToken: string;
  refreshToken: string;
  expiresAt: Date;
};

export function freshbooksConfig() {
  const clientId = process.env.FRESHBOOKS_CLIENT_ID;
  const clientSecret = process.env.FRESHBOOKS_CLIENT_SECRET;
  if (!clientId || !clientSecret) return null;
  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000';
  return {
    clientId,
    clientSecret,
    redirectUri: `${appUrl}/api/integrations/freshbooks/callback`,
  };
}

export function freshbooksAuthorizeUrl(args: {
  clientId: string;
  redirectUri: string;
  state: string;
}): string {
  const params = new URLSearchParams({
    client_id: args.clientId,
    response_type: 'code',
    redirect_uri: args.redirectUri,
    scope: FRESHBOOKS_SCOPES.join(' '),
    state: args.state,
  });
  return `${AUTH_URL}?${params.toString()}`;
}

// Pulls a readable message out of FreshBooks' two error envelopes
// (auth: `{ error_description }`, accounting: `{ response: { errors: [...] } }`).
function errorMessage(body: unknown, fallback: string): string {
  if (body && typeof body === 'object') {
    const b = body as {
      error_description?: string;
      message?: string;
      response?: { errors?: Array<{ message?: string }> };
    };
    const first = b.response?.errors?.[0]?.message;
    return first ?? b.error_description ?? b.message ?? fallback;
  }
  return fallback;
}

async function readJson(res: Response): Promise<unknown> {
  const text = await res.text();
  if (!text) return null;
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}

export async function exchangeFreshbooksToken(
  args: {
    clientId: string;
    clientSecret: string;
    redirectUri: string;
  } & ({ code: string } | { refreshToken: string }),
  fetchImpl: FetchLike = fetch,
): Promise<FreshBooksTokens> {
  const grant =
    'code' in args
      ? { grant_type: 'authorization_code', code: args.code }
      : { grant_type: 'refresh_token', refresh_token: args.refreshToken };
  const res = await fetchImpl(`${API_URL}/auth/oauth/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Api-Version': 'alpha' },
    body: JSON.stringify({
      client_id: args.clientId,
      client_secret: args.clientSecret,
      redirect_uri: args.redirectUri,
      ...grant,
    }),
  });
  const body = await readJson(res);
  if (!res.ok) {
    throw new FreshBooksError(
      res.status,
      errorMessage(body, `Token exchange failed (${res.status})`),
    );
  }
  const data = body as {
    access_token: string;
    refresh_token: string;
    expires_in: number;
    created_at?: number;
  };
  // `created_at` is epoch seconds; fall back to now if absent.
  const createdMs = data.created_at ? data.created_at * 1000 : Date.now();
  return {
    accessToken: data.access_token,
    refreshToken: data.refresh_token,
    expiresAt: new Date(createdMs + data.expires_in * 1000),
  };
}

export type FreshBooksBusiness = { accountId: string; businessId: string; name: string };

export class FreshBooksClient {
  constructor(
    private readonly accessToken: string,
    private readonly fetchImpl: FetchLike = fetch,
  ) {}

  private async call<T>(method: 'GET' | 'POST' | 'PUT', path: string, body?: unknown): Promise<T> {
    const res = await this.fetchImpl(`${API_URL}${path}`, {
      method,
      headers: {
        Authorization: `Bearer ${this.accessToken}`,
        'Api-Version': 'alpha',
        ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}),
      },
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });
    const json = await readJson(res);
    if (!res.ok) {
      throw new FreshBooksError(
        res.status,
        errorMessage(json, `FreshBooks ${method} ${path} failed (${res.status})`),
      );
    }
    return json as T;
  }

  // Businesses the authorizing user belongs to. A FreshBooks login can be a
  // member of several; we connect the first one they own/manage.
  async listBusinesses(): Promise<FreshBooksBusiness[]> {
    const json = await this.call<{
      response: {
        business_memberships?: Array<{
          role?: string;
          business?: { id: number | string; name: string; account_id: string | null };
        }>;
      };
    }>('GET', '/auth/api/v1/users/me');
    return (json.response.business_memberships ?? [])
      .filter((m) => m.business?.account_id)
      .map((m) => ({
        accountId: String(m.business!.account_id),
        businessId: String(m.business!.id),
        name: m.business!.name,
      }));
  }

  async findOrCreateClient(
    accountId: string,
    c: { name: string; email: string | null; phone: string | null; currency: string },
  ): Promise<string> {
    const base = `/accounting/account/${accountId}/users/clients`;
    if (c.email) {
      const found = await this.call<{
        response: { result: { clients: Array<{ id: number }> } };
      }>('GET', `${base}?search[email]=${encodeURIComponent(c.email)}`);
      const existing = found.response.result.clients[0];
      if (existing) return String(existing.id);
    }
    const [fname, ...rest] = c.name.trim().split(/\s+/);
    const created = await this.call<{ response: { result: { client: { id: number } } } }>(
      'POST',
      base,
      {
        client: {
          fname: fname ?? c.name,
          lname: rest.join(' '),
          email: c.email ?? undefined,
          mob_phone: c.phone ?? undefined,
          currency_code: c.currency,
        },
      },
    );
    return String(created.response.result.client.id);
  }

  async issueInvoice(
    accountId: string,
    draft: InvoiceDraft,
    now = new Date(),
  ): Promise<IssuedInvoice> {
    const clientId = await this.findOrCreateClient(accountId, {
      ...draft.customer,
      currency: draft.currency,
    });
    const base = `/accounting/account/${accountId}`;
    const created = await this.call<{
      response: { result: { invoice: { id: number; invoice_number: string | null } } };
    }>('POST', `${base}/invoices/invoices`, {
      invoice: {
        customerid: Number(clientId),
        create_date: isoDate(now),
        due_offset_days: draft.dueDays,
        currency_code: draft.currency,
        lines: [
          {
            type: 0, // normal line item
            name: draft.line.name,
            description: draft.line.description ?? '',
            qty: 1,
            unit_cost: {
              amount: centsToDecimalString(draft.line.amountCents),
              code: draft.currency,
            },
          },
        ],
      },
    });
    const inv = created.response.result.invoice;
    const invoiceId = String(inv.id);

    let status: IssuedInvoice['status'] = 'draft';
    if (draft.alreadyPaid) {
      // Record the checkout payment so the FreshBooks invoice shows paid and
      // the revenue lands in their books without a second charge.
      await this.call('POST', `${base}/payments/payments`, {
        payment: {
          invoiceid: Number(invoiceId),
          amount: { amount: centsToDecimalString(draft.line.amountCents) },
          date: isoDate(now),
          type: draft.alreadyPaid.via === 'stripe' ? 'Credit Card' : 'Other',
          note: `Paid online via ${draft.alreadyPaid.via} (UdyamFlow booking ${draft.bookingId})`,
        },
      });
      status = 'paid';
    } else if (draft.send && draft.customer.email) {
      await this.call('PUT', `${base}/invoices/invoices/${invoiceId}`, {
        invoice: { action_email: true, email_recipients: [draft.customer.email] },
      });
      status = 'open';
    }

    let hostedUrl: string | null = null;
    try {
      const share = await this.call<{
        response: { result: { share_link: { share_link: string } } };
      }>('GET', `${base}/invoices/invoices/${invoiceId}/share_link?share_method=share_link`);
      hostedUrl = share.response.result.share_link.share_link;
    } catch {
      // Share links are a nicety; the invoice itself was created fine.
    }

    return { externalId: invoiceId, number: inv.invoice_number, status, hostedUrl };
  }
}
