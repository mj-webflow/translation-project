import { NextRequest, NextResponse } from 'next/server';

const WEBFLOW_API_TOKEN = process.env.WEBFLOW_API_TOKEN;

interface PageContent {
    nodes: Array<{
        nodeId: string;
        type?: string;
        componentId?: string;
    }>;
}

async function fetchPageContent(pageId: string, token: string, branchId?: string | null): Promise<PageContent> {
    let allNodes: any[] = [];
    let offset = 0;
    let hasMore = true;

    // Fetch all nodes with pagination
    while (hasMore) {
        const url = new URL(`https://api.webflow.com/v2/pages/${pageId}/dom`);
        if (branchId) url.searchParams.set('branchId', branchId);
        url.searchParams.set('offset', offset.toString());
        
        const response = await fetch(url.toString(), {
            headers: {
                'Authorization': `Bearer ${token}`,
                'accept-version': '1.0.0',
            },
        });

        if (!response.ok) {
            const errorText = await response.text();
            throw new Error(`Failed to fetch page DOM content: ${errorText}`);
        }

        const json: any = await response.json();
        const domNodes: any[] = Array.isArray(json?.nodes) ? json.nodes : [];
        
        allNodes = allNodes.concat(domNodes);
        
        const total = json?.pagination?.total || 0;
        offset += domNodes.length;
        
        hasMore = domNodes.length > 0 && offset < total;
        
        if (hasMore) {
            await new Promise(resolve => setTimeout(resolve, 500));
        }
    }

    const mapped = allNodes.map((n: any) => {
        let componentIdValue: string | undefined;
        if (n?.type === 'component-instance' && typeof n?.componentId === 'string') {
            componentIdValue = n.componentId;
        } else if (n?.type === 'slot') {
            if (typeof n?.componentId === 'string') {
                componentIdValue = n.componentId;
            } else if (typeof n?.slot?.componentId === 'string') {
                componentIdValue = n.slot.componentId;
            }
        }
        
        return {
            nodeId: typeof n?.id === 'string' ? n.id : '',
            type: typeof n?.type === 'string' ? n.type : undefined,
            componentId: componentIdValue,
        };
    }).filter(n => n.nodeId);

    return { nodes: mapped };
}

export async function GET(request: NextRequest) {
    try {
        const overrideToken = request.headers.get('x-webflow-token') || '';
        const { searchParams } = new URL(request.url);
        const pageId = searchParams.get('pageId');
        const branchId = searchParams.get('branchId');
        const token = overrideToken || WEBFLOW_API_TOKEN || '';

        if (!pageId) {
            return NextResponse.json({ error: 'Page ID is required' }, { status: 400 });
        }

        if (!token) {
            return NextResponse.json({ error: 'Webflow API token not configured' }, { status: 500 });
        }

        // Fetch page content
        const pageContent = await fetchPageContent(pageId, token, branchId);
        
        // Extract unique component IDs
        const componentIds = Array.from(new Set(
            pageContent.nodes
                .filter(n => (n.type === 'component-instance' || n.type === 'slot') && n.componentId)
                .map(n => n.componentId as string)
        ));

        return NextResponse.json({
            componentIds,
            totalComponents: componentIds.length
        });

    } catch (error) {
        console.error('Error fetching page components:', error);
        return NextResponse.json(
            { error: error instanceof Error ? error.message : 'Failed to fetch page components' },
            { status: 500 }
        );
    }
}

export const maxDuration = 60;

