import { NextRequest, NextResponse } from 'next/server';

const WEBFLOW_API_TOKEN = process.env.WEBFLOW_API_TOKEN;
const DEFAULT_WEBFLOW_SITE_ID = process.env.WEBFLOW_SITE_ID || '';

export async function GET(request: NextRequest) {
  try {
    const overrideToken = request.headers.get('x-webflow-token') || '';

    const { searchParams } = new URL(request.url);
    const siteId = searchParams.get('siteId') || DEFAULT_WEBFLOW_SITE_ID;
    if (!siteId) {
      return NextResponse.json(
        { error: 'Missing siteId. Provide ?siteId=... or set WEBFLOW_SITE_ID.' },
        { status: 400 }
      );
    }

    const requestUrl = `https://api.webflow.com/v2/sites/${siteId}/pages`;
    const token = overrideToken || WEBFLOW_API_TOKEN;
    if (!token) {
      return NextResponse.json(
        { error: 'Webflow API token not configured. Provide x-webflow-token header or set WEBFLOW_API_TOKEN.' },
        { status: 500 }
      );
    }
    const requestHeaders = {
      'Authorization': `Bearer ${token}`,
      'accept-version': '1.0.0',
    } as const;

    // eslint-disable-next-line no-console
    console.log('[api/webflow/pages] Outbound request', {
      method: 'GET',
      url: requestUrl,
      headers: {
        ...requestHeaders,
        Authorization: `Bearer ${token ? '****' + token.slice(-4) : '<unset>'}`,
      },
    });

    const response = await fetch(requestUrl, {
      headers: requestHeaders,
      cache: 'no-store', // Disable caching for fresh data
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('[api/webflow/pages] Webflow API Error', { status: response.status, siteId, errorText });
      return NextResponse.json(
        {
          error: 'Failed to fetch pages from Webflow',
          details: errorText,
          siteId,
          request: { method: 'GET', url: requestUrl },
        },
        { status: response.status }
      );
    }

    const data = await response.json();
    return NextResponse.json(data);
  } catch (error) {
    console.error('[api/webflow/pages] Error fetching Webflow pages:', error);
    return NextResponse.json(
      { error: 'Internal server error', details: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}

// Configure for Edge runtime (Cloudflare Workers)
export const runtime = 'edge';

