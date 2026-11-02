-- ============================================================
-- ПЯТАК: права и RLS для заявок (service_requests)
-- Выполнить в Supabase SQL Editor
-- ============================================================

-- Таблица (если ещё нет)
create table if not exists public.service_requests (
  id uuid primary key default gen_random_uuid(),
  customer_id uuid not null references public.profiles (id) on delete cascade,
  listing_id uuid references public.equipment_listings (id) on delete set null,
  category text,
  city text not null default 'Астана',
  pyatak_name text,
  title text not null default 'Заявка на технику',
  object_address text not null,
  comment text not null default '',
  duration_hours integer not null default 4 check (duration_hours > 0),
  hourly_rate numeric(12, 2) not null default 0,
  image_url text not null default '',
  status text not null default 'open'
    check (status in ('open', 'accepted', 'in_progress', 'completed', 'cancelled')),
  accepted_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.service_requests enable row level security;

-- Права
grant select, insert, update on public.service_requests to authenticated;
grant select on public.service_requests to anon;

-- SELECT: свои / принятые мной / все открытые
drop policy if exists service_requests_select on public.service_requests;
create policy service_requests_select on public.service_requests
  for select to authenticated
  using (
    customer_id = (select auth.uid())
    or accepted_by = (select auth.uid())
    or status = 'open'
  );

-- INSERT: только от своего имени
drop policy if exists service_requests_insert on public.service_requests;
create policy service_requests_insert on public.service_requests
  for insert to authenticated
  with check (customer_id = (select auth.uid()));

-- UPDATE: автор, принявший, или любой authenticated на open (чтобы принять)
drop policy if exists service_requests_update on public.service_requests;
create policy service_requests_update on public.service_requests
  for update to authenticated
  using (
    customer_id = (select auth.uid())
    or accepted_by = (select auth.uid())
    or status = 'open'
  )
  with check (
    customer_id = (select auth.uid())
    or accepted_by = (select auth.uid())
    or (status = 'accepted' and accepted_by = (select auth.uid()))
    or status in ('open', 'accepted', 'in_progress', 'completed', 'cancelled')
  );

create index if not exists service_requests_status_city_idx
  on public.service_requests (status, city, created_at desc);
