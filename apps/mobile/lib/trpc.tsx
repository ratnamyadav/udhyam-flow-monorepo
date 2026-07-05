import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { httpBatchLink, loggerLink } from '@trpc/client';
import { createTRPCReact } from '@trpc/react-query';
import type { AppRouter } from '@udyamflow/api';
import { type ReactNode, useMemo, useState } from 'react';
import superjson from 'superjson';

export const trpc = createTRPCReact<AppRouter>();

const baseUrl = process.env.EXPO_PUBLIC_AUTH_URL ?? 'http://localhost:3000';

// BetterAuth's Expo plugin stores the session as a Cookie string under
// `${storagePrefix}_cookie`. Our prefix is `udyamflow` (configured in
// expo-client.ts), so the key is `udyamflow_cookie`. The plugin's own
// fetch path injects this automatically; for tRPC we replicate the same
// behaviour by reading the cookie and forwarding it as the `Cookie`
// request header.

const COOKIE_KEY = 'udyamflow_cookie';

export function TRPCProvider({ children }: { children: ReactNode }) {
  const [queryClient] = useState(
    () => new QueryClient({ defaultOptions: { queries: { staleTime: 30_000, retry: 1 } } }),
  );

  const trpcClient = useMemo(
    () =>
      trpc.createClient({
        links: [
          loggerLink({
            enabled: (op) =>
              process.env.NODE_ENV === 'development' ||
              (op.direction === 'down' && op.result instanceof Error),
          }),
          httpBatchLink({
            url: `${baseUrl}/api/trpc`,
            transformer: superjson,
            async headers() {
              try {
                const SecureStore = await import('expo-secure-store');
                const cookie = await SecureStore.getItemAsync(COOKIE_KEY);
                if (cookie) return { Cookie: cookie };
              } catch {
                // SecureStore unavailable (web fallback / unit tests).
              }
              return {};
            },
          }),
        ],
      }),
    [],
  );

  return (
    <trpc.Provider client={trpcClient} queryClient={queryClient}>
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    </trpc.Provider>
  );
}
