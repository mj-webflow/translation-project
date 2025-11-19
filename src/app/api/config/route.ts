import { NextResponse } from 'next/server';

// This API route exposes Supabase config at runtime
// Server-side env vars are read when the request is made (not at build time)
export async function GET() {
  const supabaseUrl = process.env.SUPABASE_URL || '';
  const supabaseAnonKey = process.env.SUPABASE_ANON_KEY || '';

  return NextResponse.json({
    supabaseUrl,
    supabaseAnonKey,
  });
}

// Force dynamic rendering so env vars are read at runtime
export const dynamic = 'force-dynamic';

