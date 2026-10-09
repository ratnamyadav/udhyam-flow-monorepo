import type { CallToolResult } from '@modelcontextprotocol/server';
import { TRPCError } from '@trpc/server';

// Tool results are compact JSON text — every MCP client renders it and
// models read it well.
export function ok(data: unknown): CallToolResult {
  return { content: [{ type: 'text', text: JSON.stringify(data) }] };
}

// Expected failures (not found, slot taken, forbidden…) go back to the model
// as a readable tool error so it can tell the user or try something else.
export async function run(fn: () => Promise<unknown>): Promise<CallToolResult> {
  try {
    return ok(await fn());
  } catch (err) {
    if (err instanceof TRPCError) {
      return { isError: true, content: [{ type: 'text', text: err.message }] };
    }
    console.error('[mcp] tool failed', err);
    return {
      isError: true,
      content: [{ type: 'text', text: 'Something went wrong. Try again in a moment.' }],
    };
  }
}

export function money(cents: number | null | undefined, currency: string | null | undefined) {
  if (cents == null || !currency) return null;
  return `${currency} ${(cents / 100).toFixed(2)}`;
}
