import { authServerMetadata } from '@udyamflow/auth/mcp';

// The OAuth issuer is /api/auth, so clients look here (RFC 8414 path
// insertion: /.well-known/oauth-authorization-server/api/auth).
export const GET = authServerMetadata;
