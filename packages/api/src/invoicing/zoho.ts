// Zoho Books client — GST-native accounting popular with Indian SMBs.
// Only the calls invoicing needs, over fetch with an injectable impl.
//
// Zoho is multi-data-centre: a user's account lives on accounts.zoho.in /
// .com / .eu / …, the OAuth callback tells us which (`accounts-server`),
// and the token response tells us the API host (`api_domain`, e.g.
// https://www.zohoapis.in). Both are persisted per connection.
//
// Access tokens last 1h; the refresh token is long-lived and NOT rotated
// on refresh (unlike FreshBooks). Every Books call needs `organization_id`.

import { isoDate } from './money';
import type { InvoiceDraft, IssuedInvoice } from './types';

type FetchLike = typeof fetch;

export const ZOHO_SCOPES = [
  'ZohoBooks.contacts.CREATE',
  'ZohoBooks.contacts.READ',
  'ZohoBooks.invoices.CREATE',
  'ZohoBooks.invoices.READ',
  'ZohoBooks.invoices.UPDATE',
  'ZohoBooks.customerpayments.CREATE',
  'ZohoBooks.settings.READ',
];

export class ZohoError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
    this.name = 'ZohoError';
  }
}

export function zohoConfig() {
  const clientId = process.env.ZOHO_CLIENT_ID;
  const clientSecret = process.env.ZOHO_CLIENT_SECRET;
  if (!clientId || !clientSecret) return null;
  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000';
  return {
    clientId,
    clientSecret,
    // Where consent starts. Defaults to the India DC; with multi-DC enabled
    // on the Zoho client, users on other DCs are redirected correctly.
    accountsUrl: process.env.ZOHO_ACCOUNTS_URL ?? 'https://accounts.zoho.in',
    redirectUri: `${appUrl}/api/integrations/zoho/callback`,
  };
}

// Only ever talk to Zoho hosts — `accounts-server` arrives as a query param
// on our callback, so it's attacker-controllable.
export function isZohoHost(url: string, kind: 'accounts' | 'api'): boolean {
  try {
    const u = new URL(url);
    if (u.protocol !== 'https:') return false;
    const re =
      kind === 'accounts'
        ? /^accounts\.zoho\.(com|in|eu|com\.au|jp|ca|sa|uk|com\.cn)$/
        : /^www\.zohoapis\.(com|in|eu|com\.au|jp|ca|sa|uk|com\.cn)$/;
    return re.test(u.hostname);
  } catch {
    return false;
  }
}

export function zohoAuthorizeUrl(args: {
  accountsUrl: string;
  clientId: string;
  redirectUri: string;
  state: string;
}): string {
  const params = new URLSearchParams({
    scope: ZOHO_SCOPES.join(','),
    client_id: args.clientId,
    response_type: 'code',
    redirect_uri: args.redirectUri,
    access_type: 'offline',
    // Force consent so Zoho issues a refresh token even on reconnect.
    prompt: 'consent',
    state: args.state,
  });
  return `${args.accountsUrl}/oauth/v2/auth?${params.toString()}`;
}

export type ZohoTokens = {
  accessToken: string;
  refreshToken: string | null;
  expiresAt: Date;
  apiDomain: string;
};

