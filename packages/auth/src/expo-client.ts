// Expo auth client. Imported only by apps/mobile — keeps expo-secure-store
// out of the Node/Next.js bundle paths.
//
// A factory rather than a singleton: the base URL depends on the device
// (EXPO_PUBLIC_AUTH_URL, the Metro host's LAN IP in dev, or production), and
// that resolution lives in the app (apps/mobile/lib/env.ts).

import { expoClient } from '@better-auth/expo/client';
import { organizationClient } from 'better-auth/client/plugins';
import { createAuthClient } from 'better-auth/react';
import * as SecureStore from 'expo-secure-store';

export function createExpoAuthClient(baseURL: string) {
  return createAuthClient({
    baseURL,
    plugins: [
      expoClient({
        scheme: 'udyamflow',
        storagePrefix: 'udyamflow',
        storage: SecureStore,
      }),
      organizationClient(),
    ],
  });
}

export type ExpoAuthClient = ReturnType<typeof createExpoAuthClient>;
