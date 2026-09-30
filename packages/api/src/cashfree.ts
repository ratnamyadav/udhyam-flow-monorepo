// Cashfree PG client: orders, refunds, and Easy Split vendors.
//
// Easy Split is how INR payments reach the *tenant's* bank account instead
// of sitting in the platform's merchant account: each tenant is onboarded as
// a Cashfree "vendor" (bank/UPI + KYC), and every order carries
// `order_splits` so Cashfree settles the tenant's share to them directly.
// Endpoint + field names follow the official cashfree-pg SDK (v6).

type FetchLike = typeof fetch;

// Orders/refunds/vendors all accept this version; bumping it changes
// response shapes, so do it deliberately.
const API_VERSION = '2023-08-01';

export class CashfreeError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
    this.name = 'CashfreeError';
  }
}

export function cashfreeConfigured(): boolean {
  return !!process.env.CASHFREE_CLIENT_ID && !!process.env.CASHFREE_CLIENT_SECRET;
}

export function cashfreeBaseUrl(): string {
  return process.env.CASHFREE_ENV === 'production'
    ? 'https://api.cashfree.com/pg'
    : 'https://sandbox.cashfree.com/pg';
}

export function cashfreeCheckoutUrl(paymentSessionId: string): string {
  const host =
    process.env.CASHFREE_ENV === 'production'
      ? 'https://payments.cashfree.com'
      : 'https://payments-test.cashfree.com';
  return `${host}/order/#${paymentSessionId}`;
}

// Share of each order settled to the tenant. The platform keeps the rest
// (e.g. to recover gateway fees). Default: tenant gets 100%.
export function vendorSplitPercent(): number {
  const fee = Number(process.env.CASHFREE_PLATFORM_FEE_PERCENT ?? 0);
  if (!Number.isFinite(fee) || fee < 0 || fee >= 100) return 100;
  return Math.round((100 - fee) * 100) / 100;
}

// Cashfree vendor ids: alphanumeric + underscore, ≤50 chars. Derived from
// the org id so it's stable and we never create two vendors per tenant.
export function vendorIdForOrg(organizationId: string): string {
  return `uf_${organizationId.replace(/[^A-Za-z0-9_]/g, '_')}`.slice(0, 50);
}

export async function cashfreeRequest<T>(
  method: 'GET' | 'POST' | 'PATCH',
  path: string,
  body?: unknown,
  fetchImpl: FetchLike = fetch,
): Promise<T> {
  const res = await fetchImpl(`${cashfreeBaseUrl()}${path}`, {
    method,
    headers: {
      'x-client-id': process.env.CASHFREE_CLIENT_ID ?? '',
      'x-client-secret': process.env.CASHFREE_CLIENT_SECRET ?? '',
      'x-api-version': API_VERSION,
      ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}),
    },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  let json: unknown = null;
  try {
    json = text ? JSON.parse(text) : null;
  } catch {
    json = text;
  }
  if (!res.ok) {
    const msg =
      json && typeof json === 'object' && 'message' in json
        ? String((json as { message: unknown }).message)
        : text.slice(0, 200);
    throw new CashfreeError(
      res.status,
      `Cashfree ${method} ${path} failed (${res.status}): ${msg}`,
    );
  }
  return json as T;
}

export function paiseToRupees(paise: number): number {
  return Math.round(paise) / 100;
}

