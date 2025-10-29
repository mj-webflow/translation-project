import path from 'node:path';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { CallToolResultSchema } from '@modelcontextprotocol/sdk/types.js';

let clientPromise: Promise<Client> | null = null;

async function getClient(): Promise<Client> {
  if (!clientPromise) {
    clientPromise = (async () => {
      const client = new Client({ name: 'translation-app', version: '0.1.0' }, { capabilities: {} });
      const serverPath = path.resolve(process.cwd(), 'mcp-server.mjs');
      const env: Record<string, string> = {};
      if (process.env.WEBFLOW_API_TOKEN) env.WEBFLOW_API_TOKEN = process.env.WEBFLOW_API_TOKEN;
      if (process.env.WEBFLOW_SITE_ID) env.WEBFLOW_SITE_ID = process.env.WEBFLOW_SITE_ID;
      if (process.env.NODE_ENV) env.NODE_ENV = process.env.NODE_ENV;

      const transport = new StdioClientTransport({
        command: 'node',
        args: [serverPath],
        env,
        cwd: process.cwd(),
        stderr: 'inherit',
      });
      await client.connect(transport);
      // Warm tools cache (optional)
      try { await client.listTools({}); } catch { /* ignore */ }
      return client;
    })();
  }
  return clientPromise;
}

export async function callMcpTool<T = unknown>(name: string, args?: Record<string, unknown>): Promise<T> {
  const client = await getClient();
  const result = await client.callTool({ name, arguments: args ?? {} }, CallToolResultSchema);
  if (result.isError) {
    const content = (result as any).content;
    const first = Array.isArray(content) ? content[0] : undefined;
    const msg = first && first.type === 'text' && typeof first.text === 'string'
      ? first.text
      : 'Unknown MCP tool error';
    throw new Error(msg);
  }
  return ((result as any).structuredContent as T) ?? ({} as T);
}


