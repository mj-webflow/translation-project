# Translation Workflow Documentation

Comprehensive guide to how the translation system works, including architecture, API flows, and technical implementation details.

## Table of Contents

1. [Overview](#overview)
2. [Architecture](#architecture)
3. [Translation Process](#translation-process)
4. [Component Handling](#component-handling)
5. [API Reference](#api-reference)
6. [Technical Details](#technical-details)
7. [Performance & Optimization](#performance--optimization)
8. [Error Handling](#error-handling)

## Overview

This application provides automated AI-powered translation of Webflow pages with comprehensive support for:
- Page text nodes
- Component properties
- Nested components
- HTML preservation
- Batch processing
- Real-time progress tracking

### Key Features

- **AI Translation**: Uses OpenAI GPT-4o-mini for high-quality translations
- **Selective Locales**: Choose which secondary locales to translate
- **Batch Processing**: Processes 3 locales simultaneously to avoid rate limits
- **HTML Preservation**: Maintains all tags, classes, IDs, and attributes
- **Component Support**: Handles properties, DOM content, and nested structures
- **Progress Tracking**: Real-time status updates in the UI

## Architecture

### System Components

```
┌─────────────────────────────────────────────────────────────┐
│                         Browser UI                          │
│  ┌─────────────────────────────────────────────────────┐   │
│  │  Pages List (/pages)                                │   │
│  │  - Locale selection checkboxes                      │   │
│  │  - Page cards with translate buttons                │   │
│  │  - Real-time progress display                       │   │
│  └─────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────┘
                            ↓ HTTP POST
┌─────────────────────────────────────────────────────────────┐
│                    Next.js API Routes                       │
│  ┌─────────────────────────────────────────────────────┐   │
│  │  /api/webflow/translate-page                        │   │
│  │  - Orchestrates translation workflow                │   │
│  │  - Fetches page content from Webflow               │   │
│  │  - Calls translation service                        │   │
│  │  - Updates Webflow content                          │   │
│  └─────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────┘
          ↓ Webflow API              ↓ OpenAI API
┌──────────────────────┐    ┌──────────────────────┐
│   Webflow Data API   │    │   OpenAI GPT-4       │
│   - Pages DOM        │    │   - Text translation │
│   - Components       │    │   - HTML preservation│
│   - Properties       │    │   - Batch processing │
└──────────────────────┘    └──────────────────────┘
```

### File Structure

```
src/
├── app/
│   ├── api/webflow/
│   │   ├── locales/route.ts           # GET site locales
│   │   ├── pages/route.ts             # GET all pages
│   │   └── translate-page/route.ts    # POST translate page
│   ├── pages/page.tsx                 # Main UI component
│   ├── layout.tsx                     # Root layout
│   └── page.tsx                       # Homepage
├── lib/
│   └── translation.ts                 # OpenAI translation service
└── types/
    └── webflow.ts                     # TypeScript types
```

## Translation Process

### Step-by-Step Flow

#### 1. User Initiates Translation

**User Action**: Selects locales and clicks "Translate" button

**Frontend** (`src/app/pages/page.tsx`):
```typescript
// Selected locale IDs from checkboxes
const selectedLocaleIds = ['locale-id-1', 'locale-id-2', 'locale-id-3'];

// POST request to API
fetch('/api/webflow/translate-page', {
  method: 'POST',
  body: JSON.stringify({ 
    pageId: 'page-id',
    targetLocaleIds: selectedLocaleIds 
  })
});
```

#### 2. Fetch Locales

**API** (`src/app/api/webflow/translate-page/route.ts`):
```typescript
// Fetch site locales from Webflow
const locales = await fetchLocales(siteId, token);
// Returns: { primary: {...}, secondary: [{...}, {...}] }

// Filter to only selected locales
const targetLocales = locales.secondary.filter(l => 
  selectedLocaleIds.includes(l.id)
);
```

#### 3. Fetch Page Content

**Webflow API Call**:
```
GET /v2/pages/{pageId}/dom
```

**Response Structure**:
```json
{
  "nodes": [
    {
      "id": "node-123",
      "type": "text",
      "text": { "html": "<h1>Hello</h1>", "text": "Hello" }
    },
    {
      "id": "node-456",
      "type": "component-instance",
      "componentId": "comp-789",
      "propertyOverrides": [
        {
          "propertyId": "prop-abc",
          "text": { "text": "Button Text" }
        }
      ]
    }
  ]
}
```

#### 4. Extract Translatable Content

**Content Types Extracted**:

1. **Page Text Nodes**
   ```typescript
   const textNodes = pageContent.nodes.filter(node =>
     node.type === 'text' && (node.text || node.html)
   );
   ```

2. **Component Property Overrides**
   ```typescript
   const componentNodes = pageContent.nodes.filter(node =>
     node.type === 'component-instance' && 
     node.propertyOverrides?.length > 0
   );
   ```

3. **Component Definitions**
   ```typescript
   // For components without overrides
   const componentIds = pageContent.nodes
     .filter(n => n.type === 'component-instance' && !n.propertyOverrides)
     .map(n => n.componentId);
   ```

4. **Nested Components**
   ```typescript
   // Recursively discover nested components
   async function collectNestedComponentIds(componentId) {
     const content = await fetchComponentContent(componentId);
     const nested = content.nodes
       .filter(n => n.type === 'component-instance')
       .map(n => n.componentId);
     // Recurse for each nested component
     for (const id of nested) {
       await collectNestedComponentIds(id);
     }
   }
   ```

#### 5. Translate Content

**Translation Service** (`src/lib/translation.ts`):

```typescript
// HTML-aware translation
async function translateText(text, options) {
  // Detect HTML
  if (isLikelyHtml(text)) {
    // Split into tokens: tags and text
    const tokens = splitHtmlIntoTokens(text);
    // ["<h1>", "Hello ", "<span>", "World", "</span>", "</h1>"]
    
    // Translate only text tokens
    const translated = await Promise.all(
      tokens.map(token => 
        isHtmlTagToken(token) 
          ? token  // Keep tags as-is
          : translatePlainText(token, options)
      )
    );
    
    // Rejoin: "<h1>Hola <span>Mundo</span></h1>"
    return translated.join('');
  }
  
  // Plain text translation
  return translatePlainText(text, options);
}
```

**OpenAI API Call**:
```typescript
const response = await fetch('https://api.openai.com/v1/chat/completions', {
  method: 'POST',
  headers: {
    'Authorization': `Bearer ${OPENAI_API_KEY}`,
    'Content-Type': 'application/json'
  },
  body: JSON.stringify({
    model: 'gpt-4o-mini',
    temperature: 0.2,
    messages: [
      {
        role: 'system',
        content: `You are a professional translator. Rules:
          1) Output ONLY translated text
          2) Preserve all HTML tags exactly
          3) Maintain formatting and spacing
          4) Keep proper nouns unchanged
          5) Preserve placeholders like {{name}}`
      },
      {
        role: 'user',
        content: `Translate to ${targetLanguage}: ${text}`
      }
    ]
  })
});
```

#### 6. Batch Processing

**Locale Batching**:
```typescript
const BATCH_SIZE = 3;
const localeBatches = [
  [locale1, locale2, locale3],  // Batch 1
  [locale4, locale5, locale6],  // Batch 2
  // ...
];

// Process each batch sequentially
for (const batch of localeBatches) {
  // Process locales in batch simultaneously
  await Promise.all(batch.map(async locale => {
    // Translate and update for this locale
  }));
}
```

**Why Batch?**
- Prevents OpenAI rate limiting
- Avoids Webflow API throttling
- Optimizes translation speed
- Handles large locale sets

#### 7. Update Webflow Content

**Three Update Paths**:

**A. Page Text Nodes**
```
POST /v2/pages/{pageId}/dom?localeId={localeId}
Body: {
  nodes: [
    { nodeId: "node-123", text: "<h1>Hola</h1>" }
  ]
}
```

**B. Component Properties**
```
POST /v2/sites/{siteId}/components/{componentId}/properties?localeId={localeId}
Body: {
  properties: [
    { propertyId: "prop-abc", text: "Texto del botón" }
  ]
}
```

**C. Component DOM**
```
POST /v2/sites/{siteId}/components/{componentId}/dom?localeId={localeId}
Body: {
  nodes: [
    { nodeId: "node-456", text: "<p>Contenido</p>" }
  ]
}
```

#### 8. Return Results

**API Response**:
```json
{
  "success": true,
  "pageId": "page-id",
  "completedLocales": ["Spanish (Mexico)", "French (France)"],
  "nodesTranslated": 45
}
```

**Frontend Updates**:
- Shows success message
- Displays translation statistics
- Refreshes page list

## Component Handling

### Component Translation Strategy

```
┌─────────────────────────────────────────────────────────┐
│              Component on Page                          │
├─────────────────────────────────────────────────────────┤
│  Has Property Overrides?                                │
│    ├─ YES → Translate overrides (page-level)          │
│    └─ NO  → Translate component definition             │
│                                                          │
│  Component Definition Translation:                      │
│    ├─ Has Properties? → Translate via Properties API   │
│    └─ No Properties?  → Translate via DOM API          │
│                                                          │
│  Has Nested Components?                                 │
│    └─ YES → Recursively translate each nested component│
└─────────────────────────────────────────────────────────┘
```

### Example: Header Component

**Scenario**: Header component with nested Nav_links component

```
Header (component-123)
├─ Logo (text node)
├─ Nav_links (component-456) ← Nested component
│  ├─ Home (text node)
│  ├─ About (text node)
│  └─ Contact (text node)
└─ CTA Button (property override)
```

**Translation Flow**:

1. **Detect Header** on page
2. **Translate CTA Button** (property override on page)
3. **Discover Nav_links** (nested component)
4. **Translate Nav_links** text nodes (Home, About, Contact)
5. **Translate Logo** (Header component DOM)

### Component Property vs DOM

**When to use Properties API**:
- Component has editable properties
- Properties exposed in component settings
- Text defined as property values

**When to use DOM API**:
- Component has hardcoded text
- No editable properties
- Text embedded in component structure

## API Reference

### GET /api/webflow/locales

Fetches site locales.

**Query Parameters**:
- `siteId` (optional): Site ID (uses env var if not provided)

**Headers**:
- `x-webflow-token` (optional): Override API token

**Response**:
```json
{
  "primary": {
    "id": "locale-123",
    "tag": "en",
    "displayName": "English"
  },
  "secondary": [
    {
      "id": "locale-456",
      "tag": "es",
      "displayName": "Spanish (Mexico)"
    }
  ]
}
```

### GET /api/webflow/pages

Fetches all pages from site.

**Query Parameters**:
- `siteId` (optional): Site ID

**Headers**:
- `x-webflow-token` (optional): Override API token

**Response**:
```json
{
  "pages": [
    {
      "id": "page-123",
      "title": "Home",
      "slug": "home",
      "publishedPath": "/",
      "draft": false,
      "seo": {
        "title": "Home Page",
        "description": "Welcome"
      }
    }
  ],
  "pagination": {
    "limit": 100,
    "offset": 0,
    "total": 25
  }
}
```

### POST /api/webflow/translate-page

Translates a page to selected locales.

**Query Parameters**:
- `siteId` (optional): Site ID
- `branchId` (optional): Branch ID

**Headers**:
- `x-webflow-token` (optional): Override API token
- `Content-Type`: `application/json`

**Request Body**:
```json
{
  "pageId": "page-123",
  "targetLocaleIds": ["locale-456", "locale-789"]
}
```

**Response**:
```json
{
  "success": true,
  "pageId": "page-123",
  "completedLocales": ["Spanish (Mexico)", "French (France)"],
  "nodesTranslated": 45
}
```

**Error Response**:
```json
{
  "error": "Translation failed",
  "details": "No target locales selected"
}
```

## Technical Details

### HTML Preservation Algorithm

```typescript
// Input: "<h1>Hello <span class="highlight">World</span></h1>"

// Step 1: Split into tokens
const tokens = html.split(/(<[^>]+>)/g);
// ["<h1>", "Hello ", "<span class=\"highlight\">", "World", "</span>", "</h1>"]

// Step 2: Identify token types
tokens.map(token => ({
  value: token,
  isTag: token.startsWith('<') && token.endsWith('>')
}));

// Step 3: Translate text tokens only
const translated = await Promise.all(
  tokens.map(async token => 
    token.isTag ? token : await translate(token)
  )
);
// ["<h1>", "Hola ", "<span class=\"highlight\">", "Mundo", "</span>", "</h1>"]

// Step 4: Rejoin
const result = translated.join('');
// "<h1>Hola <span class=\"highlight\">Mundo</span></h1>"
```

### Nested Component Discovery

```typescript
async function collectNestedComponentIds(
  componentId: string,
  visited: Set<string> = new Set()
): Promise<string[]> {
  // Prevent infinite loops
  if (visited.has(componentId)) return [];
  visited.add(componentId);
  
  // Fetch component DOM
  const content = await fetchComponentContent(componentId);
  
  // Find nested component instances
  const nestedIds: string[] = [];
  for (const node of content.nodes) {
    if (node.type === 'component-instance' && node.componentId) {
      nestedIds.push(node.componentId);
      
      // Recurse into nested component
      const deeperIds = await collectNestedComponentIds(
        node.componentId,
        visited
      );
      nestedIds.push(...deeperIds);
    }
  }
  
  return nestedIds;
}
```

### Error Recovery

**Retry Logic for Webflow API**:
```typescript
async function updatePageContent(pageId, localeId, nodes) {
  const response = await fetch(url, {
    method: 'POST',
    body: JSON.stringify({ nodes })
  });
  
  const result = await response.json();
  
  // Check for errors
  if (result.errors?.length > 0) {
    // Extract expected tags from errors
    const expectedTags = extractExpectedTags(result.errors);
    
    // Wrap content with expected tags
    const retryNodes = nodes.map(node => ({
      ...node,
      text: wrapWithTag(node.text, expectedTags[node.nodeId])
    }));
    
    // Retry with wrapped content
    await fetch(url, {
      method: 'POST',
      body: JSON.stringify({ nodes: retryNodes })
    });
  }
}
```

## Performance & Optimization

### Translation Speed

**Factors Affecting Speed**:
- Number of text nodes: ~0.1s per node
- Number of components: ~0.5s per component
- Number of locales: Linear scaling
- OpenAI API latency: ~1-2s per request
- Webflow API latency: ~0.5s per request

**Typical Times**:
- Small page (10 nodes, 1 locale): ~5 seconds
- Medium page (50 nodes, 3 locales): ~30 seconds
- Large page (100 nodes, 5 locales): ~90 seconds

### Optimization Strategies

1. **Batch Locales**: Process 3 at a time
2. **Parallel Translation**: Translate multiple text segments simultaneously
3. **Minimize API Calls**: Combine updates where possible
4. **Cache Component Discovery**: Reuse nested component lists
5. **Efficient HTML Parsing**: Single-pass tokenization

### Rate Limits

**OpenAI**:
- Tier 1: 500 RPM (requests per minute)
- Tier 2: 5,000 RPM
- Solution: Batch processing prevents hitting limits

**Webflow**:
- 60 requests per minute per token
- Solution: Sequential batch processing

## Error Handling

### Error Types & Solutions

**1. Authentication Errors**
```
Error: "Webflow API token not configured"
Solution: Check .env.local file
```

**2. Validation Errors**
```
Error: "No target locales selected"
Solution: Select at least one locale checkbox
```

**3. API Errors**
```
Error: "Failed to fetch page content"
Solution: Verify page exists and token has permissions
```

**4. Translation Errors**
```
Error: "OpenAI API error"
Solution: Check API key and credits
```

**5. Update Errors**
```
Error: "Expected <h1> element"
Solution: Automatic retry with proper wrapping
```

### Error Recovery Flow

```
┌─────────────────────┐
│  Translation Error  │
└─────────┬───────────┘
          │
          ├─ Authentication? → Show token error
          ├─ Validation? → Show user message
          ├─ API Failure? → Retry with backoff
          ├─ Rate Limit? → Queue and retry
          └─ Unknown? → Log and show generic error
```

## Best Practices

### Content Preparation

1. **Use Semantic HTML**: Proper heading hierarchy
2. **Consistent Structure**: Similar patterns across pages
3. **Clear Text**: Avoid ambiguous phrases
4. **Proper Nouns**: Mark with classes if needed
5. **Test First**: Try with simple page before bulk translation

### Translation Quality

1. **Review Translations**: Spot-check translated content
2. **Context Matters**: Provide good context in source content
3. **Brand Terms**: Keep consistent across locales
4. **Cultural Adaptation**: Consider cultural differences
5. **Proofread**: Have native speakers review

### Performance

1. **Translate in Batches**: Don't translate all pages at once
2. **Off-Peak Hours**: Translate during low-traffic times
3. **Monitor Costs**: Track OpenAI API usage
4. **Cache Results**: Consider saving translations
5. **Incremental Updates**: Only translate changed content

---

**For more information, see README.md and README_SETUP.md**
