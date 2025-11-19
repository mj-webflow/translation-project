import { createBrowserClient } from '@supabase/ssr'

export function createClient() {
  // Try to get credentials from localStorage first (runtime config)
  const supabaseUrl = typeof window !== 'undefined' 
    ? localStorage.getItem('supabase_url') || process.env.NEXT_PUBLIC_SUPABASE_URL
    : process.env.NEXT_PUBLIC_SUPABASE_URL;
    
  const supabaseKey = typeof window !== 'undefined'
    ? localStorage.getItem('supabase_anon_key') || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
    : process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!supabaseUrl || !supabaseKey) {
    throw new Error('Supabase credentials not configured. Please visit /auth-setup to configure.');
  }

  return createBrowserClient(supabaseUrl, supabaseKey)
}

export function hasSupabaseCredentials(): boolean {
  if (typeof window === 'undefined') {
    return !!(process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY);
  }
  
  const hasLocalStorage = !!(localStorage.getItem('supabase_url') && localStorage.getItem('supabase_anon_key'));
  const hasEnvVars = !!(process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY);
  
  return hasLocalStorage || hasEnvVars;
}

