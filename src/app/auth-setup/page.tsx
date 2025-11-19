"use client";

import { useState, useEffect } from 'react';
import Image from "next/image";

export default function AuthSetupPage() {
  const [supabaseUrl, setSupabaseUrl] = useState('');
  const [supabaseKey, setSupabaseKey] = useState('');
  const [error, setError] = useState('');

  useEffect(() => {
    // Load existing credentials from localStorage
    if (typeof window !== 'undefined') {
      const storedUrl = localStorage.getItem('supabase_url') || '';
      const storedKey = localStorage.getItem('supabase_anon_key') || '';
      if (storedUrl) setSupabaseUrl(storedUrl);
      if (storedKey) setSupabaseKey(storedKey);
    }
  }, []);

  const handleContinue = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    // Validate inputs
    if (!supabaseUrl || !supabaseKey) {
      setError('Please enter both Supabase URL and Anon Key');
      return;
    }

    if (!supabaseUrl.startsWith('https://') || !supabaseUrl.includes('.supabase.co')) {
      setError('Invalid Supabase URL format. Should be: https://xxxxx.supabase.co');
      return;
    }

    if (!supabaseKey.startsWith('eyJ')) {
      setError('Invalid Supabase Anon Key format. Should start with: eyJ...');
      return;
    }

    try {
      // Store credentials
      if (typeof window !== 'undefined') {
        localStorage.setItem('supabase_url', supabaseUrl);
        localStorage.setItem('supabase_anon_key', supabaseKey);
      }

      // Test the connection
      const testResponse = await fetch(`${supabaseUrl}/auth/v1/health`, {
        headers: {
          'apikey': supabaseKey,
        },
      });

      if (!testResponse.ok) {
        setError('Failed to connect to Supabase. Please check your credentials.');
        return;
      }

      // Redirect to login
      const basePath = process.env.NEXT_PUBLIC_BASE_PATH || '';
      window.location.href = `${basePath}/login`;
    } catch (err) {
      console.error('Supabase connection error:', err);
      setError('Failed to connect to Supabase. Please check your credentials.');
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

        <div className="flex flex-col items-center gap-6 mt-6 text-center sm:items-start sm:text-left w-full">
          <h1 className="max-w-xs text-3xl font-semibold leading-10 tracking-tight text-black dark:text-zinc-50">
            Supabase Configuration
          </h1>
          <p className="max-w-md text-lg leading-8 text-zinc-600 dark:text-zinc-400">
            Enter your Supabase project credentials to enable authentication.
          </p>

          {error && (
            <div className="w-full p-3 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg">
              <p className="text-sm text-red-600 dark:text-red-400">{error}</p>
            </div>
          )}

          <form onSubmit={handleContinue} className="w-full grid grid-cols-1 gap-4 mt-2">
            <div>
              <label htmlFor="supabaseUrl" className="block text-sm font-medium text-zinc-700 dark:text-zinc-300 mb-1">
                Supabase Project URL
              </label>
              <input
                id="supabaseUrl"
                type="url"
                placeholder="https://xxxxx.supabase.co"
                value={supabaseUrl}
                onChange={(e) => setSupabaseUrl(e.target.value)}
                required
                className="w-full px-4 py-2 border border-zinc-300 dark:border-zinc-600 rounded-lg bg-white dark:bg-zinc-700 text-zinc-900 dark:text-zinc-50 placeholder-zinc-500 dark:placeholder-zinc-400 focus:outline-none focus:ring-2 focus:ring-blue-500 font-mono text-sm"
              />
              <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">
                Found in: Supabase Dashboard → Settings → API → Project URL
              </p>
            </div>

            <div>
              <label htmlFor="supabaseKey" className="block text-sm font-medium text-zinc-700 dark:text-zinc-300 mb-1">
                Supabase Anon Key
              </label>
              <textarea
                id="supabaseKey"
                placeholder="eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
                value={supabaseKey}
                onChange={(e) => setSupabaseKey(e.target.value)}
                required
                rows={3}
                className="w-full px-4 py-2 border border-zinc-300 dark:border-zinc-600 rounded-lg bg-white dark:bg-zinc-700 text-zinc-900 dark:text-zinc-50 placeholder-zinc-500 dark:placeholder-zinc-400 focus:outline-none focus:ring-2 focus:ring-blue-500 font-mono text-xs"
              />
              <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">
                Found in: Supabase Dashboard → Settings → API → Project API keys → anon/public
              </p>
            </div>

            <button
              type="submit"
              className="flex h-12 w-full items-center justify-center gap-2 rounded-lg bg-blue-600 hover:bg-blue-700 px-5 text-white transition-colors font-medium mt-2"
            >
              Continue to Login
            </button>
          </form>

          <div className="mt-4 p-4 bg-blue-50 dark:bg-blue-900/20 rounded-lg border border-blue-200 dark:border-blue-800 w-full">
            <p className="text-xs text-blue-900 dark:text-blue-200">
              <strong>💡 First time setup?</strong>
              <br />
              1. Create a Supabase project at <a href="https://supabase.com" target="_blank" rel="noopener noreferrer" className="underline">supabase.com</a>
              <br />
              2. Copy your Project URL and anon key from Settings → API
              <br />
              3. Enter them above to continue
            </p>
          </div>

          <div className="mt-2 p-4 bg-zinc-50 dark:bg-zinc-900 rounded-lg border border-zinc-200 dark:border-zinc-700 w-full">
            <p className="text-xs text-zinc-600 dark:text-zinc-400">
              <strong>🔒 Security Note:</strong> Your Supabase credentials are stored locally in your browser and are not sent to any external servers except Supabase.
            </p>
          </div>
        </div>
        <div className="flex flex-col gap-4 text-base font-medium sm:flex-row">
        </div>
      </main>
    </div>
  );
}

