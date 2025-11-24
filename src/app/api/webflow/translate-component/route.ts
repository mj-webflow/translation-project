import { NextRequest } from 'next/server';

const WEBFLOW_API_TOKEN = process.env.WEBFLOW_API_TOKEN;
const WEBFLOW_SITE_ID = process.env.WEBFLOW_SITE_ID || '';

// Import translation function
import { translateBatch } from '@/lib/translation';

// Helper to send progress updates
function sendProgress(controller: ReadableStreamDefaultController, encoder: TextEncoder, status: string, message: string) {
    try {
        controller.enqueue(encoder.encode(`data: ${JSON.stringify({ status, message })}\n\n`));
    } catch (e) {
        console.error('Failed to send progress update:', e);
    }
}

async function fetchLocales(siteId: string, token: string) {
    const resp = await fetch(`https://api.webflow.com/v2/sites/${siteId}`, {
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

async function fetchComponentProperties(
    siteId: string,
    componentId: string,
    token: string,
    branchId?: string | null
): Promise<Array<{ propertyId: string; text?: string }>> {
    const url = new URL(`https://api.webflow.com/v2/sites/${siteId}/components/${componentId}/properties`);
    if (branchId) url.searchParams.set('branchId', branchId);
    const response = await fetch(url.toString(), {
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
    
    const props = Array.isArray(json?.properties) ? json.properties : [];
    const result = props.map((p: any) => {
        const propertyId = typeof p?.id === 'string' ? p.id : '';
        const text = typeof p?.text === 'string' ? p.text : undefined;
        return { propertyId, text };
    }).filter((p: any) => !!p.propertyId);
    
    return result;
}

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

    const payload = { properties } as any;

    const response = await fetch(url.toString(), {
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
        throw new Error(`Failed to update component properties for locale ${localeId}: ${errorText}`);
    }
}

export async function POST(request: NextRequest) {
    const encoder = new TextEncoder();
    
    // Create a streaming response
    const stream = new ReadableStream({
        async start(controller) {
            try {
                const overrideToken = request.headers.get('x-webflow-token') || '';
                const { searchParams } = new URL(request.url);
                const siteId = searchParams.get('siteId') || WEBFLOW_SITE_ID;
                const branchId = searchParams.get('branchId');
                const token = overrideToken || WEBFLOW_API_TOKEN || '';

                const body = await request.json();
                const { componentId, targetLocaleId } = body;

                if (!componentId) {
                    controller.enqueue(encoder.encode(`data: ${JSON.stringify({ error: 'Component ID is required' })}\n\n`));
                    controller.close();
                    return;
                }

                if (!targetLocaleId) {
                    controller.enqueue(encoder.encode(`data: ${JSON.stringify({ error: 'Target locale ID is required' })}\n\n`));
                    controller.close();
                    return;
                }

                if (!token) {
                    controller.enqueue(encoder.encode(`data: ${JSON.stringify({ error: 'Webflow API token not configured' })}\n\n`));
                    controller.close();
                    return;
                }

                if (!siteId) {
                    controller.enqueue(encoder.encode(`data: ${JSON.stringify({ error: 'Missing siteId' })}\n\n`));
                    controller.close();
                    return;
                }

                console.log(`Starting component translation: ${componentId}`);
                
                sendProgress(controller, encoder, 'fetching', 'Fetching component data...');

                // Fetch locales
                const locales = await fetchLocales(siteId, token);
                const locale = (locales.secondary || []).find((l: any) => l.id === targetLocaleId);
                
                if (!locale) {
                    controller.enqueue(encoder.encode(`data: ${JSON.stringify({ 
                        error: `Locale ${targetLocaleId} not found` 
                    })}\n\n`));
                    controller.close();
                    return;
                }

                sendProgress(controller, encoder, 'translating', `Fetching component properties for ${componentId}...`);

                // Fetch component properties
                const properties = await fetchComponentProperties(siteId, componentId, token, branchId);
                console.log(`Fetched ${properties.length} properties for component ${componentId}`);
                
                const translatableProps = properties.filter(p => typeof p.text === 'string' && p.text.trim().length > 0);
                console.log(`${translatableProps.length} properties have translatable text`);

                if (translatableProps.length === 0) {
                    sendProgress(controller, encoder, 'complete', `Component has no translatable properties`);
                    controller.enqueue(encoder.encode(`data: ${JSON.stringify({ 
                        success: true,
                        message: 'Component has no translatable properties',
                        propertiesTranslated: 0
                    })}\n\n`));
                    controller.close();
                    return;
                }

                sendProgress(controller, encoder, 'translating', `Translating ${translatableProps.length} properties...`);

                // Translate properties in small chunks
                const compSources = translatableProps.map(p => p.text as string);
                const compTranslations: string[] = [];
                const CHUNK_SIZE = 5;
                
                for (let i = 0; i < compSources.length; i += CHUNK_SIZE) {
                    const chunk = compSources.slice(i, i + CHUNK_SIZE);
                    sendProgress(controller, encoder, 'translating', `Translating properties ${i + 1}-${Math.min(i + CHUNK_SIZE, compSources.length)} of ${compSources.length}...`);
                    
                    const chunkTranslations = await translateBatch(chunk, {
                        targetLanguage: (locale as any)?.tag || (locale as any)?.displayName || 'en',
                        sourceLanguage: 'en',
                        context: `Webflow component content: ${componentId} (${(locale as any)?.tag || (locale as any)?.displayName || ''})`,
                    });
                    compTranslations.push(...chunkTranslations);
                    
                    const progress = Math.min(i + CHUNK_SIZE, compSources.length);
                    sendProgress(controller, encoder, 'translating', `Completed ${progress}/${compSources.length} properties`);
                }

                // Build properties payload
                const propertiesPayload = translatableProps.map((p, idx) => ({
                    propertyId: p.propertyId,
                    text: compTranslations[idx] ?? p.text ?? '',
                }));

                sendProgress(controller, encoder, 'updating', `Updating component in Webflow...`);

                // Update component properties
                await updateComponentProperties(siteId, componentId, locale.id, propertiesPayload, token, branchId);
                
                console.log(`Component ${componentId} properties updated successfully`);

                // Send success message
                controller.enqueue(encoder.encode(`data: ${JSON.stringify({ 
                    success: true,
                    message: `Successfully translated component`,
                    propertiesTranslated: propertiesPayload.length
                })}\n\n`));
                
                controller.close();

            } catch (error) {
                console.error('Component translation error:', error);
                controller.enqueue(encoder.encode(`data: ${JSON.stringify({ 
                    error: error instanceof Error ? error.message : 'Component translation failed'
                })}\n\n`));
                controller.close();
            }
        }
    });

    return new Response(stream, {
        headers: {
            'Content-Type': 'text/event-stream',
            'Cache-Control': 'no-cache',
            'Connection': 'keep-alive',
        },
    });
}

export const maxDuration = 300;

