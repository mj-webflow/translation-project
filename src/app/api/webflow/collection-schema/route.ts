import { NextRequest, NextResponse } from 'next/server';

const WEBFLOW_API_TOKEN = process.env.WEBFLOW_API_TOKEN;

/**
 * GET /api/webflow/collection-schema
 * 
 * Gets the field schema for a specific CMS collection.
 * This helps identify which fields are translatable (text, rich-text, plain-text).
 * 
 * Query params:
 *   - collectionId: Webflow collection ID (required)
 * 
 * Headers:
 *   - x-webflow-token: Override token (optional)
 */
export async function GET(request: NextRequest) {
    try {
        const overrideToken = request.headers.get('x-webflow-token') || '';
        const { searchParams } = new URL(request.url);
        const collectionId = searchParams.get('collectionId');
        
        const token = overrideToken || WEBFLOW_API_TOKEN;
        if (!token) {
            return NextResponse.json(
                { error: 'Webflow API token not configured. Provide x-webflow-token header or set WEBFLOW_API_TOKEN.' },
                { status: 500 }
            );
        }
        if (!collectionId) {
            return NextResponse.json(
                { error: 'Missing collectionId parameter.' },
                { status: 400 }
            );
        }

        console.log('[api/webflow/collection-schema] Fetching schema for collection:', collectionId);

        const response = await fetch(`https://api.webflow.com/v2/collections/${collectionId}`, {
            headers: {
                Authorization: `Bearer ${token}`,
                'accept-version': '1.0.0',
            },
            cache: 'no-store',
        });

        if (!response.ok) {
            const errorText = await response.text();
            console.error('[api/webflow/collection-schema] Webflow API Error:', { status: response.status, errorText });
            return NextResponse.json(
                { error: 'Failed to fetch collection schema from Webflow', details: errorText },
                { status: response.status }
            );
        }

        const data = await response.json();
        
        // Extract fields and categorize them
        const fields = data.fields || [];
        
        // Translatable field types in Webflow CMS
        const translatableTypes = ['PlainText', 'RichText', 'Link'];
        
        // Field slugs that should NEVER be translated (system/identifier fields)
        const nonTranslatableSlugs = ['slug', '_archived', '_draft'];
        
        const translatableFields = fields.filter((field: any) => 
            translatableTypes.includes(field.type) &&
            !nonTranslatableSlugs.includes(field.slug) &&
            !field.slug.endsWith('-slug') &&
            !field.slug.endsWith('-id')
        );
        
        const nonTranslatableFields = fields.filter((field: any) => 
            !translatableTypes.includes(field.type) ||
            nonTranslatableSlugs.includes(field.slug) ||
            field.slug.endsWith('-slug') ||
            field.slug.endsWith('-id')
        );

        console.log(`[api/webflow/collection-schema] ✓ Found ${fields.length} fields (${translatableFields.length} translatable)`);

        return NextResponse.json({
            collectionId: data.id,
            displayName: data.displayName,
            singularName: data.singularName,
            slug: data.slug,
            fields: {
                all: fields,
                translatable: translatableFields,
                nonTranslatable: nonTranslatableFields,
            },
            fieldTypes: {
                translatable: translatableTypes,
            },
        });
    } catch (error) {
        console.error('[api/webflow/collection-schema] Error:', error);
        return NextResponse.json(
            { error: 'Internal server error', details: error instanceof Error ? error.message : 'Unknown error' },
            { status: 500 }
        );
    }
}

