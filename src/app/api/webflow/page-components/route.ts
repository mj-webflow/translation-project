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
        
        // Fetch all components from the site to get their names
        const componentNames = new Map<string, string>();
        try {
            const componentsUrl = new URL(`https://api.webflow.com/v2/sites/${siteId}/components`);
            if (branchId) componentsUrl.searchParams.set('branchId', branchId);
            
            const componentsResponse = await fetch(componentsUrl.toString(), {
                headers: {
                    'Authorization': `Bearer ${token}`,
                    'accept-version': '1.0.0',
                },
            });

            if (componentsResponse.ok) {
                const componentsData: any = await componentsResponse.json();
                console.log('Components API response:', JSON.stringify(componentsData, null, 2));
                
                // Map component IDs to their display names
                if (componentsData.components && Array.isArray(componentsData.components)) {
                    componentsData.components.forEach((comp: any) => {
                        const name = comp.displayName || comp.name || `Component ${comp.id?.slice(0, 8) || 'Unknown'}`;
                        componentNames.set(comp.id, name);
                    });
                }
            } else {
                console.error(`Failed to fetch components list: ${componentsResponse.status}`);
            }
        } catch (error) {
            console.error('Failed to fetch components list:', error);
        }

        // Build component list with names
        const components = componentInstances.map((comp: any, index: number) => ({
            nodeId: comp.nodeId,
            componentId: comp.componentId,
            name: componentNames.get(comp.componentId) || comp.displayName || `Component ${comp.componentId?.slice(0, 8) || index + 1}`,
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

