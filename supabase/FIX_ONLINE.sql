-- ============================================================
-- ПЯТАК: полный фикс «Встать на пятак» (выполнить в SQL Editor)
-- ============================================================

-- 1. Колонки (если миграция pyataks ещё не применялась)
alter table public.equipment_listings
  add column if not exists pyatak_id uuid references public.pyataks (id) on delete set null,
  add column if not exists is_online boolean not null default false,
  add column if not exists online_at timestamptz,
  add column if not exists equipment_verified boolean not null default false;

-- 2. Права: весь UPDATE для authenticated (проще и надёжнее, чем список колонок)
grant select on public.equipment_listings to anon, authenticated;
grant insert on public.equipment_listings to authenticated;
grant update on public.equipment_listings to authenticated;
grant delete on public.equipment_listings to authenticated;

-- 3. Пятаки: чтение всем
grant select on public.pyataks to anon, authenticated;

-- 4. RLS политики update (пересоздаём)
drop policy if exists "Owners update their own listings" on public.equipment_listings;
create policy "Owners update their own listings"
on public.equipment_listings for update
to authenticated
using (owner_id = (select auth.uid()))
with check (owner_id = (select auth.uid()));

-- 5. Индекс для каталога «онлайн»
create index if not exists equipment_listings_online_pyatak_idx
  on public.equipment_listings (pyatak_id, is_online)
  where is_active = true and is_online = true;
