import { createBrowserClient } from '@supabase/ssr'

let clientInstance: ReturnType<typeof createBrowserClient> | null = null;
let configPromise: Promise<{ supabaseUrl: string; supabaseAnonKey: string }> | null = null;

async function getConfig() {
  if (!configPromise) {
    configPromise = (async () => {
      try {
        const basePath = process.env.NEXT_PUBLIC_BASE_PATH || '';
        const response = await fetch(`${basePath}/api/config`);
        if (response.ok) {
          return await response.json();
        }
      } catch (err) {
        console.error('Failed to fetch Supabase config:', err);
      }
      throw new Error('Failed to load Supabase configuration');
    })();
  }
  return configPromise;
}

export async function createClient() {
  // Only create client at runtime (not at build time)
  if (typeof window === 'undefined') {
    throw new Error('createClient can only be called on the client side');
  }

  // Return existing instance if available
  if (clientInstance) {
    console.log('Returning existing Supabase client instance');
    return clientInstance;
  }

  // Get configuration from API (reads server-side env vars at runtime)
  console.log('Fetching Supabase config from /api/config...');
  const { supabaseUrl, supabaseAnonKey } = await getConfig();
  console.log('Supabase config received:', { 
    supabaseUrl, 
    anonKeyLength: supabaseAnonKey?.length 
  });

  if (!supabaseUrl || !supabaseAnonKey) {
    throw new Error('Missing Supabase environment variables. Please set SUPABASE_URL and SUPABASE_ANON_KEY');
  }

  // Create and cache the client instance
  console.log('Creating new Supabase client instance...');
  clientInstance = createBrowserClient(supabaseUrl, supabaseAnonKey);
  console.log('Supabase client created successfully');
  
  return clientInstance;
}

