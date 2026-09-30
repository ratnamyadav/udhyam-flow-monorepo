// Expo auth client. Imported only by apps/mobile — keeps expo-secure-store
// out of the Node/Next.js bundle paths.

import { expoClient } from '@better-auth/expo/client';
import { organizationClient } from 'better-auth/client/plugins';
import { createAuthClient } from 'better-auth/react';
import * as SecureStore from 'expo-secure-store';

export const expoAuthClient = createAuthClient({
  baseURL: process.env.EXPO_PUBLIC_AUTH_URL ?? 'http://localhost:3000',
  plugins: [
    expoClient({
      scheme: 'udyamflow',
      storagePrefix: 'udyamflow',
      storage: SecureStore,
    }),
    organizationClient(),
  ],
});

// `getCookie()` returns the stored session as a Cookie header value — use it
// for requests the auth client doesn't make itself (tRPC).
export const { signIn, signUp, signOut, useSession, organization, getCookie } = expoAuthClient;
