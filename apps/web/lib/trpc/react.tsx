'use client';

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { httpBatchLink, loggerLink } from '@trpc/client';
import { createTRPCReact } from '@trpc/react-query';
import type { AppRouter } from '@udyamflow/api';
import { useSession } from '@udyamflow/auth/client';
import { useEffect, useRef, useState } from 'react';
import superjson from 'superjson';

export const trpc = createTRPCReact<AppRouter>();

function getBaseUrl() {
  if (typeof window !== 'undefined') return '';
  if (process.env.NEXT_PUBLIC_APP_URL) return process.env.NEXT_PUBLIC_APP_URL;
  return `http://localhost:3000`;
}

export function TRPCReactProvider({ children }: { children: React.ReactNode }) {
  const [queryClient] = useState(() => new QueryClient());
  const { data: session, isPending } = useSession();
  useResetCacheOnScopeChange(queryClient, session, isPending);
  const [trpcClient] = useState(() =>
    trpc.createClient({
      links: [
        loggerLink({
          enabled: (op) =>
            process.env.NODE_ENV === 'development' ||
            (op.direction === 'down' && op.result instanceof Error),
        }),
        httpBatchLink({
          url: `${getBaseUrl()}/api/trpc`,
          transformer: superjson,
          headers: () => ({ 'x-trpc-source': 'web' }),
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

// Drops cached data when the signed-in user or active workspace changes, so
// one account never sees another's data. The provider and navigation stay
// mounted (remounting them would lose in-flight navigation, e.g. sign-in's
// redirect); the cache is reset instead and active queries refetch.
function useResetCacheOnScopeChange(
  queryClient: QueryClient,
  session:
    | { user: { id: string }; session: { activeOrganizationId?: string | null } }
    | null
    | undefined,
  isPending: boolean,
) {
  const scope = isPending
    ? null
    : `${session?.user.id ?? 'guest'}:${session?.session.activeOrganizationId ?? ''}`;
  const settled = useRef<string | null>(null);
  useEffect(() => {
    if (scope === null) return;
    const previous = settled.current;
    settled.current = scope;
    if (previous === null || previous === scope) return;
    void queryClient.cancelQueries().then(() => {
      queryClient.removeQueries({ type: 'inactive' });
      return queryClient.resetQueries({ type: 'active' });
    });
  }, [scope, queryClient]);
}