export async function exchangeZohoToken(
  args: {
    accountsUrl: string;
    clientId: string;
    clientSecret: string;
    redirectUri: string;
  } & ({ code: string } | { refreshToken: string }),
  fetchImpl: FetchLike = fetch,
): Promise<ZohoTokens> {
  if (!isZohoHost(args.accountsUrl, 'accounts')) throw new Error('Unexpected Zoho accounts host');
  const params = new URLSearchParams({
    client_id: args.clientId,
    client_secret: args.clientSecret,
    redirect_uri: args.redirectUri,
    ...('code' in args
      ? { grant_type: 'authorization_code', code: args.code }
      : { grant_type: 'refresh_token', refresh_token: args.refreshToken }),
  });
  const res = await fetchImpl(`${args.accountsUrl}/oauth/v2/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: params.toString(),
  });
  const json = (await res.json().catch(() => ({}))) as {
    access_token?: string;
    refresh_token?: string;
    expires_in?: number;
    api_domain?: string;
    error?: string;
  };
  // Zoho reports some OAuth errors with HTTP 200 + `{ error }`.
  if (!res.ok || json.error || !json.access_token) {
    throw new ZohoError(res.status, `Zoho token exchange failed: ${json.error ?? res.status}`);
  }
  const apiDomain = json.api_domain ?? 'https://www.zohoapis.in';
  if (!isZohoHost(apiDomain, 'api')) throw new Error('Unexpected Zoho API host');
  return {
    accessToken: json.access_token,
    refreshToken: json.refresh_token ?? null,
    expiresAt: new Date(Date.now() + (json.expires_in ?? 3600) * 1000),
    apiDomain,
  };
}

type ZohoTax = {
  tax_id: string;
  tax_name?: string;
  tax_percentage: number;
  tax_type?: string; // 'tax' | 'tax_group'
  tax_specification?: string; // 'cgst' | 'sgst' | 'igst' | …
};

// Zoho India models intra-state GST as a tax *group* (CGST+SGST) and
// inter-state as a single IGST tax, at the same combined percentage.
export function pickZohoTax(taxes: ZohoTax[], rateBps: number, interState: boolean): string | null {
  const pct = rateBps / 100;
  const match = taxes.find(
    (t) =>
      Math.abs(t.tax_percentage - pct) < 0.001 &&
      (interState ? t.tax_specification === 'igst' : t.tax_type === 'tax_group'),
  );
  return match?.tax_id ?? null;
}

const PAYMENT_MODE: Record<string, string> = {
  stripe: 'creditcard',
  cashfree: 'banktransfer',
};

export class ZohoBooksClient {
  constructor(
    private readonly accessToken: string,
    private readonly apiDomain: string,
    private readonly fetchImpl: FetchLike = fetch,
  ) {
    if (!isZohoHost(apiDomain, 'api')) throw new Error('Unexpected Zoho API host');
  }

  private async call<T>(
    method: 'GET' | 'POST',
    path: string,
    organizationId: string | null,
    body?: unknown,
    query: Record<string, string> = {},
  ): Promise<T> {
    const q = new URLSearchParams({
      ...(organizationId ? { organization_id: organizationId } : {}),
      ...query,
    });
    const qs = q.toString();
    const res = await this.fetchImpl(`${this.apiDomain}/books/v3${path}${qs ? `?${qs}` : ''}`, {
      method,
      headers: {
        Authorization: `Zoho-oauthtoken ${this.accessToken}`,
        ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}),
      },
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });
    const json = (await res.json().catch(() => ({}))) as { code?: number; message?: string };
    // Books returns `code: 0` on success, non-zero with a message otherwise.
    if (!res.ok || (typeof json.code === 'number' && json.code !== 0)) {
      throw new ZohoError(res.status, json.message ?? `Zoho Books ${method} ${path} failed`);
    }
    return json as T;
  }

  async listOrganizations(): Promise<
    Array<{ organizationId: string; name: string; currency: string }>
  > {
    const json = await this.call<{
      organizations?: Array<{ organization_id: string; name: string; currency_code: string }>;
    }>('GET', '/organizations', null);
    return (json.organizations ?? []).map((o) => ({
      organizationId: String(o.organization_id),
      name: o.name,
      currency: o.currency_code,
    }));
  }

  async findOrCreateContact(orgId: string, draft: InvoiceDraft): Promise<string> {
    const { name, email, phone } = draft.customer;
    if (email) {
      const found = await this.call<{ contacts?: Array<{ contact_id: string }> }>(
        'GET',
        '/contacts',
        orgId,
        undefined,
        { email },
      );
      if (found.contacts?.[0]) return String(found.contacts[0].contact_id);
    }
    const gstin = draft.tax.customerGstin;
    const [first, ...rest] = name.trim().split(/\s+/);
    const created = await this.call<{ contact: { contact_id: string } }>(
      'POST',
      '/contacts',
      orgId,
      {
        contact_name: name,
        contact_type: 'customer',
        customer_sub_type: gstin ? 'business' : 'individual',
        ...(gstin
          ? { gst_treatment: 'business_gst', gst_no: gstin }
          : { gst_treatment: 'consumer' }),
        contact_persons: [
          {
            first_name: first ?? name,
            last_name: rest.join(' '),
            email: email ?? undefined,
            mobile: phone ?? undefined,
            is_primary_contact: true,
          },
        ],
      },
    );
    return String(created.contact.contact_id);
  }

  async listTaxes(orgId: string): Promise<ZohoTax[]> {
    const json = await this.call<{ taxes?: ZohoTax[] }>('GET', '/settings/taxes', orgId);
    return json.taxes ?? [];
  }

  async issueInvoice(orgId: string, draft: InvoiceDraft, now = new Date()): Promise<IssuedInvoice> {
    const contactId = await this.findOrCreateContact(orgId, draft);
    const { gst, sacCode } = draft.tax;
    const taxId =
      gst.documentType === 'tax_invoice'
        ? pickZohoTax(await this.listTaxes(orgId), gst.rateBps, gst.interState)
        : null;
    if (gst.documentType === 'tax_invoice' && !taxId) {
      throw new ZohoError(
        422,
        `No GST ${gst.rateBps / 100}% ${gst.interState ? 'IGST tax' : 'tax group'} found in Zoho Books — create it under Settings → Taxes`,
      );
    }

    const due = new Date(now.getTime() + draft.dueDays * 24 * 60 * 60 * 1000);
    const created = await this.call<{
      invoice: { invoice_id: string; invoice_number: string; status: string; invoice_url?: string };
    }>(
      'POST',
      '/invoices',
      orgId,
      {
        customer_id: contactId,
        date: isoDate(now),
        due_date: isoDate(due),
        reference_number: draft.bookingId.slice(-12),
        // Our prices are GST-inclusive — let Zoho back the tax out.
        is_inclusive_tax: true,
        line_items: [
          {
            name: draft.line.name,
            description: draft.line.description ?? '',
            rate: draft.line.amountCents / 100,
            quantity: 1,
            ...(taxId ? { tax_id: taxId } : {}),
            ...(sacCode ? { hsn_or_sac: sacCode } : {}),
          },
        ],
      },
      // `send=true` emails the contact; skip it for already-paid invoices
      // (they get the payment receipt instead).
      { send: String(draft.send && !draft.alreadyPaid && !!draft.customer.email) },
    );
    const inv = created.invoice;

    let status: IssuedInvoice['status'] = draft.send && draft.customer.email ? 'open' : 'draft';
    if (draft.alreadyPaid) {
      // Payments can only be applied to sent invoices.
      await this.call('POST', `/invoices/${inv.invoice_id}/status/sent`, orgId);
      await this.call('POST', '/customerpayments', orgId, {
        customer_id: contactId,
        payment_mode: PAYMENT_MODE[draft.alreadyPaid.via] ?? 'others',
        amount: draft.line.amountCents / 100,
        date: isoDate(now),
        reference_number: draft.bookingId.slice(-12),
        description: `Paid online via ${draft.alreadyPaid.via} (UdyamFlow)`,
        invoices: [{ invoice_id: inv.invoice_id, amount_applied: draft.line.amountCents / 100 }],
      });
      status = 'paid';
    }

    return {
      externalId: String(inv.invoice_id),
      number: inv.invoice_number ?? null,
      status,
      hostedUrl: inv.invoice_url ?? null,
    };
  }
}
