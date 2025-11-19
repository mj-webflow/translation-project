// Supabase configuration for Webflow Cloud deployment
// These values are safe to expose in client-side code (anon key is designed to be public)

// For local development, use environment variables
// For Webflow Cloud production, hardcode the values here
export const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || 'YOUR_SUPABASE_URL_HERE';
export const SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || 'YOUR_SUPABASE_ANON_KEY_HERE';

// Validate configuration
if (SUPABASE_URL === 'YOUR_SUPABASE_URL_HERE' || SUPABASE_ANON_KEY === 'YOUR_SUPABASE_ANON_KEY_HERE') {
  console.warn('⚠️  Supabase configuration not set. Please update src/lib/supabase-config.ts with your Supabase credentials.');
}

