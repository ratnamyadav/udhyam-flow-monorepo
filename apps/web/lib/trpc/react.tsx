'use client';

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { httpBatchLink, loggerLink } from '@trpc/client';
import { createTRPCReact } from '@trpc/react-query';
import type { AppRouter } from '@udyamflow/api';
import { useSession } from '@udyamflow/auth/client';
import { useState } from 'react';
import superjson from 'superjson';

export const trpc = createTRPCReact<AppRouter>();

function getBaseUrl() {
  if (typeof window !== 'undefined') return '';
  if (process.env.NEXT_PUBLIC_APP_URL) return process.env.NEXT_PUBLIC_APP_URL;
  return `http://localhost:3000`;
}

export function TRPCReactProvider({ children }: { children: React.ReactNode }) {
  const { data: session, isPending } = useSession();
  return <ScopedProvider key={useScopeKey(session, isPending)}>{children}</ScopedProvider>;
}

// Remount key for the query cache: bumps only when the signed-in user or
// active workspace changes. The first settled session is adopted without a
// bump, so the initial loading → loaded step doesn't remount the whole app.
function useScopeKey(
  session:
    | { user: { id: string }; session: { activeOrganizationId?: string | null } }
    | null
    | undefined,
  isPending: boolean,
) {
  const scope = isPending
    ? null
    : `${session?.user.id ?? 'guest'}:${session?.session.activeOrganizationId ?? ''}`;
  const [state, setState] = useState<{ scope: string | null; key: number }>({
    scope: null,
    key: 0,
  });
  if (scope !== null && scope !== state.scope) {
    const next = { scope, key: state.scope === null ? state.key : state.key + 1 };
    setState(next);
    return next.key;
  }
  return state.key;
}

function ScopedProvider({ children }: { children: React.ReactNode }) {
  const [queryClient] = useState(() => new QueryClient());
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
