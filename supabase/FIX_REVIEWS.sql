-- ============================================================
-- ПЯТАК: отзывы по orders + service_requests
-- ============================================================

-- 1. Расширяем reviews
alter table public.reviews
  alter column order_id drop not null;

alter table public.reviews
  add column if not exists service_request_id uuid unique
    references public.service_requests (id) on delete cascade;

alter table public.reviews drop constraint if exists reviews_has_parent;
alter table public.reviews
  add constraint reviews_has_parent
  check (order_id is not null or service_request_id is not null);

-- listing_id может быть null для заявки без карточки техники
alter table public.reviews
  alter column listing_id drop not null;

-- 2. Права
grant select on public.reviews to anon, authenticated;
grant insert (order_id, service_request_id, listing_id, author_id, rating, body)
  on public.reviews to authenticated;

-- 3. RLS insert: completed order ИЛИ completed service_request
drop policy if exists "Customers review their completed orders" on public.reviews;
create policy "Customers review completed jobs"
on public.reviews for insert
to authenticated
with check (
  author_id = (select auth.uid())
  and (
    (
      order_id is not null
      and exists (
        select 1 from public.orders o
        where o.id = order_id
          and o.customer_id = (select auth.uid())
          and o.status = 'completed'
          and (listing_id is null or o.listing_id = listing_id)
      )
    )
    or (
      service_request_id is not null
      and exists (
        select 1 from public.service_requests sr
        where sr.id = service_request_id
          and sr.customer_id = (select auth.uid())
          and sr.status = 'completed'
          and (listing_id is null or sr.listing_id is not distinct from listing_id)
      )
    )
  )
);

-- 4. При завершении service_request — счётчик заказов владельца + уровень
create or replace function public.handle_service_request_completed()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.status = 'completed'
     and old.status is distinct from 'completed'
     and new.accepted_by is not null then
    update public.profiles
    set completed_orders_count = coalesce(completed_orders_count, 0) + 1,
        updated_at = now()
    where id = new.accepted_by;

    if exists (
      select 1 from pg_proc where proname = 'recalculate_owner_level'
    ) then
      perform public.recalculate_owner_level(new.accepted_by);
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists service_requests_handle_completed on public.service_requests;
create trigger service_requests_handle_completed
after update of status on public.service_requests
for each row execute function public.handle_service_request_completed();

-- 5. Триггер рейтинга listing — только если listing_id задан
create or replace function public.update_listing_rating()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  affected_listing_id uuid;
begin
  affected_listing_id := coalesce(new.listing_id, old.listing_id);
  if affected_listing_id is null then
    return coalesce(new, old);
  end if;
  update public.equipment_listings
  set rating = coalesce((
        select round(avg(rating)::numeric, 1)
        from public.reviews
        where listing_id = affected_listing_id
      ), 0),
      review_count = (
        select count(*)::integer
        from public.reviews
        where listing_id = affected_listing_id
      )
  where id = affected_listing_id;
  return coalesce(new, old);
end;
$$;
