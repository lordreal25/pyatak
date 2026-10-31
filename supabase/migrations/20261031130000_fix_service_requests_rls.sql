-- Fix RLS: любой authenticated может принять open-заявку (проставить accepted_by)

drop policy if exists service_requests_update on public.service_requests;

create policy service_requests_update on public.service_requests
  for update to authenticated
  using (
    customer_id = auth.uid()
    or accepted_by = auth.uid()
    or status = 'open'
  )
  with check (
    customer_id = auth.uid()
    or accepted_by = auth.uid()
    -- после принятия accepted_by = текущий пользователь
    or (status = 'accepted' and accepted_by = auth.uid())
    or status in ('open', 'accepted', 'in_progress', 'completed', 'cancelled')
  );
