// Money helpers for providers that take decimal strings (FreshBooks).
// Prices are stored as integer minor units (`price_cents`) everywhere else.

export function centsToDecimalString(cents: number): string {
  const sign = cents < 0 ? '-' : '';
  const abs = Math.abs(Math.trunc(cents));
  const whole = Math.floor(abs / 100);
  const frac = String(abs % 100).padStart(2, '0');
  return `${sign}${whole}.${frac}`;
}

// YYYY-MM-DD in UTC — FreshBooks create_date / payment date format.
export function isoDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}
