-- =============================================
-- Открытые заявки (видны всем авторизованным)
-- =============================================

create table if not exists public.service_requests (
  id uuid primary key default gen_random_uuid(),
  customer_id uuid not null references public.profiles (id) on delete cascade,
  listing_id uuid references public.equipment_listings (id) on delete set null,
  category text,
  city text not null default '',
  pyatak_name text,
  title text not null default '',
  object_address text not null check (char_length(object_address) between 3 and 500),
  comment text not null default '' check (char_length(comment) <= 2000),
  duration_hours integer not null default 4 check (duration_hours between 1 and 720),
  hourly_rate numeric(12, 2) default 0,
  image_url text not null default '',
  status text not null default 'open'
    check (status in ('open', 'accepted', 'in_progress', 'completed', 'cancelled')),
  accepted_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists service_requests_status_city_idx
  on public.service_requests (status, city, created_at desc);

create index if not exists service_requests_customer_idx
  on public.service_requests (customer_id, created_at desc);

create index if not exists service_requests_accepted_by_idx
  on public.service_requests (accepted_by, created_at desc);

drop trigger if exists service_requests_set_updated_at on public.service_requests;
create trigger service_requests_set_updated_at
before update on public.service_requests
for each row execute function public.set_updated_at();

alter table public.service_requests enable row level security;

-- Читать: свои заявки, принятые мной, или все открытые
drop policy if exists service_requests_select on public.service_requests;
create policy service_requests_select on public.service_requests
  for select to authenticated
  using (
    customer_id = auth.uid()
    or accepted_by = auth.uid()
    or status = 'open'
  );

-- Создавать: только от своего имени
drop policy if exists service_requests_insert on public.service_requests;
create policy service_requests_insert on public.service_requests
  for insert to authenticated
  with check (customer_id = auth.uid());

-- Обновлять: автор или принявший исполнитель
drop policy if exists service_requests_update on public.service_requests;
create policy service_requests_update on public.service_requests
  for update to authenticated
  using (customer_id = auth.uid() or accepted_by = auth.uid() or status = 'open')
  with check (customer_id = auth.uid() or accepted_by = auth.uid() or status in ('open', 'accepted', 'in_progress', 'completed', 'cancelled'));
