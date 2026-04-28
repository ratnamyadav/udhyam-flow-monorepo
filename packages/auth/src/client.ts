// Browser auth client used by apps/web and apps/admin.

import { organizationClient } from 'better-auth/client/plugins';
import { createAuthClient } from 'better-auth/react';

export const authClient = createAuthClient({
  baseURL:
    typeof window === 'undefined' ? process.env.NEXT_PUBLIC_AUTH_URL : window.location.origin,
  plugins: [organizationClient()],
});

export const { signIn, signUp, signOut, useSession, organization, useListOrganizations } =
  authClient;
