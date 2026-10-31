-- =============================================
-- Сид: реальная спецтехника Казахстана
-- Владелец каталога: seed@pyatak.kz
-- Выполнять в Supabase SQL Editor (роль postgres / bypass RLS)
-- =============================================

create extension if not exists pgcrypto with schema extensions;

do $$
declare
  seed_owner_id uuid := 'a1000000-0000-4000-8000-000000000001';
  seed_email text := 'seed@pyatak.kz';
begin
  -- 1) Пользователь auth (если ещё нет)
  if not exists (select 1 from auth.users where id = seed_owner_id) then
    insert into auth.users (
      instance_id,
      id,
      aud,
      role,
      email,
      encrypted_password,
      email_confirmed_at,
      raw_app_meta_data,
      raw_user_meta_data,
      created_at,
      updated_at,
      confirmation_token,
      recovery_token,
      email_change_token_new,
      email_change
    ) values (
      '00000000-0000-0000-0000-000000000000',
      seed_owner_id,
      'authenticated',
      'authenticated',
      seed_email,
      crypt('pyatak-seed-not-for-login', gen_salt('bf')),
      now(),
      '{"provider":"email","providers":["email"]}'::jsonb,
      '{"display_name":"Пятак Каталог"}'::jsonb,
      now(),
      now(),
      '',
      '',
      '',
      ''
    );
  end if;

  -- identity (Supabase Auth v2) — best-effort
  begin
    if not exists (select 1 from auth.identities where user_id = seed_owner_id) then
      insert into auth.identities (
        id,
        user_id,
        identity_data,
        provider,
        provider_id,
        last_sign_in_at,
        created_at,
        updated_at
      ) values (
        seed_owner_id,
        seed_owner_id,
        jsonb_build_object('sub', seed_owner_id::text, 'email', seed_email),
        'email',
        seed_owner_id::text,
        now(),
        now(),
        now()
      );
    end if;
  exception when others then
    raise notice 'auth.identities skip: %', SQLERRM;
  end;

  -- 2) Профиль
  begin
    insert into public.profiles (id, display_name, preferred_language, preferred_city)
    values (seed_owner_id, 'Пятак Каталог', 'ru', 'Алматы')
    on conflict (id) do update
      set display_name = excluded.display_name,
          preferred_city = coalesce(public.profiles.preferred_city, excluded.preferred_city);
  exception when others then
    raise notice 'profile insert: %', SQLERRM;
  end;

  if not exists (select 1 from public.profiles where id = seed_owner_id) then
    select id into seed_owner_id from public.profiles limit 1;
    if seed_owner_id is null then
      raise exception 'Нет профиля. Зарегистрируйте пользователя в приложении и повторите SQL.';
    end if;
    raise notice 'Fallback owner profile: %', seed_owner_id;
  end if;

  -- 3) Очистка старых сид-объявлений с фиксированными UUID (можно перезапускать)
  delete from public.equipment_listings
  where id in (
    'a1000001-0000-4000-8000-000000000001',
    'a1000001-0000-4000-8000-000000000002',
    'a1000001-0000-4000-8000-000000000003',
    'a1000001-0000-4000-8000-000000000004',
    'a1000001-0000-4000-8000-000000000005',
    'a1000001-0000-4000-8000-000000000006',
    'a1000001-0000-4000-8000-000000000007',
    'a1000001-0000-4000-8000-000000000008',
    'a1000001-0000-4000-8000-000000000009',
    'a1000001-0000-4000-8000-000000000010',
    'a1000001-0000-4000-8000-000000000011',
    'a1000001-0000-4000-8000-000000000012',
    'a1000001-0000-4000-8000-000000000013',
    'a1000001-0000-4000-8000-000000000014',
    'a1000001-0000-4000-8000-000000000015',
    'a1000001-0000-4000-8000-000000000016',
    'a1000001-0000-4000-8000-000000000017',
    'a1000001-0000-4000-8000-000000000018',
    'a1000001-0000-4000-8000-000000000019',
    'a1000001-0000-4000-8000-000000000020',
    'a1000001-0000-4000-8000-000000000021',
    'a1000001-0000-4000-8000-000000000022',
    'a1000001-0000-4000-8000-000000000023'
  );

  -- 4) Объявления
  insert into public.equipment_listings (
    id, owner_id, title, model, category, hourly_rate, city, description, specs, image_urls,
    availability, operator_included, delivery_available, is_active, rating, review_count
  ) values
  (
    'a1000001-0000-4000-8000-000000000001', seed_owner_id,
    'Гусеничный экскаватор 20 т', 'Komatsu PC200-8', 'Экскаваторы', 22000, 'Алматы',
    'Классический 20-тонник для котлованов, траншей и планировки. Полный пакет: оператор, доставка по городу.',
    array['Ковш 0,9–1,0 м³','Глубина копания 6,6 м','Масса 20,1 т','Двигатель Komatsu SAA6D107E-1'],
    array['https://images.unsplash.com/photo-1580901368919-7738efb0f87e?auto=format&fit=crop&w=1200&q=85'],
    array['mon','tue','wed','thu','fri','sat','sun'], true, true, true, 4.9, 47
  ),
  (
    'a1000001-0000-4000-8000-000000000002', seed_owner_id,
    'Гусеничный экскаватор CAT', 'Caterpillar 320D L', 'Экскаваторы', 28000, 'Астана',
    'CAT 320D для тяжёлых земляных работ и промышленного строительства. Есть гидромолот.',
    array['Ковш 1,2 м³','Глубина копания 6,7 м','Масса 22 т','Опция: гидромолот'],
    array['https://images.unsplash.com/photo-1504307651254-35680f356dfd?auto=format&fit=crop&w=1200&q=85'],
    array['mon','tue','wed','thu','fri','sat'], true, true, true, 5.0, 31
  ),
  (
    'a1000001-0000-4000-8000-000000000003', seed_owner_id,
    'Экскаватор 33 т', 'Hitachi ZX330-5G', 'Экскаваторы', 32000, 'Алматы',
    'Тяжёлый экскаватор для карьеров, глубоких котлованов и сноса. Работаем по области.',
    array['Ковш 1,4 м³','Глубина копания 7,3 м','Масса 33 т','Гусеницы 600 мм'],
    array['https://images.unsplash.com/photo-1581094794329-c8112a89af12?auto=format&fit=crop&w=1200&q=85'],
    array['mon','tue','wed','thu','fri'], true, true, true, 4.8, 19
  ),
  (
    'a1000001-0000-4000-8000-000000000004', seed_owner_id,
    'Экскаватор-погрузчик', 'JCB 3CX Super', 'Экскаваторы', 16000, 'Караганда',
    'Универсальный JCB для городских работ, прокладки коммуникаций и мелких котлованов.',
    array['Передний ковш 1,1 м³','Задний ковш 0,3 м³','Глубина копания 5,5 м','4WD'],
    array['https://images.unsplash.com/photo-1581092160562-40aa08e78837?auto=format&fit=crop&w=1200&q=85'],
    array['mon','tue','wed','thu','fri','sat'], true, false, true, 4.7, 52
  ),
  (
    'a1000001-0000-4000-8000-000000000005', seed_owner_id,
    'Гусеничный экскаватор SANY', 'SANY SY215C', 'Экскаваторы', 20000, 'Шымкент',
    'Надёжный 21-тонник. Хорош по цене/часу для стандартных земляных работ.',
    array['Ковш 1,0 м³','Глубина копания 6,5 м','Масса 21,5 т','Двигатель Isuzu'],
    array['https://images.unsplash.com/photo-1621905252507-b35492cc74b4?auto=format&fit=crop&w=1200&q=85'],
    array['mon','tue','wed','thu','fri','sat','sun'], true, true, true, 4.6, 14
  ),
  (
    'a1000001-0000-4000-8000-000000000006', seed_owner_id,
    'Фронтальный погрузчик 5 т', 'XCMG LW500FN', 'Погрузчики', 18000, 'Алматы',
    'Погрузка песка, щебня, снега. Частый выбор на стройках и базах стройматериалов.',
    array['Ковш 3,0 м³','Грузоподъёмность 5 т','Масса 16,5 т','Двигатель Weichai'],
    array['https://images.unsplash.com/photo-1579273168839-1a9c5e1d3f0e?auto=format&fit=crop&w=1200&q=85'],
    array['mon','tue','wed','thu','fri','sat'], true, true, true, 4.8, 26
  ),
  (
    'a1000001-0000-4000-8000-000000000007', seed_owner_id,
    'Фронтальный погрузчик CAT', 'Caterpillar 950H', 'Погрузчики', 25000, 'Астана',
    'Мощный CAT для карьеров и крупных объектов. Работаем с длительными сменами.',
    array['Ковш 3,1–4,0 м³','Грузоподъёмность 5+ т','Масса 18 т','Полный привод'],
    array['https://images.unsplash.com/photo-1581092918056-0c4c3acd3789?auto=format&fit=crop&w=1200&q=85'],
    array['mon','tue','wed','thu','fri'], true, true, true, 4.9, 22
  ),
  (
    'a1000001-0000-4000-8000-000000000008', seed_owner_id,
    'Фронтальный погрузчик SDLG', 'SDLG LG936L', 'Погрузчики', 14000, 'Актобе',
    'Экономичный погрузчик для складов, дворов и небольших строек.',
    array['Ковш 1,8 м³','Грузоподъёмность 3 т','Масса 10,3 т','Оператор включён'],
    array['https://images.unsplash.com/photo-1504917595217-d4dc5ebe6122?auto=format&fit=crop&w=1200&q=85'],
    array['mon','tue','wed','thu','fri','sat'], true, false, true, 4.5, 11
  ),
  (
    'a1000001-0000-4000-8000-000000000009', seed_owner_id,
    'Автокран 25 т «Галичанин»', 'КС-55713-1К-3', 'Автокраны', 26000, 'Алматы',
    'Автокран 25 т на шасси КАМАЗ. Монтаж металлоконструкций, плит, оборудования.',
    array['Г/п 25 т','Стрела 21–28 м','Шасси КАМАЗ-65115','Удостоверение крановщика'],
    array['https://images.unsplash.com/photo-1504307651254-35680f356dfd?auto=format&fit=crop&w=1200&q=85'],
    array['mon','tue','wed','thu','fri','sat'], true, true, true, 5.0, 41
  ),
  (
    'a1000001-0000-4000-8000-000000000010', seed_owner_id,
    'Автокран 25 т Ивановец', 'КС-45717К-1', 'Автокраны', 24000, 'Астана',
    'Городские и пригородные монтажные работы. Выезд в день обращения при наличии слота.',
    array['Г/п 25 т','Стрела до 28 м','Шасси КАМАЗ','Работа с люлькой по запросу'],
    array['https://images.unsplash.com/photo-1541888946425-d81bb19240f5?auto=format&fit=crop&w=1200&q=85'],
    array['mon','tue','wed','thu','fri'], true, true, true, 4.8, 29
  ),
  (
    'a1000001-0000-4000-8000-000000000011', seed_owner_id,
    'Автокран 50 т XCMG', 'XCMG QY50KA', 'Автокраны', 45000, 'Алматы',
    '50-тонник для тяжёлого монтажа. Нужна подготовка площадки и согласование вылета.',
    array['Г/п 50 т','Стрела 43 м','Вылет до 38 м','Экипаж: крановщик + стропальщик'],
    array['https://images.unsplash.com/photo-1581092160607-ee22621dd758?auto=format&fit=crop&w=1200&q=85'],
    array['mon','tue','wed','thu','fri'], true, true, true, 4.9, 15
  ),
  (
    'a1000001-0000-4000-8000-000000000012', seed_owner_id,
    'Самосвал 20 т Howo', 'Howo ZZ3257N3847A', 'Самосвалы', 15000, 'Алматы',
    'Перевозка грунта, щебня, песка. Рейсы по городу и области. Можно заказать колонну.',
    array['Г/п 20–25 т','Кузов ~16 м³','6×4','Водитель с опытом карьеров'],
    array['https://images.unsplash.com/photo-1592805723127-0047c8f7e6a2?auto=format&fit=crop&w=1200&q=85'],
    array['mon','tue','wed','thu','fri','sat','sun'], true, true, true, 4.7, 38
  ),
  (
    'a1000001-0000-4000-8000-000000000013', seed_owner_id,
    'Самосвал КАМАЗ 15 т', 'КАМАЗ-65115', 'Самосвалы', 13000, 'Караганда',
    'Надёжный КАМАЗ для стройки и ЖКХ. Работаем по смене и по рейсам.',
    array['Г/п 15 т','Кузов 10–12 м³','6×4','Зимняя подготовка'],
    array['https://images.unsplash.com/photo-1601584115197-04ecc0da31d7?auto=format&fit=crop&w=1200&q=85'],
    array['mon','tue','wed','thu','fri','sat'], true, true, true, 4.6, 44
  ),
  (
    'a1000001-0000-4000-8000-000000000014', seed_owner_id,
    'Самосвал Shacman 25 т', 'Shacman F3000 6×4', 'Самосвалы', 17000, 'Астана',
    'Мощный самосвал для дальних рейсов и тяжёлых грузов. GPS-контроль по запросу.',
    array['Г/п 25 т','Кузов 20 м³','Двигатель Weichai','Ретардер'],
    array['https://images.unsplash.com/photo-1519003722824-194d4455a60c?auto=format&fit=crop&w=1200&q=85'],
    array['mon','tue','wed','thu','fri','sat'], true, true, true, 4.8, 17
  ),
  (
    'a1000001-0000-4000-8000-000000000015', seed_owner_id,
    'Автовышка 28 м', 'Isuzu NPR / АП-28', 'Автовышки', 16000, 'Алматы',
    'Фасады, реклама, освещение, обслуживание ЛЭП. Оператор с допуском к высоте.',
    array['Высота 28 м','Люлька 200–250 кг','Поворот 360°','Выносные опоры'],
    array['https://images.unsplash.com/photo-1541888946425-d81bb19240f5?auto=format&fit=crop&w=1200&q=85'],
    array['mon','tue','wed','thu','fri','sat'], true, false, true, 4.9, 33
  ),
  (
    'a1000001-0000-4000-8000-000000000016', seed_owner_id,
    'Автовышка 32 м', 'Hyundai HD78 / 32м', 'Автовышки', 19000, 'Астана',
    'Высотные работы на ЖК и торговых центрах. Можно с двухсменным графиком.',
    array['Высота 32 м','Г/п люльки 250 кг','Боковой вылет до 12 м','Обогрев кабины'],
    array['https://images.unsplash.com/photo-1503387762-592deb58ef4e?auto=format&fit=crop&w=1200&q=85'],
    array['mon','tue','wed','thu','fri'], true, true, true, 4.8, 20
  ),
  (
    'a1000001-0000-4000-8000-000000000017', seed_owner_id,
    'Манипулятор 5 т', 'Hyundai HD120 + Soosan', 'Манипуляторы', 18000, 'Алматы',
    'Доставка и разгрузка паллет, блоков, станков. Борт 6 м, кран-манипулятор Soosan.',
    array['Кран 5 т','Вылет ~8–10 м','Борт 6,2 м','Водитель-оператор'],
    array['https://images.unsplash.com/photo-1581092918056-0c4c3acd3789?auto=format&fit=crop&w=1200&q=85'],
    array['mon','tue','wed','thu','fri','sat'], true, true, true, 4.9, 36
  ),
  (
    'a1000001-0000-4000-8000-000000000018', seed_owner_id,
    'Манипулятор КАМАЗ 7 т', 'КАМАЗ-43118 + КМУ', 'Манипуляторы', 21000, 'Караганда',
    'Полноприводный манипулятор для бездорожья и промышленных площадок.',
    array['КМУ до 7 т','Полный привод 6×6','Борт 6 м','Лебёдка'],
    array['https://images.unsplash.com/photo-1581092160562-40aa08e78837?auto=format&fit=crop&w=1200&q=85'],
    array['mon','tue','wed','thu','fri'], true, true, true, 4.7, 18
  ),
  (
    'a1000001-0000-4000-8000-000000000019', seed_owner_id,
    'Каток дорожный HAMM', 'HAMM HD 90', 'Дорожная техника', 23000, 'Алматы',
    'Двухвальцовый каток для асфальта и основания. Сдаём с оператором дорожных работ.',
    array['Масса 9 т','Ширина 1,68 м','Вибрация','Полив вальцов'],
    array['https://images.unsplash.com/photo-1517089596392-fb9a9033e05b?auto=format&fit=crop&w=1200&q=85'],
    array['mon','tue','wed','thu','fri'], true, true, true, 4.8, 12
  ),
  (
    'a1000001-0000-4000-8000-000000000020', seed_owner_id,
    'Грунтовый каток BOMAG', 'BOMAG BW 213 D', 'Дорожная техника', 27000, 'Астана',
    'Уплотнение грунта и щебёночного основания на трассах и площадках.',
    array['Масса ~12 т','Гладкий/кулачковый валец','Вибрация','Доставка тралом'],
    array['https://images.unsplash.com/photo-1504917595217-d4dc5ebe6122?auto=format&fit=crop&w=1200&q=85'],
    array['mon','tue','wed','thu','fri'], true, true, true, 4.9, 9
  ),
  (
    'a1000001-0000-4000-8000-000000000021', seed_owner_id,
    'Автогрейдер ДЗ-98', 'ДЗ-98 / ГС-14.02', 'Дорожная техника', 20000, 'Шымкент',
    'Планировка дорог, откосов, площадок. Опытный машинист грейдера.',
    array['Отвал 3,7 м','Мощность ~135–160 л.с.','Полный привод','Оператор включён'],
    array['https://images.unsplash.com/photo-1621905251189-08b45d6a269e?auto=format&fit=crop&w=1200&q=85'],
    array['mon','tue','wed','thu','fri','sat'], true, true, true, 4.6, 16
  ),
  (
    'a1000001-0000-4000-8000-000000000022', seed_owner_id,
    'Мини-погрузчик Bobcat', 'Bobcat S650', 'Другое', 12000, 'Алматы',
    'Узкие дворы, склады, уборка снега, навесное оборудование (ковш, вилы, щётка).',
    array['Г/п ~1200 кг','Ширина ~1,8 м','Навесное по запросу','Оператор'],
    array['https://images.unsplash.com/photo-1581092162384-8987c1d64718?auto=format&fit=crop&w=1200&q=85'],
    array['mon','tue','wed','thu','fri','sat','sun'], true, true, true, 4.9, 27
  ),
  (
    'a1000001-0000-4000-8000-000000000023', seed_owner_id,
    'Дизель-генератор 100 кВт', 'PowerLink / Weichai 100 kW', 'Другое', 9000, 'Астана',
    'Аренда ДГУ на стройку и мероприятия. Доставка, подключение, топливо по договорённости.',
    array['100 кВт / ~125 кВА','Трёхфазный 380 В','Шумозащитный кожух','Доставка'],
    array['https://images.unsplash.com/photo-1473341304170-971dccb5ac1e?auto=format&fit=crop&w=1200&q=85'],
    array['mon','tue','wed','thu','fri','sat','sun'], false, true, true, 4.7, 13
  );

  raise notice 'Seed complete: % listings for owner %', 23, seed_owner_id;
end $$;
