import { NextRequest, NextResponse } from 'next/server';

const WEBFLOW_API_TOKEN = process.env.WEBFLOW_API_TOKEN;

/**
 * GET /api/webflow/collection-items
 * 
 * Lists all items within a CMS collection with pagination support.
 * 
 * Query params:
 *   - collectionId: Webflow collection ID (required)
 *   - offset: Pagination offset (optional, default 0)
 *   - limit: Items per page (optional, default 100, max 100)
 *   - cmsLocaleId: Filter by locale (optional)
 * 
 * Headers:
 *   - x-webflow-token: Override token (optional)
 */
export async function GET(request: NextRequest) {
    try {
        const overrideToken = request.headers.get('x-webflow-token') || '';
        const { searchParams } = new URL(request.url);
        const collectionId = searchParams.get('collectionId');
        const offset = parseInt(searchParams.get('offset') || '0', 10);
        const limit = Math.min(parseInt(searchParams.get('limit') || '100', 10), 100);
        const cmsLocaleId = searchParams.get('cmsLocaleId');
        const fetchAll = searchParams.get('fetchAll') === 'true';
        
        const token = overrideToken || WEBFLOW_API_TOKEN;
        if (!token) {
            return NextResponse.json(
                { error: 'Webflow API token not configured. Provide x-webflow-token header or set WEBFLOW_API_TOKEN.' },
                { status: 500 }
            );
        }
        if (!collectionId) {
            return NextResponse.json(
                { error: 'Missing collectionId parameter.' },
                { status: 400 }
            );
        }

        console.log('[api/webflow/collection-items] Fetching items for collection:', collectionId);

        const requestHeaders = {
            Authorization: `Bearer ${token}`,
            'accept-version': '1.0.0',
        };

        // If fetchAll is true, paginate through all items
        if (fetchAll) {
            let allItems: any[] = [];
            let currentOffset = 0;
            let hasMore = true;

            while (hasMore) {
                let url = `https://api.webflow.com/v2/collections/${collectionId}/items?offset=${currentOffset}&limit=100`;
                if (cmsLocaleId) {
                    url += `&cmsLocaleId=${cmsLocaleId}`;
                }

                const response = await fetch(url, {
                    headers: requestHeaders,
                    cache: 'no-store',
                });

                if (!response.ok) {
                    const errorText = await response.text();
                    console.error('[api/webflow/collection-items] Webflow API Error:', { status: response.status, errorText });
                    return NextResponse.json(
                        { error: 'Failed to fetch collection items from Webflow', details: errorText },
                        { status: response.status }
                    );
                }

                const data = await response.json();
                const items = data.items || [];
                allItems = allItems.concat(items);

                const total = data.pagination?.total || 0;
                currentOffset += items.length;
                hasMore = items.length > 0 && currentOffset < total;

                console.log(`[api/webflow/collection-items] Fetched ${items.length} items (total: ${allItems.length}/${total})`);
            }

            console.log(`[api/webflow/collection-items] ✓ Fetched all ${allItems.length} items`);

            return NextResponse.json({
                items: allItems,
                pagination: {
                    offset: 0,
                    limit: allItems.length,
                    total: allItems.length,
                },
            });
        }

        // Single page fetch
        let url = `https://api.webflow.com/v2/collections/${collectionId}/items?offset=${offset}&limit=${limit}`;
        if (cmsLocaleId) {
            url += `&cmsLocaleId=${cmsLocaleId}`;
        }

        const response = await fetch(url, {
            headers: requestHeaders,
            cache: 'no-store',
        });

        if (!response.ok) {
            const errorText = await response.text();
            console.error('[api/webflow/collection-items] Webflow API Error:', { status: response.status, errorText });
            return NextResponse.json(
                { error: 'Failed to fetch collection items from Webflow', details: errorText },
                { status: response.status }
            );
        }

        const data = await response.json();
        const items = data.items || [];
        const pagination = data.pagination || { offset, limit, total: items.length };

        console.log(`[api/webflow/collection-items] ✓ Fetched ${items.length} items (offset: ${offset}, total: ${pagination.total})`);

        return NextResponse.json({
            items,
            pagination,
        });
    } catch (error) {
        console.error('[api/webflow/collection-items] Error:', error);
        return NextResponse.json(
            { error: 'Internal server error', details: error instanceof Error ? error.message : 'Unknown error' },
            { status: 500 }
        );
    }
}

