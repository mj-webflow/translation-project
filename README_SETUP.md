# Webflow Pages Setup Guide

This Next.js application displays and manages Webflow pages with localization support.

## Setup Instructions

### 1. Environment Variables

Create a `.env.local` file in the root of your project with the following content:

```env
WEBFLOW_API_TOKEN=your_webflow_api_token_here
WEBFLOW_SITE_ID=68c83fa8b4d1c57c202101a3
OPENAI_API_KEY=your_openai_api_key_here
```

Notes:
- `WEBFLOW_API_TOKEN` is used by the MCP server to authenticate with Webflow.
- `WEBFLOW_SITE_ID` is used by the classic REST API endpoints.
- `OPENAI_API_KEY` enables AI-powered translation; without it, the app falls back to mock translations for testing.

**To get your Webflow API Token:**
1. Go to [Webflow Developers](https://developers.webflow.com/)
2. Navigate to your workspace settings
3. Generate a new API token with appropriate permissions
4. Copy the token and paste it in your `.env.local` file

**To get your OpenAI API Key:**
1. Go to [OpenAI Platform](https://platform.openai.com/)
2. Sign up or log in to your account
3. Navigate to API Keys
4. Create a new secret key
5. Copy the key and paste it in your `.env.local` file

**Note:** If the OpenAI API key is not provided, the system will fall back to mock translations for testing.

### 2. Install Dependencies

```bash
npm install
```

### 3. Run the Development Server

```bash
npm run dev
```

### 4. MCP Server Integration (Webflow)

This project uses a local MCP server (`mcp-server.mjs`) to proxy Webflow Designer MCP tools. You do not need to run it manually. It is started on-demand by the app via `src/lib/mcpClient.ts` using stdio.

What happens under the hood:
- The app launches `mcp-server.mjs` (local MCP server) as a child process.
- The local server bridges to Webflow's MCP endpoint via `npx mcp-remote https://mcp.webflow.com/sse`.
- Tools exposed locally include:
  - `get_page_content` → forwards to Webflow MCP `pages_get_content` with `{ page_id }`
  - `update_page_content` → forwards to Webflow MCP `pages_update_static_content` with `{ page_id, localeId, nodes }`

Requirements:
- Internet access (the bridge connects to Webflow over SSE).
- Valid `WEBFLOW_API_TOKEN` in your environment.

### 4. View Your Pages

Open your browser and navigate to:
- Homepage: [http://localhost:3000](http://localhost:3000)
- Webflow Pages List: [http://localhost:3000/pages](http://localhost:3000/pages)

## Features

### Pages List (`/pages`)

The pages list displays all your Webflow pages with:

- **Search**: Filter pages by title, slug, or path
- **Filters**: View all pages, only published pages, or only drafts
- **Statistics**: Total pages, published count, and draft count
- **Page Details**: 
  - Title and SEO description
  - Published path
  - Status badges (Draft, Published, Branch, Template)
  - Page ID and slug
  - Last updated date
- **Translation Workflow**:
  - One-click translation button for each page
  - Automatic translation to all configured locales (French, Spanish, Arabic)
  - Real-time progress tracking
  - AI-powered translations using OpenAI (GPT)
  - Success/error indicators
  - Automatic page content updates in Webflow

### MCP-backed Content Management

- Fetch static content nodes for a Webflow page via MCP
- Update localized static content for a page via MCP

### Locales

- Fetch Webflow locales for the current site to drive translation workflows

### API Routes

- `/api/webflow/pages` (GET): Fetch pages from Webflow REST API
- `/api/webflow/locales` (GET): Fetch locales via Webflow API
- `/api/webflow/page-content` (GET): Fetch static content nodes via MCP
  - Query params: `pageId` (string)
- `/api/webflow/update-page` (POST): Update static content via MCP
  - Body: `{ pageId: string, localeId: string, nodes: Array<{ nodeId: string; text: string }> }`
- `/api/webflow/translate-page` (POST): Translate a page to configured locales (AI or mock)
  - Body: `{ pageId: string }`
- `/api/translate` (POST): Internal translation utility (used by the workflow)

## File Structure

```
src/
├── app/
│   ├── api/
│   │   └── webflow/
│   │       ├── pages/
│   │       │   └── route.ts              # Fetch pages (REST)
│   │       ├── locales/
│   │       │   └── route.ts              # Fetch locales
│   │       ├── page-content/
│   │       │   └── route.ts              # Fetch page content (MCP)
│   │       ├── update-page/
│   │       │   └── route.ts              # Update page content (MCP)
│   │       └── translate-page/
│   │           └── route.ts              # Translate and update content per locale
│   ├── api/
│   │   └── translate/
│   │       └── route.ts                  # Translate utility API
│   ├── pages/
│   │   └── page.tsx              # Pages list UI
│   └── page.tsx                  # Homepage
├── lib/
│   └── mcpClient.ts              # Launches local MCP server and calls tools
├── types/
│   └── webflow.ts                # TypeScript types
├── mcp-server.mjs                # Local MCP server (Webflow bridge)
```

## Next Steps

You can extend this application to:
- Add page editing capabilities
- Implement translation workflows
- Manage multiple locales
- Bulk update page content
- Track translation progress

## Troubleshooting

### "Webflow API token not configured" error
- Make sure you created the `.env.local` file
- Verify the token is correct and has proper permissions
- Restart the development server after adding environment variables

### Pages not loading
- Check your Webflow site ID is correct
- Ensure your API token has read permissions for pages
- Check the browser console and terminal for error messages

### MCP server / bridge issues
- Ensure `WEBFLOW_API_TOKEN` is set in `.env.local`
- Confirm you have internet access (the bridge uses SSE)
- Check terminal logs for `[mcp-server]` messages; errors there indicate MCP tool failures
- If needed, you can test-run the MCP server manually:

```bash
node mcp-server.mjs
```

Then hit an API that uses it (in a separate terminal) to verify connectivity:

```bash
curl "http://localhost:3000/api/webflow/page-content?pageId=<YOUR_PAGE_ID>"
```

