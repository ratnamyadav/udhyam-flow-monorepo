// Client-side env. Browser-visible vars only (NEXT_PUBLIC_* / EXPO_PUBLIC_*).
// Validated at module load; throws if a required var is missing so we crash
// loudly in dev instead of silently falling back to undefined later.

import { z } from 'zod';

export const clientEnvSchema = z.object({
  NEXT_PUBLIC_APP_URL: z.url(),
  NEXT_PUBLIC_AUTH_URL: z.url(),
});

export type ClientEnv = z.infer<typeof clientEnvSchema>;

export function getClientEnv(): ClientEnv {
  const parsed = clientEnvSchema.safeParse({
    NEXT_PUBLIC_APP_URL: process.env.NEXT_PUBLIC_APP_URL,
    NEXT_PUBLIC_AUTH_URL: process.env.NEXT_PUBLIC_AUTH_URL,
  });
  if (!parsed.success) {
    const flat = parsed.error.flatten().fieldErrors;
    const lines = Object.entries(flat).map(([k, v]) => `  • ${k}: ${(v ?? []).join(', ')}`);
    throw new Error(`Invalid or missing client env vars:\n${lines.join('\n')}`);
  }
  return parsed.data;
}
