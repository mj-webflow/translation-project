# Webflow Translation Project - Setup Guide

Complete setup instructions for getting the translation application running in development and production environments.

## Table of Contents

1. [Prerequisites](#prerequisites)
2. [Installation](#installation)
3. [Configuration](#configuration)
4. [Development](#development)
5. [Features Overview](#features-overview)
6. [Troubleshooting](#troubleshooting)

## Prerequisites

### Required Software

- **Node.js**: Version 18.0.0 or higher
- **npm**: Version 9.0.0 or higher (comes with Node.js)
- **Git**: For version control

### Required Accounts & API Keys

1. **Webflow Account**
   - Active Webflow site with localization enabled
   - Access to Webflow workspace settings
   - Site must have at least one secondary locale configured

2. **Webflow API Token** (Can be entered via UI)
   - Required scopes:
     - `pages:read` - Read page content
     - `pages:write` - Update page content
     - `components:read` - Read component data
     - `components:write` - Update component properties
     - `sites:read` - Read site information
   - Can be entered via homepage form (stored in browser localStorage)
   - Environment variable is optional fallback

3. **OpenAI API Key** (Required in environment)
   - Active OpenAI account
   - API access enabled
   - Sufficient credits for translation
   - Must be set in `.env.local` file

## Installation

### Step 1: Clone or Download

```bash
# If using Git
git clone <repository-url>
cd translation-project

# Or download and extract the ZIP file
```

### Step 2: Install Dependencies

```bash
npm install
```

This installs:
- Next.js 16
- React 19
- Tailwind CSS 4
- TypeScript
- Other required dependencies

### Step 3: Create Environment File

Create a `.env.local` file in the project root:

```bash
touch .env.local
```

Add the following content:

```env
# OpenAI API Configuration (Required)
OPENAI_API_KEY=your_openai_api_key_here

# Webflow API Configuration (Optional - can use UI form instead)
# WEBFLOW_API_TOKEN=your_webflow_api_token_here
# WEBFLOW_SITE_ID=your_webflow_site_id_here
```

**Important Notes**:
- **OpenAI API Key**: Required in `.env.local` for security reasons
- **Webflow Credentials**: Can be entered via the homepage form instead of environment variables
  - Form values are stored in browser localStorage
  - Environment variables serve as optional fallbacks
  - Useful for development/testing without re-entering credentials

## Configuration

### Getting Your Webflow API Token

1. Navigate to [Webflow Developers](https://developers.webflow.com/)
2. Click on your workspace
3. Go to **Settings** → **API Access**
4. Click **Generate API Token**
5. Name your token (e.g., "Translation App")
6. Select required scopes:
   - ✅ `pages:read`
   - ✅ `pages:write`
   - ✅ `components:read`
   - ✅ `components:write`
   - ✅ `sites:read`
7. Click **Generate Token**
8. Copy the token immediately (you won't see it again)
9. **Enter via homepage form** (recommended)
   - Navigate to `http://localhost:3000`
   - Paste token in the form
   - Stored in browser localStorage
10. **OR** paste into `.env.local` as `WEBFLOW_API_TOKEN` (optional fallback)

### Getting Your Webflow Site ID

**Method 1: From Webflow Designer**
1. Open your site in Webflow Designer
2. Go to **Site Settings** → **General**
3. Find the Site ID in the URL or settings
4. **Enter via homepage form** (recommended)
   - Navigate to `http://localhost:3000`
   - Paste Site ID in the form
   - Stored in browser localStorage
5. **OR** paste into `.env.local` as `WEBFLOW_SITE_ID` (optional fallback)

**Method 2: From API**
1. Use the Webflow API to list your sites
2. Find your site in the response
3. Copy the `id` field
4. Enter via homepage form or `.env.local`

### Getting Your OpenAI API Key (Required)

1. Go to [OpenAI Platform](https://platform.openai.com/)
2. Sign in or create an account
3. Navigate to **API Keys** in the left sidebar
4. Click **Create new secret key**
5. Name your key (e.g., "Webflow Translation")
6. Copy the key immediately
7. **Must** paste into `.env.local` as `OPENAI_API_KEY`

**Important Notes**:
- OpenAI key **must** be in `.env.local` for security
- Cannot be entered via UI form
- Ensure you have sufficient credits in your OpenAI account
- Keep this key secure and never commit to version control

### Verifying Configuration

**Minimum Required** - Your `.env.local` file should contain at least:

```env
OPENAI_API_KEY=sk-proj-abc123def456...
```

**Optional Fallbacks** - You can also add Webflow credentials:

```env
OPENAI_API_KEY=sk-proj-abc123def456...
WEBFLOW_API_TOKEN=wfp_abc123def456...
WEBFLOW_SITE_ID=68c83fa8b4d1c57c202101a3
```

**Recommended Setup**:
- ✅ OpenAI key in `.env.local`
- ✅ Webflow credentials entered via homepage form
- ✅ Environment variables as fallback (optional)

## Development

### Starting the Development Server

```bash
npm run dev
```

The application will start on [http://localhost:3000](http://localhost:3000)

### Available Routes

- **Homepage**: `http://localhost:3000`
  - Configuration form for Webflow credentials
  - Enter API token and Site ID
  - Credentials stored in browser localStorage
  - Navigation to pages list

- **Pages List**: `http://localhost:3000/pages`
  - View all Webflow pages
  - Select locales and translate pages
  - Monitor translation progress
  - Requires Webflow credentials (from form or environment)

### Development Commands

```bash
# Start development server
npm run dev

# Build for production
npm run build

# Start production server
npm start

# Run linter
npm run lint
```

## Features Overview

### Pages List (`/pages`)

The main interface for managing translations:

#### Locale Selection Panel
- Displays all secondary locales from your Webflow site
- Checkboxes to select target locales
- Must select at least one locale before translating
- Selection persists during session

#### Page Cards
Each page displays:
- **Title**: Page name from Webflow
- **Status Badges**:
  - 🟢 Published / 🟠 Draft
  - 🔵 Branch (if applicable)
  - 🟣 Template (if collection template)
- **Published Path**: Link to live page
- **SEO Description**: Meta description if available
- **Metadata**: Page ID, slug, last updated date
- **Translate Button**: Initiates translation process

#### Search & Filter
- **Search Bar**: Filter by title, slug, or path
- **Filter Buttons**:
  - All Pages
  - Published Only
  - Drafts Only
- **Statistics**: Total, published, and draft counts

#### Translation Progress
Real-time status updates showing:
- Current step (fetching, translating, updating)
- Target locales being processed
- Number of nodes translated
- Success/error messages

### Translation Process

When you click "Translate":

1. **Preparation** (1-2 seconds)
   - Fetches page content from Webflow
   - Identifies translatable text nodes
   - Discovers all components (including nested)

2. **Translation** (2-5 seconds per locale)
   - Translates text while preserving HTML
   - Processes 3 locales simultaneously
   - Shows progress for each locale

3. **Update** (1-2 seconds per locale)
   - Updates page text nodes
   - Updates component properties
   - Updates component DOM content

4. **Completion**
   - Shows success message
   - Displays translation statistics
   - Refreshes page list

### What Gets Translated

✅ **Page Content**
- Text nodes in page DOM
- Headings, paragraphs, links
- Button text, labels

✅ **Components**
- Component property overrides (page-level)
- Component default properties (definition-level)
- Component DOM text nodes (hardcoded text)
- Nested components at any depth

✅ **HTML Preservation**
- Nested `<span>`, `<strong>`, `<em>` tags
- CSS classes and IDs
- Inline styles
- Data attributes (e.g., `data-w-id`)
- GSAP animation wrappers

❌ **Not Translated**
- Images and media
- CMS collection items
- Form field values
- Custom code blocks
- External scripts

## Troubleshooting

### Environment Variables

**Problem**: "Webflow API token not configured"

**Solutions**:
1. **Primary**: Enter credentials via homepage form at `http://localhost:3000`
2. **Alternative**: Add to `.env.local` as fallback
3. Check browser localStorage has values (F12 → Application → Local Storage)
4. Restart development server if using `.env.local`: `Ctrl+C` then `npm run dev`

**Problem**: "Missing siteId"

**Solutions**:
1. **Primary**: Enter Site ID via homepage form
2. **Alternative**: Add `WEBFLOW_SITE_ID` to `.env.local`
3. Verify Site ID format (should be alphanumeric)
4. Check browser localStorage

**Problem**: "OpenAI API error"

**Solutions**:
1. Verify `OPENAI_API_KEY` is set in `.env.local` (required)
2. Check API key format starts with `sk-`
3. Ensure sufficient credits in OpenAI account
4. Restart development server after adding key

### API Issues

**Problem**: "Failed to fetch pages"

**Solutions**:
1. Verify API token has `pages:read` scope
2. Check Site ID is correct
3. Ensure site exists and is accessible
4. Check Webflow API status

**Problem**: "Failed to update page content"

**Solutions**:
1. Verify API token has `pages:write` scope
2. Check if page is locked or being edited
3. Ensure locale IDs are valid
4. Try with a different page

### Translation Issues

**Problem**: "No target locales selected"

**Solutions**:
1. Select at least one locale checkbox at the top
2. Ensure site has secondary locales configured
3. Refresh page if locales don't appear

**Problem**: Translation gets stuck

**Solutions**:
1. Check browser console for errors (F12)
2. Verify OpenAI API key is valid
3. Check OpenAI account has credits
4. Try translating fewer locales at once
5. Refresh page and try again

**Problem**: Components not translating

**Solutions**:
1. Check console logs for component processing
2. Verify component has properties or text nodes
3. Ensure component is not using CMS content
4. Check if component is properly nested

### Performance Issues

**Problem**: Translation is slow

**Expected Behavior**:
- 2-5 seconds per locale is normal
- Larger pages take longer
- Multiple locales process in batches

**Optimization**:
- Translate fewer locales at once
- Break large pages into smaller ones
- Check internet connection speed

### Display Issues

**Problem**: Pages not loading

**Solutions**:
1. Check browser console for errors
2. Verify API credentials are correct
3. Clear browser cache
4. Try different browser

**Problem**: Checkboxes not working

**Solutions**:
1. Ensure JavaScript is enabled
2. Check for browser extensions blocking scripts
3. Try incognito/private mode

## Advanced Configuration

### Custom Locale Storage

The app stores selected locales in browser state. To persist selections:

1. Modify `src/app/pages/page.tsx`
2. Add localStorage for selected locale IDs
3. Restore on component mount

### Batch Size Adjustment

To change how many locales process simultaneously:

1. Open `src/app/api/webflow/translate-page/route.ts`
2. Find `const BATCH_SIZE = 3;`
3. Change to desired number (1-5 recommended)
4. Restart server

### Translation Model

To use a different OpenAI model:

1. Open `src/lib/translation.ts`
2. Find `model: 'gpt-4o-mini'`
3. Change to `'gpt-4'` or `'gpt-3.5-turbo'`
4. Note: Different models have different costs

## Next Steps

After successful setup:

1. **Test Translation**
   - Start with a simple page
   - Select one locale
   - Verify translation quality

2. **Explore Features**
   - Try multiple locales
   - Test component translation
   - Check HTML preservation

3. **Production Deployment**
   - See main README.md for deployment options
   - Add environment variables to hosting platform
   - Test thoroughly before going live

## Support Resources

- **Webflow API Docs**: https://developers.webflow.com/
- **OpenAI API Docs**: https://platform.openai.com/docs
- **Next.js Docs**: https://nextjs.org/docs
- **Project Documentation**: See `TRANSLATION_WORKFLOW.md`

## Security Best Practices

1. **Never commit `.env.local`** to version control
2. **Rotate API keys** regularly
3. **Use environment-specific** keys for dev/prod
4. **Monitor API usage** to detect anomalies
5. **Restrict API token scopes** to minimum required

---

**Setup complete!** You're ready to start translating Webflow pages.
