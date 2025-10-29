#!/usr/bin/env node

import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';

async function main() {
  const token = process.env.WEBFLOW_API_TOKEN;
  if (!token) {
    console.error('WEBFLOW_API_TOKEN is not set. Export it before running.');
    process.exit(1);
  }

  const client = new Client({ name: 'mcp-test-list-tools', version: '0.1.0' }, { capabilities: {} });
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

  const tools = await client.listTools({});
  console.log(JSON.stringify(tools, null, 2));
}

main().catch((err) => {
  console.error(err?.stack || String(err));
  process.exit(1);
});


