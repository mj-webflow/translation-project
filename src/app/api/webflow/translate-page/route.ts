import { NextRequest, NextResponse } from 'next/server';
// Use OpenAI translation service
import { translateBatch } from '@/lib/translation';

const WEBFLOW_API_TOKEN = process.env.WEBFLOW_API_TOKEN;
const WEBFLOW_SITE_ID = process.env.WEBFLOW_SITE_ID || '';

/**
 * Fetch with retry logic for rate limiting
 */
async function fetchWithRetry(
    url: string,
    options: RequestInit,
    maxRetries: number = 3
): Promise<Response> {
    let lastError: Error | null = null;
    
    for (let attempt = 0; attempt <= maxRetries; attempt++) {
        try {
            const response = await fetch(url, options);
            
            // If rate limited, wait and retry
            if (response.status === 429) {
                if (attempt < maxRetries) {
                    const waitTime = Math.pow(2, attempt) * 1000; // Exponential backoff: 1s, 2s, 4s
                    console.log(`Rate limited. Waiting ${waitTime}ms before retry ${attempt + 1}/${maxRetries}...`);
                    await new Promise(resolve => setTimeout(resolve, waitTime));
                    continue;
                }
            }
            
            return response;
        } catch (error) {
            lastError = error as Error;
            if (attempt < maxRetries) {
                const waitTime = Math.pow(2, attempt) * 1000;
                console.log(`Request failed. Retrying in ${waitTime}ms... (${attempt + 1}/${maxRetries})`);
                await new Promise(resolve => setTimeout(resolve, waitTime));
            }
        }
    }
    
    throw lastError || new Error('Max retries exceeded');
}

async function fetchLocales(siteId: string, token: string) {
    const resp = await fetchWithRetry(`https://api.webflow.com/v2/sites/${siteId}`, {
        headers: {
            Authorization: `Bearer ${token}`,
            'accept-version': '1.0.0',
        },
        cache: 'no-store',
    });
	if (!resp.ok) {
		const errorText = await resp.text();
		throw new Error(`Failed to fetch locales: ${errorText}`);
	}
	const data = await resp.json();
	return {
		primary: data.locales?.primary || null,
		secondary: data.locales?.secondary || [],
	};
}

