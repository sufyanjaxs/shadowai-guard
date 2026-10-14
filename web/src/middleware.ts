import { NextResponse, type NextRequest } from 'next/server'
import { createServerClient, type CookieOptions } from '@supabase/ssr'

// Two jobs, in this order:
//   1. Security headers on every response (one place, so no route can forget).
//   2. Authentication gate for /dashboard — the redirect happens in middleware,
//      i.e. before any dashboard component or API handler runs.

function buildCsp(): string {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || ''
  const supabaseOrigin = supabaseUrl ? new URL(supabaseUrl).origin : ''
  const supabaseWs = supabaseOrigin ? supabaseOrigin.replace(/^http/, 'ws') : ''

  const connect = ["'self'", supabaseOrigin, supabaseWs, 'https://api.stripe.com']
    .filter(Boolean)
    .join(' ')

  return [
    "default-src 'self'",
    // A nonce-based policy ('strict-dynamic' + nonce) is not usable here: Next
    // only stamps a nonce on DYNAMICALLY rendered routes, and this app
    // prerenders its pages, so the bootstrap scripts would ship without one and
    // every page would break. 'self' + 'unsafe-inline' with an explicit origin
    // allowlist elsewhere is the strongest policy this app can actually honour.
    // Nothing renders user-supplied HTML, so there is no inline-script sink.
    `script-src 'self' 'unsafe-inline'${
      process.env.NODE_ENV === 'production' ? '' : " 'unsafe-eval'"
    } https://js.stripe.com`,
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: blob:",
    "font-src 'self' data:",
    `connect-src ${connect}`,
    "frame-src https://js.stripe.com https://hooks.stripe.com",
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "frame-ancestors 'none'",
    ...(process.env.NODE_ENV === 'production' ? ['upgrade-insecure-requests'] : []),
  ].join('; ')
}

export async function middleware(req: NextRequest) {
  const csp = buildCsp()

  // Cookies written by the session refresh, replayed onto the final response.
  const refreshedCookies: { name: string; value: string; options: CookieOptions }[] = []

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return req.cookies.getAll()
        },
        setAll(cookiesToSet: { name: string; value: string; options: CookieOptions }[]) {
          cookiesToSet.forEach(({ name, value }) => req.cookies.set(name, value))
          refreshedCookies.push(...cookiesToSet)
        },
      },
    }
  )

  const { pathname } = req.nextUrl
  const isProtected = pathname === '/dashboard' || pathname.startsWith('/dashboard/')
  const isAuthPage = pathname === '/login' || pathname === '/signup'

  // getUser() validates the token against Supabase (it does not trust the cookie
  // alone). Pages that need no session skip the round trip entirely.
  let user: { id: string } | null = null
  if (isProtected || isAuthPage) {
    const { data } = await supabase.auth.getUser()
    user = data.user
  }

  if (isProtected && !user) {
    const loginUrl = req.nextUrl.clone()
    loginUrl.pathname = '/login'
    loginUrl.search = ''
    loginUrl.searchParams.set('next', pathname)
    const redirect = NextResponse.redirect(loginUrl)
    redirect.headers.set('Content-Security-Policy', csp)
    redirect.headers.set('X-Frame-Options', 'DENY')
    redirect.headers.set('X-Content-Type-Options', 'nosniff')
    refreshedCookies.forEach(({ name, value, options }) => redirect.cookies.set(name, value, options))
    return redirect
  }

  if (isAuthPage && user) {
    const dashUrl = req.nextUrl.clone()
    dashUrl.pathname = '/dashboard'
    dashUrl.search = ''
    const redirect = NextResponse.redirect(dashUrl)
    redirect.headers.set('Content-Security-Policy', csp)
    redirect.headers.set('X-Frame-Options', 'DENY')
    refreshedCookies.forEach(({ name, value, options }) => redirect.cookies.set(name, value, options))
    return redirect
  }

  // Nothing is rendered from user input, but the policy is still forwarded to
  // Next so that any server component can read it if it needs to.
  const requestHeaders = new Headers(req.headers)
  requestHeaders.set('Content-Security-Policy', csp)

  const res = NextResponse.next({ request: { headers: requestHeaders } })
  refreshedCookies.forEach(({ name, value, options }) => res.cookies.set(name, value, options))

  res.headers.set('Content-Security-Policy', csp)
  res.headers.set('Strict-Transport-Security', 'max-age=31536000; includeSubDomains')
  res.headers.set('X-Frame-Options', 'DENY')
  res.headers.set('X-Content-Type-Options', 'nosniff')
  res.headers.set('Referrer-Policy', 'strict-origin-when-cross-origin')
  res.headers.set('X-DNS-Prefetch-Control', 'off')
  res.headers.set('Cross-Origin-Opener-Policy', 'same-origin')
  res.headers.set('Permissions-Policy', 'camera=(), microphone=(), geolocation=()')

  return res
}

export const config = {
  // Everything except static assets and image optimisation.
  matcher: ['/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico|css|js|map)$).*)'],
}