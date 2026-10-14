-- ==========================================
-- SHADOWAI GUARD - MASTER DATABASE SCHEMA
-- ==========================================

-- 1. TABLES

create table public.companies (
  id uuid primary key default uuid_generate_v4(),
  name text not null,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null
);

create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  company_id uuid references public.companies(id) on delete set null,
  role text not null check (role in ('admin', 'member')) default 'member',
  created_at timestamp with time zone default timezone('utc'::text, now()) not null
);

create table public.policies (
  id uuid primary key default uuid_generate_v4(),
  company_id uuid references public.companies(id) on delete cascade,
  data_type text not null,
  action text not null check (action in ('WARN', 'REDACT', 'BLOCK')),
  created_at timestamp with time zone default timezone('utc'::text, now()) not null,
  unique(company_id, data_type)
);

-- CRITICAL: NO CONTENT COLUMN. Metadata only.
create table public.events (
  id uuid primary key default uuid_generate_v4(),
  company_id uuid references public.companies(id) on delete cascade,
  user_id uuid references auth.users(id) on delete set null,
  ai_tool text,
  data_type text not null,
  action text not null,
  count int not null default 1,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null
);

create table public.invites (
  id uuid primary key default uuid_generate_v4(),
  company_id uuid references public.companies(id) on delete cascade,
  email text not null,
  role text not null check (role in ('admin', 'member')),
  token text unique not null,
  expires_at timestamp with time zone not null,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null
);

create table public.subscriptions (
  id uuid primary key default uuid_generate_v4(),
  company_id uuid references public.companies(id) on delete cascade,
  stripe_customer_id text,
  stripe_subscription_id text unique,
  plan text,
  status text,
  current_period_end timestamp with time zone,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null
);

-- 2. ROW LEVEL SECURITY (RLS)

alter table public.companies enable row level security;
alter table public.profiles enable row level security;
alter table public.policies enable row level security;
alter table public.events enable row level security;
alter table public.invites enable row level security;
alter table public.subscriptions enable row level security;

-- Profiles: Users can only see their own profile
create policy "Users can view own profile"
  on public.profiles for select using (auth.uid() = id);

-- Profiles: Admins can see all profiles in their company
create policy "Admins can view company profiles"
  on public.profiles for select using (
    company_id in (select company_id from public.profiles where id = auth.uid() and role = 'admin')
  );

-- Companies: Users can only see their own company
create policy "Users can view own company"
  on public.companies for select using (
    id in (select company_id from public.profiles where id = auth.uid())
  );

-- Policies: Company members can read policies
create policy "Members can read policies"
  on public.policies for select using (
    company_id in (select company_id from public.profiles where id = auth.uid())
  );

-- Policies: Only admins can modify policies
create policy "Admins can manage policies"
  on public.policies for all using (
    company_id in (select company_id from public.profiles where id = auth.uid() and role = 'admin')
  );

-- Events: Users can insert events for their own company
create policy "Users can insert company events"
  on public.events for insert with check (
    company_id in (select company_id from public.profiles where id = auth.uid())
  );

-- Events: Admins can read all events in their company
create policy "Admins can read company events"
  on public.events for select using (
    company_id in (select company_id from public.profiles where id = auth.uid() and role = 'admin')
  );

-- Invites & Subscriptions: Only admins can manage
create policy "Admins can manage invites"
  on public.invites for all using (
    company_id in (select company_id from public.profiles where id = auth.uid() and role = 'admin')
  );

create policy "Admins can read subscriptions"
  on public.subscriptions for select using (
    company_id in (select company_id from public.profiles where id = auth.uid() and role = 'admin')
  );

-- 3. AUTO-PROFILE CREATION TRIGGER
-- When a new user signs up via Supabase Auth, automatically create their profile row.
create or replace function public.handle_new_user()
returns trigger as $$
begin
  insert into public.profiles (id, role)
  values (new.id, 'member');
  return new;
end;
$$ language plpgsql security definer;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();

