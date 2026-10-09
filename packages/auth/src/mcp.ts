// Server-side pieces the web app needs to protect its MCP endpoint with the
// OAuth provider: token verification and the discovery documents clients
// (Claude, ChatGPT, …) fetch before signing in.

import { oauthProviderAuthServerMetadata } from '@better-auth/oauth-provider';
import { oauthProviderResourceClient } from '@better-auth/oauth-provider/resource-client';
import { db } from '@udyamflow/db';
import { AUTH_ISSUER, auth, MCP_RESOURCE, MCP_SCOPES } from './server';

const resourceClient = oauthProviderResourceClient(auth).getActions();
type ResourceClient = typeof resourceClient;
const metadataUrl = `${new URL(MCP_RESOURCE).origin}/.well-known/oauth-protected-resource${new URL(MCP_RESOURCE).pathname}`;

export type McpIdentity = {
  userId: string;
  organizationId: string;
  scopes: string[];
  clientId: string;
};

function errorResponse(err: unknown): Response {
  const e = err as { statusCode?: unknown; headers?: ResponseInit['headers']; message?: string };
  if (typeof e?.statusCode === 'number') {
    return Response.json(
      { error: e.statusCode === 403 ? 'insufficient_scope' : 'invalid_token', message: e.message },
      { status: e.statusCode, headers: e.headers },
    );
  }
  console.error('[mcp] token verification failed', err);
  return Response.json({ error: 'server_error' }, { status: 500 });
}

// The caller's identity from its OAuth access token, or the 401/403 response
// whose WWW-Authenticate challenge sends the client to sign in. Tests pass
// their own auth instance and database.
export function createMcpVerifier(
  authInstance: typeof auth = auth,
  database: Pick<typeof db, 'query'> = db,
) {
  const verifier =
    authInstance === auth ? resourceClient : oauthProviderResourceClient(authInstance).getActions();
  return (req: Request) => verifyMcpRequestWith(verifier, database, req);
}

export const verifyMcpRequest = createMcpVerifier();

async function verifyMcpRequestWith(
  verifier: ResourceClient,
  database: Pick<typeof db, 'query'>,
  req: Request,
): Promise<McpIdentity | Response> {
  try {
    const payload = await verifier.verifyAccessTokenRequest(req, {
      verifyOptions: { audience: MCP_RESOURCE, issuer: AUTH_ISSUER },
      jwksUrl: `${AUTH_ISSUER}/jwks`,
    });
    if (!payload.sub || typeof payload.org !== 'string') {
      return Response.json(
        { error: 'invalid_token', message: 'Reconnect and pick a workspace.' },
        { status: 401 },
      );
    }
    const identity = {
      userId: payload.sub,
      organizationId: payload.org,
      scopes: typeof payload.scope === 'string' ? payload.scope.split(' ') : [],
      clientId: String(payload.azp ?? payload.client_id ?? ''),
    };
    // Disconnecting an assistant deletes its consent; access tokens are
    // stateless JWTs, so check the consent still stands on every call.
    const consent = await database.query.oauthConsent.findFirst({
      columns: { id: true },
      where: (c, { and, eq }) =>
        and(
          eq(c.clientId, identity.clientId),
          eq(c.userId, identity.userId),
          eq(c.referenceId, identity.organizationId),
        ),
    });
    if (!consent) {
      return Response.json(
        { error: 'invalid_token', message: 'This assistant was disconnected.' },
        {
          status: 401,
          headers: {
            'WWW-Authenticate': `Bearer error="invalid_token", resource_metadata="${metadataUrl}"`,
          },
        },
      );
    }
    return identity;
  } catch (err) {
    return errorResponse(err);
  }
}

// RFC 9728 document for the MCP endpoint.
export async function mcpProtectedResourceMetadata(): Promise<Response> {
  const metadata = await resourceClient.getProtectedResourceMetadata({
    resource: MCP_RESOURCE,
    authorization_servers: [AUTH_ISSUER],
    scopes_supported: ['offline_access', ...MCP_SCOPES],
    resource_name: 'UdyamFlow',
  });
  return Response.json(metadata, {
    headers: { 'access-control-allow-origin': '*', 'cache-control': 'public, max-age=300' },
  });
}

// RFC 8414 document for the issuer (served at the site root, since the
// issuer has the /api/auth path).
export const authServerMetadata = oauthProviderAuthServerMetadata(auth, {
  headers: { 'access-control-allow-origin': '*' },
});
