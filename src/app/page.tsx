"use client";
import Image from "next/image";
import Link from "next/link";
import * as React from 'react';

export default function Home() {
  const [siteId, setSiteId] = React.useState('');
  const [apiKey, setApiKey] = React.useState('');

  const handleViewPages = async (e: React.MouseEvent<HTMLAnchorElement>) => {
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
        <Image
          className=""
          src="/Favicon_64px_Light.svg"
          alt="Webflow logo"
          width={100}
          height={20}
          priority
        />
        <div className="flex flex-col items-center gap-6 mt-6 text-center sm:items-start sm:text-left">
          <h1 className="max-w-xs text-3xl font-semibold leading-10 tracking-tight text-black dark:text-zinc-50">
            Webflow Translation Project
          </h1>
          <p className="max-w-md text-lg leading-8 text-zinc-600 dark:text-zinc-400">
            Manage and translate your Webflow site content with ease.
          </p>
          <div className="w-full grid grid-cols-1 gap-3 mt-2">
            <input
              type="text"
              placeholder="Webflow Site ID"
              value={siteId}
              onChange={(e) => setSiteId(e.target.value)}
              className="w-full px-4 py-2 border border-zinc-300 dark:border-zinc-600 rounded-lg bg-white dark:bg-zinc-700 text-zinc-900 dark:text-zinc-50 placeholder-zinc-500 dark:placeholder-zinc-400 focus:outline-none focus:ring-2 focus:ring-zinc-900 dark:focus:ring-zinc-50"
            />
            <input
              type="password"
              placeholder="Webflow API Token"
              value={apiKey}
              onChange={(e) => setApiKey(e.target.value)}
              className="w-full px-4 py-2 border border-zinc-300 dark:border-zinc-600 rounded-lg bg-white dark:bg-zinc-700 text-zinc-900 dark:text-zinc-50 placeholder-zinc-500 dark:placeholder-zinc-400 focus:outline-none focus:ring-2 focus:ring-zinc-900 dark:focus:ring-zinc-50"
            />
          </div>
        </div>
        <div className="flex flex-col gap-4 text-base font-medium sm:flex-row">
          <button
            className="flex h-12 w-full items-center justify-center gap-2 rounded-full bg-foreground px-5 text-background transition-colors hover:bg-[#383838] dark:hover:bg-[#ccc] md:w-[200px] cursor-pointer"
            onClick={(e) => handleViewPages(e as any)}
          >
            View Webflow Pages
          </button>
        </div>
      </main>
    </div>
  );
}
