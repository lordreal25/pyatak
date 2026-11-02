-- ============================================================
-- ПЯТАК: чат по заявкам (service_requests + conversations)
-- ============================================================

-- 1. Связь conversation ↔ service_request
alter table public.conversations
  alter column order_id drop not null;

alter table public.conversations
  add column if not exists service_request_id uuid unique
    references public.service_requests (id) on delete cascade;

-- хотя бы order_id или service_request_id
alter table public.conversations drop constraint if exists conversations_has_parent;
alter table public.conversations
  add constraint conversations_has_parent
  check (order_id is not null or service_request_id is not null);

-- 2. Права
grant select, insert on public.conversations to authenticated;
grant select, insert on public.messages to authenticated;

-- 3. RLS: создание диалога участником
drop policy if exists "Participants can create conversations" on public.conversations;
create policy "Participants can create conversations"
on public.conversations for insert
to authenticated
with check (
  customer_id = (select auth.uid())
  or owner_id = (select auth.uid())
);

-- 4. RLS messages (на всякий случай пересоздаём insert)
drop policy if exists "Participants can send messages as themselves" on public.messages;
create policy "Participants can send messages as themselves"
on public.messages for insert
to authenticated
with check (
  sender_id = (select auth.uid())
  and exists (
    select 1 from public.conversations c
    where c.id = conversation_id
      and (c.customer_id = (select auth.uid()) or c.owner_id = (select auth.uid()))
  )
);

drop policy if exists "Participants can view conversation messages" on public.messages;
create policy "Participants can view conversation messages"
on public.messages for select
to authenticated
using (
  exists (
    select 1 from public.conversations c
    where c.id = conversation_id
      and (c.customer_id = (select auth.uid()) or c.owner_id = (select auth.uid()))
  )
);
