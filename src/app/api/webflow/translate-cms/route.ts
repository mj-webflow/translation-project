import { NextRequest } from 'next/server';
import { translateBatch } from '@/lib/translation';

const WEBFLOW_API_TOKEN = process.env.WEBFLOW_API_TOKEN;
const WEBFLOW_SITE_ID = process.env.WEBFLOW_SITE_ID || '';

// Translatable field types in Webflow CMS
const TRANSLATABLE_FIELD_TYPES = ['PlainText', 'RichText'];

// Field slugs that should NEVER be translated (system/identifier fields)
const NON_TRANSLATABLE_FIELD_SLUGS = [
    'slug',
    '_archived',
    '_draft',
];

// Counter for API calls
let requestApiCallCount = 0;

/**
 * Fetch with retry and exponential backoff for rate limiting
 */
async function fetchWithRetry(
    url: string,
    options: RequestInit,
    maxRetries = 3
): Promise<Response> {
    let lastError: Error | null = null;
    
    for (let attempt = 0; attempt < maxRetries; attempt++) {
        try {
            // Track Webflow API calls
            if (url.includes('api.webflow.com')) {
                requestApiCallCount++;
            }
            
            const response = await fetch(url, options);
            
            // If rate limited, wait and retry
            if (response.status === 429) {
                const retryAfter = response.headers.get('Retry-After');
                const waitTime = retryAfter ? parseInt(retryAfter, 10) * 1000 : Math.pow(2, attempt) * 1000;
                console.log(`Rate limited. Waiting ${waitTime}ms before retry ${attempt + 1}/${maxRetries}`);
                await new Promise(resolve => setTimeout(resolve, waitTime));
                continue;
            }
            
            return response;
        } catch (error) {
            lastError = error as Error;
            if (attempt < maxRetries - 1) {
                const waitTime = Math.pow(2, attempt) * 1000;
                console.log(`Request failed. Waiting ${waitTime}ms before retry ${attempt + 1}/${maxRetries}`);
                await new Promise(resolve => setTimeout(resolve, waitTime));
            }
        }
    }
    
    throw lastError || new Error('Max retries exceeded');
}

/**
 * Fetch collection schema
 */
async function fetchCollectionSchema(collectionId: string, token: string) {
    const response = await fetchWithRetry(`https://api.webflow.com/v2/collections/${collectionId}`, {
        headers: {
            Authorization: `Bearer ${token}`,
            'accept-version': '1.0.0',
        },
        cache: 'no-store',
    });

    if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Failed to fetch collection schema: ${errorText}`);
    }

    return response.json();
}

/**
 * Fetch items from a collection
 */
async function fetchCollectionItems(
    collectionId: string,
    token: string,
    itemIds?: string[],
    cmsLocaleId?: string
): Promise<any[]> {
    const items: any[] = [];
    let offset = 0;
    const limit = 100;
    let hasMore = true;

    while (hasMore) {
        let url = `https://api.webflow.com/v2/collections/${collectionId}/items?offset=${offset}&limit=${limit}`;
        if (cmsLocaleId) {
            url += `&cmsLocaleId=${cmsLocaleId}`;
        }

        const response = await fetchWithRetry(url, {
            headers: {
                Authorization: `Bearer ${token}`,
                'accept-version': '1.0.0',
            },
            cache: 'no-store',
        });

        if (!response.ok) {
            const errorText = await response.text();
            throw new Error(`Failed to fetch collection items: ${errorText}`);
        }

        const data = await response.json();
        const fetchedItems = data.items || [];
        
        // If itemIds specified, filter to only those items
        if (itemIds && itemIds.length > 0) {
            const filtered = fetchedItems.filter((item: any) => itemIds.includes(item.id));
            items.push(...filtered);
        } else {
            items.push(...fetchedItems);
        }

        const total = data.pagination?.total || 0;
        offset += fetchedItems.length;
        hasMore = fetchedItems.length > 0 && offset < total;

        // If we have all requested items, stop early
        if (itemIds && items.length >= itemIds.length) {
            hasMore = false;
        }
    }

    return items;
}

/**
 * Update collection items for a specific locale
 */
