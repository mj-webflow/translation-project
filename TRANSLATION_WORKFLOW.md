# Translation Workflow Documentation

## Overview

This Next.js application provides a localization workflow for Webflow pages, allowing you to copy page content from the primary locale to multiple secondary locales (e.g., French, Spanish, Arabic) with a single click using the Webflow Localization APIs.

## How It Works

### 1. **User Interface** (`/pages`)
- Displays all Webflow pages in a searchable, filterable list
- Each page has a "Translate" button
- Real-time progress tracking during translation
- Visual feedback for success/errors

### 2. **Translation Process**

When you click the "Translate" button:

#### Step 1: Fetch Page Content (Primary Locale)
- Retrieves the current page static content from Webflow (primary locale)
- Extracts all text nodes that need localization
- Uses Webflow API: `GET /v2/pages/{pageId}/content`

#### Step 2: Prepare Localized Content
- Uses the primary locale text as the source for all secondary locales
- You may enhance this step later to integrate your own translation source or workflow

#### Step 3: Update Localized Content
- Updates each secondary locale with the prepared content
- Uses Webflow API: `PUT /v2/pages/{pageId}/static_content`
- Updates all locales sequentially

#### Step 4: Completion
- Shows success message with number of locales updated
- Refreshes the pages list
- Translation state persists until page refresh

## Architecture

### Files Structure

```
src/
├── app/
│   ├── pages/
│   │   └── page.tsx                    # Main UI with translation controls
│   └── api/
│       └── webflow/
│           ├── pages/
│           │   └── route.ts            # Fetch all pages
│           └── translate-page/
│               └── route.ts            # Localization workflow handler
├── lib/
│   └── translation.ts                  # AI translation service
└── types/
    └── webflow.ts                      # TypeScript types
```

### API Routes

#### `GET /api/webflow/pages`
Fetches all pages from the Webflow site.

**Response:**
```json
{
  "pages": [...],
  "pagination": {
    "limit": 100,
    "offset": 0,
    "total": 33
  }
}
```

#### `POST /api/webflow/translate-page`
Translates a page to all configured locales.

**Request:**
```json
{
  "pageId": "68ffc9c4c24cf1ffafdc728a"
}
```

**Response:**
```json
{
  "success": true,
  "pageId": "68ffc9c4c24cf1ffafdc728a",
  "completedLocales": ["French (France)", "Spanish", "Arabic (Standard)"],
  "nodesTranslated": 15
}
```

## Configuration

### Supported Locales

The system is configured with these locales (from Webflow site):

| Locale | Display Name | Tag | Locale ID | CMS Locale ID | Subdirectory |
|--------|--------------|-----|-----------|---------------|--------------|
| Primary | English | en | `68c83faab4d1c57c20210252` | `68c83faab4d1c57c20210247` | `/` |
| Secondary | French (France) | fr-FR | `68c83faab4d1c57c20210254` | `68c83faab4d1c57c20210248` | `/fr-fr` |
| Secondary | Spanish | es | `68c83faab4d1c57c20210256` | `68c83faab4d1c57c20210249` | `/es` |
| Secondary | Arabic (Standard) | ar | `68c83faab4d1c57c20210258` | `68c83faab4d1c57c2021024a` | `/ar` |

### Environment Variables

Required environment variables in `.env.local`:

```env
# Webflow API (Required)
WEBFLOW_API_TOKEN=your_webflow_api_token
WEBFLOW_SITE_ID=68c83fa8b4d1c57c202101a3
```

## Content Preparation

The system currently copies primary locale content as-is to each secondary locale.

Guidelines for preparing content:
1. Preserve HTML tags and structure
2. Maintain formatting, line breaks, and spacing
3. Keep proper nouns and brand names as-is
4. Handle right-to-left languages (Arabic) properly
5. Preserve placeholder variables unchanged

### Notes
- There is no external AI dependency. All updates occur via Webflow Localization APIs.

## Usage Examples

### Basic Translation
1. Navigate to `/pages`
2. Find the page you want to translate
3. Click the "Translate" button
4. Wait for the progress indicator
5. See success message when complete

### Viewing Translated Pages
After translation, pages are available at:
- English (Primary): `https://wfc-demo.webflow.io/page-slug`
- French: `https://wfc-demo.webflow.io/fr-fr/page-slug`
- Spanish: `https://wfc-demo.webflow.io/es/page-slug`
- Arabic: `https://wfc-demo.webflow.io/ar/page-slug`

## Limitations

1. **Static Content Only**: Currently translates static page content (text nodes)
2. **Sequential Processing**: Translates one locale at a time for reliability
3. **No Bulk Translation**: Must translate pages individually
4. **Draft Pages**: Can translate but won't be visible until published
5. **Template Pages**: May require special handling for dynamic content

## Error Handling

The system handles various error scenarios:
- Missing API credentials
- Webflow API failures
- Translation service errors
- Network timeouts
- Invalid page IDs

Errors are displayed in the UI with descriptive messages.

## Future Enhancements

Potential improvements:
1. Bulk translation (translate multiple pages at once)
2. Translation preview before applying
3. Manual translation editing
4. Translation memory/cache
5. Cost tracking for API usage
6. Support for collection items
7. Support for component translations
8. Rollback capability

## Performance Considerations

- **API Calls**: Each page requires 1 fetch + N update calls (N = number of locales)
- **Update Speed**: Depends on number of nodes and locales
- **Rate Limits**: Respects Webflow Data API rate limits
- **Cost**: No external AI costs

## Support

For issues or questions:
1. Check console logs for detailed error messages
2. Verify API credentials are correct
3. Ensure Webflow site has locales configured
4. Test with a simple page first

## License

This localization workflow is part of the translation-project and uses:
- Webflow API v2
- Next.js 16
- React 19

