# Component Translation Implementation Summary

## Problem Solved
Large components at the bottom of pages were causing timeouts because:
1. The Cloudflare Worker was processing all page content + all components in a single request
2. By the time it reached large components at the bottom, the execution time limit was exceeded
3. Even with progress updates, the total processing time was too long

## Solution Implemented
**Option 3: Translate Components Separately**

Instead of one monolithic API call, we now break translation into multiple smaller calls:
- **1 call** to get the list of components on the page
- **1 call** to translate page text nodes (skipping components)
- **N calls** to translate each component individually (where N = number of components)

## Files Modified

### 1. `/src/app/api/webflow/translate-page/route.ts`
- Added `translatePageContent` parameter (default: true)
- Added `translateComponents` parameter (default: true) 
- Wrapped component translation logic in `if (translateComponents)` conditional
- When `translateComponents=false`, only page text nodes are translated

### 2. `/src/app/api/webflow/translate-component/route.ts` (NEW)
- New endpoint to translate a single component
- Accepts: `componentId`, `targetLocaleId`, `siteId`, `branchId`
- Translates component properties and/or DOM text nodes
- Returns streaming progress updates via SSE

### 3. `/src/app/api/webflow/page-components/route.ts` (NEW)
- New endpoint to get list of components on a page
- Accepts: `pageId`, `siteId`, `branchId`
- Returns: Array of unique component IDs (including nested components)
- Uses recursive traversal to find components in slots and nested structures

### 4. `/src/app/pages/page.tsx`
- Updated `handleTranslatePage` to orchestrate multiple API calls:
  1. Fetch list of components via `/api/webflow/page-components`
  2. Translate page content via `/api/webflow/translate-page` (with `translateComponents=false`)
  3. Loop through components and translate each via `/api/webflow/translate-component`
- Updated progress UI to show:
  - "Translating page text..."
  - "Translating component 1/5..."
  - "Translating component 2/5..."
  - etc.
- Added `processStreamingResponse` helper function to handle SSE responses

### 5. `/src/app/pages/page.tsx` - Interface Updates
- Updated `TranslationProgress` interface:
  - Changed `nodesCount` to `nodesTranslated`
  - Changed `componentsCount` to `componentsTranslated`
  - Added `totalComponents` to track total number of components

## API Flow

### Before (Single Request)
```
POST /api/webflow/translate-page
  ├─ Fetch page content
  ├─ Translate page text nodes (100+ nodes) ⏱️ 30s
  ├─ Collect all components (10+ components)
  ├─ Translate component 1 ⏱️ 15s
  ├─ Translate component 2 ⏱️ 15s
  ├─ ...
  ├─ Translate component 10 ⏱️ 15s
  └─ TIMEOUT! ❌ (Total: 180s+)
```

### After (Multiple Requests)
```
GET /api/webflow/page-components
  └─ Returns: [comp1, comp2, ..., comp10] ⏱️ 2s

POST /api/webflow/translate-page (translateComponents=false)
  ├─ Fetch page content
  └─ Translate page text nodes (100+ nodes) ⏱️ 30s ✅

POST /api/webflow/translate-component (componentId=comp1)
  └─ Translate component 1 ⏱️ 15s ✅

POST /api/webflow/translate-component (componentId=comp2)
  └─ Translate component 2 ⏱️ 15s ✅

...

POST /api/webflow/translate-component (componentId=comp10)
  └─ Translate component 10 ⏱️ 15s ✅
```

## Benefits

1. **No More Timeouts**: Each API call is short (10-30 seconds max)
2. **Better User Experience**: User sees exactly which component is being translated
3. **Graceful Failure Handling**: If one component fails, others still succeed
4. **Easier Debugging**: Logs show exactly which component caused issues
5. **Future Scalability**: Could parallelize component translation (translate 2-3 at once)

## Testing Checklist

- [x] Build succeeds (`npm run build`)
- [x] TypeScript compiles without errors
- [ ] Test on local dev server (`npm run dev`)
- [ ] Test on Webflow Cloud (`npm run preview`)
- [ ] Verify progress messages display correctly
- [ ] Verify large components no longer timeout
- [ ] Verify all components are translated (including nested ones)

## Notes

- The default behavior is unchanged: `translateComponents=true` means components are still translated
- The new approach is **opt-in** via the client-side orchestration
- All existing functionality is preserved for backward compatibility
- The new endpoints can be used independently for future features (e.g., "Translate only this component" button)

