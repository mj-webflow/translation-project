'use client';

import { useEffect, useState, useCallback } from 'react';
import { createClient } from '@/lib/supabase';
import Navigation from '@/components/Navigation';

interface Collection {
    id: string;
    displayName: string;
    singularName: string;
    slug: string;
    createdOn: string;
    lastUpdated: string;
}

interface CollectionField {
    id: string;
    slug: string;
    displayName: string;
    type: string;
    isRequired: boolean;
}

interface CollectionItem {
    id: string;
    fieldData: Record<string, any>;
    createdOn: string;
    lastUpdated: string;
    isArchived: boolean;
    isDraft: boolean;
}

interface TranslationProgress {
    status: 'idle' | 'translating' | 'complete' | 'error';
    message?: string;
    step?: number;
    totalSteps?: number;
    itemsTranslated?: number;
    localesCompleted?: string[];
    error?: string;
}

export default function CMSPage() {
    // State
    const [collections, setCollections] = useState<Collection[]>([]);
    const [selectedCollection, setSelectedCollection] = useState<Collection | null>(null);
    const [collectionFields, setCollectionFields] = useState<{ all: CollectionField[]; translatable: CollectionField[] }>({ all: [], translatable: [] });
    const [items, setItems] = useState<CollectionItem[]>([]);
    const [selectedItemIds, setSelectedItemIds] = useState<Set<string>>(new Set());
    const [selectedFieldSlugs, setSelectedFieldSlugs] = useState<Set<string>>(new Set());
    const [locales, setLocales] = useState<{ primary: any | null; secondary: any[] }>({ primary: null, secondary: [] });
    const [selectedLocaleIds, setSelectedLocaleIds] = useState<string[]>([]);
    
    // Loading states
    const [loadingCollections, setLoadingCollections] = useState(true);
    const [loadingItems, setLoadingItems] = useState(false);
    const [translationProgress, setTranslationProgress] = useState<TranslationProgress>({ status: 'idle' });
    
    // UI state
    const [searchQuery, setSearchQuery] = useState('');
    const [error, setError] = useState<string | null>(null);
    const [userEmail, setUserEmail] = useState<string>('');
    const [supabase, setSupabase] = useState<ReturnType<typeof createClient> | null>(null);
    const [translateSlugs, setTranslateSlugs] = useState(false);

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

    // Fetch collections and locales on mount
    useEffect(() => {
        const fetchData = async () => {
            try {
                setLoadingCollections(true);
                const storedSiteId = typeof window !== 'undefined' ? (localStorage.getItem('webflow_site_id') || '') : '';
                const storedToken = typeof window !== 'undefined' ? (localStorage.getItem('webflow_api_token') || '') : '';
                const basePath = process.env.NEXT_PUBLIC_BASE_PATH || '';
                
                const headers: Record<string, string> = storedToken ? { 'x-webflow-token': storedToken } : {};

                // Fetch locales
                const localesResp = await fetch(
                    `${basePath}/api/webflow/locales${storedSiteId ? `?siteId=${encodeURIComponent(storedSiteId)}` : ''}`,
                    { headers, cache: 'no-store' }
                );
                if (localesResp.ok) {
                    const localesData = await localesResp.json();
                    setLocales(localesData);
                }

                // Fetch collections
                const collectionsResp = await fetch(
                    `${basePath}/api/webflow/collections${storedSiteId ? `?siteId=${encodeURIComponent(storedSiteId)}` : ''}`,
                    { headers, cache: 'no-store' }
                );
                
                if (!collectionsResp.ok) {
                    const errorData = await collectionsResp.json().catch(() => ({}));
                    throw new Error(errorData.error || 'Failed to fetch collections');
                }
                
                const data = await collectionsResp.json();
                setCollections(data.collections || []);
            } catch (err) {
                setError(err instanceof Error ? err.message : 'An error occurred');
            } finally {
                setLoadingCollections(false);
            }
        };

        fetchData();
    }, []);

    // Fetch items when collection is selected
    const fetchCollectionItems = useCallback(async (collection: Collection) => {
        try {
            setLoadingItems(true);
            setItems([]);
            setSelectedItemIds(new Set());
            
            const storedSiteId = typeof window !== 'undefined' ? (localStorage.getItem('webflow_site_id') || '') : '';
            const storedToken = typeof window !== 'undefined' ? (localStorage.getItem('webflow_api_token') || '') : '';
            const basePath = process.env.NEXT_PUBLIC_BASE_PATH || '';
            
            const headers: Record<string, string> = storedToken ? { 'x-webflow-token': storedToken } : {};

            // Fetch schema first
            const schemaResp = await fetch(
                `${basePath}/api/webflow/collection-schema?collectionId=${encodeURIComponent(collection.id)}`,
                { headers, cache: 'no-store' }
            );
            
            if (schemaResp.ok) {
                const schemaData = await schemaResp.json();
                setCollectionFields({
                    all: schemaData.fields?.all || [],
                    translatable: schemaData.fields?.translatable || [],
                });
                // Select all translatable fields by default
                setSelectedFieldSlugs(new Set((schemaData.fields?.translatable || []).map((f: CollectionField) => f.slug)));
            }

            // Fetch items
            const itemsResp = await fetch(
                `${basePath}/api/webflow/collection-items?collectionId=${encodeURIComponent(collection.id)}&fetchAll=true`,
                { headers, cache: 'no-store' }
            );
            
            if (!itemsResp.ok) {
                const errorData = await itemsResp.json().catch(() => ({}));
                throw new Error(errorData.error || 'Failed to fetch items');
            }
            
            const data = await itemsResp.json();
            setItems(data.items || []);
        } catch (err) {
            console.error('Failed to fetch collection items:', err);
            setError(err instanceof Error ? err.message : 'Failed to fetch items');
        } finally {
            setLoadingItems(false);
        }
    }, []);

    // Handle collection selection
    const handleSelectCollection = (collection: Collection) => {
        setSelectedCollection(collection);
        fetchCollectionItems(collection);
    };

    // Toggle item selection
    const toggleItemSelection = (itemId: string) => {
        setSelectedItemIds(prev => {
            const newSet = new Set(prev);
            if (newSet.has(itemId)) {
                newSet.delete(itemId);
            } else {
                newSet.add(itemId);
            }
            return newSet;
        });
    };

    // Select/deselect all items
    const toggleAllItems = () => {
        if (selectedItemIds.size === filteredItems.length) {
            setSelectedItemIds(new Set());
        } else {
            setSelectedItemIds(new Set(filteredItems.map(item => item.id)));
        }
    };

    // Toggle field selection
    const toggleFieldSelection = (fieldSlug: string) => {
        setSelectedFieldSlugs(prev => {
            const newSet = new Set(prev);
            if (newSet.has(fieldSlug)) {
                newSet.delete(fieldSlug);
            } else {
                newSet.add(fieldSlug);
            }
            return newSet;
        });
    };

    // Filter items by search
    const filteredItems = items.filter(item => {
        if (!searchQuery) return true;
        const nameField = item.fieldData?.name || item.fieldData?.title || item.fieldData?.['post-title'] || '';
        return nameField.toLowerCase().includes(searchQuery.toLowerCase());
    });

    // Get display name for an item
    const getItemDisplayName = (item: CollectionItem): string => {
        return item.fieldData?.name || 
               item.fieldData?.title || 
               item.fieldData?.['post-title'] ||
               item.fieldData?.['blog-post-title'] ||
               `Item ${item.id.slice(-6)}`;
    };

    // Handle translation
    const handleTranslate = async () => {
        if (selectedItemIds.size === 0) {
            setError('Please select at least one item to translate');
            return;
        }
        if (selectedLocaleIds.length === 0) {
            setError('Please select at least one target locale');
            return;
        }
        if (selectedFieldSlugs.size === 0) {
            setError('Please select at least one field to translate');
            return;
        }
        if (!selectedCollection) return;

        setError(null);
        setTranslationProgress({ status: 'translating', message: 'Starting translation...', step: 0, totalSteps: 5 });

        try {
            const storedSiteId = typeof window !== 'undefined' ? (localStorage.getItem('webflow_site_id') || '') : '';
            const storedToken = typeof window !== 'undefined' ? (localStorage.getItem('webflow_api_token') || '') : '';
            const basePath = process.env.NEXT_PUBLIC_BASE_PATH || '';

            const response = await fetch(
                `${basePath}/api/webflow/translate-cms${storedSiteId ? `?siteId=${encodeURIComponent(storedSiteId)}` : ''}`,
                {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        ...(storedToken ? { 'x-webflow-token': storedToken } : {}),
                    },
                    body: JSON.stringify({
                        collectionId: selectedCollection.id,
                        itemIds: Array.from(selectedItemIds),
                        targetLocaleIds: selectedLocaleIds,
                        fieldSlugs: Array.from(selectedFieldSlugs),
                        translateSlug: translateSlugs,
                    }),
                }
            );

            if (!response.ok || !response.body) {
                throw new Error('Translation request failed');
            }

            // Read SSE stream
            const reader = response.body.getReader();
            const decoder = new TextDecoder();
            let buffer = '';
            const completedLocales: string[] = [];

            while (true) {
                const { done, value } = await reader.read();
                
                if (done) break;
                
                buffer += decoder.decode(value, { stream: true });
                const lines = buffer.split('\n');
                buffer = lines.pop() || '';
                
                for (const line of lines) {
                    if (line.trim() === '' || line.startsWith(':')) continue;
                    
                    if (line.startsWith('data: ')) {
                        try {
                            const data = JSON.parse(line.slice(6));
                            
                            if (data.error) {
                                setTranslationProgress({
                                    status: 'error',
                                    error: data.error,
                                });
                                return;
                            }
                            
                            if (data.type === 'progress') {
                                setTranslationProgress(prev => ({
                                    ...prev,
                                    message: data.message,
                                    step: data.step,
                                    totalSteps: data.totalSteps,
                                }));
                            }
                            
                            if (data.type === 'locale_complete') {
                                completedLocales.push(data.locale);
                                setTranslationProgress(prev => ({
                                    ...prev,
                                    message: `Completed ${data.locale}`,
                                    localesCompleted: [...completedLocales],
                                    itemsTranslated: data.itemsTranslated,
                                }));
                            }
                            
                            if (data.type === 'complete') {
                                setTranslationProgress({
                                    status: 'complete',
                                    message: data.message,
                                    itemsTranslated: data.itemsTranslated,
                                    localesCompleted: completedLocales,
                                });
                            }
                        } catch (e) {
                            console.warn('Failed to parse SSE message:', line);
                        }
                    }
                }
            }
        } catch (err) {
            console.error('Translation error:', err);
            setTranslationProgress({
                status: 'error',
                error: err instanceof Error ? err.message : 'Translation failed',
            });
        }
    };

    // Loading state
    if (loadingCollections) {
        return (
            <div className="min-h-screen bg-zinc-50 dark:bg-zinc-900">
                <Navigation userEmail={userEmail} onLogout={handleLogout} />
                <div className="flex items-center justify-center h-[calc(100vh-64px)]">
                    <div className="text-center">
                        <div className="inline-block h-8 w-8 animate-spin rounded-full border-4 border-solid border-zinc-900 border-r-transparent dark:border-zinc-50"></div>
                        <p className="mt-4 text-zinc-600 dark:text-zinc-400">Loading collections...</p>
                    </div>
                </div>
            </div>
        );
    }

    return (
        <div className="min-h-screen bg-zinc-50 dark:bg-zinc-900">
            <Navigation userEmail={userEmail} onLogout={handleLogout} />
            
            <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
                {/* Header */}
                <div className="mb-6">
                    <h1 className="text-3xl font-bold text-zinc-900 dark:text-zinc-50">
                        CMS Translations
                    </h1>
                    <p className="mt-1 text-zinc-600 dark:text-zinc-400">
                        Translate your CMS collection items to multiple languages
                    </p>
                </div>

                {/* Error Display */}
                {error && (
                    <div className="mb-6 p-4 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg">
                        <div className="flex items-center gap-2 text-red-600 dark:text-red-400">
                            <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 20 20">
                                <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd" />
                            </svg>
                            <span>{error}</span>
                            <button onClick={() => setError(null)} className="ml-auto text-sm underline">Dismiss</button>
                        </div>
                    </div>
                )}

                {/* 3-Panel Layout */}
                <div className="grid grid-cols-12 gap-6">
                    {/* Left Panel: Collections */}
                    <div className="col-span-12 md:col-span-3">
                        <div className="bg-white dark:bg-zinc-800 rounded-xl shadow-sm border border-zinc-200 dark:border-zinc-700 overflow-hidden">
                            <div className="p-4 border-b border-zinc-200 dark:border-zinc-700">
                                <h2 className="font-semibold text-zinc-900 dark:text-zinc-50">Collections</h2>
                                <p className="text-xs text-zinc-500 dark:text-zinc-500 mt-1">{collections.length} collections</p>
                            </div>
                            <div className="max-h-[500px] overflow-y-auto">
                                {collections.length === 0 ? (
                                    <div className="p-4 text-center text-zinc-500 dark:text-zinc-400 text-sm">
                                        No collections found
                                    </div>
                                ) : (
                                    collections.map(collection => (
                                        <button
                                            key={collection.id}
                                            onClick={() => handleSelectCollection(collection)}
                                            className={`w-full text-left px-4 py-3 border-b border-zinc-100 dark:border-zinc-700/50 transition-colors ${
                                                selectedCollection?.id === collection.id
                                                    ? 'bg-blue-50 dark:bg-blue-900/20 border-l-4 border-l-blue-500'
                                                    : 'hover:bg-zinc-50 dark:hover:bg-zinc-700/50'
                                            }`}
                                        >
                                            <div className="font-medium text-zinc-900 dark:text-zinc-50 text-sm">
                                                {collection.displayName}
                                            </div>
                                            <div className="text-xs text-zinc-500 dark:text-zinc-500 mt-0.5">
                                                {collection.slug}
                                            </div>
                                        </button>
                                    ))
                                )}
                            </div>
                        </div>
                    </div>

                    {/* Middle Panel: Items */}
                    <div className="col-span-12 md:col-span-5">
                        <div className="bg-white dark:bg-zinc-800 rounded-xl shadow-sm border border-zinc-200 dark:border-zinc-700 overflow-hidden">
                            <div className="p-4 border-b border-zinc-200 dark:border-zinc-700">
                                <div className="flex items-center justify-between mb-3">
                                    <h2 className="font-semibold text-zinc-900 dark:text-zinc-50">
                                        {selectedCollection ? selectedCollection.displayName : 'Select a Collection'}
                                    </h2>
                                    {items.length > 0 && (
                                        <span className="text-xs text-zinc-500 dark:text-zinc-500">
                                            {selectedItemIds.size}/{items.length} selected
                                        </span>
                                    )}
                                </div>
                                
                                {selectedCollection && (
                                    <div className="flex items-center gap-2">
                                        <input
                                            type="text"
                                            placeholder="Search items..."
                                            value={searchQuery}
                                            onChange={(e) => setSearchQuery(e.target.value)}
                                            className="flex-1 px-3 py-1.5 text-sm border border-zinc-300 dark:border-zinc-600 rounded-lg bg-white dark:bg-zinc-700 text-zinc-900 dark:text-zinc-50 placeholder-zinc-500 focus:outline-none focus:ring-2 focus:ring-blue-500"
                                        />
                                        <button
                                            onClick={toggleAllItems}
                                            className="px-3 py-1.5 text-xs font-medium bg-zinc-100 dark:bg-zinc-700 text-zinc-700 dark:text-zinc-300 rounded-lg hover:bg-zinc-200 dark:hover:bg-zinc-600 transition-colors"
                                        >
                                            {selectedItemIds.size === filteredItems.length ? 'Deselect All' : 'Select All'}
                                        </button>
                                    </div>
                                )}
                            </div>
                            
                            <div className="max-h-[400px] overflow-y-auto">
                                {!selectedCollection ? (
                                    <div className="p-8 text-center text-zinc-500 dark:text-zinc-400">
                                        <svg className="w-12 h-12 mx-auto mb-3 opacity-50" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" />
                                        </svg>
                                        <p className="text-sm">Select a collection to view items</p>
                                    </div>
                                ) : loadingItems ? (
                                    <div className="p-8 text-center">
                                        <div className="inline-block h-6 w-6 animate-spin rounded-full border-2 border-solid border-zinc-400 border-r-transparent"></div>
                                        <p className="mt-2 text-sm text-zinc-500 dark:text-zinc-400">Loading items...</p>
                                    </div>
                                ) : filteredItems.length === 0 ? (
                                    <div className="p-8 text-center text-zinc-500 dark:text-zinc-400 text-sm">
                                        {searchQuery ? 'No items match your search' : 'No items in this collection'}
                                    </div>
                                ) : (
                                    filteredItems.map(item => (
                                        <label
                                            key={item.id}
                                            className={`flex items-center gap-3 px-4 py-3 border-b border-zinc-100 dark:border-zinc-700/50 cursor-pointer transition-colors ${
                                                selectedItemIds.has(item.id)
                                                    ? 'bg-blue-50 dark:bg-blue-900/10'
                                                    : 'hover:bg-zinc-50 dark:hover:bg-zinc-700/50'
                                            }`}
                                        >
                                            <input
                                                type="checkbox"
                                                checked={selectedItemIds.has(item.id)}
                                                onChange={() => toggleItemSelection(item.id)}
                                                className="h-4 w-4 rounded border-zinc-300 dark:border-zinc-600 text-blue-600 focus:ring-blue-500"
                                            />
                                            <div className="flex-1 min-w-0">
                                                <div className="font-medium text-zinc-900 dark:text-zinc-50 text-sm truncate">
                                                    {getItemDisplayName(item)}
                                                </div>
                                                <div className="flex items-center gap-2 mt-0.5">
                                                    {item.isDraft && (
                                                        <span className="px-1.5 py-0.5 text-xs font-medium bg-orange-100 dark:bg-orange-900/30 text-orange-700 dark:text-orange-400 rounded">
                                                            Draft
                                                        </span>
                                                    )}
                                                    <span className="text-xs text-zinc-500 dark:text-zinc-500">
                                                        {new Date(item.lastUpdated).toLocaleDateString()}
                                                    </span>
                                                </div>
                                            </div>
                                        </label>
                                    ))
                                )}
                            </div>
                        </div>
                    </div>

                    {/* Right Panel: Translation Options */}
                    <div className="col-span-12 md:col-span-4">
                        <div className="bg-white dark:bg-zinc-800 rounded-xl shadow-sm border border-zinc-200 dark:border-zinc-700 overflow-hidden sticky top-24">
                            <div className="p-4 border-b border-zinc-200 dark:border-zinc-700">
                                <h2 className="font-semibold text-zinc-900 dark:text-zinc-50">Translation Options</h2>
                            </div>
                            
                            <div className="p-4 space-y-5">
                                {/* Selected Items Summary */}
                                <div>
                                    <div className="text-sm font-medium text-zinc-700 dark:text-zinc-300 mb-2">Selected Items</div>
                                    <div className="text-2xl font-bold text-zinc-900 dark:text-zinc-50">
                                        {selectedItemIds.size}
                                        <span className="text-sm font-normal text-zinc-500 dark:text-zinc-500 ml-1">
                                            item{selectedItemIds.size !== 1 ? 's' : ''}
                                        </span>
                                    </div>
                                </div>

                                {/* Target Locales */}
                                <div>
                                    <div className="flex items-center justify-between mb-2">
                                        <div className="text-sm font-medium text-zinc-700 dark:text-zinc-300">Target Locales</div>
                                        {locales.secondary.length > 0 && (
                                            <div className="text-xs text-zinc-500 dark:text-zinc-500">
                                                {selectedLocaleIds.length}/{locales.secondary.length} selected
                                            </div>
                                        )}
                                    </div>
                                    {locales.secondary.length === 0 ? (
                                        <div className="text-sm text-zinc-500 dark:text-zinc-400">No secondary locales configured</div>
                                    ) : (
                                        <div className="space-y-2 max-h-32 overflow-y-auto">
                                            {locales.secondary.map((loc: any) => {
                                                const id = loc.id || loc.localeId || loc.tag;
                                                const label = loc.displayName || loc.tag || id;
                                                const checked = selectedLocaleIds.includes(id);
                                                return (
                                                    <label key={id} className="flex items-center gap-2 text-sm text-zinc-800 dark:text-zinc-200">
                                                        <input
                                                            type="checkbox"
                                                            checked={checked}
                                                            onChange={(e) => {
                                                                setSelectedLocaleIds(prev => 
                                                                    e.target.checked ? [...prev, id] : prev.filter(x => x !== id)
                                                                );
                                                            }}
                                                            className="h-4 w-4 rounded border-zinc-300 dark:border-zinc-600 text-blue-600 focus:ring-blue-500"
                                                        />
                                                        <span>{label}</span>
                                                    </label>
                                                );
                                            })}
                                        </div>
                                    )}
                                </div>

                                {/* Fields to Translate */}
                                <div>
                                    <div className="flex items-center justify-between mb-2">
                                        <div className="text-sm font-medium text-zinc-700 dark:text-zinc-300">Fields to Translate</div>
                                        {collectionFields.translatable.length > 0 && (
                                            <div className="text-xs text-zinc-500 dark:text-zinc-500">
                                                {selectedFieldSlugs.size}/{collectionFields.translatable.length} selected
                                            </div>
                                        )}
                                    </div>
                                    {collectionFields.translatable.length === 0 ? (
                                        <div className="text-sm text-zinc-500 dark:text-zinc-400">
                                            {selectedCollection ? 'No translatable fields found' : 'Select a collection first'}
                                        </div>
                                    ) : (
                                        <div className="space-y-2 max-h-32 overflow-y-auto">
                                            {collectionFields.translatable.map((field) => (
                                                <label key={field.slug} className="flex items-center gap-2 text-sm text-zinc-800 dark:text-zinc-200">
                                                    <input
                                                        type="checkbox"
                                                        checked={selectedFieldSlugs.has(field.slug)}
                                                        onChange={() => toggleFieldSelection(field.slug)}
                                                        className="h-4 w-4 rounded border-zinc-300 dark:border-zinc-600 text-blue-600 focus:ring-blue-500"
                                                    />
                                                    <span>{field.displayName || field.slug}</span>
                                                    <span className="text-xs text-zinc-500 dark:text-zinc-500">
                                                        ({field.type})
                                                    </span>
                                                </label>
                                            ))}
                                        </div>
                                    )}
                                </div>

                                {/* Translation Options */}
                                <div className="pt-3 border-t border-zinc-200 dark:border-zinc-700">
                                    <div className="text-sm font-medium text-zinc-700 dark:text-zinc-300 mb-2">Additional Options</div>
                                    <label className="flex items-start gap-2 cursor-pointer group">
                                        <input
                                            type="checkbox"
                                            checked={translateSlugs}
                                            onChange={(e) => setTranslateSlugs(e.target.checked)}
                                            className="h-4 w-4 mt-0.5 rounded border-zinc-300 dark:border-zinc-600 text-blue-600 focus:ring-blue-500"
                                        />
                                        <div>
                                            <span className="text-sm text-zinc-800 dark:text-zinc-200 group-hover:text-zinc-900 dark:group-hover:text-zinc-100">
                                                Translate item slugs
                                            </span>
                                            <p className="text-xs text-zinc-500 dark:text-zinc-500 mt-0.5">
                                                URLs will be translated and made URL-safe
                                            </p>
                                        </div>
                                    </label>
                                </div>

                                {/* Translation Progress */}
                                {translationProgress.status !== 'idle' && (
                                    <div className={`p-3 rounded-lg ${
                                        translationProgress.status === 'complete' 
                                            ? 'bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800'
                                            : translationProgress.status === 'error'
                                            ? 'bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800'
                                            : 'bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800'
                                    }`}>
                                        {translationProgress.status === 'translating' && (
                                            <div className="flex items-center gap-2">
                                                <div className="w-4 h-4 border-2 border-blue-600 border-t-transparent rounded-full animate-spin" />
                                                <span className="text-sm text-blue-700 dark:text-blue-400">
                                                    {translationProgress.message}
                                                </span>
                                            </div>
                                        )}
                                        {translationProgress.status === 'complete' && (
                                            <div className="flex items-center gap-2 text-green-700 dark:text-green-400">
                                                <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
                                                    <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                                                </svg>
                                                <span className="text-sm font-medium">{translationProgress.message}</span>
                                            </div>
                                        )}
                                        {translationProgress.status === 'error' && (
                                            <div className="flex items-center gap-2 text-red-700 dark:text-red-400">
                                                <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
                                                    <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd" />
                                                </svg>
                                                <span className="text-sm">{translationProgress.error}</span>
                                            </div>
                                        )}
                                    </div>
                                )}

                                {/* Translate Button */}
                                <button
                                    onClick={handleTranslate}
                                    disabled={
                                        selectedItemIds.size === 0 || 
                                        selectedLocaleIds.length === 0 || 
                                        selectedFieldSlugs.size === 0 ||
                                        translationProgress.status === 'translating'
                                    }
                                    className={`w-full py-3 px-4 rounded-lg font-medium flex items-center justify-center gap-2 transition-all ${
                                        selectedItemIds.size === 0 || 
                                        selectedLocaleIds.length === 0 || 
                                        selectedFieldSlugs.size === 0 ||
                                        translationProgress.status === 'translating'
                                            ? 'bg-zinc-200 dark:bg-zinc-700 text-zinc-400 dark:text-zinc-500 cursor-not-allowed'
                                            : 'bg-gradient-to-r from-blue-500 to-violet-600 text-white hover:from-blue-600 hover:to-violet-700 shadow-lg shadow-blue-500/25'
                                    }`}
                                >
                                    {translationProgress.status === 'translating' ? (
                                        <>
                                            <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                                            Translating...
                                        </>
                                    ) : (
                                        <>
                                            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 5h12M9 3v2m1.048 9.5A18.022 18.022 0 016.412 9m6.088 9h7M11 21l5-10 5 10M12.751 5C11.783 10.77 8.07 15.61 3 18.129" />
                                            </svg>
                                            Translate Selected
                                        </>
                                    )}
                                </button>

                                {/* Helper text */}
                                {(selectedItemIds.size === 0 || selectedLocaleIds.length === 0 || selectedFieldSlugs.size === 0) && (
                                    <p className="text-xs text-zinc-500 dark:text-zinc-500 text-center">
                                        {selectedItemIds.size === 0 && 'Select items to translate'}
                                        {selectedItemIds.size > 0 && selectedLocaleIds.length === 0 && 'Select target locales'}
                                        {selectedItemIds.size > 0 && selectedLocaleIds.length > 0 && selectedFieldSlugs.size === 0 && 'Select fields to translate'}
                                    </p>
                                )}
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
}

