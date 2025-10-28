import { NextRequest, NextResponse } from 'next/server';

const WEBFLOW_API_TOKEN = process.env.WEBFLOW_API_TOKEN;

export async function PUT(request: NextRequest) {
  try {
    if (!WEBFLOW_API_TOKEN) {
      return NextResponse.json(
        { error: 'Webflow API token not configured' },
        { status: 500 }
      );
    }

    const { pageId, localeId, nodes } = await request.json();

    if (!pageId || !localeId || !Array.isArray(nodes)) {
      return NextResponse.json(
        { error: 'pageId, localeId and nodes are required' },
        { status: 400 }
      );
    }

    const response = await fetch(`https://api.webflow.com/v2/pages/${pageId}/static_content`, {
      method: 'PUT',
      headers: {
        Authorization: `Bearer ${WEBFLOW_API_TOKEN}`,
        'accept-version': '1.0.0',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ localeId, nodes }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      return NextResponse.json(
        { error: 'Failed to update page content', details: errorText },
        { status: response.status }
      );
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    return NextResponse.json(
      { error: 'Internal server error', details: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}