async function updateCollectionItems(
    collectionId: string,
    token: string,
    items: Array<{ id: string; fieldData: Record<string, any> }>,
    cmsLocaleId: string
): Promise<{ success: boolean; error?: string }> {
    // Webflow API allows updating up to 100 items at a time
    const BATCH_SIZE = 100;
    
    for (let i = 0; i < items.length; i += BATCH_SIZE) {
        const batch = items.slice(i, i + BATCH_SIZE);
        
        // Per Webflow docs: cmsLocaleId must be included IN EACH ITEM, not just as query param
        // https://developers.webflow.com/data/v2.0.0/docs/working-with-localization/localize-cms-content
        const response = await fetchWithRetry(
            `https://api.webflow.com/v2/collections/${collectionId}/items`,
            {
                method: 'PATCH',
                headers: {
                    Authorization: `Bearer ${token}`,
                    'Content-Type': 'application/json',
                    'accept-version': '1.0.0',
                },
                body: JSON.stringify({
                    items: batch.map(item => ({
                        id: item.id,
                        cmsLocaleId: cmsLocaleId,  // Include locale ID in each item!
                        fieldData: item.fieldData,
                    })),
                }),
            }
        );

        if (!response.ok) {
            const errorText = await response.text();
            console.error('Failed to update items:', errorText);
            return { success: false, error: errorText };
        }
    }

    return { success: true };
}

/**
 * Fetch site locales
 */
