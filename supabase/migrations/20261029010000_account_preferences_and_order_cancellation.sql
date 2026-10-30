alter table public.profiles
  add column preferred_city text not null default 'Алматы'
  check (char_length(preferred_city) between 2 and 80);

grant update (display_name, avatar_url, preferred_language, preferred_city)
  on public.profiles to authenticated;

drop policy if exists "Listing owners update order status" on public.orders;

create policy "Participants update permitted order statuses"
on public.orders for update
to authenticated
using (
  owner_id = (select auth.uid())
  or (
    customer_id = (select auth.uid())
    and status = 'pending'
  )
)
with check (
  owner_id = (select auth.uid())
  or (
    customer_id = (select auth.uid())
    and status = 'cancelled'
  )
);

create or replace function public.validate_order_status_change()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.status is distinct from old.status and not coalesce(
    (
      (
        auth.uid() = new.owner_id
        and (
          (old.status = 'pending' and new.status in ('accepted', 'declined'))
          or (old.status = 'accepted' and new.status in ('in_progress', 'cancelled'))
          or (old.status = 'in_progress' and new.status in ('completed', 'cancelled'))
        )
      )
      or (
        auth.uid() = new.customer_id
        and old.status = 'pending'
        and new.status = 'cancelled'
      )
    ),
    false
  ) then
    raise exception 'Invalid order status transition or actor: % -> %', old.status, new.status;
  end if;
  return new;
end;
$$;
