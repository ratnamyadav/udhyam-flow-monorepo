// Expo auth client. Imported only by apps/mobile — keeps expo-secure-store
// out of the Node/Next.js bundle paths.

import { expoClient } from '@better-auth/expo/client';
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
  ],
});

export const { signIn, signUp, signOut, useSession } = expoAuthClient;
