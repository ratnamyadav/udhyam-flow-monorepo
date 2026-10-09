import { ownerMcpHandler } from '@udyamflow/api/mcp';
import { verifyMcpRequest } from '@udyamflow/auth/mcp';
import { db } from '@udyamflow/db';

// MCP endpoint for business owners' AI assistants. Clients discover the OAuth
// server from the 401 challenge, sign the owner in, then call tools with a
// bearer token scoped to one workspace.

const handler = ownerMcpHandler({
  db,
  appUrl: process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000',
});

async function handle(req: Request) {
  const identity = await verifyMcpRequest(req);
  if (identity instanceof Response) return identity;
  return handler.fetch(req, {
    authInfo: {
      token: '',
      clientId: identity.clientId,
      scopes: identity.scopes,
      extra: { identity },
    },
  });
}

export { handle as DELETE, handle as GET, handle as POST };
