#!/usr/bin/env node

import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { CallToolResultSchema } from '@modelcontextprotocol/sdk/types.js';

async function main() {
  const token = process.env.WEBFLOW_API_TOKEN;
  if (!token) {
    console.error('WEBFLOW_API_TOKEN is not set. Export it before running.');
    process.exit(1);
  }

  const pageId = process.argv[2];
  if (!pageId) {
    console.error('Usage: node scripts/mcp-get-page-content.mjs <pageId>');
    process.exit(1);
  }

  const client = new Client({ name: 'mcp-test-get-page', version: '0.1.0' }, { capabilities: {} });
  const transport = new StdioClientTransport({
    command: 'npx',
    args: ['--yes', 'mcp-remote', 'https://mcp.webflow.com/sse'],
    env: {
      WEBFLOW_API_TOKEN: token,
      NODE_ENV: process.env.NODE_ENV || 'development',
    },
    stderr: 'inherit',
  });
  await client.connect(transport);

  const result = await client.callTool(
    { name: 'pages_get_content', arguments: { page_id: pageId } },
    CallToolResultSchema
  );

  if (result.isError) {
    const msg = Array.isArray(result.content) && result.content[0]?.type === 'text'
      ? result.content[0].text
      : 'Unknown MCP error';
    console.error('Error:', msg);
    process.exit(2);
  }

  const nodes = result.structuredContent?.nodes || [];
  console.log(JSON.stringify({ nodesCount: nodes.length, nodes }, null, 2));
}

main().catch((err) => {
  console.error(err?.stack || String(err));
  process.exit(1);
});


