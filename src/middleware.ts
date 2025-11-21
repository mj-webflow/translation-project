import { createServerClient, type CookieOptions } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'

export async function middleware(request: NextRequest) {
  let response = NextResponse.next({
    request: {
      headers: request.headers,
    },
  })

  // Get environment variables at runtime (server-side only)
  const supabaseUrl = process.env.SUPABASE_URL;
  const supabaseAnonKey = process.env.SUPABASE_ANON_KEY;

  if (!supabaseUrl || !supabaseAnonKey) {
    // If Supabase is not configured, allow access to all routes
    // This allows the app to build without Supabase credentials
    console.warn('Supabase credentials not configured. Authentication is disabled.');
    return response;
  }

  const supabase = createServerClient(
    supabaseUrl,
    supabaseAnonKey,
    {
      cookies: {
        get(name: string) {
          return request.cookies.get(name)?.value
        },
        set(name: string, value: string, options: CookieOptions) {
          request.cookies.set({
            name,
            value,
            ...options,
          })
          response = NextResponse.next({
            request: {
              headers: request.headers,
            },
          })
          response.cookies.set({
            name,
            value,
            ...options,
          })
        },
        remove(name: string, options: CookieOptions) {
          request.cookies.set({
            name,
            value: '',
            ...options,
          })
          response = NextResponse.next({
            request: {
              headers: request.headers,
            },
          })
          response.cookies.set({
            name,
            value: '',
            ...options,
          })
        },
      },
    }
  )

  const { data: { user } } = await supabase.auth.getUser()

  const basePath = process.env.NEXT_PUBLIC_BASE_PATH || ''
  const pathname = request.nextUrl.pathname

  // Protect /setup, /pages and /api/webflow routes
  if (!user && (pathname.startsWith('/setup') || pathname.startsWith('/pages') || pathname.startsWith('/api/webflow'))) {
    return NextResponse.redirect(new URL(`${basePath}/login`, request.url))
  }

  // Redirect to /setup if already logged in and trying to access root or login
  if (user && (pathname === '/' || pathname === basePath || pathname === `${basePath}/` || pathname.startsWith('/login'))) {
    return NextResponse.redirect(new URL(`${basePath}/setup`, request.url))
  }

  return response
}

export const config = {
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
}

