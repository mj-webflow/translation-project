import { NextResponse } from 'next/server';

const WEBFLOW_API_TOKEN = process.env.WEBFLOW_API_TOKEN;
const WEBFLOW_SITE_ID = process.env.WEBFLOW_SITE_ID || '68c83fa8b4d1c57c202101a3';

export async function GET() {
	try {
		if (!WEBFLOW_API_TOKEN) {
			return NextResponse.json({ error: 'Webflow API token not configured' }, { status: 500 });
		}

		const resp = await fetch(`https://api.webflow.com/v2/sites/${WEBFLOW_SITE_ID}`, {
			headers: {
				Authorization: `Bearer ${WEBFLOW_API_TOKEN}`,
				'accept-version': '1.0.0',
			},
			cache: 'no-store',
		});

		if (!resp.ok) {
			const errorText = await resp.text();
			return NextResponse.json({ error: 'Failed to fetch locales', details: errorText }, { status: resp.status });
		}

		const data = await resp.json();
		const locales = {
			primary: data.locales?.primary || null,
			secondary: data.locales?.secondary || [],
		};

		return NextResponse.json(locales);
	} catch (err) {
		return NextResponse.json(
			{ error: 'Internal server error', details: err instanceof Error ? err.message : 'Unknown error' },
			{ status: 500 }
		);
	}
}
