import { createBrowserClient } from '@supabase/ssr'

let clientInstance: ReturnType<typeof createBrowserClient> | null = null;

export function createClient() {
  // Only create client at runtime (not at build time)
  if (typeof window === 'undefined') {
    throw new Error('createClient can only be called on the client side');
  }

  // Return existing instance if available
  if (clientInstance) {
    return clientInstance;
  }

  // Get environment variables at runtime
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!supabaseUrl || !supabaseAnonKey) {
    throw new Error('Missing Supabase environment variables. Please set NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY');
  }

  // Create and cache the client instance
  clientInstance = createBrowserClient(supabaseUrl, supabaseAnonKey);
  
  return clientInstance;
}

