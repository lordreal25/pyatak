-- =============================================
-- ПЯТАКИ + РЕПУТАЦИЯ + ОНЛАЙН-СТАТУС
-- =============================================

-- 1. Таблица пятаков
create table if not exists public.pyataks (
  id uuid primary key default gen_random_uuid(),
  city text not null check (char_length(city) between 2 and 80),
  name text not null check (char_length(name) between 2 and 80),
  district text,
  sort_order integer not null default 0,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  unique (city, name)
);

create index if not exists pyataks_city_idx on public.pyataks (city) where is_active = true;

-- 2. Расширяем profiles
alter table public.profiles
  add column if not exists phone_verified boolean not null default false,
  add column if not exists documents_verified boolean not null default false,
  add column if not exists company_verified boolean not null default false,
  add column if not exists completed_orders_count integer not null default 0 check (completed_orders_count >= 0),
  add column if not exists response_rate numeric(5,2) default 0 check (response_rate between 0 and 100),
  add column if not exists avg_response_minutes integer,
  add column if not exists level text not null default 'novice'
    check (level in ('novice', 'expert', 'pro'));

-- 3. Расширяем equipment_listings
alter table public.equipment_listings
  add column if not exists pyatak_id uuid references public.pyataks (id) on delete set null,
  add column if not exists is_online boolean not null default false,
  add column if not exists online_at timestamptz,
  add column if not exists equipment_verified boolean not null default false;

create index if not exists equipment_listings_online_pyatak_idx
  on public.equipment_listings (pyatak_id, is_online)
  where is_active = true and is_online = true;

-- 4. Функция пересчёта уровня
create or replace function public.recalculate_owner_level(p_owner_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_count integer;
  v_rating numeric;
  v_level text;
begin
  select completed_orders_count into v_count
  from public.profiles where id = p_owner_id;

  select coalesce(round(avg(r.rating)::numeric, 1), 0) into v_rating
  from public.reviews r
  join public.equipment_listings l on l.id = r.listing_id
  where l.owner_id = p_owner_id;

  if v_count >= 50 and v_rating >= 4.7 then
    v_level := 'pro';
  elsif v_count >= 10 and v_rating >= 4.5 then
    v_level := 'expert';
  else
    v_level := 'novice';
  end if;

  update public.profiles
  set level = v_level,
      updated_at = now()
  where id = p_owner_id;
end;
$$;

-- 5. Триггер: при завершении заказа увеличиваем счётчик и пересчитываем уровень
create or replace function public.handle_order_completed()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.status = 'completed' and old.status is distinct from 'completed' then
    update public.profiles
    set completed_orders_count = completed_orders_count + 1,
        updated_at = now()
    where id = new.owner_id;

    perform public.recalculate_owner_level(new.owner_id);
  end if;
  return new;
end;
$$;

drop trigger if exists orders_handle_completed on public.orders;
create trigger orders_handle_completed
after update of status on public.orders
for each row execute function public.handle_order_completed();

-- 6. Стартовые пятаки
insert into public.pyataks (city, name, district, sort_order) values
  ('Астана', 'Питак Нура', 'Нуринский', 1),
  ('Астана', 'Питак Сарыарка', 'Сарыаркинский', 2),
  ('Астана', 'Питак Есиль', 'Есильский', 3),
  ('Астана', 'Питак Алматы', 'Алматинский', 4),
  ('Алматы', 'Питак Медеу', 'Медеуский', 1),
  ('Алматы', 'Питак Бостандык', 'Бостандыкский', 2),
  ('Алматы', 'Питак Ауэзов', 'Ауэзовский', 3),
  ('Алматы', 'Питак Алмалы', 'Алмалинский', 4),
  ('Караганда', 'Питак Центр', 'Центр', 1),
  ('Караганда', 'Питак Юго-Восток', 'Юго-Восток', 2)
on conflict (city, name) do nothing;
