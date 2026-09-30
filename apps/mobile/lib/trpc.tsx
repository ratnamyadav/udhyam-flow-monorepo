import { QueryCache, QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { httpBatchLink, loggerLink, TRPCClientError } from '@trpc/client';
import { createTRPCReact } from '@trpc/react-query';
import type { AppRouter } from '@udyamflow/api';
import { router } from 'expo-router';
import { type ReactNode, useState } from 'react';
import superjson from 'superjson';
import { expoAuthClient } from '@/lib/auth';
import { AUTH_URL } from './env';

export const trpc = createTRPCReact<AppRouter>();

/** tRPC error code (`'CONFLICT'`, `'PRECONDITION_FAILED'`, …) of an unknown error. */
export function trpcErrorCode(error: unknown): string | undefined {
  if (error instanceof TRPCClientError) {
    const data = error.data as { code?: string } | undefined;
    return data?.code;
  }
  return undefined;
}

/** Message that is safe to show to the user for a failed query / mutation. */
export function errorMessage(error: unknown, fallback = 'Something went wrong.'): string {
  if (error instanceof Error && error.message) return error.message;
  return fallback;
}

/**
 * Tenant procedures throw PRECONDITION_FAILED when the user has no
 * organization at all (the server already falls back to the first membership
 * when none is active). Queries that handle this themselves opt out of the
 * global redirect with `meta: { handlesNoOrganization: true }`.
 */
export function isNoOrganizationError(error: unknown): boolean {
  return trpcErrorCode(error) === 'PRECONDITION_FAILED';
}

const NON_RETRYABLE = new Set([
  'BAD_REQUEST',
  'UNAUTHORIZED',
  'FORBIDDEN',
  'NOT_FOUND',
  'CONFLICT',
  'PRECONDITION_FAILED',
  'TOO_MANY_REQUESTS',
]);

function createQueryClient() {
  return new QueryClient({
    queryCache: new QueryCache({
      onError(error, query) {
        if (query.meta?.handlesNoOrganization) return;
        if (isNoOrganizationError(error)) router.replace('/no-organization');
      },
    }),
    defaultOptions: {
      queries: {
        staleTime: 30_000,
        retry: (failureCount, error) => {
          const code = trpcErrorCode(error);
          if (code && NON_RETRYABLE.has(code)) return false;
          return failureCount < 1;
        },
      },
    },
  });
}

export function TRPCProvider({ children }: { children: ReactNode }) {
  const [queryClient] = useState(createQueryClient);

  const [trpcClient] = useState(() =>
    trpc.createClient({
      links: [
        loggerLink({
          enabled: (op) =>
            process.env.NODE_ENV === 'development' ||
            (op.direction === 'down' && op.result instanceof Error),
        }),
        httpBatchLink({
          url: `${AUTH_URL}/api/trpc`,
          transformer: superjson,
          // BetterAuth's Expo plugin keeps the session cookies in SecureStore
          // and exposes them as a ready-made `Cookie` header value. Native has
          // no cookie jar we want involved, so never send ambient credentials.
          headers() {
            const cookie = expoAuthClient.getCookie();
            return cookie ? { Cookie: cookie } : {};
          },
          fetch: (url, options) => fetch(url, { ...options, credentials: 'omit' }),
        }),
      ],
    }),
  );

  return (
    <trpc.Provider client={trpcClient} queryClient={queryClient}>
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    </trpc.Provider>
  );
}
