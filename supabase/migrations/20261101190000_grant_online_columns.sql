-- Разрешить владельцам обновлять поля онлайн/пятак
-- (старый GRANT update перечислял колонки без is_online / online_at / pyatak_id)

grant update (
  title,
  model,
  category,
  hourly_rate,
  city,
  description,
  specs,
  image_urls,
  availability,
  operator_included,
  delivery_available,
  is_active,
  pyatak_id,
  is_online,
  online_at,
  equipment_verified
) on public.equipment_listings to authenticated;

-- На всякий случай: права на таблицу pyataks (чтение)
grant select on public.pyataks to anon, authenticated;
