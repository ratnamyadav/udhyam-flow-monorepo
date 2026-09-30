import Stripe from 'stripe';

// Lazily-constructed platform Stripe client. Null when STRIPE_SECRET_KEY is
// unset so callers can degrade to "not configured" instead of crashing.

let _stripe: Stripe | null = null;

export function getStripe(): Stripe | null {
  if (_stripe) return _stripe;
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) return null;
  _stripe = new Stripe(key);
  return _stripe;
}
