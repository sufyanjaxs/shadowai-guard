-- Seat limit per plan (set by the Stripe webhook).
ALTER TABLE public.subscriptions ADD COLUMN seat_limit int default 0;

-- Required by the Stripe webhook, which upserts with onConflict: 'company_id'.
-- (Added while packaging: the original schema had no such constraint.)
ALTER TABLE public.subscriptions ADD CONSTRAINT subscriptions_company_id_key UNIQUE (company_id);
