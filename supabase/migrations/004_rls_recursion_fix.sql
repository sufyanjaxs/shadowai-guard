-- ==========================================
-- SHADOWAI GUARD - RLS RECURSION FIX
-- ==========================================
-- 001_init.sql expressed "is this user an admin of this company?" by querying
-- public.profiles from inside a policy on public.profiles. Postgres refuses that
-- outright — every query against the table dies with
--   42P17: infinite recursion detected in policy for relation "profiles"
-- so the dashboard could never have loaded a team, a policy, or an event.
--
-- Fix: two SECURITY DEFINER helpers that read the caller's own profile while
-- bypassing RLS (no recursion, because the policy is no longer inside the rule),
-- and every policy rewritten to call them. Same semantics, no recursion.

create or replace function public.current_company_id()
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select company_id from public.profiles where id = auth.uid()
$$;

create or replace function public.is_company_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.profiles
    where id = auth.uid() and role = 'admin' and company_id is not null
  )
$$;

revoke all on function public.current_company_id() from public, anon;
revoke all on function public.is_company_admin() from public, anon;
-- anon is granted execute as well: policy expressions are evaluated as the
-- caller's role, and a logged-out request is evaluated as anon. Both helpers
-- only ever report auth.uid()'s own company, so anon (auth.uid() = null) simply
-- gets NULL back and matches no rows.
grant execute on function public.current_company_id() to anon, authenticated, service_role;
grant execute on function public.is_company_admin() to anon, authenticated, service_role;

-- Profiles -----------------------------------------------------------------
drop policy if exists "Users can view own profile" on public.profiles;
drop policy if exists "Admins can view company profiles" on public.profiles;

create policy "Users can view own profile"
  on public.profiles for select using (id = auth.uid());

create policy "Admins can view company profiles"
  on public.profiles for select using (
    public.is_company_admin() and company_id = public.current_company_id()
  );

-- Companies ----------------------------------------------------------------
drop policy if exists "Users can view own company" on public.companies;

create policy "Users can view own company"
  on public.companies for select using (id = public.current_company_id());

-- Policies -----------------------------------------------------------------
drop policy if exists "Members can read policies" on public.policies;
drop policy if exists "Admins can manage policies" on public.policies;

create policy "Members can read policies"
  on public.policies for select using (company_id = public.current_company_id());

create policy "Admins can manage policies"
  on public.policies for all
  using (company_id = public.current_company_id() and public.is_company_admin())
  with check (company_id = public.current_company_id() and public.is_company_admin());

-- Events -------------------------------------------------------------------
drop policy if exists "Users can insert company events" on public.events;
drop policy if exists "Admins can read company events" on public.events;

create policy "Users can insert company events"
  on public.events for insert with check (company_id = public.current_company_id());

create policy "Admins can read company events"
  on public.events for select using (
    company_id = public.current_company_id() and public.is_company_admin()
  );

-- Invites ------------------------------------------------------------------
drop policy if exists "Admins can manage invites" on public.invites;

create policy "Admins can manage invites"
  on public.invites for all
  using (company_id = public.current_company_id() and public.is_company_admin())
  with check (company_id = public.current_company_id() and public.is_company_admin());

-- Subscriptions ------------------------------------------------------------
drop policy if exists "Admins can read subscriptions" on public.subscriptions;

create policy "Admins can read subscriptions"
  on public.subscriptions for select using (
    company_id = public.current_company_id() and public.is_company_admin()
  );