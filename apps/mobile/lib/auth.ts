import { createExpoAuthClient } from '@udyamflow/auth/expo-client';
import { AUTH_URL } from './env';

// Same base URL as tRPC, so sign-in on a physical device reaches the dev
// machine instead of the phone's own localhost.
export const expoAuthClient = createExpoAuthClient(AUTH_URL);

// `getCookie()` returns the stored session as a Cookie header value — used
// for requests the auth client doesn't make itself (tRPC).
export const { signIn, signUp, signOut, useSession, organization, getCookie } = expoAuthClient;
