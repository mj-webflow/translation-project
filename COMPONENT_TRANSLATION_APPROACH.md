# Component Translation Approach (Option 3)

## Problem
Large components at the bottom of pages cause timeouts because:
1. All previous content has already been processed
2. The Cloudflare Worker is close to its execution time limit
3. Even with progress updates, the total time exceeds limits

## Solution
Separate page content translation from component translation into multiple API calls.

## New API Endpoints

### 1. `/api/webflow/page-components` (GET)
- **Purpose**: Get list of all components on a page
- **Parameters**: `pageId`, `branchId` (optional)
- **Returns**: Array of component IDs

### 2. `/api/webflow/translate-component` (POST)
- **Purpose**: Translate a single component
- **Parameters**: `componentId`, `targetLocaleId`
- **Returns**: Streaming progress updates

### 3. `/api/webflow/translate-page` (Modified)
- **Purpose**: Translate page text nodes only (skip components)
- **New Parameters**: 
  - `translatePageContent` (default: true)
  - `translateComponents` (default: false - changed!)
  - `specificComponentIds` (array)

## Client-Side Flow

```
For each locale:
  1. Call /api/webflow/translate-page 
     - translatePageContent: true
     - translateComponents: false
     
  2. Call /api/webflow/page-components
     - Get list of component IDs
     
  3. For each component:
     - Call /api/webflow/translate-component
     - Show progress: "Translating component 1/5..."
```

## Benefits
1. **No timeouts**: Each API call is shorter
2. **Better progress**: User sees exactly which component is being translated
3. **Retry individual components**: If one component fails, others still succeed
4. **Parallel processing**: Could translate multiple components at once (future)

## Implementation Status
- ✅ Created `/api/webflow/translate-component` endpoint
- ✅ Created `/api/webflow/page-components` endpoint
- ✅ Modified `/api/webflow/translate-page` to accept `translateComponents` parameter (default: true)
- ✅ Updated client-side to orchestrate multiple API calls (page content + individual components)
- ✅ Updated UI to show component-level progress ("Translating component 1/5...")

## Testing
To test the new implementation:

1. **Start the dev server**: `npm run dev`
2. **Navigate to the Pages screen** and select a page with multiple components
3. **Select target locales** and click "Translate"
4. **Watch the progress messages**:
   - "Translating page text..." (page content only)
   - "Translating component 1/5..." (each component separately)
   - "Translating component 2/5..."
   - etc.

## Expected Behavior
- **No more timeouts**: Each API call is short (typically 10-30 seconds)
- **Better visibility**: User sees exactly which component is being translated
- **Graceful failures**: If one component fails, others still succeed
- **Faster overall**: Smaller requests = less likely to hit rate limits or timeouts

