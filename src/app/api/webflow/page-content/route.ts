import { NextRequest, NextResponse } from 'next/server';
import { callMcpTool } from '@/lib/mcpClient';

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const pageId = searchParams.get('pageId');
    console.log('pageId', pageId);

    if (!pageId) {
      return NextResponse.json(
        { error: 'pageId is required' },
        { status: 400 }
      );
    }

    // Log and delegate to MCP tool
    // eslint-disable-next-line no-console
    console.log('[api/webflow/page-content] MCP get_page_content request', { pageId });
    const data = await callMcpTool<{ nodes: Array<{ nodeId: string; text?: string; type?: string }> }>('get_page_content', { pageId });
    // eslint-disable-next-line no-console
    console.log('[api/webflow/page-content] MCP get_page_content response', { nodesCount: Array.isArray((data as any)?.nodes) ? (data as any).nodes.length : 0 });
    console.log('data', NextResponse.json(data));
    return NextResponse.json(data);
    
  } catch (error) {
    return NextResponse.json(
      { error: 'Internal server error', details: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}


