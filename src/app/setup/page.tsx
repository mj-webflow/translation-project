"use client";
import Image from "next/image";
import * as React from 'react';
import { createClient } from '@/lib/supabase';

export default function SetupPage() {
  const [siteId, setSiteId] = React.useState('');
  const [apiKey, setApiKey] = React.useState('');
  const [userEmail, setUserEmail] = React.useState('');
  
  const supabase = createClient();

  React.useEffect(() => {
    // Get user info
    supabase.auth.getUser().then(({ data: { user } }) => {
      if (user?.email) {
        setUserEmail(user.email);
      }
    });

    // Load existing credentials from localStorage
    if (typeof window !== 'undefined') {
      const storedSiteId = localStorage.getItem('webflow_site_id') || '';
      const storedToken = localStorage.getItem('webflow_api_token') || '';
      if (storedSiteId) setSiteId(storedSiteId);
      if (storedToken) setApiKey(storedToken);
    }
  }, [supabase.auth]);

  const handleLogout = async () => {
    await supabase.auth.signOut();
    const basePath = process.env.NEXT_PUBLIC_BASE_PATH || '';
    window.location.href = `${basePath}/login`;
  };

  const handleContinue = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      if (typeof window !== 'undefined') {
        if (siteId) localStorage.setItem('webflow_site_id', siteId);
        if (apiKey) localStorage.setItem('webflow_api_token', apiKey);
      }

      const effectiveSiteId = siteId || (typeof window !== 'undefined' ? localStorage.getItem('webflow_site_id') || '' : '');
      const effectiveToken = apiKey || (typeof window !== 'undefined' ? localStorage.getItem('webflow_api_token') || '' : '');

      const basePath = process.env.NEXT_PUBLIC_BASE_PATH || '';
      const resp = await fetch(`${basePath}/api/webflow/locales?siteId=${encodeURIComponent(effectiveSiteId)}`, {
        cache: 'no-store',
        headers: effectiveToken ? { 'x-webflow-token': effectiveToken } : {},
      });
      if (resp.ok) {
        const locales = await resp.json();
        // store locally (localStorage) and log
        if (typeof window !== 'undefined') {
          localStorage.setItem('webflow_locales', JSON.stringify(locales));
        }
        console.log('Locales loaded:', locales);
      } else {
        console.warn('Failed to load locales');
      }
    } catch (err) {
      console.error('Error loading locales', err);
    } finally {
      const basePath = process.env.NEXT_PUBLIC_BASE_PATH || '';
      window.location.href = `${basePath}/pages`;
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-zinc-50 font-sans dark:bg-black">
      <main className="flex min-h-screen w-full max-w-3xl flex-col items-center justify-between py-32 px-16 bg-white dark:bg-black sm:items-start">
        <div className="w-full flex items-center justify-between mb-8">
          <Image
            className=""
            src="/Favicon_64px_Light.svg"
            alt="Webflow logo"
            width={100}
            height={20}
            priority
          />
          <div className="flex items-center gap-4">
            {userEmail && (
              <div className="text-right">
                <div className="text-xs text-zinc-600 dark:text-zinc-400">Signed in as</div>
                <div className="text-sm font-medium text-zinc-900 dark:text-zinc-50">{userEmail}</div>
              </div>
            )}
            <button
              onClick={handleLogout}
              className="px-3 py-1.5 bg-zinc-200 dark:bg-zinc-700 text-zinc-900 dark:text-zinc-50 rounded-lg hover:bg-zinc-300 dark:hover:bg-zinc-600 transition-colors text-sm"
            >
              Sign Out
            </button>
          </div>
        </div>

        <div className="flex flex-col items-center gap-6 mt-6 text-center sm:items-start sm:text-left">
          <h1 className="max-w-xs text-3xl font-semibold leading-10 tracking-tight text-black dark:text-zinc-50">
            Webflow Configuration
          </h1>
          <p className="max-w-md text-lg leading-8 text-zinc-600 dark:text-zinc-400">
            Enter your Webflow Site ID and API Token to get started with translations.
          </p>
          <form onSubmit={handleContinue} className="w-full grid grid-cols-1 gap-3 mt-2">
            <div>
              <label htmlFor="siteId" className="block text-sm font-medium text-zinc-700 dark:text-zinc-300 mb-1">
                Webflow Site ID
              </label>
              <input
                id="siteId"
                type="text"
                placeholder="Enter your Webflow Site ID"
                value={siteId}
                onChange={(e) => setSiteId(e.target.value)}
                required
                className="w-full px-4 py-2 border border-zinc-300 dark:border-zinc-600 rounded-lg bg-white dark:bg-zinc-700 text-zinc-900 dark:text-zinc-50 placeholder-zinc-500 dark:placeholder-zinc-400 focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
            <div>
              <label htmlFor="apiKey" className="block text-sm font-medium text-zinc-700 dark:text-zinc-300 mb-1">
                Webflow API Token
              </label>
              <input
                id="apiKey"
                type="password"
                placeholder="Enter your Webflow API Token"
                value={apiKey}
                onChange={(e) => setApiKey(e.target.value)}
                required
                className="w-full px-4 py-2 border border-zinc-300 dark:border-zinc-600 rounded-lg bg-white dark:bg-zinc-700 text-zinc-900 dark:text-zinc-50 placeholder-zinc-500 dark:placeholder-zinc-400 focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
            <button
              type="submit"
              className="flex h-12 w-full items-center justify-center gap-2 rounded-lg bg-blue-600 hover:bg-blue-700 px-5 text-white transition-colors font-medium mt-2"
            >
              Continue to Pages
            </button>
          </form>
          
          <div className="mt-4 p-4 bg-zinc-50 dark:bg-zinc-900 rounded-lg border border-zinc-200 dark:border-zinc-700 w-full">
            <p className="text-xs text-zinc-600 dark:text-zinc-400">
              <strong>Note:</strong> Your Webflow credentials are stored locally in your browser and are not sent to any external servers except Webflow's API.
            </p>
          </div>
        </div>
        <div className="flex flex-col gap-4 text-base font-medium sm:flex-row">
        </div>
      </main>
    </div>
  );
}

