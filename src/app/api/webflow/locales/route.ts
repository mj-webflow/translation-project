import { NextRequest, NextResponse } from 'next/server';

const WEBFLOW_API_TOKEN = process.env.WEBFLOW_API_TOKEN;
const DEFAULT_WEBFLOW_SITE_ID = process.env.WEBFLOW_SITE_ID || '';

export async function GET(request: NextRequest) {
	try {
		const overrideToken = request.headers.get('x-webflow-token') || '';
		const { searchParams } = new URL(request.url);
		const siteId = searchParams.get('siteId') || DEFAULT_WEBFLOW_SITE_ID;
		const token = overrideToken || WEBFLOW_API_TOKEN;
		if (!token) {
			return NextResponse.json({ error: 'Webflow API token not configured. Provide x-webflow-token header or set WEBFLOW_API_TOKEN.' }, { status: 500 });
		}
		if (!siteId) {
			return NextResponse.json({ error: 'Missing siteId. Provide ?siteId=... or set WEBFLOW_SITE_ID.' }, { status: 400 });
		}

		const resp = await fetch(`https://api.webflow.com/v2/sites/${siteId}`, {
			headers: {
				Authorization: `Bearer ${token}`,
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
