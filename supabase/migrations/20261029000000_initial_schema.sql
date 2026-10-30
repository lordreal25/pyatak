create extension if not exists pgcrypto with schema extensions;

create type public.equipment_category as enum (
  'Экскаваторы',
  'Погрузчики',
  'Автокраны',
  'Самосвалы',
  'Автовышки',
  'Манипуляторы',
  'Дорожная техника',
  'Другое'
);

create type public.order_status as enum (
  'pending',
  'accepted',
  'declined',
  'in_progress',
  'completed',
  'cancelled'
);

create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  display_name text not null default '' check (char_length(display_name) <= 100),
  avatar_url text,
  preferred_language text not null default 'ru' check (preferred_language in ('ru', 'kk')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.equipment_listings (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references public.profiles (id) on delete cascade,
  title text not null check (char_length(title) between 2 and 120),
  model text not null check (char_length(model) between 1 and 120),
  category public.equipment_category not null,
  hourly_rate numeric(12, 2) not null check (hourly_rate > 0),
  city text not null check (char_length(city) between 2 and 80),
  description text not null default '' check (char_length(description) <= 5000),
  specs text[] not null default '{}',
  image_urls text[] not null default '{}',
  availability text[] not null default array['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'],
  operator_included boolean not null default false,
  delivery_available boolean not null default false,
  is_active boolean not null default true,
  rating numeric(2, 1) not null default 0 check (rating between 0 and 5),
  review_count integer not null default 0 check (review_count >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint equipment_listings_availability_check check (
    availability <@ array['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun']
  )
);

create table public.orders (
  id uuid primary key default gen_random_uuid(),
  listing_id uuid not null references public.equipment_listings (id) on delete restrict,
  customer_id uuid not null references public.profiles (id) on delete restrict,
  owner_id uuid not null references public.profiles (id) on delete restrict,
  status public.order_status not null default 'pending',
  starts_at timestamptz not null,
  duration_hours integer not null check (duration_hours between 1 and 720),
  object_address text not null check (char_length(object_address) between 5 and 500),
  comment text not null default '' check (char_length(comment) <= 2000),
  hourly_rate_snapshot numeric(12, 2) not null check (hourly_rate_snapshot > 0),
  total_amount numeric(14, 2) not null check (total_amount > 0),
  listing_title_snapshot text not null,
  listing_image_snapshot text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint orders_distinct_customer_owner check (customer_id <> owner_id)
);

create table public.conversations (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null unique references public.orders (id) on delete cascade,
  customer_id uuid not null references public.profiles (id) on delete cascade,
  owner_id uuid not null references public.profiles (id) on delete cascade,
  created_at timestamptz not null default now(),
  constraint conversations_distinct_participants check (customer_id <> owner_id)
);

create table public.messages (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references public.conversations (id) on delete cascade,
  sender_id uuid not null references public.profiles (id) on delete cascade,
  body text not null check (char_length(body) between 1 and 4000),
  created_at timestamptz not null default now()
);

create table public.favorites (
  user_id uuid not null references public.profiles (id) on delete cascade,
  listing_id uuid not null references public.equipment_listings (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (user_id, listing_id)
);

create table public.reviews (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null unique references public.orders (id) on delete cascade,
  listing_id uuid not null references public.equipment_listings (id) on delete cascade,
  author_id uuid not null references public.profiles (id) on delete cascade,
  rating smallint not null check (rating between 1 and 5),
  body text not null default '' check (char_length(body) <= 2000),
  created_at timestamptz not null default now()
);

create table public.notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  order_id uuid references public.orders (id) on delete cascade,
  kind text not null check (kind in ('order_created', 'order_status', 'new_message')),
  title text not null check (char_length(title) between 1 and 160),
  body text not null default '' check (char_length(body) <= 500),
  read_at timestamptz,
  created_at timestamptz not null default now()
);

create index equipment_listings_active_city_category_idx
  on public.equipment_listings (city, category, hourly_rate)
  where is_active = true;
create index equipment_listings_owner_created_idx
  on public.equipment_listings (owner_id, created_at desc);
create index orders_customer_created_idx on public.orders (customer_id, created_at desc);
create index orders_owner_created_idx on public.orders (owner_id, created_at desc);
create index orders_listing_time_idx on public.orders (listing_id, starts_at)
  where status in ('pending', 'accepted', 'in_progress');
create index conversations_customer_created_idx on public.conversations (customer_id, created_at desc);
create index conversations_owner_created_idx on public.conversations (owner_id, created_at desc);
create index messages_conversation_created_idx on public.messages (conversation_id, created_at);
create index notifications_user_created_idx on public.notifications (user_id, created_at desc);

create function public.set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

create trigger profiles_set_updated_at
before update on public.profiles
for each row execute function public.set_updated_at();

create trigger equipment_listings_set_updated_at
before update on public.equipment_listings
for each row execute function public.set_updated_at();

create trigger orders_set_updated_at
before update on public.orders
for each row execute function public.set_updated_at();

create function public.handle_new_auth_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (id, display_name)
  values (
    new.id,
    left(coalesce(new.raw_user_meta_data ->> 'display_name', ''), 100)
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

create trigger on_auth_user_created
after insert on auth.users
for each row execute function public.handle_new_auth_user();

create function public.prepare_order()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  selected_listing public.equipment_listings%rowtype;
begin
  select * into selected_listing
  from public.equipment_listings
  where id = new.listing_id and is_active = true
  for update;

  if not found then
    raise exception 'Listing is unavailable';
  end if;

  if selected_listing.owner_id = new.customer_id then
    raise exception 'Owners cannot rent their own listings';
  end if;

  if new.owner_id <> selected_listing.owner_id then
    raise exception 'Order owner does not match listing owner';
  end if;

  if new.starts_at <= now() then
    raise exception 'Order start must be in the future';
  end if;

  if not exists (
    select 1
    from public.profiles
    where id = new.customer_id
  ) then
    raise exception 'Customer profile does not exist';
  end if;

  if not (lower(to_char(new.starts_at at time zone 'Asia/Almaty', 'Dy')) = any (selected_listing.availability)) then
    raise exception 'Listing is not scheduled for the selected weekday';
  end if;

  if exists (
    select 1
    from public.orders existing
    where existing.listing_id = new.listing_id
      and existing.status in ('pending', 'accepted', 'in_progress')
      and tstzrange(
        existing.starts_at,
        existing.starts_at + make_interval(hours => existing.duration_hours),
        '[)'
      ) && tstzrange(
        new.starts_at,
        new.starts_at + make_interval(hours => new.duration_hours),
        '[)'
      )
  ) then
    raise exception 'Listing is already requested for this time';
  end if;

  new.hourly_rate_snapshot := selected_listing.hourly_rate;
  new.total_amount := selected_listing.hourly_rate * new.duration_hours;
  new.listing_title_snapshot := selected_listing.title || ' ' || selected_listing.model;
  new.listing_image_snapshot := coalesce(selected_listing.image_urls[1], '');
  return new;
end;
$$;

create trigger orders_prepare_insert
before insert on public.orders
for each row execute function public.prepare_order();

create function public.handle_new_order()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  listing_city text;
begin
  insert into public.conversations (order_id, customer_id, owner_id)
  values (new.id, new.customer_id, new.owner_id);

  select city into listing_city
  from public.equipment_listings
  where id = new.listing_id;

  insert into public.notifications (user_id, order_id, kind, title, body)
  values (
    new.owner_id,
    new.id,
    'order_created',
    'Новая заявка',
    new.listing_title_snapshot || ' · ' || coalesce(listing_city, '')
  );
  return new;
end;
$$;

create trigger orders_after_insert
after insert on public.orders
for each row execute function public.handle_new_order();

create function public.validate_order_status_change()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.status is distinct from old.status and not (
    (old.status = 'pending' and new.status in ('accepted', 'declined', 'cancelled'))
    or (old.status = 'accepted' and new.status in ('in_progress', 'cancelled'))
    or (old.status = 'in_progress' and new.status in ('completed', 'cancelled'))
  ) then
    raise exception 'Invalid order status transition: % -> %', old.status, new.status;
  end if;
  return new;
end;
$$;

create trigger orders_validate_status_change
before update of status on public.orders
for each row execute function public.validate_order_status_change();

create function public.notify_order_status()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.status is distinct from old.status then
    insert into public.notifications (user_id, order_id, kind, title, body)
    values (
      case when auth.uid() = new.owner_id then new.customer_id else new.owner_id end,
      new.id,
      'order_status',
      'Изменился статус заявки',
      new.listing_title_snapshot
    );
  end if;
  return new;
end;
$$;

create trigger orders_notify_status
after update of status on public.orders
for each row execute function public.notify_order_status();

create function public.notify_conversation_message()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  recipient_id uuid;
begin
  select case
      when new.sender_id = customer_id then owner_id
      else customer_id
    end
  into recipient_id
  from public.conversations
  where id = new.conversation_id;

  if recipient_id is null then
    raise exception 'Conversation does not exist';
  end if;

  insert into public.notifications (user_id, order_id, kind, title, body)
  select recipient_id, order_id, 'new_message', 'Новое сообщение', left(new.body, 500)
  from public.conversations
  where id = new.conversation_id;
  return new;
end;
$$;

create trigger messages_notify_recipient
after insert on public.messages
for each row execute function public.notify_conversation_message();

create function public.update_listing_rating()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  affected_listing_id uuid;
begin
  affected_listing_id := coalesce(new.listing_id, old.listing_id);
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

create trigger reviews_update_listing_rating
after insert or update or delete on public.reviews
for each row execute function public.update_listing_rating();

alter table public.profiles enable row level security;
alter table public.equipment_listings enable row level security;
alter table public.orders enable row level security;
alter table public.conversations enable row level security;
alter table public.messages enable row level security;
alter table public.favorites enable row level security;
alter table public.reviews enable row level security;
alter table public.notifications enable row level security;

create policy "Profiles are public"
on public.profiles for select
to anon, authenticated
using (true);

create policy "Users update their own profile"
on public.profiles for update
to authenticated
using ((select auth.uid()) = id)
with check ((select auth.uid()) = id);

create policy "Active listings are public"
on public.equipment_listings for select
to anon, authenticated
using (is_active or owner_id = (select auth.uid()));

create policy "Owners create their own listings"
on public.equipment_listings for insert
to authenticated
with check (owner_id = (select auth.uid()));

create policy "Owners update their own listings"
on public.equipment_listings for update
to authenticated
using (owner_id = (select auth.uid()))
with check (owner_id = (select auth.uid()));

create policy "Owners delete their own listings"
on public.equipment_listings for delete
to authenticated
using (owner_id = (select auth.uid()));

create policy "Order participants can view orders"
on public.orders for select
to authenticated
using (
  customer_id = (select auth.uid())
  or owner_id = (select auth.uid())
);

create policy "Customers create orders for other owners"
on public.orders for insert
to authenticated
with check (
  customer_id = (select auth.uid())
  and owner_id <> (select auth.uid())
);

create policy "Listing owners update order status"
on public.orders for update
to authenticated
using (owner_id = (select auth.uid()))
with check (
  owner_id = (select auth.uid())
  and customer_id <> (select auth.uid())
);

create policy "Participants can view conversations"
on public.conversations for select
to authenticated
using (
  customer_id = (select auth.uid())
  or owner_id = (select auth.uid())
);

create policy "Participants can view conversation messages"
on public.messages for select
to authenticated
using (
  exists (
    select 1
    from public.conversations c
    where c.id = conversation_id
      and (c.customer_id = (select auth.uid()) or c.owner_id = (select auth.uid()))
  )
);

create policy "Participants can send messages as themselves"
on public.messages for insert
to authenticated
with check (
  sender_id = (select auth.uid())
  and exists (
    select 1
    from public.conversations c
    where c.id = conversation_id
      and (c.customer_id = (select auth.uid()) or c.owner_id = (select auth.uid()))
  )
);

create policy "Users manage their own favorites"
on public.favorites for all
to authenticated
using (user_id = (select auth.uid()))
with check (user_id = (select auth.uid()));

create policy "Reviews are public"
on public.reviews for select
to anon, authenticated
using (true);

create policy "Customers review their completed orders"
on public.reviews for insert
to authenticated
with check (
  author_id = (select auth.uid())
  and exists (
    select 1
    from public.orders o
    where o.id = order_id
      and o.listing_id = reviews.listing_id
      and o.customer_id = (select auth.uid())
      and o.status = 'completed'
  )
);

create policy "Users view their own notifications"
on public.notifications for select
to authenticated
using (user_id = (select auth.uid()));

create policy "Users mark their own notifications as read"
on public.notifications for update
to authenticated
using (user_id = (select auth.uid()))
with check (user_id = (select auth.uid()));

revoke all on public.profiles from anon, authenticated;
revoke all on public.equipment_listings from anon, authenticated;
revoke all on public.orders from anon, authenticated;
revoke all on public.conversations from anon, authenticated;
revoke all on public.messages from anon, authenticated;
revoke all on public.favorites from anon, authenticated;
revoke all on public.reviews from anon, authenticated;
revoke all on public.notifications from anon, authenticated;

grant select on public.profiles to anon, authenticated;
grant update (display_name, avatar_url, preferred_language) on public.profiles to authenticated;

grant select on public.equipment_listings to anon, authenticated;
grant insert (owner_id, title, model, category, hourly_rate, city, description, specs, image_urls, availability, operator_included, delivery_available)
  on public.equipment_listings to authenticated;
grant update (title, model, category, hourly_rate, city, description, specs, image_urls, availability, operator_included, delivery_available, is_active)
  on public.equipment_listings to authenticated;
grant delete on public.equipment_listings to authenticated;

grant select on public.orders to authenticated;
grant insert (listing_id, customer_id, owner_id, starts_at, duration_hours, object_address, comment, hourly_rate_snapshot, total_amount, listing_title_snapshot, listing_image_snapshot)
  on public.orders to authenticated;
grant update (status) on public.orders to authenticated;

grant select on public.conversations to authenticated;
grant select on public.messages to authenticated;
grant insert (conversation_id, sender_id, body) on public.messages to authenticated;

grant select, insert, delete on public.favorites to authenticated;
grant select on public.reviews to anon, authenticated;
grant insert (order_id, listing_id, author_id, rating, body) on public.reviews to authenticated;
grant select on public.notifications to authenticated;
grant update (read_at) on public.notifications to authenticated;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'equipment-images',
  'equipment-images',
  true,
  10485760,
  array['image/jpeg', 'image/png', 'image/webp', 'image/heic']
)
on conflict (id) do update
set public = excluded.public,
    file_size_limit = excluded.file_size_limit,
    allowed_mime_types = excluded.allowed_mime_types;

create policy "Equipment photos are publicly readable"
on storage.objects for select
to anon, authenticated
using (bucket_id = 'equipment-images');

create policy "Users upload photos to their own folder"
on storage.objects for insert
to authenticated
with check (
  bucket_id = 'equipment-images'
  and (storage.foldername(name))[1] = (select auth.uid())::text
);

create policy "Users update their own photos"
on storage.objects for update
to authenticated
using (
  bucket_id = 'equipment-images'
  and owner_id = (select auth.uid())::text
)
with check (
  bucket_id = 'equipment-images'
  and owner_id = (select auth.uid())::text
);

create policy "Users delete their own photos"
on storage.objects for delete
to authenticated
using (
  bucket_id = 'equipment-images'
  and owner_id = (select auth.uid())::text
);
