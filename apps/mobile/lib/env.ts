import Constants from 'expo-constants';

// Base URL of the web app (BetterAuth handler + tRPC API + web booking pages).
//
// Resolution order:
//   1. EXPO_PUBLIC_AUTH_URL — from the shell, apps/mobile/.env, or the monorepo
//      root .env (app.config.ts / metro.config.js load ../../.env too).
//   2. In development, the machine running Metro: `Constants.expoConfig.hostUri`
//      is "<lan-ip>:<metro-port>", and `pnpm dev` serves the web app on :3000.
//      `localhost` would point at the phone itself on a real device.
//   3. Production fallback.
const PRODUCTION_URL = 'https://udyamflow.com';
const DEV_API_PORT = 3000;

function devHostUrl(): string | null {
  const hostUri = Constants.expoConfig?.hostUri;
  if (!hostUri) return null;
  // Strip the Metro port ("192.168.1.20:8081" → "192.168.1.20").
  const host = hostUri
    .replace(/^[a-z]+:\/\//i, '')
    .split('/')[0]
    ?.replace(/:\d+$/, '');
  return host ? `http://${host}:${DEV_API_PORT}` : null;
}

function resolveAuthUrl(): string {
  const fromEnv = process.env.EXPO_PUBLIC_AUTH_URL;
  if (fromEnv) return fromEnv;
  if (__DEV__) return devHostUrl() ?? `http://localhost:${DEV_API_PORT}`;
  return PRODUCTION_URL;
}

export const AUTH_URL = resolveAuthUrl().replace(/\/+$/, '');

/** Web onboarding — where users without an organization finish setup. */
export const ONBOARDING_URL = `${AUTH_URL}/onboarding/account`;
