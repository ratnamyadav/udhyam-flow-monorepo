import { mcpProtectedResourceMetadata } from '@udyamflow/auth/mcp';

// Served at both /.well-known/oauth-protected-resource and the RFC 9728
// path form /.well-known/oauth-protected-resource/api/mcp.
export const GET = () => mcpProtectedResourceMetadata();
