import { createMcpHandler } from '@modelcontextprotocol/server';
import type { Db } from '@udyamflow/db';
import { createOwnerMcpServer, type OwnerIdentity } from './owner';
import { createPublicMcpServer } from './public';

export type { OwnerIdentity };

// Stateless HTTP handlers (a fresh server per request — fits serverless).
// The owner handler trusts `authInfo.extra.identity`: the route sets it only
// after verifying the OAuth access token.
export function ownerMcpHandler(opts: { db: Db; appUrl: string }) {
  return createMcpHandler((ctx) => {
    const identity = ctx.authInfo?.extra?.identity as OwnerIdentity | undefined;
    if (!identity) throw new Error('MCP request reached the owner server without a verified token');
    return createOwnerMcpServer({
      ...opts,
      identity,
      headers: ctx.requestInfo?.headers ?? new Headers(),
    });
  });
}

export function publicMcpHandler(opts: { db: Db; appUrl: string }) {
  return createMcpHandler((ctx) =>
    createPublicMcpServer({ ...opts, headers: ctx.requestInfo?.headers ?? new Headers() }),
  );
}
