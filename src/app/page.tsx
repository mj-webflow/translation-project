"use client";
import Image from "next/image";
import Link from "next/link";

export default function Home() {
  const handleViewPages = async (e: React.MouseEvent<HTMLAnchorElement>) => {
    e.preventDefault();
    try {
      const resp = await fetch('/api/webflow/locales', { cache: 'no-store' });
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
      window.location.href = '/pages';
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-zinc-50 font-sans dark:bg-black">
      <main className="flex min-h-screen w-full max-w-3xl flex-col items-center justify-between py-32 px-16 bg-white dark:bg-black sm:items-start">
        <Image
          className="dark:invert"
          src="/next.svg"
          alt="Next.js logo"
          width={100}
          height={20}
          priority
        />
        <div className="flex flex-col items-center gap-6 text-center sm:items-start sm:text-left">
          <h1 className="max-w-xs text-3xl font-semibold leading-10 tracking-tight text-black dark:text-zinc-50">
            Webflow Translation Project
          </h1>
          <p className="max-w-md text-lg leading-8 text-zinc-600 dark:text-zinc-400">
            Manage and translate your Webflow site content with ease.
          </p>
        </div>
        <div className="flex flex-col gap-4 text-base font-medium sm:flex-row">
          <Link
            className="flex h-12 w-full items-center justify-center gap-2 rounded-full bg-foreground px-5 text-background transition-colors hover:bg-[#383838] dark:hover:bg-[#ccc] md:w-[200px]"
            href="/pages"
            onClick={handleViewPages}
          >
            View Webflow Pages
          </Link>
          <a
            className="flex h-12 w-full items-center justify-center rounded-full border border-solid border-black/[.08] px-5 transition-colors hover:border-transparent hover:bg-black/[.04] dark:border-white/[.145] dark:hover:bg-[#1a1a1a] md:w-[200px]"
            href="https://nextjs.org/docs"
            target="_blank"
            rel="noopener noreferrer"
          >
            Documentation
          </a>
        </div>
      </main>
    </div>
  );
}
