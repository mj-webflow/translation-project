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

### API Route

The application includes an API route at `/api/webflow/pages` that:
- Fetches pages from the Webflow API
- Handles authentication automatically
- Provides error handling and logging

## File Structure

```
src/
├── app/
│   ├── api/
│   │   └── webflow/
│   │       └── pages/
│   │           └── route.ts      # API route to fetch pages
│   ├── pages/
│   │   └── page.tsx              # Pages list UI
│   └── page.tsx                  # Homepage
├── types/
│   └── webflow.ts                # TypeScript types
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

