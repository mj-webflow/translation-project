# Webflow Translation Project

A production-ready Next.js application for automated translation of Webflow pages using AI-powered translation with full support for nested components, HTML preservation, and batch processing.

## Features

- **AI-Powered Translation**: Integrates with OpenAI GPT-4 for high-quality translations
- **Multi-Locale Support**: Translate pages to multiple secondary locales simultaneously
- **Component Translation**: Handles both component properties and DOM text nodes
- **Nested Components**: Recursively translates components within components
- **HTML Preservation**: Maintains all HTML tags, nested spans, and GSAP animations
- **Batch Processing**: Processes locales in batches of 3 to avoid rate limits
- **Real-Time Progress**: Detailed progress tracking with status updates
- **Selective Translation**: Choose which locales to translate via UI checkboxes

## Prerequisites

- Node.js 18+ and npm
- Webflow site with localization enabled
- Webflow API token with appropriate permissions (can be entered via UI)
- OpenAI API key for translation (must be in environment variables)

## Installation

1. **Clone the repository**
   ```bash
   git clone <repository-url>
   cd translation-project
   ```

2. **Install dependencies**
   ```bash
   npm install
   ```

3. **Configure environment variables**
   
   Create a `.env.local` file in the root directory:
   ```env
   # OpenAI API Configuration (Required for translation)
   OPENAI_API_KEY=your_openai_api_key_here
   
   # Webflow API Configuration (Optional - can be set via UI form instead)
   # WEBFLOW_API_TOKEN=your_webflow_api_token_here
   # WEBFLOW_SITE_ID=your_site_id_here
   
   # Base Path for Webflow Cloud (Required for Cloudflare Workers deployment)
   # This should match your mount path in Webflow Cloud (e.g., /app, /admin)
   # Leave empty for local development
   NEXT_PUBLIC_BASE_PATH=
   ```
   
   **Note**: 
   - Webflow credentials can be entered via the homepage form and are stored in browser localStorage. Environment variables are optional fallbacks.
   - `NEXT_PUBLIC_BASE_PATH` is required when deploying to Webflow Cloud with a custom mount path. See [Webflow Cloud documentation](https://developers.webflow.com/webflow-cloud/bring-your-own-app) for details.

4. **Run the development server**
   ```bash
   npm run dev
   ```

5. **Open your browser**
   
   Navigate to [http://localhost:3000](http://localhost:3000)

## Usage

### Translating Pages

1. Navigate to `/pages` to see all Webflow pages
2. Select target locales using the checkboxes at the top
3. Click the "Translate" button on any page
4. Monitor real time progress as the translation proceeds
5. View success message with translation statistics

### Features Available

- **Search & Filter**: Find pages by title, slug, or path
- **Status Badges**: See draft, published, branch, and template indicators
- **Locale Selection**: Choose which secondary locales to translate
- **Progress Tracking**: Real-time updates showing current step and locale
- **Error Handling**: Clear error messages with actionable feedback

## Architecture

### Project Structure

```
translation-project/
├── src/
│   ├── app/
│   │   ├── api/
│   │   │   └── webflow/
│   │   │       ├── locales/
│   │   │       │   └── route.ts          # Fetch site locales
│   │   │       ├── pages/
│   │   │       │   └── route.ts          # Fetch all pages
│   │   │       └── translate-page/
│   │   │           └── route.ts          # Translation orchestration
│   │   ├── pages/
│   │   │   └── page.tsx                  # Pages list UI
│   │   ├── layout.tsx                    # Root layout
│   │   └── page.tsx                      # Homepage
│   ├── lib/
│   │   └── translation.ts                # OpenAI translation service
│   └── types/
│       └── webflow.ts                    # TypeScript type definitions
├── .env.local                            # Environment variables (create this)
├── package.json
├── README.md                             # This file
├── README_SETUP.md                       # Detailed setup guide
└── TRANSLATION_WORKFLOW.md               # Translation workflow documentation
```

### Technology Stack

- **Framework**: Next.js 16 (App Router)
- **UI**: React 19 with Tailwind CSS 4
- **Translation**: OpenAI GPT-4o mini
- **APIs**: Webflow Data API v2
- **Language**: TypeScript

## Configuration

### Webflow API Token

1. Go to [Webflow Developers](https://developers.webflow.com/)
2. Navigate to workspace settings
3. Generate a new API token with these scopes:
   - `pages:read`
   - `pages:write`
   - `components:read`
   - `components:write`
   - `sites:read`
4. Enter the token via the homepage form (stored in browser localStorage)
   - **OR** optionally add to `.env.local` as a fallback

### Webflow Site ID

1. Open your site in Webflow Designer
2. Go to **Site Settings** → **General**
3. Copy the Site ID from the URL or settings
4. Enter via the homepage form (stored in browser localStorage)
   - **OR** optionally add to `.env.local` as a fallback

### OpenAI API Key (Required)

1. Go to [OpenAI Platform](https://platform.openai.com/)
2. Navigate to API keys
3. Create a new secret key
4. **Must** add to `.env.local` file (cannot be entered via UI for security)

## Documentation

- **[Setup Guide](./README_SETUP.md)**: Detailed installation and configuration
- **[Translation Workflow](./TRANSLATION_WORKFLOW.md)**: How translation works under the hood

## Translation Process

1. **Fetch Locales**: Retrieves primary and secondary locales from Webflow
2. **Fetch Page Content**: Gets page DOM including text nodes and components
3. **Extract Translatable Content**: 
   - Page text nodes
   - Component property overrides
   - Component properties (default values)
   - Nested component content
4. **Translate Content**: Uses OpenAI to translate while preserving HTML
5. **Update Webflow**: 
   - Updates page DOM for text nodes
   - Updates component properties via Data API
   - Processes locales in batches of 3
6. **Complete**: Shows success with statistics

## Advanced Features

### HTML Preservation

The translation system preserves:
- Nested HTML tags (e.g., `<span>`, `<strong>`, `<em>`)
- GSAP animation wrappers
- CSS classes and inline styles
- Data attributes (e.g., `data-w-id`)
- Complex nested structures

### Component Handling

Supports multiple component scenarios:
- **With Property Overrides**: Translates page-level overrides
- **Without Overrides**: Translates component definition properties
- **Hardcoded Text**: Falls back to DOM text node translation
- **Nested Components**: Recursively discovers and translates

### Batch Processing

- Processes 3 locales simultaneously
- Prevents API rate limiting
- Optimizes translation speed
- Handles large page sets efficiently

## Troubleshooting

### Common Issues

**"Webflow API token not configured"**
- Verify `.env.local` exists and contains `WEBFLOW_API_TOKEN`
- Restart the dev server after adding environment variables

**"No target locales selected"**
- Select at least one secondary locale checkbox before translating

**Translation gets stuck**
- Check console for errors
- Verify OpenAI API key is valid
- Ensure sufficient API credits

**Components not translating**
- Check if component has properties or DOM text nodes
- Verify component is not using CMS content
- Look for console logs showing component processing

### Debug Mode

Enable detailed logging by checking the browser console and terminal output during translation.

## Deployment

### Vercel (Recommended)

1. Push your code to GitHub
2. Import project in Vercel
3. Add environment variables in Vercel dashboard
4. Deploy

### Other Platforms

The app can be deployed to any platform supporting Next.js:
- Netlify
- AWS Amplify
- Railway
- Render

## Performance

- **Translation Speed**: ~2-5 seconds per locale (depends on content size)
- **Batch Size**: 3 locales processed simultaneously
- **API Calls**: Optimized to minimize Webflow API requests
- **Caching**: No caching (always fetches fresh content)

## Security

- API tokens stored in environment variables
- No client-side exposure of credentials
- Server-side API calls only
- Input validation on all endpoints

## Contributing

This is a production application. For modifications:
1. Test thoroughly in development
2. Verify translation quality
3. Check component handling
4. Test with multiple locales

## License

Private project - All rights reserved

## Support

For issues or questions:
1. Check the documentation files
2. Review console logs for errors
3. Verify API credentials and permissions
4. Test with a simple page first

---

**Built using Next.js, Webflow API, and OpenAI**
