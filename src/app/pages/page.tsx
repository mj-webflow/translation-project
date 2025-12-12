'use client';

import { useEffect, useState } from 'react';
import type { WebflowPage, WebflowPagesResponse } from '@/types/webflow';
import { createClient } from '@/lib/supabase';
import Navigation from '@/components/Navigation';

interface TranslationProgress {
  pageId: string;
  status: 'idle' | 'fetching' | 'translating' | 'updating' | 'complete' | 'error';
  currentLocale?: string;
  error?: string;
  completedLocales: string[];
  totalLocales?: number;
  currentStep?: string;
  nodesCount?: number;
  componentsCount?: number;
}

export default function WebflowPagesPage() {
  const [pages, setPages] = useState<WebflowPage[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<'all' | 'published' | 'draft'>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [translationProgress, setTranslationProgress] = useState<Record<string, TranslationProgress>>({});
  const [locales, setLocales] = useState<{ primary: any | null; secondary: any[] }>({ primary: null, secondary: [] });
  const [selectedLocaleIds, setSelectedLocaleIds] = useState<string[]>([]);
  const [userEmail, setUserEmail] = useState<string>('');
  const [supabase, setSupabase] = useState<ReturnType<typeof createClient> | null>(null);
  const [currentPage, setCurrentPage] = useState(1);
  const PAGES_PER_PAGE = 50;
  
  // Initialize Supabase and get user info
  useEffect(() => {
    const initSupabase = async () => {
      try {
        const client = await createClient();
        setSupabase(client);
        
        const { data } = await client.auth.getUser();
        if (data.user?.email) {
          setUserEmail(data.user.email);
        }
      } catch (err) {
        console.error('Failed to initialize Supabase:', err);
      }
    };
    
    initSupabase();
  }, []);
  
  const handleLogout = async () => {
    try {
      const client = supabase || await createClient();
      if (client) {
        await client.auth.signOut();
      }
    } catch (err) {
      console.error('Failed to sign out:', err);
    }
    const basePath = process.env.NEXT_PUBLIC_BASE_PATH || '';
    window.location.href = `${basePath}/login`;
  };

  useEffect(() => {
    const fetchLocalesThenPages = async () => {
      try {
        setLoading(true);
        const storedSiteId = typeof window !== 'undefined' ? (localStorage.getItem('webflow_site_id') || '') : '';
        const storedToken = typeof window !== 'undefined' ? (localStorage.getItem('webflow_api_token') || '') : '';
        const basePath = process.env.NEXT_PUBLIC_BASE_PATH || '';

        // 1) Fetch locales first
        const localesResp = await fetch(`${basePath}/api/webflow/locales${storedSiteId ? `?siteId=${encodeURIComponent(storedSiteId)}` : ''}`, {
          headers: storedToken ? { 'x-webflow-token': storedToken } : {},
          cache: 'no-store',
        });
        if (!localesResp.ok) {
          const e = await localesResp.json().catch(() => ({}));
          throw new Error(e?.error || 'Failed to fetch locales');
        }
        const localesData = await localesResp.json();
        setLocales(localesData);

        // Default selection: none. User must select at least one secondary locale before translating

        // 2) Then fetch pages
        const pagesResp = await fetch(`${basePath}/api/webflow/pages${storedSiteId ? `?siteId=${encodeURIComponent(storedSiteId)}` : ''}` , {
          headers: storedToken ? { 'x-webflow-token': storedToken } : {},
          cache: 'no-store',
        });
        if (!pagesResp.ok) {
          const errorData = await pagesResp.json().catch(() => ({}));
          throw new Error(errorData.error || 'Failed to fetch pages');
        }
        const data: WebflowPagesResponse = await pagesResp.json();
        setPages(data.pages);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'An error occurred');
      } finally {
        setLoading(false);
      }
    };

    fetchLocalesThenPages();
  }, []);

  const filteredPages = pages
    .filter((page) => {
      if (filter === 'published') return !page.draft;
      if (filter === 'draft') return page.draft;
      return true;
    })
    .filter((page) => {
      if (!searchQuery) return true;
      return (
        page.title?.toLowerCase().includes(searchQuery.toLowerCase()) ||
        page.slug?.toLowerCase().includes(searchQuery.toLowerCase()) ||
        page.publishedPath?.toLowerCase().includes(searchQuery.toLowerCase())
      );
    });

  // Pagination
  const totalPages = Math.ceil(filteredPages.length / PAGES_PER_PAGE);
  const startIndex = (currentPage - 1) * PAGES_PER_PAGE;
  const endIndex = startIndex + PAGES_PER_PAGE;
  const paginatedPages = filteredPages.slice(startIndex, endIndex);

  // Reset to page 1 when filter or search changes
  useEffect(() => {
    setCurrentPage(1);
  }, [filter, searchQuery]);

  const publishedCount = pages.filter((p) => !p.draft).length;
  const draftCount = pages.filter((p) => p.draft).length;

  const handleTranslatePage = async (page: WebflowPage) => {
    const pageId = page.id;
    if (selectedLocaleIds.length === 0) {
      setTranslationProgress(prev => ({
        ...prev,
        [pageId]: {
          pageId,
          status: 'error',
          error: 'Select at least one secondary locale before translating.',
          completedLocales: [],
        }
      }));
      return;
    }
    
    // Initialize progress tracking
    const selectedLocaleNames = locales.secondary
      .filter((l: any) => selectedLocaleIds.includes(l.id))
      .map((l: any) => l.displayName || l.tag);
    
    setTranslationProgress(prev => ({
      ...prev,
      [pageId]: {
        pageId,
        status: 'fetching',
        completedLocales: [],
        totalLocales: selectedLocaleIds.length,
        currentStep: 'Fetching page content...',
      }
    }));

    try {
      const storedSiteId = typeof window !== 'undefined' ? (localStorage.getItem('webflow_site_id') || '') : '';
      const storedToken = typeof window !== 'undefined' ? (localStorage.getItem('webflow_api_token') || '') : '';
      const branchId = page.branchId ? `&branchId=${encodeURIComponent(page.branchId)}` : '';
      const basePath = process.env.NEXT_PUBLIC_BASE_PATH || '';
      
      const completedLocales: string[] = [];
      const failedLocales: Array<{ name: string; error: string }> = [];
      let totalNodesTranslated = 0;

      // Translate all locales in a single request
      setTranslationProgress(prev => ({
        ...prev,
        [pageId]: {
          ...prev[pageId],
          status: 'translating', 
          currentStep: `Starting translation to ${selectedLocaleIds.length} locale(s)...`,
          completedLocales: []
        }
      }));

      try {
        const response = await fetch(`${basePath}/api/webflow/translate-page${storedSiteId ? `?siteId=${encodeURIComponent(storedSiteId)}${branchId}` : ''}`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          ...(storedToken ? { headers: { 'Content-Type': 'application/json', 'x-webflow-token': storedToken } } : {}),
          body: JSON.stringify({ pageId, targetLocaleIds: selectedLocaleIds })
        });

        if (!response.ok || !response.body) {
          throw new Error(`Translation request failed`);
        }

        // Read the streaming response
        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        let buffer = '';

        while (true) {
          const { done, value } = await reader.read();
          
          if (done) {
            console.log(`Stream ended. Completed locales:`, completedLocales);
            // Process any remaining buffer
            if (buffer.trim()) {
              console.log(`Processing remaining buffer:`, buffer);
              if (buffer.startsWith('data: ')) {
                try {
                  const data = JSON.parse(buffer.slice(6));
                  console.log(`Final SSE message from buffer:`, data);
                  if (data.success && data.localeName) {
                    if (!completedLocales.includes(data.localeName)) {
                      completedLocales.push(data.localeName);
                      totalNodesTranslated += data.nodesTranslated || 0;
                      console.log(`✓ Completed translation to ${data.localeName} (from buffer). Total completed: ${completedLocales.length}/${selectedLocaleIds.length}`);
                    }
                  }
                } catch (e) {
                  console.warn('Failed to parse final buffer:', buffer);
                }
              }
            }
            break;
          }
          
          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split('\n');
          buffer = lines.pop() || '';
          
          for (const line of lines) {
            if (line.trim() === '' || line.startsWith(':')) {
              // Skip empty lines and keepalive comments
              continue;
            }
            
            if (line.startsWith('data: ')) {
              try {
                const data = JSON.parse(line.slice(6));
                console.log(`SSE message:`, data);
                
                if (data.error) {
                  throw new Error(data.error);
                }
                
                if (data.status) {
                  // Update progress with status messages
                  console.log(`Updating progress:`, data.message || data.status);
                  setTranslationProgress(prev => ({
                    ...prev,
                    [pageId]: {
                      ...prev[pageId],
                      currentStep: data.message || data.status,
                    }
                  }));
                }
                
                if (data.success && data.localeName) {
                  // Locale completed successfully
                  if (!completedLocales.includes(data.localeName)) {
                    completedLocales.push(data.localeName);
                    totalNodesTranslated += data.nodesTranslated || 0;
                    console.log(`✓ Completed translation to ${data.localeName}. Total completed: ${completedLocales.length}/${selectedLocaleIds.length}`);
                    console.log(`Completed locales array:`, completedLocales);
                    
                    // Update progress with completed locale
                    setTranslationProgress(prev => ({
                      ...prev,
                      [pageId]: {
                        ...prev[pageId],
                        completedLocales: [...completedLocales],
                        currentStep: `✓ Completed ${data.localeName} (${completedLocales.length}/${selectedLocaleIds.length})`,
                      }
                    }));
                  }
                }
              } catch (e) {
                console.warn('Failed to parse SSE message:', line);
              }
            }
          }
        }
        
        // All locales processed
        console.log(`All locales processed. Final completed count: ${completedLocales.length}/${selectedLocaleIds.length}`);
      console.log(`Final completed locales array:`, completedLocales);
      console.log(`Failed locales:`, failedLocales);
      console.log(`Total nodes translated:`, totalNodesTranslated);
      
      // Build final status message
      let finalMessage = '';
      if (completedLocales.length === selectedLocaleIds.length) {
        finalMessage = `Translation complete! Successfully translated to all ${completedLocales.length} locale(s)`;
      } else if (completedLocales.length > 0) {
        finalMessage = `Partially complete: Translated to ${completedLocales.length}/${selectedLocaleIds.length} locale(s). `;
        if (failedLocales.length > 0) {
          const failedNames = failedLocales.map(f => f.name).join(', ');
          finalMessage += `Failed: ${failedNames}`;
        }
      } else {
        finalMessage = `Translation failed for all locales. Please check the logs and try again.`;
      }
      
      setTranslationProgress(prev => {
        const finalStatus: 'complete' | 'error' = completedLocales.length > 0 ? 'complete' : 'error';
        const finalProgress = {
          ...prev,
          [pageId]: {
            ...prev[pageId],
            status: finalStatus,
            completedLocales: [...completedLocales],
            currentStep: finalMessage,
            nodesCount: totalNodesTranslated,
            error: failedLocales.length > 0 ? failedLocales.map(f => `${f.name}: ${f.error}`).join('; ') : undefined,
          }
        };
        console.log(`Final progress state for ${pageId}:`, finalProgress[pageId]);
        return finalProgress;
      });

      // === TRANSLATE METADATA ===
      // After content translation, also translate page metadata (title, SEO, Open Graph)
      if (completedLocales.length > 0) {
        setTranslationProgress(prev => ({
          ...prev,
          [pageId]: {
            ...prev[pageId],
            status: 'translating',
            currentStep: `Translating page metadata...`,
          }
        }));

        try {
          const metaResponse = await fetch(`${basePath}/api/webflow/translate-metadata${storedSiteId ? `?siteId=${encodeURIComponent(storedSiteId)}` : ''}`, {
            method: 'POST',
            headers: { 
              'Content-Type': 'application/json',
              ...(storedToken ? { 'x-webflow-token': storedToken } : {})
            },
            body: JSON.stringify({ pageId, targetLocaleIds: selectedLocaleIds })
          });

          if (metaResponse.ok && metaResponse.body) {
            const metaReader = metaResponse.body.getReader();
            const metaDecoder = new TextDecoder();
            let metaBuffer = '';
            let metaCompleted = 0;

            while (true) {
              const { done, value } = await metaReader.read();
              if (done) break;

              metaBuffer += metaDecoder.decode(value, { stream: true });
              const metaLines = metaBuffer.split('\n');
              metaBuffer = metaLines.pop() || '';

              for (const line of metaLines) {
                if (line.startsWith('data: ')) {
                  try {
                    const data = JSON.parse(line.slice(6));
                    if (data.success && data.localeName) {
                      metaCompleted++;
                      setTranslationProgress(prev => ({
                        ...prev,
                        [pageId]: {
                          ...prev[pageId],
                          currentStep: `Translated metadata for ${data.localeName} (${metaCompleted}/${selectedLocaleIds.length})`,
                        }
                      }));
                    }
                  } catch (e) {
                    // Ignore parse errors
                  }
                }
              }
            }
            console.log(`[translate-page] ✓ Metadata translation complete for ${metaCompleted} locale(s)`);
          }
        } catch (metaError) {
          console.error('Metadata translation error (non-fatal):', metaError);
          // Don't fail the whole operation if metadata translation fails
        }

        // Set final complete status after metadata translation
        setTranslationProgress(prev => ({
          ...prev,
          [pageId]: {
            ...prev[pageId],
            status: 'complete',
            currentStep: `Translation complete! Content and metadata translated to ${completedLocales.length} locale(s)`,
          }
        }));
      }

      // Refresh pages list
      const storedSiteIdRefresh = typeof window !== 'undefined' ? (localStorage.getItem('webflow_site_id') || '') : '';
      const storedTokenRefresh = typeof window !== 'undefined' ? (localStorage.getItem('webflow_api_token') || '') : '';
      const pagesResponse = await fetch(`/api/webflow/pages${storedSiteIdRefresh ? `?siteId=${encodeURIComponent(storedSiteIdRefresh)}` : ''}`, {
        headers: storedTokenRefresh ? { 'x-webflow-token': storedTokenRefresh } : {},
      });
      if (pagesResponse.ok) {
        const data: WebflowPagesResponse = await pagesResponse.json();
        setPages(data.pages);
        }
      } catch (error) {
        console.error(`Translation request failed (may be timeout):`, error);
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';
        
        // Mark all remaining locales as failed
        for (const localeName of selectedLocaleNames) {
          if (!completedLocales.includes(localeName)) {
            failedLocales.push({ name: localeName, error: errorMessage });
          }
        }
        
        // If some locales completed before the timeout, treat as partial success
        if (completedLocales.length > 0) {
          console.log(`Stream timed out, but ${completedLocales.length} locale(s) completed successfully`);
          
          let finalMessage = '';
          if (completedLocales.length === selectedLocaleIds.length) {
            finalMessage = `Translation complete! Successfully translated to all ${completedLocales.length} locale(s) (connection timed out but work completed)`;
          } else {
            finalMessage = `Partially complete: Translated to ${completedLocales.length}/${selectedLocaleIds.length} locale(s). `;
            if (failedLocales.length > 0) {
              const failedNames = failedLocales.map(f => f.name).join(', ');
              finalMessage += `Failed or timed out: ${failedNames}`;
            }
          }
          
          setTranslationProgress(prev => {
            const finalStatus: 'complete' | 'error' = completedLocales.length === selectedLocaleIds.length ? 'complete' : 'error';
            return {
              ...prev,
              [pageId]: {
                ...prev[pageId],
                status: finalStatus,
                completedLocales: [...completedLocales],
                currentStep: finalMessage,
                nodesCount: totalNodesTranslated,
                error: failedLocales.length > 0 ? failedLocales.map(f => `${f.name}: ${f.error}`).join('; ') : undefined,
              }
            };
          });
        } else {
          // No locales completed - this is a real error
          setTranslationProgress(prev => {
            const finalStatus: 'error' = 'error';
            return {
              ...prev,
              [pageId]: {
                ...prev[pageId],
                status: finalStatus,
                currentStep: `Translation failed: ${errorMessage}`,
                error: errorMessage,
              }
            };
          });
        }
      }

    } catch (err) {
      console.error('Translation error:', err);
      setTranslationProgress(prev => ({
        ...prev,
        [pageId]: {
          ...prev[pageId],
          status: 'error',
          error: err instanceof Error ? err.message : 'Translation failed'
        }
      }));
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-zinc-50 dark:bg-zinc-900">
        <Navigation userEmail={userEmail} onLogout={handleLogout} />
        <div className="flex items-center justify-center h-[calc(100vh-64px)]">
        <div className="text-center">
          <div className="inline-block h-8 w-8 animate-spin rounded-full border-4 border-solid border-zinc-900 border-r-transparent dark:border-zinc-50"></div>
          <p className="mt-4 text-zinc-600 dark:text-zinc-400">Loading pages...</p>
          </div>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen bg-zinc-50 dark:bg-zinc-900">
        <Navigation userEmail={userEmail} onLogout={handleLogout} />
        <div className="flex items-center justify-center h-[calc(100vh-64px)] p-4">
        <div className="max-w-md text-center">
          <div className="mb-4 text-6xl">⚠️</div>
          <h1 className="text-2xl font-bold text-zinc-900 dark:text-zinc-50 mb-2">
            Error Loading Pages
          </h1>
          <p className="text-zinc-600 dark:text-zinc-400">{error}</p>
          <button
            onClick={() => window.location.reload()}
            className="mt-6 px-4 py-2 bg-zinc-900 dark:bg-zinc-50 text-white dark:text-zinc-900 rounded-lg hover:bg-zinc-700 dark:hover:bg-zinc-200 transition-colors"
          >
            Retry
          </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-zinc-50 dark:bg-zinc-900">
      <Navigation userEmail={userEmail} onLogout={handleLogout} />
      
      <div className="max-w-7xl mx-auto py-6 px-4 sm:px-6 lg:px-8">
        {/* Header */}
        <div className="mb-6">
          <h1 className="text-3xl font-bold text-zinc-900 dark:text-zinc-50">
            Page Translations
          </h1>
          <p className="mt-1 text-zinc-600 dark:text-zinc-400">
            Translate your Webflow pages to multiple languages
          </p>
        </div>

        {/* Locale Selection */}
        <div className="bg-white dark:bg-zinc-800 rounded-lg shadow-sm p-4 mb-6">
          <div className="mb-2 text-sm text-zinc-600 dark:text-zinc-400">Select locales to translate into:</div>
          <div className="flex flex-wrap gap-3">
            {locales.secondary.length === 0 ? (
              <div className="text-sm text-zinc-500 dark:text-zinc-400">No secondary locales found.</div>
            ) : (
              locales.secondary.map((loc: any) => {
                const id = loc.id || loc.localeId || loc.tag;
                const label = loc.displayName || loc.tag || id;
                const checked = selectedLocaleIds.includes(id);
                return (
                  <label key={id} className="inline-flex items-center gap-2 text-sm text-zinc-800 dark:text-zinc-100">
                    <input
                      type="checkbox"
                      className="h-4 w-4"
                      checked={checked}
                      onChange={(e) => {
                        setSelectedLocaleIds(prev => e.target.checked ? [...prev, id] : prev.filter(x => x !== id));
                      }}
                    />
                    <span>{label}</span>
                  </label>
                );
              })
            )}
          </div>
          {selectedLocaleIds.length === 0 && (
            <div className="mt-2 text-xs text-orange-600 dark:text-orange-400">Pick at least one secondary locale to enable translation.</div>
          )}
        </div>

        {/* Stats */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
          <div className="bg-white dark:bg-zinc-800 rounded-lg p-4 shadow-sm">
            <div className="text-2xl font-bold text-zinc-900 dark:text-zinc-50">
              {pages.length}
            </div>
            <div className="text-sm text-zinc-600 dark:text-zinc-400">Total Pages</div>
          </div>
          <div className="bg-white dark:bg-zinc-800 rounded-lg p-4 shadow-sm">
            <div className="text-2xl font-bold text-green-600 dark:text-green-400">
              {publishedCount}
            </div>
            <div className="text-sm text-zinc-600 dark:text-zinc-400">Published</div>
          </div>
          <div className="bg-white dark:bg-zinc-800 rounded-lg p-4 shadow-sm">
            <div className="text-2xl font-bold text-orange-600 dark:text-orange-400">
              {draftCount}
            </div>
            <div className="text-sm text-zinc-600 dark:text-zinc-400">Drafts</div>
          </div>
        </div>

        {/* Filters and Search */}
        <div className="bg-white dark:bg-zinc-800 rounded-lg shadow-sm p-4 mb-6">
          <div className="flex flex-col md:flex-row gap-4">
            <div className="flex-1">
              <input
                type="text"
                placeholder="Search pages..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full px-4 py-2 border border-zinc-300 dark:border-zinc-600 rounded-lg bg-white dark:bg-zinc-700 text-zinc-900 dark:text-zinc-50 placeholder-zinc-500 dark:placeholder-zinc-400 focus:outline-none focus:ring-2 focus:ring-zinc-900 dark:focus:ring-zinc-50"
              />
            </div>
            <div className="flex gap-2">
              <button
                onClick={() => setFilter('all')}
                className={`px-4 py-2 rounded-lg transition-colors ${
                  filter === 'all'
                    ? 'bg-zinc-900 dark:bg-zinc-50 text-white dark:text-zinc-900'
                    : 'bg-zinc-200 dark:bg-zinc-700 text-zinc-900 dark:text-zinc-50 hover:bg-zinc-300 dark:hover:bg-zinc-600'
                }`}
              >
                All
              </button>
              <button
                onClick={() => setFilter('published')}
                className={`px-4 py-2 rounded-lg transition-colors ${
                  filter === 'published'
                    ? 'bg-zinc-900 dark:bg-zinc-50 text-white dark:text-zinc-900'
                    : 'bg-zinc-200 dark:bg-zinc-700 text-zinc-900 dark:text-zinc-50 hover:bg-zinc-300 dark:hover:bg-zinc-600'
                }`}
              >
                Published
              </button>
              <button
                onClick={() => setFilter('draft')}
                className={`px-4 py-2 rounded-lg transition-colors ${
                  filter === 'draft'
                    ? 'bg-zinc-900 dark:bg-zinc-50 text-white dark:text-zinc-900'
                    : 'bg-zinc-200 dark:bg-zinc-700 text-zinc-900 dark:text-zinc-50 hover:bg-zinc-300 dark:hover:bg-zinc-600'
                }`}
              >
                Drafts
              </button>
            </div>
          </div>
        </div>

        {/* Pages List */}
        <div className="space-y-3">
          {filteredPages.length === 0 ? (
            <div className="bg-white dark:bg-zinc-800 rounded-lg p-8 text-center shadow-sm">
              <p className="text-zinc-600 dark:text-zinc-400">No pages found</p>
            </div>
          ) : (
            paginatedPages.map((page) => {
              const progress = translationProgress[page.id];
              const isTranslating = progress && progress.status !== 'idle' && progress.status !== 'complete' && progress.status !== 'error';
              
              return (
                <div
                  key={page.id}
                  className="bg-white dark:bg-zinc-800 rounded-lg p-6 shadow-sm hover:shadow-md transition-shadow"
                >
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex-1">
                      <div className="flex items-center gap-3 mb-2">
                        <h2 className="text-xl font-semibold text-zinc-900 dark:text-zinc-50">
                          {page.title}
                        </h2>
                        <div className="flex gap-2">
                          {page.draft ? (
                            <span className="px-2 py-1 text-xs font-medium bg-orange-100 dark:bg-orange-900 text-orange-800 dark:text-orange-200 rounded">
                              Draft
                            </span>
                          ) : (
                            <span className="px-2 py-1 text-xs font-medium bg-green-100 dark:bg-green-900 text-green-800 dark:text-green-200 rounded">
                              Published
                            </span>
                          )}
                          {page.isBranch && (
                            <span className="px-2 py-1 text-xs font-medium bg-blue-100 dark:bg-blue-900 text-blue-800 dark:text-blue-200 rounded">
                              Branch
                            </span>
                          )}
                          {page.collectionId && (
                            <span className="px-2 py-1 text-xs font-medium bg-purple-100 dark:bg-purple-900 text-purple-800 dark:text-purple-200 rounded">
                              Template
                            </span>
                          )}
                        </div>
                      </div>
                      
                      <a
                        href={`https://wfc-demo.webflow.io${page.publishedPath}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-sm text-blue-600 dark:text-blue-400 mb-3 font-mono hover:underline inline-flex items-center gap-1"
                      >
                        {page.publishedPath}
                        <svg 
                          className="w-3 h-3" 
                          fill="none" 
                          stroke="currentColor" 
                          viewBox="0 0 24 24"
                        >
                          <path 
                            strokeLinecap="round" 
                            strokeLinejoin="round" 
                            strokeWidth={2} 
                            d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" 
                          />
                        </svg>
                      </a>

                      {page.seo.description && (
                        <p className="text-sm text-zinc-500 dark:text-zinc-500 mb-3">
                          {page.seo.description}
                        </p>
                      )}

                      <div className="flex flex-wrap gap-4 text-xs text-zinc-500 dark:text-zinc-500">
                        <div>
                          <span className="font-medium">ID:</span> {page.id}
                        </div>
                        <div>
                          <span className="font-medium">Slug:</span> {page.slug}
                        </div>
                        <div>
                          <span className="font-medium">Updated:</span>{' '}
                          {new Date(page.lastUpdated).toLocaleDateString()}
                        </div>
                      </div>

                      {/* Translation Progress */}
                      {progress && (
                        <div className="mt-3 p-3 bg-zinc-50 dark:bg-zinc-900 rounded border border-zinc-200 dark:border-zinc-700">
                          {progress.status === 'complete' && (
                            <div className="space-y-1">
                            <div className="flex items-center gap-2 text-green-600 dark:text-green-400">
                              <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
                                <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                              </svg>
                              <span className="text-sm font-medium">
                                  Translation complete!
                              </span>
                              </div>
                              {progress.currentStep && (
                                <div className="text-xs text-zinc-600 dark:text-zinc-400 ml-6">
                                  {progress.currentStep}
                                </div>
                              )}
                            </div>
                          )}
                          {progress.status === 'error' && (
                            <div className="flex items-center gap-2 text-red-600 dark:text-red-400">
                              <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
                                <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd" />
                              </svg>
                              <span className="text-sm font-medium">Error: {progress.error}</span>
                            </div>
                          )}
                          {isTranslating && (
                            <div className="space-y-1">
                            <div className="flex items-center gap-2 text-blue-600 dark:text-blue-400">
                              <div className="w-4 h-4 border-2 border-blue-600 border-t-transparent rounded-full animate-spin" />
                              <span className="text-sm font-medium">
                                  {progress.status === 'fetching' && 'Preparing translation...'}
                                  {progress.status === 'translating' && 'Translating content...'}
                                  {progress.status === 'updating' && 'Updating content...'}
                              </span>
                              </div>
                              {progress.currentStep && (
                                <div className="text-xs text-zinc-600 dark:text-zinc-400 ml-6">
                                  {progress.currentStep}
                                </div>
                              )}
                              {progress.totalLocales && (
                                <div className="text-xs text-zinc-500 dark:text-zinc-500 ml-6">
                                  {progress.completedLocales?.length || 0}/{progress.totalLocales} locale(s) completed
                                </div>
                              )}
                            </div>
                          )}
                        </div>
                      )}
                    </div>

                    {/* Action Buttons */}
                    <div className="flex flex-col gap-2">
                      <button
                        onClick={() => handleTranslatePage(page)}
                        disabled={isTranslating}
                        className={`px-4 py-2 rounded-lg font-medium transition-colors flex items-center gap-2 ${
                          isTranslating
                            ? 'bg-zinc-200 dark:bg-zinc-700 text-zinc-400 dark:text-zinc-500 cursor-not-allowed'
                            : 'bg-blue-600 hover:bg-blue-700 text-white'
                        }`}
                      >
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 5h12M9 3v2m1.048 9.5A18.022 18.022 0 016.412 9m6.088 9h7M11 21l5-10 5 10M12.751 5C11.783 10.77 8.07 15.61 3 18.129" />
                        </svg>
                        {isTranslating ? 'Translating...' : 'Translate'}
                      </button>
                    </div>
                  </div>
                </div>
              );
            })
          )}
        </div>

        {/* Pagination */}
        {filteredPages.length > 0 && (
          <div className="mt-6">
            <div className="flex items-center justify-between">
              <div className="text-sm text-zinc-600 dark:text-zinc-400">
                Showing {startIndex + 1}-{Math.min(endIndex, filteredPages.length)} of {filteredPages.length} pages
                {filteredPages.length !== pages.length && ` (filtered from ${pages.length} total)`}
              </div>
              
              {totalPages > 1 && (
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => setCurrentPage(prev => Math.max(1, prev - 1))}
                    disabled={currentPage === 1}
                    className={`px-3 py-1 rounded-lg text-sm font-medium transition-colors ${
                      currentPage === 1
                        ? 'bg-zinc-200 dark:bg-zinc-700 text-zinc-400 dark:text-zinc-500 cursor-not-allowed'
                        : 'bg-zinc-200 dark:bg-zinc-700 text-zinc-900 dark:text-zinc-50 hover:bg-zinc-300 dark:hover:bg-zinc-600'
                    }`}
                  >
                    Previous
                  </button>
                  
                  <div className="flex items-center gap-1">
                    {Array.from({ length: totalPages }, (_, i) => i + 1).map((pageNum) => {
                      // Show first page, last page, current page, and pages around current
                      const showPage = 
                        pageNum === 1 ||
                        pageNum === totalPages ||
                        (pageNum >= currentPage - 1 && pageNum <= currentPage + 1);
                      
                      const showEllipsis = 
                        (pageNum === currentPage - 2 && currentPage > 3) ||
                        (pageNum === currentPage + 2 && currentPage < totalPages - 2);
                      
                      if (showEllipsis) {
                        return (
                          <span key={pageNum} className="px-2 text-zinc-400 dark:text-zinc-500">
                            ...
                          </span>
                        );
                      }
                      
                      if (!showPage) return null;
                      
                      return (
                        <button
                          key={pageNum}
                          onClick={() => setCurrentPage(pageNum)}
                          className={`px-3 py-1 rounded-lg text-sm font-medium transition-colors ${
                            currentPage === pageNum
                              ? 'bg-zinc-900 dark:bg-zinc-50 text-white dark:text-zinc-900'
                              : 'bg-zinc-200 dark:bg-zinc-700 text-zinc-900 dark:text-zinc-50 hover:bg-zinc-300 dark:hover:bg-zinc-600'
                          }`}
                        >
                          {pageNum}
                        </button>
                      );
                    })}
                  </div>
                  
                  <button
                    onClick={() => setCurrentPage(prev => Math.min(totalPages, prev + 1))}
                    disabled={currentPage === totalPages}
                    className={`px-3 py-1 rounded-lg text-sm font-medium transition-colors ${
                      currentPage === totalPages
                        ? 'bg-zinc-200 dark:bg-zinc-700 text-zinc-400 dark:text-zinc-500 cursor-not-allowed'
                        : 'bg-zinc-200 dark:bg-zinc-700 text-zinc-900 dark:text-zinc-50 hover:bg-zinc-300 dark:hover:bg-zinc-600'
                    }`}
                  >
                    Next
                  </button>
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

