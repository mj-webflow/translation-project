import { NextRequest, NextResponse } from 'next/server';
import { callMcpTool } from '@/lib/mcpClient';

export async function PUT(request: NextRequest) {
  try {
    const { pageId, localeId, nodes } = await request.json();

    if (!pageId || !localeId || !Array.isArray(nodes)) {
      return NextResponse.json(
        { error: 'pageId, localeId and nodes are required' },
        { status: 400 }
      );
    }

    // Log and delegate update to MCP tool
    // eslint-disable-next-line no-console
    console.log('[api/webflow/update-page] MCP update_page_content request', { pageId, localeId, nodesCount: Array.isArray(nodes) ? nodes.length : 0 });
    const result = await callMcpTool<{ success: boolean }>('update_page_content', { pageId, localeId, nodes });
    return NextResponse.json(result);
  } catch (error) {
    return NextResponse.json(
      { error: 'Internal server error', details: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}


