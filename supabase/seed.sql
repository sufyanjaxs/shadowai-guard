-- ==========================================
-- SHADOWAI GUARD - LOCAL TEST SEED
-- ==========================================
-- Applies to `supabase start` (local dev) only. Never run against production:
-- `supabase db push` deliberately ignores seed.sql, and running it by hand would
-- create junk tenants inside a real customer database.
--
-- Creates two ISOLATED companies so the RLS tests have something to prove:
-- a member of Acme must never be able to see or touch anything belonging to Globex.

insert into public.companies (id, name) values
  ('11111111-1111-1111-1111-111111111111', 'Acme Corp'),
  ('22222222-2222-2222-2222-222222222222', 'Globex Inc');

insert into public.policies (company_id, data_type, action) values
  ('11111111-1111-1111-1111-111111111111', 'CREDIT_CARD', 'WARN'),
  ('11111111-1111-1111-1111-111111111111', 'API_KEY', 'BLOCK'),
  ('11111111-1111-1111-1111-111111111111', 'EMAIL', 'REDACT'),
  ('22222222-2222-2222-2222-222222222222', 'CREDIT_CARD', 'BLOCK');
