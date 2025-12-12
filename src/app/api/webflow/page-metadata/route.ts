import { NextRequest, NextResponse } from 'next/server';

const WEBFLOW_API_TOKEN = process.env.WEBFLOW_API_TOKEN;

export const runtime = 'nodejs';

/**
 * GET /api/webflow/page-metadata
 * Fetches metadata for a specific page, optionally for a specific locale
 * 
 * Query params:
 *   - pageId: Required - The Webflow page ID
 *   - localeId: Optional - Specific locale to fetch metadata for
 * 
 * Reference: https://developers.webflow.com/data/v2.0.0/reference/pages-and-components/pages/get-metadata
 */
export async function GET(request: NextRequest) {
  try {
    const overrideToken = request.headers.get('x-webflow-token') || '';
    const token = overrideToken || WEBFLOW_API_TOKEN;

    if (!token) {
      return NextResponse.json(
        { error: 'Webflow API token not configured. Provide x-webflow-token header or set WEBFLOW_API_TOKEN.' },
        { status: 500 }
      );
    }

    const { searchParams } = new URL(request.url);
    const pageId = searchParams.get('pageId');
    const localeId = searchParams.get('localeId');

    if (!pageId) {
      return NextResponse.json(
        { error: 'Missing pageId parameter' },
        { status: 400 }
      );
    }

    // Build the API URL
    let url = `https://api.webflow.com/v2/pages/${pageId}`;
    if (localeId) {
      url += `?localeId=${encodeURIComponent(localeId)}`;
    }

    console.log(`[page-metadata] Fetching metadata for page ${pageId}${localeId ? ` (locale: ${localeId})` : ''}`);

    const response = await fetch(url, {
      headers: {
        'Authorization': `Bearer ${token}`,
        'accept-version': '1.0.0',
      },
      cache: 'no-store',
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('[page-metadata] Webflow API Error:', { status: response.status, errorText });
      return NextResponse.json(
        { error: 'Failed to fetch page metadata from Webflow', details: errorText },
        { status: response.status }
      );
    }

    const data = await response.json();
    
    console.log(`[page-metadata] ✓ Fetched metadata for page "${data.title || pageId}"`);

    // Return relevant metadata fields
    return NextResponse.json({
      id: data.id,
      title: data.title,
      slug: data.slug,
      seo: data.seo || { title: '', description: '' },
      openGraph: data.openGraph || { title: '', titleCopied: false, description: '', descriptionCopied: false },
      localeId: data.localeId,
      publishedPath: data.publishedPath,
      draft: data.draft,
      archived: data.archived,
    });
  } catch (error) {
    console.error('[page-metadata] Error:', error);
    return NextResponse.json(
      { error: 'Internal server error', details: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}

