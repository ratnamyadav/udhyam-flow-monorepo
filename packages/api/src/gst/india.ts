// Indian identifiers + GST state codes, shared by GST invoicing and Cashfree
// vendor onboarding. Pure functions — safe to import from the browser too.

// GST state/UT codes (first two digits of a GSTIN; also "place of supply").
export const GST_STATES: Record<string, string> = {
  '01': 'Jammu and Kashmir',
  '02': 'Himachal Pradesh',
  '03': 'Punjab',
  '04': 'Chandigarh',
  '05': 'Uttarakhand',
  '06': 'Haryana',
  '07': 'Delhi',
  '08': 'Rajasthan',
  '09': 'Uttar Pradesh',
  '10': 'Bihar',
  '11': 'Sikkim',
  '12': 'Arunachal Pradesh',
  '13': 'Nagaland',
  '14': 'Manipur',
  '15': 'Mizoram',
  '16': 'Tripura',
  '17': 'Meghalaya',
  '18': 'Assam',
  '19': 'West Bengal',
  '20': 'Jharkhand',
  '21': 'Odisha',
  '22': 'Chhattisgarh',
  '23': 'Madhya Pradesh',
  '24': 'Gujarat',
  '26': 'Dadra and Nagar Haveli and Daman and Diu',
  '27': 'Maharashtra',
  '29': 'Karnataka',
  '30': 'Goa',
  '31': 'Lakshadweep',
  '32': 'Kerala',
  '33': 'Tamil Nadu',
  '34': 'Puducherry',
  '35': 'Andaman and Nicobar Islands',
  '36': 'Telangana',
  '37': 'Andhra Pradesh',
  '38': 'Ladakh',
};

export function isStateCode(code: string): boolean {
  return code in GST_STATES;
}

const GSTIN_RE = /^(\d{2})([A-Z]{5}\d{4}[A-Z])([1-9A-Z])Z([0-9A-Z])$/;
const GSTIN_CHARS = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ';

// Validates structure, state code and the mod-36 check digit.
export function isValidGstin(raw: string): boolean {
  const g = raw.trim().toUpperCase();
  const m = GSTIN_RE.exec(g);
  if (!m || !isStateCode(m[1]!)) return false;
  let sum = 0;
  for (let i = 0; i < 14; i++) {
    const v = GSTIN_CHARS.indexOf(g[i]!);
    const product = v * (i % 2 === 0 ? 1 : 2);
    sum += Math.floor(product / 36) + (product % 36);
  }
  const check = GSTIN_CHARS[(36 - (sum % 36)) % 36];
  return check === g[14];
}

export function stateCodeFromGstin(gstin: string): string {
  return gstin.trim().slice(0, 2);
}

export function isValidPan(raw: string): boolean {
  return /^[A-Z]{5}\d{4}[A-Z]$/.test(raw.trim().toUpperCase());
}

export function isValidIfsc(raw: string): boolean {
  return /^[A-Z]{4}0[A-Z0-9]{6}$/.test(raw.trim().toUpperCase());
}

// SAC (services) codes are 6 digits starting with 99; HSN for goods is
// 4–8 digits. We accept either, 4–8 digits.
export function isValidHsnSac(raw: string): boolean {
  return /^\d{4,8}$/.test(raw.trim());
}

// Indian mobile, returned as 10 digits (strips +91 / 0 prefixes).
export function normalizeIndianMobile(raw: string): string | null {
  const digits = raw.replace(/\D/g, '');
  const ten =
    digits.length === 12 && digits.startsWith('91')
      ? digits.slice(2)
      : digits.length === 11 && digits.startsWith('0')
        ? digits.slice(1)
        : digits;
  return /^[6-9]\d{9}$/.test(ten) ? ten : null;
}
