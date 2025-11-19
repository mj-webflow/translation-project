// Supabase configuration for Webflow Cloud deployment
// These values are safe to expose in client-side code (anon key is designed to be public)

// For local development, use environment variables
// For Webflow Cloud production, hardcode the values here
export const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://yuhbcbgszlzqwwooofxa.supabase.co';
export const SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || 'eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inl1aGJjYmdzemx6cXd3b29vZnhhIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjM1MDI1NjUsImV4cCI6MjA3OTA3ODU2NX0;

// Validate configuration
if (SUPABASE_URL === 'https://yuhbcbgszlzqwwooofxa.supabase.co' || SUPABASE_ANON_KEY === 'eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inl1aGJjYmdzemx6cXd3b29vZnhhIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjM1MDI1NjUsImV4cCI6MjA3OTA3ODU2NX0') {
  console.warn('⚠️  Supabase configuration not set. Please update src/lib/supabase-config.ts with your Supabase credentials.');
}

