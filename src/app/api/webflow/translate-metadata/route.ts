import { NextRequest } from 'next/server';
import { translateBatch } from '@/lib/translation';

const WEBFLOW_API_TOKEN = process.env.WEBFLOW_API_TOKEN;

export const runtime = 'nodejs';

interface PageMetadata {
  id: string;
  title: string;
  slug: string;
  seo: {
    title?: string;
    description?: string;
  };
  openGraph: {
    title?: string;
    titleCopied?: boolean;
    description?: string;
    descriptionCopied?: boolean;
  };
  localeId?: string;
}

interface TranslateMetadataRequest {
  pageId: string;
  targetLocaleIds: string[];
  translateSlug?: boolean;
}

/**
 * Converts translated text to a URL-safe slug
 * - Converts to lowercase
 * - Replaces spaces and underscores with hyphens
 * - Removes special characters except hyphens
 * - Removes consecutive hyphens
 * - Trims hyphens from start/end
 */
function toSlug(text: string): string {
  return text
    .toLowerCase()
    .normalize('NFD') // Decompose accented characters
    .replace(/[\u0300-\u036f]/g, '') // Remove diacritical marks
    .replace(/[^a-z0-9\s-]/g, '') // Remove non-alphanumeric except spaces and hyphens
    .replace(/[\s_]+/g, '-') // Replace spaces and underscores with hyphens
    .replace(/-+/g, '-') // Remove consecutive hyphens
    .replace(/^-|-$/g, ''); // Trim hyphens from start/end
}

/**
 * POST /api/webflow/translate-metadata
 * Translates page metadata (title, SEO, Open Graph) to target locales
 * Uses Server-Sent Events (SSE) for streaming progress updates
 * 
 * Body:
 *   - pageId: Required - The Webflow page ID
 *   - targetLocaleIds: Required - Array of locale IDs to translate to
 * 
 * Reference: 
 *   - GET: https://developers.webflow.com/data/v2.0.0/reference/pages-and-components/pages/get-metadata
 *   - PUT: https://developers.webflow.com/data/v2.0.0/reference/pages-and-components/pages/update-page-settings
 */
