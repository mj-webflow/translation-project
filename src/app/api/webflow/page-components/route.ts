import { NextRequest } from 'next/server';

const WEBFLOW_API_TOKEN = process.env.WEBFLOW_API_TOKEN || '';
const WEBFLOW_SITE_ID = process.env.WEBFLOW_SITE_ID || '';

export async function GET(request: NextRequest) {
    try {
        const { searchParams } = new URL(request.url);
        const pageId = searchParams.get('pageId');
        const siteId = searchParams.get('siteId') || WEBFLOW_SITE_ID;
        const branchId = searchParams.get('branchId');
        const overrideToken = request.headers.get('x-webflow-token') || '';
        const token = overrideToken || WEBFLOW_API_TOKEN;

        if (!pageId) {
            return Response.json({ error: 'Page ID is required' }, { status: 400 });
        }

        if (!token || !siteId) {
            return Response.json({ error: 'Missing credentials' }, { status: 400 });
        }

        // Fetch page content to get all component instances
        const url = new URL(`https://api.webflow.com/v2/pages/${pageId}/dom`);
        if (branchId) url.searchParams.set('branchId', branchId);

        const response = await fetch(url.toString(), {
            headers: {
                'Authorization': `Bearer ${token}`,
                'accept-version': '1.0.0',
            },
        });

        if (!response.ok) {
            const errorText = await response.text();
            return Response.json({ error: `Failed to fetch page content: ${errorText}` }, { status: response.status });
        }

        const pageContent: any = await response.json();
        
        // Extract all component instances
        const componentInstances = pageContent.nodes?.filter((n: any) => n.type === 'component-instance') || [];
        
        // Log first component instance to see available fields
        if (componentInstances.length > 0) {
            console.log('Sample component instance fields:', Object.keys(componentInstances[0]));
            console.log('Sample component instance:', JSON.stringify(componentInstances[0], null, 2));
        }
        
        // Fetch component metadata for each unique component ID to get names
        const uniqueComponentIds = new Set<string>();
        componentInstances.forEach((comp: any) => {
            if (comp.componentId) {
                uniqueComponentIds.add(comp.componentId);
            }
        });

        // Fetch component names
        const componentNames = new Map<string, string>();
        for (const componentId of uniqueComponentIds) {
            try {
                const compUrl = new URL(`https://api.webflow.com/v2/sites/${siteId}/components/${componentId}`);
                if (branchId) compUrl.searchParams.set('branchId', branchId);
                
                const compResponse = await fetch(compUrl.toString(), {
                    headers: {
                        'Authorization': `Bearer ${token}`,
                        'accept-version': '1.0.0',
                    },
                });

                if (compResponse.ok) {
                    const compData: any = await compResponse.json();
                    console.log(`Component ${componentId} data:`, JSON.stringify(compData, null, 2));
                    const name = compData?.displayName || compData?.name || compData?.componentMetadata?.displayName || compData?.componentMetadata?.name || `Component ${componentId.slice(0, 8)}`;
                    componentNames.set(componentId, name);
                } else {
                    console.error(`Failed to fetch component ${componentId}: ${compResponse.status}`);
                    componentNames.set(componentId, `Component ${componentId.slice(0, 8)}`);
                }
            } catch (error) {
                console.error(`Failed to fetch component ${componentId}:`, error);
                componentNames.set(componentId, `Component ${componentId.slice(0, 8)}`);
            }
        }

        // Build component list with names
        const components = componentInstances.map((comp: any, index: number) => ({
            nodeId: comp.nodeId,
            componentId: comp.componentId,
            name: componentNames.get(comp.componentId) || `Component ${index + 1}`,
            hasOverrides: !!(comp.propertyOverrides && comp.propertyOverrides.length > 0),
            overrideCount: comp.propertyOverrides?.length || 0,
        }));

        return Response.json({
            components,
            total: components.length,
        });

    } catch (error) {
        console.error('Error fetching page components:', error);
        return Response.json({ 
            error: 'Failed to fetch page components',
            details: error instanceof Error ? error.message : 'Unknown error'
        }, { status: 500 });
    }
}

export const dynamic = 'force-dynamic';

