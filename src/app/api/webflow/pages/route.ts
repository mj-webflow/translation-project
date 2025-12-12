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

    // Fetch all pages with pagination
    let allPages: any[] = [];
    let offset = 0;
    let hasMore = true;
    const limit = 100; // Webflow API limit per request

    console.log('[api/webflow/pages] Fetching all pages for site:', siteId);

    while (hasMore) {
      const requestUrl = `https://api.webflow.com/v2/sites/${siteId}/pages?offset=${offset}&limit=${limit}`;
      
      console.log(`[api/webflow/pages] Fetching batch at offset ${offset}...`);

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
      const pages = data.pages || [];
      
      allPages = allPages.concat(pages);
      
      const total = data.pagination?.total || 0;
      offset += pages.length;
      
      hasMore = pages.length > 0 && offset < total;
      
      console.log(`[api/webflow/pages] Fetched ${pages.length} pages (total so far: ${allPages.length}/${total})`);
      
      if (hasMore) {
        console.log(`[api/webflow/pages] More pages available, fetching next batch...`);
      }
    }

    console.log(`[api/webflow/pages] ✓ Fetched all ${allPages.length} pages`);

    // Return all pages with original pagination structure
    return NextResponse.json({
      pages: allPages,
      pagination: {
        limit: allPages.length,
        offset: 0,
        total: allPages.length,
      }
    });
  } catch (error) {
    console.error('[api/webflow/pages] Error fetching Webflow pages:', error);
    return NextResponse.json(
      { error: 'Internal server error', details: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}

