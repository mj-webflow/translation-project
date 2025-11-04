import { NextRequest, NextResponse } from 'next/server';
// Use OpenAI translation service
import { translateBatch } from '@/lib/translation';

const WEBFLOW_API_TOKEN = process.env.WEBFLOW_API_TOKEN;
const WEBFLOW_SITE_ID = process.env.WEBFLOW_SITE_ID || '68c83fa8b4d1c57c202101a3';

async function fetchLocales() {
	const resp = await fetch(`https://api.webflow.com/v2/sites/${WEBFLOW_SITE_ID}`, {
		headers: {
			Authorization: `Bearer ${WEBFLOW_API_TOKEN}`,
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

async function fetchPageContent(pageId: string): Promise<PageContent> {
    const response = await fetch(
        `https://api.webflow.com/v2/pages/${pageId}/dom`,
        {
            headers: {
                'Authorization': `Bearer ${WEBFLOW_API_TOKEN}`,
                'accept-version': '1.0.0',
            },
        }
    );

    if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Failed to fetch page DOM content: ${errorText}`);
    }

    const json: any = await response.json();
    const domNodes: any[] = Array.isArray(json?.nodes) ? json.nodes : [];

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
        if (n?.type === 'text') {
            if (typeof n?.text?.text === 'string' && n.text.text.length > 0) {
                textValue = n.text.text;
            } else if (typeof n?.text?.html === 'string' && n.text.html.length > 0) {
                htmlValue = n.text.html;
                textValue = stripHtml(n.text.html);
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
    nodes: Array<{ nodeId: string; type?: string; text?: string; html?: string }>
};

async function fetchComponentContent(componentId: string): Promise<ComponentContent> {
    const response = await fetch(
        `https://api.webflow.com/v2/sites/${WEBFLOW_SITE_ID}/components/${componentId}/dom`,
        {
            headers: {
                'Authorization': `Bearer ${WEBFLOW_API_TOKEN}`,
                'accept-version': '1.0.0',
            },
        }
    );
    if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Failed to fetch component DOM content: ${errorText}`);
    }
    const json: any = await response.json();
    const nodes: any[] = Array.isArray(json?.nodes) ? json.nodes : [];

    const result = nodes.map((n: any) => {
        let textValue: string | undefined;
        let htmlValue: string | undefined;
        if (n?.type === 'text') {
            if (typeof n?.text?.text === 'string' && n.text.text.length > 0) {
                textValue = n.text.text;
            } else if (typeof n?.text?.html === 'string' && n.text.html.length > 0) {
                htmlValue = n.text.html;
            }
        }
        return {
            nodeId: typeof n?.id === 'string' ? n.id : '',
            type: typeof n?.type === 'string' ? n.type : undefined,
            text: textValue,
            html: htmlValue,
        };
    }).filter((n: any) => n.nodeId);

    return { nodes: result };
}

async function updateComponentContent(
    componentId: string,
    localeId: string,
    nodes: Array<{ nodeId: string; text: string }>
): Promise<void> {
    const url = new URL(`https://api.webflow.com/v2/sites/${WEBFLOW_SITE_ID}/components/${componentId}/dom`);
    url.searchParams.set('localeId', localeId);

    const response = await fetch(url.toString(), {
        method: 'POST',
        headers: {
            'Authorization': `Bearer ${WEBFLOW_API_TOKEN}`,
            'accept-version': '1.0.0',
            'Content-Type': 'application/json',
        },
        body: JSON.stringify({ nodes }),
    });

    if (!response.ok) {
        const errorText = await response.text();
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
                    'Authorization': `Bearer ${WEBFLOW_API_TOKEN}`,
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
    | { nodeId: string; propertyOverrides: Array<{ propertyId: string; text: string }> };

async function updatePageContent(
    pageId: string,
    localeId: string,
    nodes: UpdateNode[]
): Promise<void> {
    const url = new URL(`https://api.webflow.com/v2/pages/${pageId}/dom`);
    url.searchParams.set('localeId', localeId);

    const payload = { nodes } as any;

    const response = await fetch(url.toString(), {
        method: 'POST',
        headers: {
            'Authorization': `Bearer ${WEBFLOW_API_TOKEN}`,
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
                    'Authorization': `Bearer ${WEBFLOW_API_TOKEN}`,
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

export async function POST(request: NextRequest) {
	try {
		if (!WEBFLOW_API_TOKEN) {
			return NextResponse.json(
				{ error: 'Webflow API token not configured' },
				{ status: 500 }
			);
		}

		const { pageId } = await request.json();

		if (!pageId) {
			return NextResponse.json(
				{ error: 'Page ID is required' },
				{ status: 400 }
			);
		}

		console.log(`Starting translation for page: ${pageId}`);

		// Step 0: Fetch locales dynamically
		const locales = await fetchLocales();
		console.log('Locales used for translation:', locales);

		// Step 1: Fetch page content (primary locale)
		const pageContent = await fetchPageContent(pageId);
		console.log("pageContent", pageContent);

		if (!pageContent.nodes || pageContent.nodes.length === 0) {
			return NextResponse.json(
				{ error: 'No content found on page' },
				{ status: 404 }
			);
		}

				// Filter text nodes only (ensure type and either text/html are present)
				const textNodes = pageContent.nodes.filter(node =>
					node.type === 'text' && (
						(typeof node.text === 'string' && node.text.trim().length > 0) ||
						(typeof node.html === 'string' && node.html.trim().length > 0)
					)
				);
		console.log(`Found ${textNodes.length} text nodes to translate`);

		const completedLocales: string[] = [];

        // Step 2 & 3: Translate and update for each secondary locale, including component instances
		for (const locale of locales.secondary) {
                console.log(`Updating locale ${locale.displayName} (${locale.tag}) with translated text...`);

                const sources = textNodes.map((node) => (
                    typeof node.html === 'string' && node.html.length > 0 ? node.html : (node.text as string)
                ));

                const translations = await translateBatch(sources, {
                    targetLanguage: (locale as any)?.tag || (locale as any)?.displayName || 'en',
                    sourceLanguage: 'en',
                    context: `Webflow page content: ${pageId} (${(locale as any)?.tag || (locale as any)?.displayName || ''})`,
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
					if (trimmed.startsWith('<')) return trimmed; // already HTML
					return `<${tag}>${escapeHtml(trimmed)}</${tag}>`;
				};

                const textUpdateNodes: UpdateNode[] = textNodes.map((node, idx) => {
					const content = translations[idx] ?? sources[idx] ?? '';
					const rootTag = getRootTag(node.html);
					return {
						nodeId: node.nodeId,
						text: ensureWrapped(content, rootTag),
					};
				});

                // Handle component instances: translate propertyOverrides
                const componentNodes = pageContent.nodes.filter(n => n.type === 'component-instance' && Array.isArray(n.propertyOverrides) && (n.propertyOverrides as any).length > 0);
                let componentUpdateNodes: UpdateNode[] = [];
                if (componentNodes.length > 0) {
                    const overrideItems: Array<{ nodeId: string; propertyId: string; source: string }> = [];
                    for (const cn of componentNodes) {
                        for (const po of cn.propertyOverrides || []) {
                            const src = typeof po.html === 'string' && po.html.length > 0 ? po.html : (po.text as string | undefined);
                            if (typeof src === 'string' && src.trim().length > 0) {
                                overrideItems.push({ nodeId: cn.nodeId, propertyId: po.propertyId, source: src });
                            }
                        }
                    }

                    if (overrideItems.length > 0) {
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

                        componentUpdateNodes = Array.from(group.entries()).map(([nodeId, propertyOverrides]) => ({ nodeId, propertyOverrides }));
                    }
                }

            const allUpdates: UpdateNode[] = [...textUpdateNodes, ...componentUpdateNodes];
            // Send page-level updates first (text nodes and property overrides)
            if (allUpdates.length > 0) {
                console.log(`Updating ${allUpdates.length} nodes for ${locale.displayName}...`);
                await updatePageContent(pageId, locale.id, allUpdates);
            }

            // Additionally, for component instances with no property overrides, update component definition content for this locale
            const uniqueComponentIds = Array.from(new Set(
                (pageContent.nodes || [])
                    .filter(n => n.type === 'component-instance' && (!n.propertyOverrides || n.propertyOverrides.length === 0) && typeof n.componentId === 'string')
                    .map(n => n.componentId as string)
            ));

            for (const componentId of uniqueComponentIds) {
                const comp = await fetchComponentContent(componentId);
                const compTextNodes = comp.nodes.filter(n => n.type === 'text' && (
                    (typeof n.html === 'string' && n.html.trim().length > 0) ||
                    (typeof n.text === 'string' && n.text.trim().length > 0)
                ));
                if (compTextNodes.length === 0) continue;

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

                const compUpdateNodes = compTextNodes.map((n, idx) => ({
                    nodeId: n.nodeId,
                    text: ensureWrapped(compTranslations[idx] ?? compSources[idx] ?? '', getRootTag(n.html)),
                }));

                await updateComponentContent(componentId, locale.id, compUpdateNodes);
            }

            completedLocales.push(locale.displayName);
		}

		console.log(`Translation complete for page ${pageId}. Updated ${completedLocales.length} locales.`);

		return NextResponse.json({
			success: true,
			pageId,
			completedLocales,
			nodesTranslated: textNodes.length,
		});

	} catch (error) {
		console.error('Translation error:', error);
		return NextResponse.json(
			{
				error: 'Translation failed',
				details: error instanceof Error ? error.message : 'Unknown error',
			},
			{ status: 500 }
		);
	}
}