export async function POST(request: NextRequest) {
  const overrideToken = request.headers.get('x-webflow-token') || '';
  const token = overrideToken || WEBFLOW_API_TOKEN;

  if (!token) {
    return new Response(JSON.stringify({ error: 'Webflow API token not configured' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  const { searchParams } = new URL(request.url);
  const siteId = searchParams.get('siteId') || process.env.WEBFLOW_SITE_ID || '';

  let body: TranslateMetadataRequest;
  try {
    body = await request.json();
  } catch {
    return new Response(JSON.stringify({ error: 'Invalid JSON body' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  const { pageId, targetLocaleIds, translateSlug = false } = body;

  if (!pageId || !Array.isArray(targetLocaleIds) || targetLocaleIds.length === 0) {
    return new Response(JSON.stringify({ error: 'Missing pageId or targetLocaleIds' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  // Create SSE stream
  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      const sendSSE = (data: Record<string, unknown>) => {
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(data)}\n\n`));
      };

      try {
        // Fetch locales to get display names and primary locale
        sendSSE({ status: 'fetching', message: 'Fetching site locales...' });
        
        const localesResp = await fetch(`https://api.webflow.com/v2/sites/${siteId}`, {
          headers: {
            'Authorization': `Bearer ${token}`,
            'accept-version': '1.0.0',
          },
        });

        if (!localesResp.ok) {
          throw new Error('Failed to fetch site info');
        }

        const siteData = await localesResp.json();
        const locales = siteData.locales || { primary: null, secondary: [] };
        const primaryLocale = locales.primary;
        const allLocales = [primaryLocale, ...(locales.secondary || [])].filter(Boolean);
        
        // Get source language from primary locale
        const sourceLanguage = primaryLocale?.tag?.split('-')[0] || 'en';

        // Fetch primary locale metadata (source for translation)
        sendSSE({ status: 'fetching', message: 'Fetching source metadata...' });

        const primaryMetadataResp = await fetch(`https://api.webflow.com/v2/pages/${pageId}`, {
          headers: {
            'Authorization': `Bearer ${token}`,
            'accept-version': '1.0.0',
          },
        });

        if (!primaryMetadataResp.ok) {
          const errorText = await primaryMetadataResp.text();
          throw new Error(`Failed to fetch page metadata: ${errorText}`);
        }

        const sourceMetadata: PageMetadata = await primaryMetadataResp.json();
        console.log(`[translate-metadata] Source metadata:`, {
          title: sourceMetadata.title,
          seoTitle: sourceMetadata.seo?.title,
          seoDesc: sourceMetadata.seo?.description,
          ogTitle: sourceMetadata.openGraph?.title,
          ogDesc: sourceMetadata.openGraph?.description,
        });

        // Collect texts to translate
        const textsToTranslate: { field: string; text: string }[] = [];
        
        if (sourceMetadata.title) {
          textsToTranslate.push({ field: 'title', text: sourceMetadata.title });
        }
        // Slug translation is optional - translate the title-like text, then convert to URL-safe slug
        if (translateSlug && sourceMetadata.slug) {
          // Use the title as the source for slug translation (gives better context)
          // Fall back to the slug itself if title is not available
          const slugSource = sourceMetadata.title || sourceMetadata.slug.replace(/-/g, ' ');
          textsToTranslate.push({ field: 'slug', text: slugSource });
        }
        if (sourceMetadata.seo?.title) {
          textsToTranslate.push({ field: 'seoTitle', text: sourceMetadata.seo.title });
        }
        if (sourceMetadata.seo?.description) {
          textsToTranslate.push({ field: 'seoDescription', text: sourceMetadata.seo.description });
        }
        if (sourceMetadata.openGraph?.title && !sourceMetadata.openGraph.titleCopied) {
          textsToTranslate.push({ field: 'ogTitle', text: sourceMetadata.openGraph.title });
        }
        if (sourceMetadata.openGraph?.description && !sourceMetadata.openGraph.descriptionCopied) {
          textsToTranslate.push({ field: 'ogDescription', text: sourceMetadata.openGraph.description });
        }

        if (textsToTranslate.length === 0) {
          sendSSE({ 
            success: true, 
            message: 'No metadata fields to translate',
            fieldsTranslated: 0,
          });
          controller.close();
          return;
        }

        console.log(`[translate-metadata] Found ${textsToTranslate.length} fields to translate`);

        // Process each target locale
        for (const localeId of targetLocaleIds) {
          const locale = allLocales.find((l: any) => l.id === localeId);
          const localeName = locale?.displayName || locale?.tag || localeId;
          const targetLanguage = locale?.tag?.split('-')[0] || 'en';

          sendSSE({ 
            status: 'translating', 
            message: `Translating metadata to ${localeName}...`,
            localeName,
          });

          try {
            // Translate all texts for this locale
            const sources = textsToTranslate.map(t => t.text);
            const translations = await translateBatch(sources, {
              targetLanguage,
              sourceLanguage,
              context: `Page metadata for: ${sourceMetadata.title}`,
            });

            // Build the update payload
            const updatePayload: Record<string, any> = {};
            
            textsToTranslate.forEach((item, idx) => {
              const translated = translations[idx];
              switch (item.field) {
                case 'title':
                  updatePayload.title = translated;
                  break;
                case 'slug':
                  // Convert translated text to URL-safe slug
                  const translatedSlug = toSlug(translated);
                  if (translatedSlug.length > 0) {
                    updatePayload.slug = translatedSlug;
                    console.log(`[translate-metadata] Slug: "${sourceMetadata.slug}" → "${translatedSlug}"`);
                  }
                  break;
                case 'seoTitle':
                  if (!updatePayload.seo) updatePayload.seo = {};
                  updatePayload.seo.title = translated;
                  break;
                case 'seoDescription':
                  if (!updatePayload.seo) updatePayload.seo = {};
                  updatePayload.seo.description = translated;
                  break;
                case 'ogTitle':
                  if (!updatePayload.openGraph) updatePayload.openGraph = {};
                  updatePayload.openGraph.title = translated;
                  updatePayload.openGraph.titleCopied = false;
                  break;
                case 'ogDescription':
                  if (!updatePayload.openGraph) updatePayload.openGraph = {};
                  updatePayload.openGraph.description = translated;
                  updatePayload.openGraph.descriptionCopied = false;
                  break;
              }
            });

            console.log(`[translate-metadata] Updating ${localeName} with:`, updatePayload);

            // Update the page metadata for this locale
            sendSSE({ 
              status: 'updating', 
              message: `Updating metadata for ${localeName}...`,
              localeName,
            });

            const updateResp = await fetch(
              `https://api.webflow.com/v2/pages/${pageId}?localeId=${encodeURIComponent(localeId)}`,
              {
                method: 'PUT',
                headers: {
                  'Authorization': `Bearer ${token}`,
                  'accept-version': '1.0.0',
                  'Content-Type': 'application/json',
                },
                body: JSON.stringify(updatePayload),
              }
            );

            if (!updateResp.ok) {
              const errorText = await updateResp.text();
              console.error(`[translate-metadata] Failed to update ${localeName}:`, errorText);
              sendSSE({ 
                error: `Failed to update metadata for ${localeName}: ${errorText}`,
                localeName,
              });
              continue;
            }

            console.log(`[translate-metadata] ✓ Updated metadata for ${localeName}`);
            sendSSE({ 
              success: true, 
              localeName,
              fieldsTranslated: textsToTranslate.length,
              message: `Translated ${textsToTranslate.length} metadata fields to ${localeName}`,
            });

          } catch (localeError) {
            console.error(`[translate-metadata] Error translating to ${localeName}:`, localeError);
            sendSSE({ 
              error: `Translation error for ${localeName}: ${localeError instanceof Error ? localeError.message : 'Unknown error'}`,
              localeName,
            });
          }
        }

        sendSSE({ 
          status: 'complete', 
          message: `Metadata translation complete for ${targetLocaleIds.length} locale(s)`,
        });

      } catch (error) {
        console.error('[translate-metadata] Error:', error);
        sendSSE({ 
          error: error instanceof Error ? error.message : 'Unknown error',
          status: 'error',
        });
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
    },
  });
}

