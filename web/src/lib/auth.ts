import { NextResponse } from 'next/server'
import type { User } from '@supabase/supabase-js'
import { createServerSupabase } from './supabase-server'

export type MemberRole = 'admin' | 'member'

export interface AuthContext {
  user: User
  profile: { id: string; company_id: string | null; role: MemberRole }
}

export type AuthResult =
  | { ok: true; context: AuthContext }
  | { ok: false; response: NextResponse }

// Every API route calls this BEFORE doing any work:
//   401 when there is no valid session (authentication),
//   403 when the session is not an admin of the company (authorization).
// Reads go through the user's own Supabase client, so RLS is enforced on the way
// in rather than being re-implemented in TypeScript.
export async function requireAdmin(): Promise<AuthResult> {
  const supabase = createServerSupabase()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    return { ok: false, response: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }) }
  }

  const { data: profile, error } = await supabase
    .from('profiles')
    .select('id, company_id, role')
    .eq('id', user.id)
    .single()

  if (error || !profile) {
    return { ok: false, response: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }) }
  }

  if (profile.role !== 'admin') {
    return { ok: false, response: NextResponse.json({ error: 'Admins only' }, { status: 403 }) }
  }

  if (!profile.company_id) {
    return {
      ok: false,
      response: NextResponse.json({ error: 'No company is attached to this account' }, { status: 400 }),
    }
  }

  return { ok: true, context: { user, profile: profile as AuthContext['profile'] } }
}

// Same as above but any company member is allowed.
export async function requireUser(): Promise<AuthResult> {
  const supabase = createServerSupabase()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    return { ok: false, response: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }) }
  }

  const { data: profile, error } = await supabase
    .from('profiles')
    .select('id, company_id, role')
    .eq('id', user.id)
    .single()

  if (error || !profile) {
    return { ok: false, response: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }) }
  }

  return { ok: true, context: { user, profile: profile as AuthContext['profile'] } }
}

export function getClientIp(req: Request): string {
  const forwarded = req.headers.get('x-forwarded-for')
  if (forwarded) return forwarded.split(',')[0].trim()
  return req.headers.get('x-real-ip') || 'unknown'
}