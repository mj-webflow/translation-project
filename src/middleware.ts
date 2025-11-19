import { createServerClient, type CookieOptions } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'

export async function middleware(request: NextRequest) {
  let response = NextResponse.next({
    request: {
      headers: request.headers,
    },
  })

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
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

  // Only log actual page requests (not assets, DevTools, etc.)
  if (!pathname.includes('.well-known') && !pathname.includes('_next') && !pathname.match(/\.(ico|svg|png|jpg|jpeg|gif|webp)$/)) {
    console.log('Middleware:', { pathname, user: !!user, basePath })
  }

  // Redirect unauthenticated users from root to login
  if (!user && pathname === '/') {
    console.log('Redirecting to login (not authenticated, on root)')
    return NextResponse.redirect(new URL(`${basePath}/login`, request.url))
  }

  // Protect /setup, /pages and /api/webflow routes
  if (!user && (pathname.startsWith('/setup') || pathname.startsWith('/pages') || pathname.startsWith('/api/webflow'))) {
    console.log('Redirecting to login (not authenticated, protected route)')
    return NextResponse.redirect(new URL(`${basePath}/login`, request.url))
  }

  // Redirect to /setup if already logged in and trying to access root or login
  if (user && (pathname === '/' || pathname === basePath || pathname === `${basePath}/` || pathname.startsWith('/login'))) {
    console.log('Redirecting to setup (authenticated user on root/login)')
    return NextResponse.redirect(new URL(`${basePath}/setup`, request.url))
  }

  return response
}

export const config = {
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
}