async function fetchLocales(siteId: string, token: string) {
    const response = await fetchWithRetry(`https://api.webflow.com/v2/sites/${siteId}`, {
        headers: {
            Authorization: `Bearer ${token}`,
            'accept-version': '1.0.0',
        },
        cache: 'no-store',
    });

    if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Failed to fetch locales: ${errorText}`);
    }

    const data = await response.json();
    return {
        primary: data.locales?.primary || null,
        secondary: data.locales?.secondary || [],
    };
}

/**
 * Strip HTML tags for translation, then restore
 */
function stripHtmlForTranslation(html: string): { text: string; isHtml: boolean } {
    if (!html || typeof html !== 'string') {
        return { text: '', isHtml: false };
    }
    
    const isHtml = /<[^>]+>/.test(html);
    if (!isHtml) {
        return { text: html, isHtml: false };
    }
    
    // For rich text, we'll translate the whole thing and let the translation service handle HTML
    return { text: html, isHtml: true };
}

/**
 * Create keep-alive stream for SSE
 */
function createKeepAliveStream(encoder: TextEncoder) {
    let keepAliveInterval: ReturnType<typeof setInterval> | null = null;
    
    return {
        start(controller: ReadableStreamDefaultController) {
            keepAliveInterval = setInterval(() => {
                try {
                    controller.enqueue(encoder.encode(': keepalive\n\n'));
                } catch {
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

/**
 * POST /api/webflow/translate-cms
 * 
 * Translates CMS collection items to target locales.
 * Uses Server-Sent Events (SSE) to stream progress updates.
 * 
 * Request body:
 *   - collectionId: Webflow collection ID (required)
 *   - itemIds: Array of item IDs to translate (optional, translates all if not provided)
 *   - targetLocaleIds: Array of target locale IDs (required)
 *   - fieldSlugs: Array of field slugs to translate (optional, translates all translatable if not provided)
 * 
 * Query params:
 *   - siteId: Webflow site ID (optional if env is set)
 * 
 * Headers:
 *   - x-webflow-token: Override token (optional)
 */
export async function POST(request: NextRequest) {
    const encoder = new TextEncoder();
    
    // Helper to send SSE messages
    const sendSSE = (controller: ReadableStreamDefaultController, data: any) => {
        const message = `data: ${JSON.stringify(data)}\n\n`;
        controller.enqueue(encoder.encode(message));
        controller.enqueue(encoder.encode(': ping\n\n'));
    };

    const stream = new ReadableStream({
        async start(controller) {
            const keepAlive = createKeepAliveStream(encoder);
            keepAlive.start(controller);
            
            requestApiCallCount = 0;
            
            try {
                const overrideToken = request.headers.get('x-webflow-token') || '';
                const { searchParams } = new URL(request.url);
                const siteId = searchParams.get('siteId') || WEBFLOW_SITE_ID;
                const token = overrideToken || WEBFLOW_API_TOKEN || '';

                const body = await request.json();
                const { collectionId, itemIds, targetLocaleIds, fieldSlugs } = body;

                // Validation
                if (!collectionId) {
                    sendSSE(controller, { error: 'Collection ID is required' });
                    controller.close();
                    keepAlive.stop();
                    return;
                }

                if (!targetLocaleIds || !Array.isArray(targetLocaleIds) || targetLocaleIds.length === 0) {
                    sendSSE(controller, { error: 'At least one target locale ID is required' });
                    controller.close();
                    keepAlive.stop();
                    return;
                }

                if (!token) {
                    sendSSE(controller, { error: 'Webflow API token not configured' });
                    controller.close();
                    keepAlive.stop();
                    return;
                }

                if (!siteId) {
                    sendSSE(controller, { error: 'Missing siteId' });
                    controller.close();
                    keepAlive.stop();
                    return;
                }

                console.log(`[translate-cms] Starting translation for collection: ${collectionId}`);
                console.log(`[translate-cms] Items: ${itemIds?.length || 'all'}, Locales: ${targetLocaleIds.length}`);

                sendSSE(controller, { 
                    type: 'progress', 
                    message: 'Fetching collection schema...',
                    step: 1,
                    totalSteps: 5
                });

                // Step 1: Fetch collection schema
                const schema = await fetchCollectionSchema(collectionId, token);
                const allFields = schema.fields || [];
                
                // Determine which fields to translate
                let fieldsToTranslate = allFields.filter((f: any) => 
                    TRANSLATABLE_FIELD_TYPES.includes(f.type) &&
                    !NON_TRANSLATABLE_FIELD_SLUGS.includes(f.slug) &&
                    !f.slug.endsWith('-slug') &&
                    !f.slug.endsWith('-id')
                );
                
                // If specific fields requested, filter to those (still excluding system fields)
                if (fieldSlugs && fieldSlugs.length > 0) {
                    fieldsToTranslate = fieldsToTranslate.filter((f: any) => 
                        fieldSlugs.includes(f.slug) &&
                        !NON_TRANSLATABLE_FIELD_SLUGS.includes(f.slug)
                    );
                }

                console.log(`[translate-cms] Translatable fields: ${fieldsToTranslate.map((f: any) => f.slug).join(', ')}`);

                if (fieldsToTranslate.length === 0) {
                    sendSSE(controller, { 
                        type: 'error', 
                        error: 'No translatable fields found in this collection' 
                    });
                    controller.close();
                    keepAlive.stop();
                    return;
                }

                sendSSE(controller, { 
                    type: 'progress', 
                    message: `Found ${fieldsToTranslate.length} translatable fields`,
                    fields: fieldsToTranslate.map((f: any) => ({ slug: f.slug, type: f.type })),
                    step: 1,
                    totalSteps: 5
                });

                // Step 2: Fetch locales
                sendSSE(controller, { 
                    type: 'progress', 
                    message: 'Fetching locales...',
                    step: 2,
                    totalSteps: 5
                });

                const locales = await fetchLocales(siteId, token);
                const primaryLocale = locales.primary;
                const sourceLanguage = primaryLocale?.tag || primaryLocale?.cmsLocaleId || 'en';
                
                console.log(`[translate-cms] Source language: ${sourceLanguage}`);

                // Step 3: Fetch items (primary locale)
                sendSSE(controller, { 
                    type: 'progress', 
                    message: 'Fetching items...',
                    step: 3,
                    totalSteps: 5
                });

                const items = await fetchCollectionItems(
                    collectionId, 
                    token, 
                    itemIds,
                    primaryLocale?.cmsLocaleId
                );

                if (items.length === 0) {
                    sendSSE(controller, { 
                        type: 'error', 
                        error: 'No items found to translate' 
                    });
                    controller.close();
                    keepAlive.stop();
                    return;
                }

                console.log(`[translate-cms] Found ${items.length} items to translate`);

                sendSSE(controller, { 
                    type: 'progress', 
                    message: `Found ${items.length} items to translate`,
                    itemCount: items.length,
                    step: 3,
                    totalSteps: 5
                });

                // Step 4: Translate and update for each locale
                const totalLocales = targetLocaleIds.length;
                let completedLocales = 0;

                for (const targetLocaleId of targetLocaleIds) {
                    const locale = (locales.secondary || []).find((l: any) => l.id === targetLocaleId);
                    const localeName = locale?.displayName || locale?.tag || targetLocaleId;
                    const targetLanguage = locale?.tag || localeName;

                    console.log(`[translate-cms] Translating to: ${localeName} (${targetLanguage})`);
                    
                    // Check if locale has CMS localization enabled
                    if (!locale?.cmsLocaleId) {
                        sendSSE(controller, { 
                            type: 'locale_error', 
                            locale: localeName,
                            error: `Locale "${localeName}" does not have CMS localization enabled. Please enable it in Webflow Settings > Locales.`
                        });
                        completedLocales++;
                        continue;
                    }

                    sendSSE(controller, { 
                        type: 'progress', 
                        message: `Translating to ${localeName}...`,
                        locale: localeName,
                        localeProgress: `${completedLocales + 1}/${totalLocales}`,
                        step: 4,
                        totalSteps: 5
                    });

                    // Collect all texts to translate
                    const textsToTranslate: Array<{ itemId: string; fieldSlug: string; text: string; isHtml: boolean }> = [];

                    for (const item of items) {
                        const fieldData = item.fieldData || {};
                        
                        for (const field of fieldsToTranslate) {
                            const value = fieldData[field.slug];
                            if (value && typeof value === 'string' && value.trim()) {
                                const { text, isHtml } = stripHtmlForTranslation(value);
                                if (text.trim()) {
                                    textsToTranslate.push({
                                        itemId: item.id,
                                        fieldSlug: field.slug,
                                        text,
                                        isHtml,
                                    });
                                }
                            }
                        }
                    }

                    if (textsToTranslate.length === 0) {
                        console.log(`[translate-cms] No translatable content found`);
                        completedLocales++;
                        continue;
                    }

                    console.log(`[translate-cms] Translating ${textsToTranslate.length} text segments`);

                    sendSSE(controller, { 
                        type: 'progress', 
                        message: `Translating ${textsToTranslate.length} text segments to ${localeName}...`,
                        locale: localeName,
                        segmentCount: textsToTranslate.length,
                        step: 4,
                        totalSteps: 5
                    });

                    // Batch translate
                    const translations = await translateBatch(
                        textsToTranslate.map(t => t.text),
                        {
                            targetLanguage,
                            sourceLanguage,
                        }
                    );

                    // Build update payloads
                    const itemUpdates: Map<string, Record<string, any>> = new Map();

                    textsToTranslate.forEach((textInfo, index) => {
                        if (!itemUpdates.has(textInfo.itemId)) {
                            itemUpdates.set(textInfo.itemId, {});
                        }
                        const fieldData = itemUpdates.get(textInfo.itemId)!;
                        fieldData[textInfo.fieldSlug] = translations[index];
                    });

                    // Convert to array format for API
                    const updatePayload = Array.from(itemUpdates.entries()).map(([id, fieldData]) => ({
                        id,
                        fieldData,
                    }));

                    console.log(`[translate-cms] Updating ${updatePayload.length} items for ${localeName}`);

                    sendSSE(controller, { 
                        type: 'progress', 
                        message: `Updating ${updatePayload.length} items for ${localeName}...`,
                        locale: localeName,
                        step: 5,
                        totalSteps: 5
                    });

                    // Update items
                    const cmsLocaleId = locale?.cmsLocaleId || targetLocaleId;
                    const updateResult = await updateCollectionItems(
                        collectionId,
                        token,
                        updatePayload,
                        cmsLocaleId
                    );

                    if (!updateResult.success) {
                        console.error(`[translate-cms] Failed to update items for ${localeName}:`, updateResult.error);
                        sendSSE(controller, { 
                            type: 'locale_error', 
                            locale: localeName,
                            error: updateResult.error 
                        });
                    } else {
                        console.log(`[translate-cms] ✓ Completed ${localeName}`);
                        sendSSE(controller, { 
                            type: 'locale_complete', 
                            locale: localeName,
                            itemsTranslated: updatePayload.length,
                            fieldsTranslated: textsToTranslate.length
                        });
                    }

                    completedLocales++;
                }

                // Complete
                console.log(`[translate-cms] ✓ Translation complete. API calls: ${requestApiCallCount}`);
                
                sendSSE(controller, { 
                    type: 'complete', 
                    message: 'Translation complete!',
                    itemsTranslated: items.length,
                    localesTranslated: completedLocales,
                    apiCallCount: requestApiCallCount
                });

            } catch (error) {
                console.error('[translate-cms] Error:', error);
                sendSSE(controller, { 
                    type: 'error', 
                    error: error instanceof Error ? error.message : 'Unknown error occurred' 
                });
            } finally {
                keepAlive.stop();
                controller.close();
            }
        }
    });

    return new Response(stream, {
        headers: {
            'Content-Type': 'text/event-stream',
            'Cache-Control': 'no-cache',
            'Connection': 'keep-alive',
            'X-Accel-Buffering': 'no',
        },
    });
}

