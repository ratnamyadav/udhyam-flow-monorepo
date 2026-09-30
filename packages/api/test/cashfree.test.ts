import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  buildVendorPayload,
  CashfreeError,
  cashfreeCreateOrder,
  cashfreeCreateVendor,
  cashfreeRefund,
  vendorIdForOrg,
  vendorSplitPercent,
} from '../src/cashfree';
import {
  isValidGstin,
  isValidIfsc,
  isValidPan,
  normalizeIndianMobile,
  stateCodeFromGstin,
} from '../src/gst/india';

type Call = { url: string; init: RequestInit; body: Record<string, unknown> };

function mockFetch(status: number, response: unknown) {
  const calls: Call[] = [];
  const fn = vi.fn(async (url: string | URL | Request, init?: RequestInit) => {
    calls.push({
      url: String(url),
      init: init ?? {},
      body: init?.body ? JSON.parse(String(init.body)) : {},
    });
    return new Response(JSON.stringify(response), { status });
  });
  return { fetch: fn as unknown as typeof fetch, calls };
}

afterEach(() => {
  delete process.env.CASHFREE_PLATFORM_FEE_PERCENT;
  delete process.env.CASHFREE_ENV;
});

describe('Indian identifiers', () => {
  it('validates GSTIN structure and check digit', () => {
    expect(isValidGstin('27AAPFU0939F1ZV')).toBe(true);
    expect(isValidGstin('27aapfu0939f1zv')).toBe(true);
    expect(isValidGstin('27AAPFU0939F1ZA')).toBe(false); // bad check digit
    expect(isValidGstin('99AAPFU0939F1ZV')).toBe(false); // unknown state
    expect(stateCodeFromGstin('27AAPFU0939F1ZV')).toBe('27');
  });

  it('validates PAN and IFSC', () => {
    expect(isValidPan('ABCPV1234D')).toBe(true);
    expect(isValidPan('ABC1234D')).toBe(false);
    expect(isValidIfsc('HDFC0001234')).toBe(true);
    expect(isValidIfsc('HDFC1001234')).toBe(false);
  });

  it('normalizes Indian mobiles', () => {
    expect(normalizeIndianMobile('+91 98765 43210')).toBe('9876543210');
    expect(normalizeIndianMobile('09876543210')).toBe('9876543210');
    expect(normalizeIndianMobile('12345')).toBeNull();
    expect(normalizeIndianMobile('5876543210')).toBeNull();
  });
});

describe('Cashfree Easy Split', () => {
  it('derives a stable, valid vendor id', () => {
    expect(vendorIdForOrg('org-AbC.123')).toBe('uf_org_AbC_123');
    expect(vendorIdForOrg('x'.repeat(80))).toHaveLength(50);
  });

  it('splits 100% to the vendor by default, minus any platform fee', () => {
    expect(vendorSplitPercent()).toBe(100);
    process.env.CASHFREE_PLATFORM_FEE_PERCENT = '2.5';
    expect(vendorSplitPercent()).toBe(97.5);
    process.env.CASHFREE_PLATFORM_FEE_PERCENT = 'nonsense';
    expect(vendorSplitPercent()).toBe(100);
  });

  it('creates orders in rupees with order_splits when a vendor is active', async () => {
    const { fetch, calls } = mockFetch(200, { payment_session_id: 'sess_1' });
    const res = await cashfreeCreateOrder(
      {
        orderId: 'bkg_1',
        amountPaise: 49_950,
        currency: 'INR',
        customerName: 'Asha',
        returnUrl: 'https://x/r',
        vendorId: 'uf_org_1',
      },
      fetch,
    );
    expect(res.paymentSessionId).toBe('sess_1');
    expect(calls[0]!.url).toBe('https://sandbox.cashfree.com/pg/orders');
    expect((calls[0]!.init.headers as Record<string, string>)['x-api-version']).toBe('2023-08-01');
    expect(calls[0]!.body).toMatchObject({
      order_amount: 499.5,
      order_splits: [{ vendor_id: 'uf_org_1', percentage: 100 }],
    });
  });

  it('omits order_splits without a vendor and uses the production host when configured', async () => {
    process.env.CASHFREE_ENV = 'production';
    const { fetch, calls } = mockFetch(200, { payment_session_id: 's' });
    await cashfreeCreateOrder(
      { orderId: 'o', amountPaise: 100, currency: 'INR', customerName: 'A', returnUrl: 'r' },
      fetch,
    );
    expect(calls[0]!.url).toBe('https://api.cashfree.com/pg/orders');
    expect(calls[0]!.body).not.toHaveProperty('order_splits');
  });

  it('recovers refunds from the vendor share', async () => {
    process.env.CASHFREE_PLATFORM_FEE_PERCENT = '2';
    const { fetch, calls } = mockFetch(200, {});
    await cashfreeRefund({ orderId: 'bkg_1', amountPaise: 100_000, vendorId: 'uf_org_1' }, fetch);
    expect(calls[0]!.url).toContain('/orders/bkg_1/refunds');
    expect(calls[0]!.body).toMatchObject({
      refund_amount: 1000,
      refund_splits: [{ vendor_id: 'uf_org_1', amount: 980 }],
    });
  });

  it('builds bank and UPI vendor payloads', () => {
    const base = {
      vendorId: 'uf_1',
      name: 'Asha Clinic',
      email: 'a@x.in',
      phone: '9876543210',
      kyc: { accountType: 'Proprietorship', businessType: 'Healthcare', pan: 'abcpv1234d' },
    };
    expect(
      buildVendorPayload({
        ...base,
        payout: {
          kind: 'bank',
          accountHolder: 'Asha',
          accountNumber: '1234567890',
          ifsc: 'hdfc0001234',
        },
      }),
    ).toMatchObject({
      vendor_id: 'uf_1',
      status: 'ACTIVE',
      verify_account: true,
      bank: { account_number: '1234567890', ifsc: 'HDFC0001234' },
      kyc_details: { pan: 'ABCPV1234D', business_type: 'Healthcare' },
    });
    const upi = buildVendorPayload({
      ...base,
      payout: { kind: 'upi', accountHolder: 'Asha', vpa: 'asha@okhdfc' },
    });
    expect(upi).toMatchObject({ upi: { vpa: 'asha@okhdfc' } });
    expect(upi).not.toHaveProperty('bank');
  });

  it('surfaces Cashfree error messages', async () => {
    const { fetch } = mockFetch(400, { message: 'vendor_id already exists' });
    await expect(
      cashfreeCreateVendor(
        {
          vendorId: 'uf_1',
          name: 'A',
          email: 'a@x.in',
          phone: '9876543210',
          payout: { kind: 'upi', accountHolder: 'A', vpa: 'a@upi' },
          kyc: { accountType: 'Individual', businessType: 'Education', pan: 'ABCPV1234D' },
        },
        fetch,
      ),
    ).rejects.toThrow(CashfreeError);
  });
});
