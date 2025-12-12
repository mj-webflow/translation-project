import { NextRequest, NextResponse } from 'next/server';

const WEBFLOW_API_TOKEN = process.env.WEBFLOW_API_TOKEN;
const DEFAULT_WEBFLOW_SITE_ID = process.env.WEBFLOW_SITE_ID || '';

/**
 * GET /api/webflow/collections
 * 
 * Lists all CMS collections for a Webflow site.
 * 
 * Query params:
 *   - siteId: Webflow site ID (optional if WEBFLOW_SITE_ID env is set)
 * 
 * Headers:
 *   - x-webflow-token: Override token (optional)
 */
export async function GET(request: NextRequest) {
    try {
        const overrideToken = request.headers.get('x-webflow-token') || '';
        const { searchParams } = new URL(request.url);
        const siteId = searchParams.get('siteId') || DEFAULT_WEBFLOW_SITE_ID;
        
        const token = overrideToken || WEBFLOW_API_TOKEN;
        if (!token) {
            return NextResponse.json(
                { error: 'Webflow API token not configured. Provide x-webflow-token header or set WEBFLOW_API_TOKEN.' },
                { status: 500 }
            );
        }
        if (!siteId) {
            return NextResponse.json(
                { error: 'Missing siteId. Provide ?siteId=... or set WEBFLOW_SITE_ID.' },
                { status: 400 }
            );
        }

        console.log('[api/webflow/collections] Fetching collections for site:', siteId);

        const response = await fetch(`https://api.webflow.com/v2/sites/${siteId}/collections`, {
            headers: {
                Authorization: `Bearer ${token}`,
                'accept-version': '1.0.0',
            },
            cache: 'no-store',
        });

        if (!response.ok) {
            const errorText = await response.text();
            console.error('[api/webflow/collections] Webflow API Error:', { status: response.status, errorText });
            return NextResponse.json(
                { error: 'Failed to fetch collections from Webflow', details: errorText },
                { status: response.status }
            );
        }

        const data = await response.json();
        const collections = data.collections || [];
        
        console.log(`[api/webflow/collections] ✓ Found ${collections.length} collections`);

        return NextResponse.json({
            collections,
            total: collections.length,
        });
    } catch (error) {
        console.error('[api/webflow/collections] Error:', error);
        return NextResponse.json(
            { error: 'Internal server error', details: error instanceof Error ? error.message : 'Unknown error' },
            { status: 500 }
        );
    }
}

