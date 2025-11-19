// Supabase configuration for Webflow Cloud deployment
// These values are safe to expose in client-side code (anon key is designed to be public)

// For local development, use environment variables
// For Webflow Cloud production, hardcode the values here
export const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://yuhbcbgszlzqwwooofxa.supabase.co';
export const SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inl1aGJjYmdzemx6cXd3b29vZnhhIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjM1MDI1NjUsImV4cCI6MjA3OTA3ODU2NX0._B2BpsbAm3k8PdTBhTgQTfDNDMa4g_NfaCmle3Yymkk';

// Validate configuration
if (SUPABASE_ANON_KEY.includes('YOUR_SIGNATURE_HERE')) {
  console.warn('⚠️  Supabase configuration incomplete. Please update src/lib/supabase-config.ts with your complete Supabase anon key.');
}

