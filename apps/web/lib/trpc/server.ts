import 'server-only';
import { appRouter, createTRPCContext } from '@udyamflow/api';
import { headers } from 'next/headers';
import { cache } from 'react';

// Server-side tRPC caller for use in React Server Components.
// `cache()` keeps the context per-request, so multiple RSC reads share one session lookup.
const createContext = cache(async () => {
  const reqHeaders = new Headers(await headers());
  reqHeaders.set('x-trpc-source', 'rsc');
  return createTRPCContext({ headers: reqHeaders });
});

export const trpcServer = cache(async () => appRouter.createCaller(await createContext()));
