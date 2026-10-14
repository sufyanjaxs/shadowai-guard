-- ==========================================
-- SHADOWAI GUARD - HARDENING (server-side state that must survive serverless)
-- ==========================================
-- Closes the "known issues" from CHANGES_FROM_CHAT.md:
--   * in-memory rate limiter  -> fixed-window counters in Postgres
--   * Math.random() invites   -> single-use, expiring, atomic claim
--   * no idempotency key      -> every Stripe event id is recorded once
-- Run AFTER 001_init.sql and 002_seat_limit.sql.

-- 1. RATE LIMITING -----------------------------------------------------------
-- One row per (endpoint, identifier) with a fixed window. The whole check-and-
-- increment is a single atomic upsert, so concurrent requests from the same IP
-- on different serverless instances cannot both slip past the limit.
create table if not exists public.rate_limits (
  key text primary key,
  count int not null default 0,
  reset_at timestamp with time zone not null default (timezone('utc'::text, now()))
);

alter table public.rate_limits enable row level security;
-- No policies on purpose: deny-by-default for anon/authenticated. Only the
-- service role and the SECURITY DEFINER function below can touch these rows.

create or replace function public.check_rate_limit(
  p_key text,
  p_limit int,
  p_window_seconds int
) returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_count int;
begin
  if p_key is null or p_limit < 1 or p_window_seconds < 1 then
    return false;
  end if;

  insert into public.rate_limits as r (key, count, reset_at)
  values (p_key, 1, now() + make_interval(secs => p_window_seconds))
  on conflict (key) do update
    set count = case
          when r.reset_at <= now() then 1
          else r.count + 1
        end,
        reset_at = case
          when r.reset_at <= now() then now() + make_interval(secs => p_window_seconds)
          else r.reset_at
        end
  returning count into v_count;

  -- Kept for a while so the table cannot grow without bound.
  delete from public.rate_limits where reset_at < now() - interval '1 day';

  return v_count <= p_limit;
end;
$$;

revoke execute on function public.check_rate_limit(text, int, int) from public, anon;
grant execute on function public.check_rate_limit(text, int, int) to service_role;

-- 2. INVITES: auditable, single-use, atomically claimed ----------------------
alter table public.invites add column if not exists invited_by uuid references auth.users(id) on delete set null;
alter table public.invites add column if not exists accepted_at timestamp with time zone;
alter table public.invites add column if not exists accepted_by uuid references auth.users(id) on delete set null;

create index if not exists invites_company_pending_idx
  on public.invites (company_id) where accepted_at is null;

-- Redeems an invite exactly once. Runs as one transaction:
--   lock invite -> verify unused + unexpired -> re-check the seat limit ->
--   mark used -> attach the profile to the company.
-- SECURITY DEFINER is required because the caller is an invited user who has no
-- rights over the target company yet.
create or replace function public.claim_invite(p_token text, p_user_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_invite public.invites%rowtype;
  v_seats int;
  v_used int;
begin
  if p_token is null or p_user_id is null then
    return jsonb_build_object('ok', false, 'reason', 'invalid');
  end if;

  select * into v_invite
  from public.invites
  where token = p_token
  for update;

  if not found then
    return jsonb_build_object('ok', false, 'reason', 'invalid');
  end if;

  if v_invite.accepted_at is not null then
    return jsonb_build_object('ok', false, 'reason', 'used');
  end if;

  if v_invite.expires_at <= now() then
    return jsonb_build_object('ok', false, 'reason', 'expired');
  end if;

  select coalesce(max(seat_limit), 0) into v_seats
  from public.subscriptions
  where company_id = v_invite.company_id;

  select count(*) into v_used
  from public.profiles
  where company_id = v_invite.company_id;

  if v_seats > 0 and v_used >= v_seats then
    return jsonb_build_object('ok', false, 'reason', 'no_seats');
  end if;

  update public.invites
  set accepted_at = now(), accepted_by = p_user_id
  where id = v_invite.id;

  insert into public.profiles (id, company_id, role)
  values (p_user_id, v_invite.company_id, v_invite.role)
  on conflict (id) do update
    set company_id = v_invite.company_id, role = v_invite.role;

  -- Members must see a policy set too, otherwise the extension falls back to
  -- its hard-coded defaults while the dashboard shows nothing.
  if not exists (select 1 from public.policies where company_id = v_invite.company_id) then
    insert into public.policies (company_id, data_type, action) values
      (v_invite.company_id, 'CREDIT_CARD', 'WARN'),
      (v_invite.company_id, 'EMIRATES_ID', 'WARN'),
      (v_invite.company_id, 'IBAN', 'WARN'),
      (v_invite.company_id, 'EMAIL', 'REDACT'),
      (v_invite.company_id, 'PHONE', 'REDACT'),
      (v_invite.company_id, 'API_KEY', 'BLOCK'),
      (v_invite.company_id, 'PASSWORD', 'BLOCK'),
      (v_invite.company_id, 'CUSTOM_KEYWORD', 'WARN');
  end if;

  return jsonb_build_object(
    'ok', true,
    'company_id', v_invite.company_id,
    'role', v_invite.role
  );
end;
$$;

-- Only the service role (our /api/invites/accept route) may redeem a token.
revoke execute on function public.claim_invite(text, uuid) from public, anon, authenticated;
grant execute on function public.claim_invite(text, uuid) to service_role;

-- 3. STRIPE WEBHOOK IDEMPOTENCY ---------------------------------------------
-- Stripe retries a delivery until it gets a 2xx, so the same event id can arrive
-- many times. The primary key makes the second delivery a no-op.
create table if not exists public.stripe_events (
  id text primary key,
  type text not null,
  status text not null default 'received'
    check (status in ('received', 'processed', 'ignored', 'failed')),
  error text,
  created_at timestamp with time zone not null default (timezone('utc'::text, now()))
);

alter table public.stripe_events enable row level security;
-- Service role only: no policies, so neither anon nor authenticated can read it.

create index if not exists stripe_events_created_at_idx on public.stripe_events (created_at desc);

-- 4. SEAT-AWARE SUBSCRIPTION DEFAULTS ---------------------------------------
-- A company that exists but has no subscription row used to read `seat_limit`
-- as NULL and silently block every invite. New companies get a trial row from
-- /api/signup; this backfills any that predate it.
insert into public.subscriptions (company_id, plan, status, seat_limit)
select c.id, 'trial', 'trialing', 25
from public.companies c
where not exists (select 1 from public.subscriptions s where s.company_id = c.id);