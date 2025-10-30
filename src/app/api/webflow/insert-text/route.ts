import { NextRequest, NextResponse } from 'next/server';
import { callMcpTool } from '@/lib/mcpClient';

export async function POST(request: NextRequest) {
  try {
    const { pageId, text } = await request.json();

    const siteId = process.env.WEBFLOW_SITE_ID || '68c83fa8b4d1c57c202101a3';
    // eslint-disable-next-line no-console
    console.log('[api/webflow/insert-text] request', { pageId, hasText: typeof text === 'string', siteId });

    if (!pageId || typeof pageId !== 'string') {
      return NextResponse.json(
        { error: 'pageId is required' },
        { status: 400 }
      );
    }

    const result = await callMcpTool<{ success: boolean }>('insert_text_on_page', {
      siteId,
      pageId,
      text: typeof text === 'string' && text.length > 0 ? text : 'Inserted',
    });

    return NextResponse.json(result);
  } catch (error) {
    return NextResponse.json(
      { error: 'Internal server error', details: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}


