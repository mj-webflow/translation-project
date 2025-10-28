import { NextResponse } from 'next/server';

const WEBFLOW_API_TOKEN = process.env.WEBFLOW_API_TOKEN;
const WEBFLOW_SITE_ID = process.env.WEBFLOW_SITE_ID || '68c83fa8b4d1c57c202101a3';

export async function GET() {
  try {
    if (!WEBFLOW_API_TOKEN) {
      return NextResponse.json(
        { error: 'Webflow API token not configured' },
        { status: 500 }
      );
    }

    const response = await fetch(
      `https://api.webflow.com/v2/sites/${WEBFLOW_SITE_ID}/pages`,
      {
        headers: {
          'Authorization': `Bearer ${WEBFLOW_API_TOKEN}`,
          'accept-version': '1.0.0',
        },
        cache: 'no-store', // Disable caching for fresh data
      }
    );

    if (!response.ok) {
      const errorText = await response.text();
      console.error('Webflow API Error:', errorText);
      return NextResponse.json(
        { error: 'Failed to fetch pages from Webflow', details: errorText },
        { status: response.status }
      );
    }

    const data = await response.json();
    return NextResponse.json(data);
  } catch (error) {
    console.error('Error fetching Webflow pages:', error);
    return NextResponse.json(
      { error: 'Internal server error', details: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}

