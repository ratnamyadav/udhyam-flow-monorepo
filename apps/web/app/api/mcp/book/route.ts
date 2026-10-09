import { publicMcpHandler } from '@udyamflow/api/mcp';
import { db } from '@udyamflow/db';

// Public MCP endpoint: customers' assistants find a business and book it, no
// sign-in — the same surface as the public booking page.

const handler = publicMcpHandler({
  db,
  appUrl: process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000',
});

const handle = (req: Request) => handler.fetch(req);

export { handle as DELETE, handle as GET, handle as POST };
