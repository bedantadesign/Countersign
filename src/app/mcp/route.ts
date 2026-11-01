import { createMcpHandler } from '@modelcontextprotocol/server';
import { createServer } from '@/mcp/server';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
// A live plan can take most of a minute.
export const maxDuration = 60;

/** Streamable HTTP, stateless: a fresh server per request. Add `<site>/mcp` to a chat client as a connector. */
const handler = createMcpHandler(() => createServer());

const serve = (request: Request) => handler.fetch(request);
export { serve as GET, serve as POST, serve as DELETE };
