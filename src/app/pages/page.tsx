'use client';

import { useEffect, useState } from 'react';
import type { WebflowPage, WebflowPagesResponse, WebflowLocale } from '@/types/webflow';

interface TranslationProgress {
  pageId: string;
  status: 'idle' | 'fetching' | 'translating' | 'updating' | 'complete' | 'error';
  currentLocale?: string;
  error?: string;
  completedLocales: string[];
}

export default function WebflowPagesPage() {
  const [pages, setPages] = useState<WebflowPage[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<'all' | 'published' | 'draft'>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [translationProgress, setTranslationProgress] = useState<Record<string, TranslationProgress>>({});

  useEffect(() => {
    const fetchPages = async () => {
      try {
        setLoading(true);
        const response = await fetch('/api/webflow/pages');
        
        if (!response.ok) {
          const errorData = await response.json();
          throw new Error(errorData.error || 'Failed to fetch pages');
        }

        const data: WebflowPagesResponse = await response.json();
        setPages(data.pages);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'An error occurred');
      } finally {
        setLoading(false);
      }
    };

    fetchPages();
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
        page.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
        page.slug.toLowerCase().includes(searchQuery.toLowerCase()) ||
        (page.publishedPath?.toLowerCase().includes(searchQuery.toLowerCase()) ?? false)
      );
    });

  const publishedCount = pages.filter((p) => !p.draft).length;
  const draftCount = pages.filter((p) => p.draft).length;

  const handleTranslatePage = async (page: WebflowPage) => {
    const pageId = page.id;
    
    // Initialize progress tracking
    setTranslationProgress(prev => ({
      ...prev,
      [pageId]: {
        pageId,
        status: 'fetching',
        completedLocales: [],
      }
    }));

    try {
      // Step 1: Fetch page content
      setTranslationProgress(prev => ({
        ...prev,
        [pageId]: { ...prev[pageId], status: 'fetching' }
      }));

      // Fetch locales
      const localesResp = await fetch('/api/webflow/locales');
      if (!localesResp.ok) {
        const err = await localesResp.json();
        throw new Error(err.error || 'Failed to fetch locales');
      }
      const locales: { primary: WebflowLocale | null; secondary: WebflowLocale[] } = await localesResp.json();

      // Fetch page content
      setTranslationProgress(prev => ({
        ...prev,
        [pageId]: { ...prev[pageId], status: 'fetching', currentLocale: undefined }
      }));

      const contentResp = await fetch(`/api/webflow/page-content?pageId=${encodeURIComponent(pageId)}`);
      if (!contentResp.ok) {
        const err = await contentResp.json();
        throw new Error(err.error || 'Failed to fetch page content');
      }
      const pageContent: { nodes: Array<{ nodeId: string; text?: string }> } = await contentResp.json();

      const textNodes = (pageContent.nodes || []).filter(n => typeof n.text === 'string' && !!n.text && n.text.trim().length > 0);
      if (textNodes.length === 0) {
        throw new Error('No content found to translate on this page');
      }

      const completedLocales: string[] = [];

      for (const locale of locales.secondary || []) {
        setTranslationProgress(prev => ({
          ...prev,
          [pageId]: { ...prev[pageId], status: 'translating', currentLocale: locale.displayName }
        }));

        // Batch translate all text nodes for this locale
        const resp = await fetch('/api/translate', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            texts: textNodes.map(n => n.text as string),
            targetLanguage: locale.displayName,
            sourceLanguage: 'English',
            context: `Webflow page content: ${page.title} (${page.slug})`
          })
        });

        if (!resp.ok) {
          const errorData = await resp.json();
          throw new Error(errorData.error || `Translation failed for ${locale.displayName}`);
        }

        const { translations }: { translations: string[] } = await resp.json();

        // Map translations back to nodeIds
        const nodesToUpdate = textNodes.map((n, idx) => ({ nodeId: n.nodeId, text: translations[idx] || (n.text as string) }));

        // Update Webflow localized content
        setTranslationProgress(prev => ({
          ...prev,
          [pageId]: { ...prev[pageId], status: 'updating', currentLocale: locale.displayName }
        }));

        const updateResp = await fetch('/api/webflow/update-page', {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ pageId, localeId: locale.id, nodes: nodesToUpdate })
        });

        if (!updateResp.ok) {
          const errorData = await updateResp.json();
          throw new Error(errorData.error || `Failed to update ${locale.displayName}`);
        }

        completedLocales.push(locale.displayName);
        setTranslationProgress(prev => ({
          ...prev,
          [pageId]: { ...prev[pageId], status: 'translating', completedLocales: [...completedLocales] }
        }));
      }

      setTranslationProgress(prev => ({
        ...prev,
        [pageId]: {
          ...prev[pageId],
          status: 'complete',
          completedLocales
        }
      }));

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
      <div className="flex min-h-screen items-center justify-center bg-zinc-50 dark:bg-zinc-900">
        <div className="text-center">
          <div className="inline-block h-8 w-8 animate-spin rounded-full border-4 border-solid border-zinc-900 border-r-transparent dark:border-zinc-50"></div>
          <p className="mt-4 text-zinc-600 dark:text-zinc-400">Loading pages...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-zinc-50 dark:bg-zinc-900 p-4">
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
    );
  }

  return (
    <div className="min-h-screen bg-zinc-50 dark:bg-zinc-900 py-8 px-4 sm:px-6 lg:px-8">
      <div className="max-w-7xl mx-auto">
        {/* Header */}
        <div className="mb-8">
          <h1 className="text-4xl font-bold text-zinc-900 dark:text-zinc-50 mb-2">
            Webflow Pages
          </h1>
          <p className="text-zinc-600 dark:text-zinc-400">
            Browse and manage all pages from your Webflow site
          </p>
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
            filteredPages.map((page) => {
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

                      {page.seo?.description && (
                        <p className="text-sm text-zinc-500 dark:text-zinc-500 mb-3">
                          {page.seo?.description}
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
                            <div className="flex items-center gap-2 text-green-600 dark:text-green-400">
                              <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
                                <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                              </svg>
                              <span className="text-sm font-medium">
                                Translation complete! {progress.completedLocales.length} locale(s) updated
                              </span>
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
                            <div className="flex items-center gap-2 text-blue-600 dark:text-blue-400">
                              <div className="w-4 h-4 border-2 border-blue-600 border-t-transparent rounded-full animate-spin" />
                              <span className="text-sm font-medium">
                                {progress.status === 'fetching' && 'Fetching page content...'}
                                {progress.status === 'translating' && `Translating to ${progress.currentLocale}...`}
                                {progress.status === 'updating' && `Updating ${progress.currentLocale}...`}
                              </span>
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

        {/* Results count */}
        {filteredPages.length > 0 && (
          <div className="mt-6 text-center text-sm text-zinc-600 dark:text-zinc-400">
            Showing {filteredPages.length} of {pages.length} pages
          </div>
        )}
      </div>
    </div>
  );
}