export async function cashfreeCreateOrder(
  args: {
    orderId: string;
    amountPaise: number;
    currency: string;
    customerName: string;
    customerEmail?: string;
    customerPhone?: string;
    returnUrl: string;
    // Tenant's active Easy Split vendor; omitted → platform settlement.
    vendorId?: string;
    // Stable per-customer id (defaults to the order id).
    customerId?: string;
    // After this the order can't be paid — matches the slot hold.
    expiresAt?: Date;
  },
  fetchImpl: FetchLike = fetch,
): Promise<{ paymentSessionId: string }> {
  const json = await cashfreeRequest<{ payment_session_id: string }>(
    'POST',
    '/orders',
    {
      order_id: args.orderId,
      order_amount: paiseToRupees(args.amountPaise),
      order_currency: args.currency,
      customer_details: {
        customer_id: args.customerId ?? args.orderId,
        customer_name: args.customerName,
        customer_email: args.customerEmail ?? 'noemail@example.com',
        // Cashfree wants a 10-digit Indian mobile; strip +91 / formatting.
        customer_phone: args.customerPhone?.replace(/\D/g, '').slice(-10) || '0000000000',
      },
      order_meta: { return_url: args.returnUrl },
      ...(args.expiresAt ? { order_expiry_time: args.expiresAt.toISOString() } : {}),
      ...(args.vendorId
        ? { order_splits: [{ vendor_id: args.vendorId, percentage: vendorSplitPercent() }] }
        : {}),
    },
    fetchImpl,
  );
  return { paymentSessionId: json.payment_session_id };
}

export async function cashfreeRefund(
  args: {
    orderId: string;
    amountPaise: number;
    // Recover the refund from the vendor's share when the order was split.
    vendorId?: string | null;
  },
  fetchImpl: FetchLike = fetch,
): Promise<void> {
  const amount = paiseToRupees(args.amountPaise);
  const vendorAmount = args.vendorId ? Math.round(amount * vendorSplitPercent()) / 100 : undefined;
  await cashfreeRequest(
    'POST',
    `/orders/${encodeURIComponent(args.orderId)}/refunds`,
    {
      refund_amount: amount,
      refund_id: `rfd_${args.orderId}_${Date.now()}`.slice(0, 40),
      refund_note: 'Refund from UdyamFlow dashboard',
      ...(args.vendorId && vendorAmount
        ? { refund_splits: [{ vendor_id: args.vendorId, amount: vendorAmount }] }
        : {}),
    },
    fetchImpl,
  );
}

export type VendorPayout =
  | { kind: 'bank'; accountHolder: string; accountNumber: string; ifsc: string }
  | { kind: 'upi'; accountHolder: string; vpa: string };

export type VendorInput = {
  vendorId: string;
  name: string;
  email: string;
  phone: string;
  payout: VendorPayout;
  kyc: { accountType: string; businessType: string; pan: string; gstin?: string };
};

export type VendorState = { vendorId: string; status: string; remarks: string | null };

export function buildVendorPayload(v: VendorInput) {
  return {
    vendor_id: v.vendorId,
    status: 'ACTIVE',
    name: v.name,
    email: v.email,
    phone: v.phone,
    verify_account: true,
    dashboard_access: false,
    ...(v.payout.kind === 'bank'
      ? {
          bank: {
            account_holder: v.payout.accountHolder,
            account_number: v.payout.accountNumber,
            ifsc: v.payout.ifsc.toUpperCase(),
          },
        }
      : { upi: { account_holder: v.payout.accountHolder, vpa: v.payout.vpa } }),
    kyc_details: {
      account_type: v.kyc.accountType,
      business_type: v.kyc.businessType,
      pan: v.kyc.pan.toUpperCase(),
      ...(v.kyc.gstin ? { gst: v.kyc.gstin.toUpperCase() } : {}),
    },
  };
}

export async function cashfreeCreateVendor(
  v: VendorInput,
  fetchImpl: FetchLike = fetch,
): Promise<VendorState> {
  const json = await cashfreeRequest<{ vendor_id?: string; status?: string; remarks?: string }>(
    'POST',
    '/easy-split/vendors',
    buildVendorPayload(v),
    fetchImpl,
  );
  return {
    vendorId: json.vendor_id ?? v.vendorId,
    status: json.status ?? 'UNKNOWN',
    remarks: json.remarks ?? null,
  };
}

export async function cashfreeFetchVendor(
  vendorId: string,
  fetchImpl: FetchLike = fetch,
): Promise<VendorState> {
  const json = await cashfreeRequest<{ vendor_id?: string; status?: string; remarks?: string }>(
    'GET',
    `/easy-split/vendors/${encodeURIComponent(vendorId)}`,
    undefined,
    fetchImpl,
  );
  return { vendorId, status: json.status ?? 'UNKNOWN', remarks: json.remarks ?? null };
}