interface PageContent {
	nodes: Array<{
		nodeId: string;
		text?: string;
		type?: string;
        html?: string;
        componentId?: string;
        propertyOverrides?: Array<{ propertyId: string; text?: string; html?: string }>;
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
        // Note: Webflow API seems to have a default limit of 100, we'll fetch in chunks
        
        const response = await fetchWithRetry(url.toString(), {
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
        
        // Check if there are more nodes to fetch based on pagination info
        const total = json?.pagination?.total || 0;
        const returnedLimit = json?.pagination?.limit || domNodes.length;
        offset += domNodes.length;
        
        // Continue if we haven't reached the total yet
        hasMore = domNodes.length > 0 && offset < total;
        
        console.log(`Fetched ${domNodes.length} nodes (offset: ${offset - domNodes.length}, total: ${total}, fetched so far: ${allNodes.length})`);
        
        if (hasMore) {
            console.log(`More nodes available, fetching next batch...`);
        }
    }

    console.log(`Total nodes fetched: ${allNodes.length}`);
    const domNodes = allNodes;

    const stripHtml = (html: string): string => {
        try {
            return html
                .replace(/<[^>]*>/g, ' ') // remove tags
                .replace(/\s+/g, ' ')     // collapse whitespace
                .trim();
        } catch {
            return '';
        }
    };

    const mapped: PageContent['nodes'] = domNodes.map((n: any) => {
        let textValue: string | undefined;
        let htmlValue: string | undefined;
        
        // Handle regular text nodes
        if (n?.type === 'text') {
            // Prefer HTML when present to preserve nested tags/spans
            if (typeof n?.text?.html === 'string' && n.text.html.length > 0) {
                htmlValue = n.text.html;
                textValue = stripHtml(n.text.html);
            } else if (typeof n?.text?.text === 'string' && n.text.text.length > 0) {
                textValue = n.text.text;
            }
        }
        
        // Handle form elements (input, textarea, button, label) with text/placeholder/value
        // These have translatable text in their text property or attributes
        if (['input', 'text-input', 'email-input', 'password-input', 'textarea', 'button', 'submit-button', 'label', 'form-label', 'input-label'].includes(n?.type)) {
            // Check for text content first (labels, buttons)
            if (typeof n?.text?.text === 'string' && n.text.text.length > 0) {
                textValue = n.text.text;
            } else if (typeof n?.text?.html === 'string' && n.text.html.length > 0) {
                htmlValue = n.text.html;
                textValue = stripHtml(n.text.html);
            }
            // Form elements store placeholder at root level (n.placeholder)
            else if (typeof n?.placeholder === 'string' && n.placeholder.length > 0) {
                textValue = n.placeholder;
            } else if (typeof n?.value === 'string' && n.value.length > 0) {
                textValue = n.value;
            }
            // Fallback to attributes if needed
            else if (typeof n?.attributes?.placeholder === 'string' && n.attributes.placeholder.length > 0) {
                textValue = n.attributes.placeholder;
            } else if (typeof n?.attributes?.value === 'string' && n.attributes.value.length > 0) {
                textValue = n.attributes.value;
            }
        }
        
        let propertyOverrides: Array<{ propertyId: string; text?: string; html?: string }> | undefined;
        if (n?.type === 'component-instance' && Array.isArray(n?.propertyOverrides)) {
            propertyOverrides = n.propertyOverrides.map((po: any) => ({
                propertyId: typeof po?.propertyId === 'string' ? po.propertyId : '',
                text: typeof po?.text?.text === 'string' ? po.text.text : undefined,
                html: typeof po?.text?.html === 'string' ? po.text.html : undefined,
            })).filter((p: { propertyId: string; text?: string; html?: string }) => !!p.propertyId);
        }
        return {
            nodeId: typeof n?.id === 'string' ? n.id : '',
            text: textValue,
            type: typeof n?.type === 'string' ? n.type : undefined,
            html: htmlValue,
            componentId: typeof n?.componentId === 'string' ? n.componentId : undefined,
            propertyOverrides,
        };
    }).filter(n => n.nodeId);

    return { nodes: mapped };
}

type ComponentContent = {
    nodes: Array<{ 
        nodeId: string; 
        type?: string; 
        text?: string; 
        html?: string; 
        componentId?: string;
        propertyOverrides?: Array<{ propertyId: string; text?: string; html?: string }>;
    }>
};

async function fetchComponentContent(siteId: string, componentId: string, token: string, branchId?: string | null): Promise<ComponentContent> {
    let allNodes: any[] = [];
    let offset = 0;
    let hasMore = true;

    // Fetch all nodes with pagination
    while (hasMore) {
        const url = new URL(`https://api.webflow.com/v2/sites/${siteId}/components/${componentId}/dom`);
        if (branchId) url.searchParams.set('branchId', branchId);
        url.searchParams.set('offset', offset.toString());
        
        const response = await fetchWithRetry(url.toString(), {
            headers: {
                'Authorization': `Bearer ${token}`,
                'accept-version': '1.0.0',
            },
        });
        
        if (!response.ok) {
            const errorText = await response.text();
            throw new Error(`Failed to fetch component DOM content: ${errorText}`);
        }
        
        const json: any = await response.json();
        const nodes: any[] = Array.isArray(json?.nodes) ? json.nodes : [];
        
        allNodes = allNodes.concat(nodes);
        
        const total = json?.pagination?.total || 0;
        offset += nodes.length;
        
        // Continue if we haven't reached the total yet
        hasMore = nodes.length > 0 && offset < total;
    }

    const nodes = allNodes;

    const result = nodes.map((n: any) => {
        let textValue: string | undefined;
        let htmlValue: string | undefined;
        
        // Handle regular text nodes
        if (n?.type === 'text') {
            // Prefer HTML when present to preserve nested tags/spans
            if (typeof n?.text?.html === 'string' && n.text.html.length > 0) {
                htmlValue = n.text.html;
            } else if (typeof n?.text?.text === 'string' && n.text.text.length > 0) {
                textValue = n.text.text;
            }
        }
        
        // Handle form elements (input, textarea, button, label) with text/placeholder/value
        if (['input', 'text-input', 'email-input', 'password-input', 'textarea', 'button', 'submit-button', 'label', 'form-label', 'input-label'].includes(n?.type)) {
            // Check for text content first (labels, buttons)
            if (typeof n?.text?.text === 'string' && n.text.text.length > 0) {
                textValue = n.text.text;
            } else if (typeof n?.text?.html === 'string' && n.text.html.length > 0) {
                htmlValue = n.text.html;
            }
            // Form elements store placeholder at ROOT level (n.placeholder, NOT n.attributes.placeholder)
            else if (typeof n?.placeholder === 'string' && n.placeholder.length > 0) {
                textValue = n.placeholder;
            } else if (typeof n?.value === 'string' && n.value.length > 0) {
                textValue = n.value;
            }
        }
        
        // Extract property overrides if this is a component instance
        let propertyOverrides: Array<{ propertyId: string; text?: string; html?: string }> | undefined;
        if (n?.type === 'component-instance' && Array.isArray(n?.propertyOverrides)) {
            propertyOverrides = n.propertyOverrides.map((po: any) => ({
                propertyId: po?.propertyId || '',
                text: po?.text?.text || po?.text,
                html: po?.text?.html || po?.html,
            })).filter((po: any) => po.propertyId);
        }
        
        return {
            nodeId: typeof n?.id === 'string' ? n.id : '',
            type: typeof n?.type === 'string' ? n.type : undefined,
            text: textValue,
            html: htmlValue,
            componentId: typeof n?.componentId === 'string' ? n.componentId : undefined,
            propertyOverrides,
        };
    }).filter((n: any) => n.nodeId);

    return { nodes: result };
}

/**
 * Recursively collect all nested component IDs and instances from a component's DOM
 * Returns both component definition IDs and component instance nodes
 */
async function collectNestedComponentIds(
    siteId: string,
    componentId: string,
    token: string,
    branchId?: string | null,
    visited: Set<string> = new Set(),
    cache?: Map<string, ComponentContent>
): Promise<string[]> {
    if (visited.has(componentId)) return [];
    visited.add(componentId);

    // Use cache if provided to avoid redundant API calls
    let componentContent: ComponentContent;
    if (cache && cache.has(componentId)) {
        componentContent = cache.get(componentId)!;
    } else {
        componentContent = await fetchComponentContent(siteId, componentId, token, branchId);
        if (cache) {
            cache.set(componentId, componentContent);
        }
    }
    
    const nestedIds: string[] = [];

    for (const node of componentContent.nodes) {
        // Check for component instances (direct components)
        if (node.type === 'component-instance' && node.componentId) {
            nestedIds.push(node.componentId);
            // Recursively collect from nested component
            const deeperIds = await collectNestedComponentIds(siteId, node.componentId, token, branchId, visited, cache);
            nestedIds.push(...deeperIds);
        }
    }

    return nestedIds;
}

/**
 * Recursively collect all component instances (with their node IDs and property overrides)
 * from a component's DOM, including instances nested in slots
 * Returns instances with their parent component ID for proper updating
 */
async function collectNestedComponentInstances(
    siteId: string,
    componentId: string,
    token: string,
    branchId?: string | null,
    visited: Set<string> = new Set(),
    cache?: Map<string, ComponentContent>,
    parentComponentId?: string
): Promise<Array<{ nodeId: string; componentId: string; propertyOverrides?: any[]; parentComponentId: string }>> {
    if (visited.has(componentId)) return [];
    visited.add(componentId);

    // Use cache if provided
    let componentContent: ComponentContent;
    if (cache && cache.has(componentId)) {
        componentContent = cache.get(componentId)!;
    } else {
        componentContent = await fetchComponentContent(siteId, componentId, token, branchId);
        if (cache) {
            cache.set(componentId, componentContent);
        }
    }
    
    const instances: Array<{ nodeId: string; componentId: string; propertyOverrides?: any[]; parentComponentId: string }> = [];

    for (const node of componentContent.nodes) {
        if (node.type === 'component-instance' && node.componentId) {
            // Add this instance with its parent component ID
            instances.push({
                nodeId: node.nodeId,
                componentId: node.componentId,
                propertyOverrides: (node as any).propertyOverrides,
                parentComponentId: parentComponentId || componentId // Use provided parent or current component as parent
            });
            
            // Recursively collect from nested component, passing current component as parent
            const nestedInstances = await collectNestedComponentInstances(siteId, node.componentId, token, branchId, visited, cache, parentComponentId || componentId);
            instances.push(...nestedInstances);
        }
    }

    return instances;
}

/**
 * Fetch component properties for a component definition
 * Used to translate properties for locales (default values) via Data API
 */
async function fetchComponentProperties(
    siteId: string,
    componentId: string,
    token: string,
    branchId?: string | null
): Promise<Array<{ propertyId: string; text?: string }>> {
    const url = new URL(`https://api.webflow.com/v2/sites/${siteId}/components/${componentId}/properties`);
    if (branchId) url.searchParams.set('branchId', branchId);
    const response = await fetchWithRetry(url.toString(), {
        headers: {
            'Authorization': `Bearer ${token}`,
            'accept-version': '1.0.0',
        },
    });
    if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Failed to fetch component properties: ${errorText}`);
    }
    const json: any = await response.json();
    console.log(`      Raw API response for component ${componentId}:`, JSON.stringify(json, null, 2));
    
    // Check if this is a library component (cannot be translated)
    const isLibrary = json?.componentMetadata?.isLibrary === true || 
                      json?.isLibrary === true || 
                      json?.componentMetadata?.type === 'library';
    
    if (isLibrary) {
        console.log(`Component ${componentId} is a library component, skipping translation`);
        return [];
    }
    
    // Try multiple possible response structures
    let props: any[] = [];
    if (Array.isArray(json?.properties)) {
        props = json.properties;
    } else if (Array.isArray(json)) {
        props = json;
    } else if (json?.componentMetadata?.properties) {
        props = json.componentMetadata.properties;
    }
    
    console.log(`Found ${props.length} raw properties in response`);
    
    const result = props.map((p: any) => {
        // Try multiple possible field names for propertyId
        const propertyId = p?.propertyId || p?.id || p?.property_id || '';
        
        // Extract text content from nested structure
        // API returns: { text: { html: "...", text: "..." } }
        let text: string | undefined;
        if (p?.text) {
            // Prefer HTML if present (preserves nested tags), otherwise use plain text
            if (typeof p.text.html === 'string' && p.text.html.length > 0) {
                text = p.text.html;
            } else if (typeof p.text.text === 'string' && p.text.text.length > 0) {
                text = p.text.text;
            }
        }
        // Fallback to other possible field names
        if (!text) {
            text = p?.value || p?.defaultValue || p?.default_value || undefined;
        }
            
        const preview = typeof text === 'string' ? text.substring(0, 50) : 'undefined';
        console.log(`Property: id=${propertyId}, text=${preview}...`);
        return { propertyId, text };
    }).filter((p: any) => !!p.propertyId);
    
    console.log(` Returning ${result.length} properties with IDs`);
    return result;
}

/**
 * Update component properties for a given locale via Data API
 * Expects properties: [{ propertyId, text }]
 */
async function updateComponentProperties(
    siteId: string,
    componentId: string,
    localeId: string,
    properties: Array<{ propertyId: string; text: string }>,
    token: string,
    branchId?: string | null
): Promise<void> {
    const url = new URL(`https://api.webflow.com/v2/sites/${siteId}/components/${componentId}/properties`);
    url.searchParams.set('localeId', localeId);
    if (branchId) url.searchParams.set('branchId', branchId);

    console.log(`[updateComponentProperties] Updating component ${componentId} for locale ${localeId}`);
    console.log(`[updateComponentProperties] API URL: ${url.toString()}`);
    console.log(`[updateComponentProperties] Payload:`, JSON.stringify({ properties }, null, 2));

    const response = await fetchWithRetry(url.toString(), {
        method: 'POST',
        headers: {
            'Authorization': `Bearer ${token}`,
            'accept-version': '1.0.0',
            'Content-Type': 'application/json',
        },
        body: JSON.stringify({ properties }),
    });
    
    console.log(`[updateComponentProperties] Response status: ${response.status} ${response.statusText}`);
    
    if (!response.ok) {
        const errorText = await response.text();
        console.error(`[updateComponentProperties] Error response:`, errorText);
        // Check if this is a library component error and silently skip
        if (errorText.includes('Cannot write localized properties for a library component')) {
            console.log(`[updateComponentProperties] Component ${componentId} is a library component, skipping update`);
            return;
        }
        throw new Error(`Failed to update component properties for locale ${localeId}: ${errorText}`);
    }
    const result: any = await response.json().catch(() => ({}));
    console.log(`[updateComponentProperties] Success response:`, JSON.stringify(result, null, 2));
    
    if (Array.isArray(result?.errors) && result.errors.length > 0) {
        console.error(`[updateComponentProperties] API returned errors:`, result.errors);
        const renderedErrors = result.errors.map((e: any) => typeof e === 'string' ? e : JSON.stringify(e)).join(', ');
        throw new Error(`Update component properties errors for locale ${localeId}: ${renderedErrors}`);
    }
    
    console.log(`[updateComponentProperties] ✓ Successfully updated ${properties.length} properties for component ${componentId}`);
}

async function updateComponentContent(
    siteId: string,
    componentId: string,
    localeId: string,
    nodes: Array<{ nodeId: string; text?: string; placeholder?: string; propertyOverrides?: Array<{ propertyId: string; text: string }> }>,
    token: string,
    branchId?: string | null
): Promise<void> {
    const url = new URL(`https://api.webflow.com/v2/sites/${siteId}/components/${componentId}/dom`);
    url.searchParams.set('localeId', localeId);
    if (branchId) url.searchParams.set('branchId', branchId);


    const response = await fetchWithRetry(url.toString(), {
        method: 'POST',
        headers: {
            'Authorization': `Bearer ${token}`,
            'accept-version': '1.0.0',
            'Content-Type': 'application/json',
        },
        body: JSON.stringify({ nodes }),
    });

    if (!response.ok) {
        const errorText = await response.text();
        console.error(`[updateComponentContent] API Error Response:`, errorText);
        throw new Error(`Failed to update component ${componentId} content for locale ${localeId}: ${errorText}`);
    }
    
    const result: any = await response.json().catch(() => ({}));
    
    if (Array.isArray(result?.errors) && result.errors.length > 0) {
        // Attempt corrective retry by wrapping with expected root tags
        const expectedTagByNode = new Map<string, string>();
        for (const err of result.errors as any[]) {
            const nodeId = typeof err?.nodeId === 'string' ? err.nodeId : undefined;
            const msg = typeof err?.error === 'string' ? err.error : undefined;
            if (nodeId && msg) {
                const m = msg.match(/Expected\s+([a-z0-9-]+)/i);
                if (m) expectedTagByNode.set(nodeId, m[1].toLowerCase());
            }
        }

        if (expectedTagByNode.size > 0) {
            const escapeHtml = (str: string): string => str
                .replace(/&/g, '&amp;')
                .replace(/</g, '&lt;')
                .replace(/>/g, '&gt;');

            const retryNodes = nodes.map(n => {
                const tag = expectedTagByNode.get(n.nodeId);
                if (!tag) return n;
                const trimmed = (n.text || '').trim();
                if (trimmed.startsWith('<')) return { nodeId: n.nodeId, text: trimmed };
                return { nodeId: n.nodeId, text: `<${tag}>${escapeHtml(trimmed)}</${tag}>` };
            });

            const retryResp = await fetch(url.toString(), {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${token}`,
                    'accept-version': '1.0.0',
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({ nodes: retryNodes }),
            });
            if (!retryResp.ok) {
                const errorText = await retryResp.text();
                throw new Error(`Failed retry updating component ${componentId} for locale ${localeId}: ${errorText}`);
            }
            const retryResult: any = await retryResp.json().catch(() => ({}));
            if (!Array.isArray(retryResult?.errors) || retryResult.errors.length === 0) {
                return;
            }
        }

        const renderedErrors = result.errors.map((e: any) => typeof e === 'string' ? e : JSON.stringify(e)).join(', ');
        throw new Error(`Update component errors for locale ${localeId}: ${renderedErrors}`);
    }
}

type UpdateNode =
    | { nodeId: string; text: string }
    | { nodeId: string; placeholder: string }
    | { nodeId: string; value: string }
    | { nodeId: string; propertyOverrides: Array<{ propertyId: string; text: string }> };

async function updatePageContent(
    pageId: string,
    localeId: string,
    nodes: UpdateNode[],
    token: string,
    branchId?: string | null
): Promise<void> {
    const NODE_BATCH_SIZE = 50; // Update 50 nodes at a time to avoid payload size limits
    
    // If nodes array is large, split into batches
    if (nodes.length > NODE_BATCH_SIZE) {
        console.log(`    Splitting ${nodes.length} nodes into batches of ${NODE_BATCH_SIZE} for Webflow API...`);
        
        for (let i = 0; i < nodes.length; i += NODE_BATCH_SIZE) {
            const batch = nodes.slice(i, i + NODE_BATCH_SIZE);
            const batchNum = Math.floor(i / NODE_BATCH_SIZE) + 1;
            const totalBatches = Math.ceil(nodes.length / NODE_BATCH_SIZE);
            
            console.log(`Updating batch ${batchNum}/${totalBatches} (${batch.length} nodes)...`);
            await updatePageContentSingle(pageId, localeId, batch, token, branchId);
            
            // Small delay between batches
            if (i + NODE_BATCH_SIZE < nodes.length) {
                await new Promise(resolve => setTimeout(resolve, 300));
            }
        }
        return;
    }
    
    // Single batch update
    await updatePageContentSingle(pageId, localeId, nodes, token, branchId);
}

async function updatePageContentSingle(
    pageId: string,
    localeId: string,
    nodes: UpdateNode[],
    token: string,
    branchId?: string | null
): Promise<void> {
    const url = new URL(`https://api.webflow.com/v2/pages/${pageId}/dom`);
    url.searchParams.set('localeId', localeId);
    if (branchId) url.searchParams.set('branchId', branchId);

    const payload = { nodes } as any;

    const response = await fetchWithRetry(url.toString(), {
        method: 'POST',
        headers: {
            'Authorization': `Bearer ${token}`,
            'accept-version': '1.0.0',
            'Content-Type': 'application/json',
        },
        body: JSON.stringify(payload),
    });

    if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Failed to update page content for locale ${localeId}: ${errorText}`);
    }

    const result: any = await response.json().catch(() => ({}));
    if (Array.isArray(result?.errors) && result.errors.length > 0) {
        // Attempt a corrective retry if errors indicate missing root elements
        const expectedTagByNode = new Map<string, string>();
        for (const err of result.errors as any[]) {
            const nodeId = typeof err?.nodeId === 'string' ? err.nodeId : undefined;
            const msg = typeof err?.error === 'string' ? err.error : undefined;
            if (nodeId && msg) {
                const m = msg.match(/Expected\s+([a-z0-9-]+)/i);
                if (m) expectedTagByNode.set(nodeId, m[1].toLowerCase());
            }
        }

        if (expectedTagByNode.size > 0) {
            const escapeHtml = (str: string): string => str
                .replace(/&/g, '&amp;')
                .replace(/</g, '&lt;')
                .replace(/>/g, '&gt;');

            const retryPayload = {
                nodes: nodes.map(n => {
                    if ((n as any).text !== undefined) {
                        const tn = n as { nodeId: string; text: string };
                        const tag = expectedTagByNode.get(tn.nodeId);
                        if (!tag) return { nodeId: tn.nodeId, text: tn.text };
                        const trimmed = (tn.text || '').trim();
                        if (trimmed.startsWith('<')) return { nodeId: tn.nodeId, text: trimmed };
                        return { nodeId: tn.nodeId, text: `<${tag}>${escapeHtml(trimmed)}</${tag}>` };
                    }
                    // Component instance update, pass through unchanged
                    return n as { nodeId: string; propertyOverrides: Array<{ propertyId: string; text: string }> };
                })
            } as any;

            const retryResp = await fetch(url.toString(), {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${token}`,
                    'accept-version': '1.0.0',
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify(retryPayload),
            });
            if (!retryResp.ok) {
                const errorText = await retryResp.text();
                throw new Error(`Failed retry updating page content for locale ${localeId}: ${errorText}`);
            }
            const retryResult: any = await retryResp.json().catch(() => ({}));
            if (!Array.isArray(retryResult?.errors) || retryResult.errors.length === 0) {
                return;
            }
        }

        const renderedErrors = result.errors.map((e: any) => typeof e === 'string' ? e : JSON.stringify(e)).join(', ');
        throw new Error(`Update returned errors for locale ${localeId}: ${renderedErrors}`);
    }
}

// Helper to send keepalive messages
function createKeepAliveStream(encoder: TextEncoder) {
    let keepAliveInterval: NodeJS.Timeout | null = null;
    
    return {
        start(controller: ReadableStreamDefaultController) {
            // Send a comment every 10 seconds to keep connection alive
            keepAliveInterval = setInterval(() => {
                try {
                    controller.enqueue(encoder.encode(': keepalive\n\n'));
                } catch (e) {
                    // Stream might be closed
                    if (keepAliveInterval) clearInterval(keepAliveInterval);
                }
            }, 10000);
        },
        stop() {
            if (keepAliveInterval) {
                clearInterval(keepAliveInterval);
                keepAliveInterval = null;
            }
        }
    };
}

export async function POST(request: NextRequest) {
    const encoder = new TextEncoder();
    
    // Helper to send SSE messages with immediate flush for Cloudflare Workers
    const sendSSE = (controller: ReadableStreamDefaultController, encoder: TextEncoder, data: any) => {
        const message = `data: ${JSON.stringify(data)}\n\n`;
        controller.enqueue(encoder.encode(message));
        // Send a comment to force flush on Cloudflare Workers
        controller.enqueue(encoder.encode(': ping\n\n'));
    };

    // Create a streaming response
    const stream = new ReadableStream({
        async start(controller) {
            const keepAlive = createKeepAliveStream(encoder);
            keepAlive.start(controller);
            
            try {
                const overrideToken = request.headers.get('x-webflow-token') || '';
                const { searchParams } = new URL(request.url);
                const siteId = searchParams.get('siteId') || WEBFLOW_SITE_ID;
                const branchId = searchParams.get('branchId');
                const token = overrideToken || WEBFLOW_API_TOKEN || '';

                const body = await request.json();
                const { pageId, targetLocaleIds } = body;

                if (!pageId) {
                    sendSSE(controller, encoder, { error: 'Page ID is required' });
                    controller.close();
                    keepAlive.stop();
                    return;
                }

                if (!targetLocaleIds || !Array.isArray(targetLocaleIds) || targetLocaleIds.length === 0) {
                    sendSSE(controller, encoder, { error: 'At least one target locale ID is required' });
                    controller.close();
                    keepAlive.stop();
                    return;
                }

                if (!token) {
                    sendSSE(controller, encoder, { error: 'Webflow API token not configured' });
                    controller.close();
                    keepAlive.stop();
                    return;
                }

                if (!siteId) {
                    sendSSE(controller, encoder, { error: 'Missing siteId' });
                    controller.close();
                    keepAlive.stop();
                    return;
                }

		console.log(`Starting translation for page: ${pageId}`);

		// Step 0: Fetch locales dynamically
        const locales = await fetchLocales(siteId, token);
		console.log('Locales used for translation:', locales);

		// Step 1: Fetch page content (primary locale)
        const pageContent = await fetchPageContent(pageId, token, branchId);
		console.log("pageContent nodes count:", pageContent.nodes.length);
		
		// Log all component instances found on the page
		const allComponentInstances = pageContent.nodes.filter(n => n.type === 'component-instance');
		console.log(`Found ${allComponentInstances.length} component instance(s), ${pageContent.nodes.filter(n => n.type === 'text').length} text nodes`);

		if (!pageContent.nodes || pageContent.nodes.length === 0) {
			console.log('Page has no content, sending success message for all locales');
			// Send success messages for all locales (nothing to translate)
			for (const targetLocaleId of targetLocaleIds) {
				const locale = (locales.secondary || []).find((l: any) => l.id === targetLocaleId);
				if (locale) {
					sendSSE(controller, encoder, {
						success: true,
						pageId,
						localeId: locale.id,
						localeName: locale.displayName,
						nodesTranslated: 0,
					});
				}
			}
			console.log(`All ${targetLocaleIds.length} locale(s) processed (no content to translate)`);
			controller.close();
			keepAlive.stop();
			return;
		}

				// Filter translatable nodes (text nodes AND form elements with text content)
				// Also filter out nodes with minimal content (< 3 chars after stripping HTML)
				const textNodes = pageContent.nodes.filter(node => {
					// Include text nodes, form elements, and labels
					const translatableTypes = ['text', 'input', 'text-input', 'email-input', 'password-input', 'textarea', 'button', 'submit-button', 'label', 'form-label', 'input-label'];
					if (!translatableTypes.includes(node.type || '')) return false;
					
					// Get the actual text content
					let content = '';
					if (typeof node.html === 'string' && node.html.trim().length > 0) {
						// Strip HTML tags to get actual text length
						content = node.html.replace(/<[^>]*>/g, '').trim();
					} else if (typeof node.text === 'string') {
						content = node.text.trim();
					}
					
					// Filter out empty or very short content (punctuation, single chars, etc)
					return content.length >= 3;
				});
		console.log(`Found ${textNodes.length} translatable nodes (text + form elements)`);

		// Create a cache for component content to avoid redundant API calls
		const componentContentCache = new Map<string, ComponentContent>();

		// ===== COMPONENT DISCOVERY (ONCE PER REQUEST, NOT PER LOCALE) =====
		// Discover all components without overrides and nested components
		const componentsWithoutOverrides = (pageContent.nodes || [])
			.filter(n => n.type === 'component-instance' && (!n.propertyOverrides || n.propertyOverrides.length === 0) && typeof n.componentId === 'string');
		
		const topLevelComponentIds = Array.from(new Set(
			componentsWithoutOverrides.map(n => n.componentId as string)
		));

		// Collect ALL component IDs from the page (including those with overrides) to find nested components
		const allTopLevelComponentIds = Array.from(new Set(
			(pageContent.nodes || [])
				.filter(n => n.type === 'component-instance' && typeof n.componentId === 'string')
				.map(n => n.componentId as string)
		));

		// Collect all component IDs including nested ones from ALL top-level components
		const allComponentIds = new Set<string>();
		
		// Add all top-level components without overrides
		for (const componentId of topLevelComponentIds) {
			allComponentIds.add(componentId);
		}
		
		// Traverse ALL top-level components to find nested components (even if parent has overrides)
		// This ensures we find components nested in slots, nested in other components, etc.
		for (const componentId of allTopLevelComponentIds) {
			const nestedIds = await collectNestedComponentIds(siteId, componentId, token, branchId, new Set(), componentContentCache);
			if (nestedIds.length > 0) {
				console.log(`Component ${componentId} contains ${nestedIds.length} nested component(s): ${nestedIds.join(', ')}`);
			}
			// Add all discovered nested components
			nestedIds.forEach(id => allComponentIds.add(id));
		}

		console.log(`Component analysis: ${allComponentInstances.length} total, ${componentsWithoutOverrides.length} without overrides, ${allComponentIds.size} unique (including nested)`);
		console.log(`All component IDs to translate:`, Array.from(allComponentIds));
		// ===== END COMPONENT DISCOVERY =====
		
		// Check if there's anything to translate
		if (textNodes.length === 0 && allComponentIds.size === 0) {
			console.log('Page has no translatable content (no text nodes and no components), sending success message for all locales');
			// Send success messages for all locales (nothing to translate)
			for (const targetLocaleId of targetLocaleIds) {
				const locale = (locales.secondary || []).find((l: any) => l.id === targetLocaleId);
				if (locale) {
					sendSSE(controller, encoder, {
						success: true,
						pageId,
						localeId: locale.id,
						localeName: locale.displayName,
						nodesTranslated: 0,
					});
				}
			}
			console.log(`All ${targetLocaleIds.length} locale(s) processed (no translatable content)`);
			controller.close();
			keepAlive.stop();
			return;
		}

                // Process each locale
                for (let localeIndex = 0; localeIndex < targetLocaleIds.length; localeIndex++) {
                    const targetLocaleId = targetLocaleIds[localeIndex];
                    
                    // Find the target locale
                    const locale = (locales.secondary || []).find((l: any) => l.id === targetLocaleId);
                    if (!locale) {
                        sendSSE(controller, encoder, { 
                            error: `Locale ${targetLocaleId} not found` 
                        });
                        continue; // Skip to next locale
                    }
                    
                    console.log(`\n========== Processing locale ${localeIndex + 1}/${targetLocaleIds.length}: ${locale.displayName} ==========`);

                // Send progress update
                sendSSE(controller, encoder, { 
                    status: 'translating', 
                    message: `Translating ${textNodes.length} text nodes to ${locale.displayName}...`,
                    totalNodes: textNodes.length
                });

                const sources = textNodes.map((node) => (
                    typeof node.html === 'string' && node.html.length > 0 ? node.html : (node.text as string)
                ));

                let translations: string[] = [];
                try {
                    // Send progress update before translation
                    sendSSE(controller, encoder, { 
                        status: 'translating', 
                        message: `Starting translation of ${sources.length} text nodes...`,
                    });
                    
                    translations = await translateBatch(sources, {
                        targetLanguage: (locale as any)?.tag || (locale as any)?.displayName || 'en',
                        sourceLanguage: 'en',
                        context: `Webflow page content: ${pageId} (${(locale as any)?.tag || (locale as any)?.displayName || ''})`,
                    });
                    
                    // Send progress update after translation
                    sendSSE(controller, encoder, { 
                        status: 'translating', 
                        message: `Completed translating text nodes, preparing updates...`,
                    });
                } catch (error) {
                    console.error(`Failed to translate text nodes for ${locale.displayName}:`, error);
                    // Use original sources as fallback
                    translations = sources;
                }

				const getRootTag = (html?: string): string | undefined => {
					if (!html || typeof html !== 'string') return undefined;
					const m = html.trim().match(/^<([a-z0-9-]+)\b/i);
					return m ? m[1].toLowerCase() : undefined;
				};

				const escapeHtml = (str: string): string => str
					.replace(/&/g, '&amp;')
					.replace(/</g, '&lt;')
					.replace(/>/g, '&gt;');

				const ensureWrapped = (content: string, tag?: string): string => {
					const trimmed = (content || '').trim();
					if (!tag) return trimmed;
					if (trimmed.startsWith('<')) return trimmed; // already HTML
					return `<${tag}>${escapeHtml(trimmed)}</${tag}>`;
				};

                const textUpdateNodes: UpdateNode[] = textNodes.map((node, idx) => {
					const content = translations[idx] ?? sources[idx] ?? '';
					const rootTag = getRootTag(node.html);
					
					// Handle form elements differently based on their type
					// For text inputs, use placeholder
					if (['text-input', 'email-input', 'password-input', 'textarea'].includes(node.type || '')) {
						return {
							nodeId: node.nodeId,
							placeholder: content,
						};
					}
					// For submit buttons, use value
					else if (node.type === 'submit-button') {
						return {
							nodeId: node.nodeId,
							value: content,
						};
					}
					// For regular text nodes, labels, and buttons, use text
					else {
						return {
							nodeId: node.nodeId,
							text: ensureWrapped(content, rootTag),
						};
					}
				});

                // Handle component instances: we need to set property overrides for ALL instances
                // This includes instances on the page AND nested instances inside other components
                const pageComponentInstances = pageContent.nodes.filter(n => n.type === 'component-instance' && typeof n.componentId === 'string');
                
                // Collect nested component instances from ALL top-level components
                console.log('Collecting nested component instances...');
                const nestedInstances: Array<{ nodeId: string; componentId: string; propertyOverrides?: any[] }> = [];
                for (const topLevelComponentId of allTopLevelComponentIds) {
                    const nested = await collectNestedComponentInstances(siteId, topLevelComponentId, token, branchId, new Set(), componentContentCache);
                    nestedInstances.push(...nested);
                    if (nested.length > 0) {
                        console.log(`Component ${topLevelComponentId} contains ${nested.length} nested instance(s)`);
                    }
                }
                
                // Separate page-level and nested instances (they use different APIs)
                const pageLevelInstances = pageComponentInstances.map(n => ({ 
                    nodeId: n.nodeId, 
                    componentId: n.componentId as string, 
                    propertyOverrides: n.propertyOverrides,
                    isPageLevel: true
                }));
                
                const nestedInstancesWithFlag = nestedInstances.map(n => ({
                    ...n,
                    isPageLevel: false
                }));
                
                const pageComponentNodesWithOverrides = pageLevelInstances.filter(n => Array.isArray(n.propertyOverrides) && n.propertyOverrides.length > 0);
                const pageComponentNodesWithoutOverrides = pageLevelInstances.filter(n => !n.propertyOverrides || n.propertyOverrides.length === 0);
                
                const nestedComponentNodesWithOverrides = nestedInstancesWithFlag.filter(n => Array.isArray(n.propertyOverrides) && n.propertyOverrides.length > 0);
                const nestedComponentNodesWithoutOverrides = nestedInstancesWithFlag.filter(n => !n.propertyOverrides || n.propertyOverrides.length === 0);

                console.log(`Found ${pageLevelInstances.length + nestedInstances.length} total component instance(s):`);
                console.log(`  Page-level: ${pageLevelInstances.length} (${pageComponentNodesWithOverrides.length} with overrides, ${pageComponentNodesWithoutOverrides.length} without)`);
                console.log(`  Nested: ${nestedInstances.length} (${nestedComponentNodesWithOverrides.length} with overrides, ${nestedComponentNodesWithoutOverrides.length} without)`);
                let componentUpdateNodes: UpdateNode[] = [];
                
                // First, handle PAGE-LEVEL component instances WITHOUT overrides
                // We need to fetch their component's default properties and set them as overrides
                if (pageComponentNodesWithoutOverrides.length > 0) {
                    console.log(`Processing ${pageComponentNodesWithoutOverrides.length} page-level component instances without overrides...`);
                    sendSSE(controller, encoder, { 
                        status: 'translating', 
                        message: `Processing ${pageComponentNodesWithoutOverrides.length} component instances...`,
                    });
                    
                    const defaultPropertyItems: Array<{ nodeId: string; componentId: string; propertyId: string; source: string }> = [];
                    
                    // For each instance, fetch its component's properties
                    for (const instance of pageComponentNodesWithoutOverrides) {
                        try {
                            const componentId = instance.componentId as string;
                            const properties = await fetchComponentProperties(siteId, componentId, token, branchId);
                            
                            // Add each property as an override for this instance
                            for (const prop of properties) {
                                if (prop.text && prop.text.trim().length > 0) {
                                    defaultPropertyItems.push({
                                        nodeId: instance.nodeId,
                                        componentId: componentId,
                                        propertyId: prop.propertyId,
                                        source: prop.text
                                    });
                                }
                            }
                        } catch (error) {
                            console.error(`Failed to fetch properties for component ${instance.componentId}:`, error);
                        }
                    }
                    
                    console.log(`Found ${defaultPropertyItems.length} default properties to translate across ${pageComponentNodesWithoutOverrides.length} page-level instances`);
                    
                    if (defaultPropertyItems.length > 0) {
                        try {
                            const defaultTranslations = await translateBatch(defaultPropertyItems.map(i => i.source), {
                                targetLanguage: (locale as any)?.tag || (locale as any)?.displayName || 'en',
                                sourceLanguage: 'en',
                                context: `Webflow component content: ${pageId} (${(locale as any)?.tag || (locale as any)?.displayName || ''})`,
                            });
                            
                            // Group by nodeId
                            const groupByNode = new Map<string, Array<{ propertyId: string; text: string }>>();
                            defaultPropertyItems.forEach((item, idx) => {
                                const list = groupByNode.get(item.nodeId) || [];
                                list.push({ propertyId: item.propertyId, text: defaultTranslations[idx] ?? item.source });
                                groupByNode.set(item.nodeId, list);
                            });
                            
                            // Add to componentUpdateNodes
                            const defaultOverrideNodes = Array.from(groupByNode.entries()).map(([nodeId, propertyOverrides]) => ({ nodeId, propertyOverrides }));
                            componentUpdateNodes.push(...defaultOverrideNodes);
                            console.log(`Created ${defaultOverrideNodes.length} property override updates for instances without overrides`);
                        } catch (error) {
                            console.error(`Failed to translate default properties for ${locale.displayName}:`, error);
                        }
                    }
                }
                
                // Then, handle PAGE-LEVEL component instances WITH existing overrides
                if (pageComponentNodesWithOverrides.length > 0) {
                    console.log(`Processing ${pageComponentNodesWithOverrides.length} page-level component instances with existing overrides...`);
                    console.log(`Page-level instances with overrides:`, pageComponentNodesWithOverrides.map(n => ({ 
                        nodeId: n.nodeId, 
                        componentId: n.componentId, 
                        overrideCount: n.propertyOverrides?.length || 0 
                    })));
                    
                    // Send progress update for components
                    sendSSE(controller, encoder, { 
                        status: 'translating', 
                        message: `Processing ${pageComponentNodesWithOverrides.length} component instances with existing overrides...`,
                    });
                    
                    const overrideItems: Array<{ nodeId: string; propertyId: string; source: string }> = [];
                    for (const cn of pageComponentNodesWithOverrides) {
                        for (const po of cn.propertyOverrides || []) {
                            const src = typeof po.html === 'string' && po.html.length > 0 ? po.html : (po.text as string | undefined);
                            if (typeof src === 'string' && src.trim().length > 0) {
                                overrideItems.push({ nodeId: cn.nodeId, propertyId: po.propertyId, source: src });
                            }
                        }
                    }

                    if (overrideItems.length > 0) {
                        try {
                            const overrideTranslations = await translateBatch(overrideItems.map(i => i.source), {
                                targetLanguage: (locale as any)?.tag || (locale as any)?.displayName || 'en',
                                sourceLanguage: 'en',
                                context: `Webflow component content: ${pageId} (${(locale as any)?.tag || (locale as any)?.displayName || ''})`,
                            });

                            // Group back by nodeId
                            const group = new Map<string, Array<{ propertyId: string; text: string }>>();
                            overrideItems.forEach((item, idx) => {
                                const list = group.get(item.nodeId) || [];
                                list.push({ propertyId: item.propertyId, text: overrideTranslations[idx] ?? item.source });
                                group.set(item.nodeId, list);
                            });

                            const existingOverrideNodes = Array.from(group.entries()).map(([nodeId, propertyOverrides]) => ({ nodeId, propertyOverrides }));
                            componentUpdateNodes.push(...existingOverrideNodes);
                            console.log(`Created ${existingOverrideNodes.length} property override updates for page-level instances with existing overrides`);
                        } catch (error) {
                            console.error(`Failed to translate component property overrides for ${locale.displayName}:`, error);
                            console.log('Failed overrides:', overrideItems.map(i => `${i.nodeId}/${i.propertyId}: ${i.source.substring(0, 100)}...`));
                        }
                    }
                }
                
                // Handle NESTED component instances (both with and without overrides)
                // These need to be updated via their parent component's DOM API
                const allNestedInstances = [...nestedComponentNodesWithOverrides, ...nestedComponentNodesWithoutOverrides];
                if (allNestedInstances.length > 0) {
                    console.log(`Processing ${allNestedInstances.length} nested component instances (${nestedComponentNodesWithOverrides.length} with overrides, ${nestedComponentNodesWithoutOverrides.length} without)...`);
                    
                    // Group nested instances by their parent component for batch updates
                    // Key: parent component ID, Value: array of instance updates
                    const nestedUpdatesByParent = new Map<string, Array<{ 
                        nodeId: string; 
                        propertyOverrides: Array<{ propertyId: string; text: string }> 
                    }>>();
                    
                    for (const nested of allNestedInstances) {
                        // Translate and prepare updates for each nested instance
                        if (nested.propertyOverrides && nested.propertyOverrides.length > 0) {
                            console.log(`Nested instance ${nested.nodeId} (component ${nested.componentId}) has ${nested.propertyOverrides.length} override(s)`);
                            
                            // Extract text from overrides (handle both string and object types)
                            const overrideItems: Array<{ propertyId: string; source: string; isHtml: boolean; originalHtml?: string }> = [];
                            for (const po of nested.propertyOverrides) {
                                let textContent: string | undefined;
                                let isHtml = false;
                                let originalHtml: string | undefined;
                                
                                if (typeof po.text === 'string') {
                                    textContent = po.text;
                                } else if (po.text && typeof po.text === 'object' && (po.text as any).html) {
                                    // This is an HTML property - extract text but remember it's HTML
                                    const htmlContent = (po.text as any).html;
                                    textContent = htmlContent.replace(/<[^>]*>/g, ' ').trim();
                                    isHtml = true;
                                    originalHtml = htmlContent;
                                }
                                
                                if (textContent && textContent.trim().length > 0) {
                                    overrideItems.push({ propertyId: po.propertyId, source: textContent, isHtml, originalHtml });
                                }
                            }
                            
                            if (overrideItems.length > 0) {
                                try {
                                    const translations = await translateBatch(overrideItems.map(i => i.source), {
                                        targetLanguage: (locale as any)?.tag || (locale as any)?.displayName || 'en',
                                        sourceLanguage: 'en',
                                        context: `Webflow nested component: ${nested.componentId} (${(locale as any)?.tag || (locale as any)?.displayName || ''})`,
                                    });
                                    
                                    console.log(`Translated ${translations.length} nested override(s) for instance ${nested.nodeId}`);
                                    console.log(`  Sources: ${overrideItems.map(i => i.source.substring(0, 50)).join(', ')}`);
                                    console.log(`  Translations: ${translations.map(t => t.substring(0, 50)).join(', ')}`);
                                    
                                    // Store the translated overrides grouped by parent component
                                    // For HTML properties, wrap the translation in the original HTML structure
                                    const translatedOverrides = overrideItems.map((item, idx) => {
                                        let translatedText = translations[idx] ?? item.source;
                                        
                                        // If this was an HTML property, wrap the translated text in a div
                                        if (item.isHtml) {
                                            // Simple approach: wrap in a div
                                            // TODO: Preserve original HTML structure if needed
                                            translatedText = `<div>${translatedText}</div>`;
                                            console.log(`  Wrapped HTML property ${item.propertyId}: ${translatedText.substring(0, 100)}`);
                                        }
                                        
                                        return {
                                            propertyId: item.propertyId,
                                            text: translatedText
                                        };
                                    });
                                    
                                    const parentId = (nested as any).parentComponentId;
                                    if (!nestedUpdatesByParent.has(parentId)) {
                                        nestedUpdatesByParent.set(parentId, []);
                                    }
                                    nestedUpdatesByParent.get(parentId)!.push({
                                        nodeId: nested.nodeId,
                                        propertyOverrides: translatedOverrides
                                    });
                                } catch (error) {
                                    console.error(`Failed to translate nested instance ${nested.nodeId}:`, error);
                                }
                            }
                        } else {
                            console.log(`Nested instance ${nested.nodeId} (component ${nested.componentId}) has no overrides, will use default properties`);
                        }
                    }
                    
                    // Apply nested instance updates via their parent component's DOM API
                    if (nestedUpdatesByParent.size > 0) {
                        console.log(`Applying ${nestedUpdatesByParent.size} parent component(s) with nested instance updates...`);
                        
                        for (const [parentComponentId, updates] of nestedUpdatesByParent.entries()) {
                            console.log(`Updating ${updates.length} nested instance(s) in parent component ${parentComponentId}`);
                            
                            try {
                                // Convert to the format expected by updateComponentContent
                                const componentNodes = updates.map(u => ({
                                    nodeId: u.nodeId,
                                    propertyOverrides: u.propertyOverrides
                                }));
                                
                                // Update via component DOM API
                                await updateComponentContent(siteId, parentComponentId, locale.id, componentNodes, token, branchId);
                                console.log(`✓ Updated ${updates.length} nested instance(s) in component ${parentComponentId}`);
                            } catch (error) {
                                console.error(`Failed to update nested instances in component ${parentComponentId}:`, error);
                            }
                        }
                    }
                }

            const allUpdates: UpdateNode[] = [...textUpdateNodes, ...componentUpdateNodes];
            // Send page-level updates first (text nodes and property overrides)
            if (allUpdates.length > 0) {
                console.log(`Preparing to update ${allUpdates.length} nodes via page API:`);
                console.log(`  Text nodes: ${textUpdateNodes.length}`);
                console.log(`  Component property overrides: ${componentUpdateNodes.length}`);
                console.log(`  Component override node IDs: ${componentUpdateNodes.map((n: any) => n.nodeId).join(', ')}`);
                
                // Send progress update before updating
                sendSSE(controller, encoder, { 
                    status: 'updating', 
                    message: `Updating ${allUpdates.length} nodes in Webflow...`,
                });
                
                try {
                    await updatePageContent(pageId, locale.id, allUpdates, token, branchId);
                    
                    // Send progress update after updating
                    sendSSE(controller, encoder, { 
                        status: 'updating', 
                        message: `Updated page content, processing components...`,
                    });
                } catch (error) {
                    console.error(`Failed to update page content for ${locale.displayName}:`, error);
                }
            }

            // Send progress update for component processing (using pre-discovered allComponentIds)
            if (allComponentIds.size > 0) {
                sendSSE(controller, encoder, { 
                    status: 'translating', 
                    message: `Processing ${allComponentIds.size} component definition(s)...`,
                });
            }

            // Process components in parallel batches for better performance
            const PARALLEL_COMPONENTS = 5; // Process 5 components at a time
            const componentArray = Array.from(allComponentIds);
            let processedComponents = 0;
            
            for (let i = 0; i < componentArray.length; i += PARALLEL_COMPONENTS) {
                const batch = componentArray.slice(i, i + PARALLEL_COMPONENTS);
                
                // Send progress update for batch
                sendSSE(controller, encoder, { 
                    status: 'translating', 
                    message: `Processing components ${i + 1}-${Math.min(i + batch.length, componentArray.length)} of ${componentArray.length}...`,
                });
                
                // Process batch in parallel
                await Promise.all(batch.map(async (componentId) => {
                    try {
                        // Try to fetch and translate component properties first
                        const properties = await fetchComponentProperties(siteId, componentId, token, branchId);
                        const translatableProps = properties.filter(p => typeof p.text === 'string' && p.text.trim().length > 0);
                        
                        console.log(`[Component ${componentId}] Found ${properties.length} total properties, ${translatableProps.length} translatable`);
                        if (translatableProps.length > 0) {
                            console.log(`[Component ${componentId}] Translatable properties:`, translatableProps.map(p => ({ id: p.propertyId, text: p.text?.substring(0, 50) })));
                        }
                        
                        // Translate component properties if they exist
                        if (translatableProps.length > 0) {
                            console.log(`[Component ${componentId}] Starting translation of ${translatableProps.length} properties for locale ${locale.displayName}...`);
                            const compSources = translatableProps.map(p => p.text as string);
                            console.log(`[Component ${componentId}] Source texts:`, compSources);
                            
                            const compTranslations = await translateBatch(compSources, {
                                targetLanguage: (locale as any)?.tag || (locale as any)?.displayName || 'en',
                                sourceLanguage: 'en',
                                context: `Webflow component content: ${componentId} (${(locale as any)?.tag || (locale as any)?.displayName || ''})`,
                            });
                            
                            console.log(`[Component ${componentId}] Translated texts:`, compTranslations);

                            // Build properties payload with translated text (HTML preserved by translator)
                            const propertiesPayload = translatableProps.map((p, idx) => ({
                                propertyId: p.propertyId,
                                text: compTranslations[idx] ?? p.text ?? '',
                            }));
                            
                            console.log(`[Component ${componentId}] Sending update payload to Webflow:`, JSON.stringify(propertiesPayload, null, 2));

                            await updateComponentProperties(siteId, componentId, locale.id, propertiesPayload, token, branchId);
                            console.log(`[Component ${componentId}] ✓ Properties updated successfully for locale ${locale.displayName}`);
                        } else {
                            console.log(`[Component ${componentId}] No translatable properties found, skipping property translation`);
                        }
                        
                        // ALWAYS check DOM text nodes (for form elements, buttons, labels, etc.)
                        // Use cache to avoid redundant API calls
                        if (!componentContentCache.has(componentId)) {
                            const content = await fetchComponentContent(siteId, componentId, token, branchId);
                            componentContentCache.set(componentId, content);
                        }
                        const comp = componentContentCache.get(componentId)!;
                        // Include text nodes AND form elements (labels, inputs, buttons, etc.)
                        const translatableTypes = ['text', 'input', 'text-input', 'email-input', 'password-input', 'textarea', 'button', 'submit-button', 'label', 'form-label', 'input-label'];
                        
                        const compTextNodes = comp.nodes.filter(n => 
                            translatableTypes.includes(n.type || '') && (
                                (typeof n.html === 'string' && n.html.trim().length > 0) ||
                                (typeof n.text === 'string' && n.text.trim().length > 0)
                            )
                        );
                        
                        if (compTextNodes.length > 0) {
                            const compSources = compTextNodes.map(n => typeof n.html === 'string' && n.html.length > 0 ? n.html : (n.text as string));
                            const compTranslations = await translateBatch(compSources, {
                                targetLanguage: (locale as any)?.tag || (locale as any)?.displayName || 'en',
                                sourceLanguage: 'en',
                                context: `Webflow component content: ${componentId} (${(locale as any)?.tag || (locale as any)?.displayName || ''})`,
                            });

                            const getRootTag = (html?: string): string | undefined => {
                                if (!html || typeof html !== 'string') return undefined;
                                const m = html.trim().match(/^<([a-z0-9-]+)\b/i);
                                return m ? m[1].toLowerCase() : undefined;
                            };

                            const escapeHtml = (str: string): string => str
                                .replace(/&/g, '&amp;')
                                .replace(/</g, '&lt;')
                                .replace(/>/g, '&gt;');

                            const ensureWrapped = (content: string, tag?: string): string => {
                                const trimmed = (content || '').trim();
                                if (!tag) return trimmed;
                                if (trimmed.startsWith('<')) return trimmed;
                                return `<${tag}>${escapeHtml(trimmed)}</${tag}>`;
                            };

                            const compUpdateNodes = compTextNodes.map((n, idx) => {
                                const translatedContent = compTranslations[idx] ?? compSources[idx] ?? '';
                                
                                // For form inputs, update placeholder instead of text
                                if (['text-input', 'email-input', 'password-input', 'textarea'].includes(n.type || '')) {
                                    return {
                                        nodeId: n.nodeId,
                                        placeholder: translatedContent,
                                    };
                                }
                                // For submit buttons, update value instead of text
                                else if (n.type === 'submit-button') {
                                    return {
                                        nodeId: n.nodeId,
                                        value: translatedContent,
                                    };
                                }
                                // For regular buttons, labels, and text nodes, update text
                                else {
                                    return {
                                        nodeId: n.nodeId,
                                        text: ensureWrapped(translatedContent, getRootTag(n.html)),
                                    };
                                }
                            });

                            await updateComponentContent(siteId, componentId, locale.id, compUpdateNodes, token, branchId);
                        }
                    } catch (error) {
                        console.error(`Failed to translate/update component ${componentId} for ${locale.displayName}:`, error);
                    }
                }));
                
                processedComponents += batch.length;
            }

                    // Send success message for this locale
                    sendSSE(controller, encoder, {
                        success: true,
                        pageId,
                        localeId: locale.id,
                        localeName: locale.displayName,
                        nodesTranslated: textNodes.length,
                    });
                    
                    console.log(`========== Completed locale ${localeIndex + 1}/${targetLocaleIds.length}: ${locale.displayName} ==========\n`);
                } // End of locale loop
                
                // All locales processed successfully
                console.log(`All ${targetLocaleIds.length} locale(s) processed successfully`);
                controller.close();
                keepAlive.stop();

            } catch (error) {
                console.error('Translation error:', error);
                sendSSE(controller, encoder, {
                    error: 'Translation failed',
                    details: error instanceof Error ? error.message : 'Unknown error',
                });
                controller.close();
                keepAlive.stop();
            }
        }
    });

    return new Response(stream, {
        headers: {
            'Content-Type': 'text/event-stream',
            'Cache-Control': 'no-cache',
            'Connection': 'keep-alive',
            'X-Accel-Buffering': 'no', // Disable buffering for Cloudflare Workers
        },
    });
}

// Configure for long-running translations
export const maxDuration = 300; // 5 minutes
export const dynamic = 'force-dynamic';

