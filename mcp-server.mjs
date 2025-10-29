#!/usr/bin/env node

import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport as RemoteStdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import {
  ListToolsRequestSchema,
  ListToolsResultSchema,
  CallToolRequestSchema,
  CallToolResultSchema,
} from '@modelcontextprotocol/sdk/types.js';

// Minimal stdio MCP server with a simple echo tool
const server = new Server(
  { name: 'translation-mcp', version: '0.1.0' },
  { capabilities: { tools: {} } }
);

// Lazy Webflow MCP client connected over SSE via mcp-remote (stdio bridge)
let webflowClientPromise = null;

async function getWebflowMcpClient() {
  if (!webflowClientPromise) {
    webflowClientPromise = (async () => {
      const client = new Client({ name: 'translation-mcp-webflow-proxy', version: '0.1.0' }, { capabilities: {} });
      const transport = new RemoteStdioClientTransport({
        command: 'npx',
        args: ['--yes', 'mcp-remote', 'https://mcp.webflow.com/sse'],
        env: {
          // If your environment already has Webflow auth via mcp-remote, this is not required
          WEBFLOW_API_TOKEN: process.env.WEBFLOW_API_TOKEN,
          NODE_ENV: process.env.NODE_ENV,
        },
        stderr: 'inherit',
      });
      await client.connect(transport);
      try { await client.listTools({}); } catch { /* ignore */ }
      return client;
    })();
  }
  return webflowClientPromise;
}

// Advertise available tools
server.setRequestHandler(ListToolsRequestSchema, async (_request) => {
  return ListToolsResultSchema.parse({
    tools: [
      {
        name: 'echo',
        title: 'Echo',
        description: 'Echo a message back to you',
        inputSchema: {
          type: 'object',
          properties: { message: { type: 'string' } },
          required: ['message'],
        },
      },
      {
        name: 'get_page_content',
        title: 'Get Page Content',
        description: 'Fetch Webflow page static content nodes by pageId',
        inputSchema: {
          type: 'object',
          properties: { pageId: { type: 'string' } },
          required: ['pageId'],
        },
        outputSchema: {
          type: 'object',
          properties: {
            nodes: {
              type: 'array',
              items: {
                type: 'object',
                properties: {
                  nodeId: { type: 'string' },
                  text: { type: 'string' },
                  type: { type: 'string' },
                },
                required: ['nodeId'],
              },
            },
          },
          required: ['nodes'],
        },
      },
      {
        name: 'update_page_content',
        title: 'Update Page Content',
        description: 'Update Webflow page static content for a locale',
        inputSchema: {
          type: 'object',
          properties: {
            pageId: { type: 'string' },
            localeId: { type: 'string' },
            nodes: {
              type: 'array',
              items: {
                type: 'object',
                properties: {
                  nodeId: { type: 'string' },
                  text: { type: 'string' },
                },
                required: ['nodeId', 'text'],
              },
            },
          },
          required: ['pageId', 'localeId', 'nodes'],
        },
        outputSchema: {
          type: 'object',
          properties: { success: { type: 'boolean' } },
          required: ['success'],
        },
      },
    ],
  });
});

// Handle tool calls
server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;

  if (name === 'echo') {
    const message = typeof args?.message === 'string' ? args.message : '';
    return CallToolResultSchema.parse({
      content: [{ type: 'text', text: `Echo: ${message}` }],
    });
  }

  if (name === 'get_page_content') {
    const pageId = typeof args?.pageId === 'string' ? args.pageId : '';
    if (!pageId) {
      return CallToolResultSchema.parse({ content: [{ type: 'text', text: 'Missing pageId' }], isError: true });
    }
    const wfClient = await getWebflowMcpClient();
    const mcpResult = await wfClient.callTool({ name: 'pages_get_content', arguments: { page_id: pageId } }, CallToolResultSchema);
    // eslint-disable-next-line no-console
    console.error('[mcp-server] pages_get_content raw result', {
      isError: mcpResult.isError,
      hasStructured: !!mcpResult.structuredContent,
      structuredKeys: mcpResult.structuredContent ? Object.keys(mcpResult.structuredContent) : [],
      nodesCount: Array.isArray(mcpResult.structuredContent?.nodes) ? mcpResult.structuredContent.nodes.length : undefined,
    });
    if (mcpResult.isError) {
      const msg = mcpResult.content?.[0]?.type === 'text' ? (mcpResult.content[0]).text : 'Webflow MCP error fetching content';
      return CallToolResultSchema.parse({ content: [{ type: 'text', text: msg }], isError: true });
    }
    const nodes = (mcpResult.structuredContent && mcpResult.structuredContent.nodes) ? mcpResult.structuredContent.nodes : [];
    return CallToolResultSchema.parse({ structuredContent: { nodes } });
  }

  if (name === 'update_page_content') {
    const pageId = typeof args?.pageId === 'string' ? args.pageId : '';
    const localeId = typeof args?.localeId === 'string' ? args.localeId : '';
    const nodes = Array.isArray(args?.nodes) ? args.nodes : [];
    if (!pageId || !localeId || nodes.length === 0) {
      return CallToolResultSchema.parse({ content: [{ type: 'text', text: 'Missing pageId, localeId, or nodes' }], isError: true });
    }
    const wfClient = await getWebflowMcpClient();
    const mcpResult = await wfClient.callTool(
      { name: 'pages_update_static_content', arguments: { page_id: pageId, localeId, nodes } },
      CallToolResultSchema
    );
    if (mcpResult.isError) {
      const msg = mcpResult.content?.[0]?.type === 'text' ? (mcpResult.content[0]).text : 'Webflow MCP error updating content';
      return CallToolResultSchema.parse({ content: [{ type: 'text', text: msg }], isError: true });
    }
    return CallToolResultSchema.parse({ structuredContent: { success: true } });
  }

  throw new Error(`Unknown tool: ${name}`);
});

async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  // eslint-disable-next-line no-console
  console.error('translation-mcp: server running on stdio');
}

main().catch((error) => {
  // eslint-disable-next-line no-console
  console.error('translation-mcp: fatal error', error);
  process.exit(1);
});


