import { NextRequest, NextResponse } from 'next/server';
import { translateText } from '@/lib/translation';
import { callMcpTool } from '@/lib/mcpClient';

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
    }>;
}

async function fetchPageContent(pageId: string): Promise<PageContent> {
    // Use MCP to fetch static content nodes
    // eslint-disable-next-line no-console
    console.log('[api/webflow/translate-page] MCP get_page_content request', { pageId });
    const data = await callMcpTool<PageContent>('get_page_content', { pageId });
    // eslint-disable-next-line no-console
    console.log('[api/webflow/translate-page] MCP get_page_content response', { nodesCount: Array.isArray((data as any)?.nodes) ? (data as any).nodes.length : 0 });
    return data;
}

async function updatePageContent(
    pageId: string,
    localeId: string,
    nodes: Array<{ nodeId: string; text: string }>
): Promise<void> {
    // Use MCP to update localized static content
    // eslint-disable-next-line no-console
    console.log('[api/webflow/translate-page] MCP update_page_content request', { pageId, localeId, nodesCount: nodes.length });
    await callMcpTool<{ success: boolean }>('update_page_content', { pageId, localeId, nodes });
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
		console.log(`Fetched ${pageContent.nodes?.length || 0} nodes from page`);

		if (!pageContent.nodes || pageContent.nodes.length === 0) {
			return NextResponse.json(
				{ error: 'No content found on page' },
				{ status: 404 }
			);
		}

		// Filter text nodes only
		const textNodes = pageContent.nodes.filter(node => node.text && node.text.trim());
		console.log(`Found ${textNodes.length} text nodes to translate`);

		const completedLocales: string[] = [];

		// Step 2 & 3: Translate and update for each secondary locale
		for (const locale of locales.secondary) {
			console.log(`Translating to ${locale.displayName} (${locale.tag})...`);

			const translatedNodes = await Promise.all(
				textNodes.map(async (node) => {
					if (!node.text) return null;
					
					const translatedText = await translateText(node.text, {
						targetLanguage: locale.displayName,
						sourceLanguage: 'English',
					});
					
					return {
						nodeId: node.nodeId,
						text: translatedText,
					};
				})
			);

			// Filter out null values
			const validNodes = translatedNodes.filter((node): node is { nodeId: string; text: string } => node !== null);

			if (validNodes.length > 0) {
				console.log(`Updating ${validNodes.length} nodes for ${locale.displayName}...`);
				await updatePageContent(pageId, locale.id, validNodes);
				completedLocales.push(locale.displayName);
			}
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

