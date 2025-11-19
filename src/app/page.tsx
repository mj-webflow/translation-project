"use client";
import { useEffect } from 'react';

export default function Home() {
  useEffect(() => {
    // TEMP: Redirect directly to setup (bypassing auth)
    // TODO: Re-enable auth by changing this back to /login
    const basePath = process.env.NEXT_PUBLIC_BASE_PATH || '';
    window.location.href = `${basePath}/setup`;
  }, []);

  return (
    <div className="flex min-h-screen items-center justify-center bg-zinc-50 font-sans dark:bg-black">
      <div className="text-center">
        <div className="w-8 h-8 border-4 border-blue-600 border-t-transparent rounded-full animate-spin mx-auto mb-4" />
        <p className="text-zinc-600 dark:text-zinc-400">Redirecting to setup...</p>
      </div>
    </div>
  );
}
