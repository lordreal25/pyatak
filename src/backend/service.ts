import type { User } from '@supabase/supabase-js';
import { demoListings } from '../data';
import type { Listing, Order } from '../types';
import { supabase } from './client';
import type { Database, OrderStatus, Weekday } from './database.types';

type ListingRow = Database['public']['Tables']['equipment_listings']['Row'];
type OrderRow = Database['public']['Tables']['orders']['Row'];
type ProfileRow = Database['public']['Tables']['profiles']['Row'];
type MessageRow = Database['public']['Tables']['messages']['Row'];
type NotificationRow = Database['public']['Tables']['notifications']['Row'];
export type BackendNotification = NotificationRow;
type ListingFilters = {
  query?: string;
  city?: string | null;
  category?: Listing['category'] | null;
  maxPrice?: number | null;
  available?: boolean;
  operator?: boolean;
  delivery?: boolean;
  onlineOnly?: boolean;
  pyatakId?: string | null;
};

function requireBackend() {
  if (!supabase) {
    throw new Error('Backend is not configured. Add the Supabase URL and publishable key to .env.');
  }
  return supabase;
}

export function getCurrentUser() {
  if (!supabase) return Promise.resolve(null);
  return supabase.auth.getSession().then(({ data, error }) => {
    if (error) throw error;
    return data.session?.user ?? null;
  });
}

export function subscribeToAuthChanges(callback: (user: User | null) => void) {
  if (!supabase) return () => {};
  const { data } = supabase.auth.onAuthStateChange((_event, session) => callback(session?.user ?? null));
  return () => data.subscription.unsubscribe();
}

export async function requestPhoneCode(phone: string, displayName: string) {
  const client = requireBackend();
  const normalizedPhone = normalizeKazakhstanPhone(phone);
  const { error } = await client.auth.signInWithOtp({
    phone: normalizedPhone,
    options: { data: { display_name: displayName.trim() } },
  });
  if (error) throw error;
}

export async function registerWithEmail(email: string, password: string, displayName: string) {
  const client = requireBackend();
  const { data, error } = await client.auth.signUp({
    email: email.trim().toLowerCase(),
    password,
    options: { data: { display_name: displayName.trim() } },
  });
  if (error) throw error;
  return { user: data.user, emailConfirmationRequired: !data.session };
}

export async function signInWithEmail(email: string, password: string) {
  const client = requireBackend();
  const { data, error } = await client.auth.signInWithPassword({
    email: email.trim().toLowerCase(),
    password,
  });
  if (error) throw error;
  return data.user;
}

export async function verifyPhoneCode(phone: string, token: string) {
  const client = requireBackend();
  const { data, error } = await client.auth.verifyOtp({
    phone: normalizeKazakhstanPhone(phone),
    token: token.trim(),
    type: 'sms',
  });
  if (error) throw error;
  return data.user;
}

export async function signOut() {
  const client = requireBackend();
  const { error } = await client.auth.signOut();
  if (error) throw error;
}

export async function fetchProfile(userId: string): Promise<ProfileRow> {
  const client = requireBackend();
  const { data, error } = await client
    .from('profiles')
    .select('id, display_name, avatar_url, preferred_language, preferred_city, created_at, updated_at')
    .eq('id', userId)
    .single();
  if (error) throw error;
  return data;
}

export async function updateProfile(userId: string, displayName: string, language: 'ru' | 'kk', city: string) {
  const client = requireBackend();
  const { error } = await client
    .from('profiles')
    .update({
      display_name: displayName.trim(),
      preferred_language: language,
      preferred_city: city.trim(),
    })
    .eq('id', userId);
  if (error) throw error;
}

export async function fetchListings(filters: ListingFilters = {}): Promise<Listing[]> {
  const client = requireBackend();
  let query = client.from('equipment_listings').select('*').eq('is_active', true).order('created_at', { ascending: false });
  if (filters.query?.trim()) {
    const safeQuery = filters.query.trim().replace(/[,%()]/g, ' ');
    query = query.or(`title.ilike.%${safeQuery}%,model.ilike.%${safeQuery}%,city.ilike.%${safeQuery}%`);
  }
  if (filters.city) query = query.eq('city', filters.city);
  if (filters.category) query = query.eq('category', filters.category);
  if (filters.maxPrice) query = query.lte('hourly_rate', filters.maxPrice);
  if (filters.available) query = query.contains('availability', [weekdayForToday()]);
  if (filters.operator) query = query.eq('operator_included', true);
  if (filters.delivery) query = query.eq('delivery_available', true);
  if (filters.onlineOnly) query = query.eq('is_online', true);
  if (filters.pyatakId) query = query.eq('pyatak_id', filters.pyatakId);
  const { data, error } = await query;
  if (error) throw error;
  return data.map(mapListing);
}

export async function fetchOwnerListings(ownerId: string): Promise<Listing[]> {
  const client = requireBackend();
  const { data, error } = await client
    .from('equipment_listings')
    .select('*')
    .eq('owner_id', ownerId)
    .order('created_at', { ascending: false });
  if (error) throw error;
  return data.map(mapListing);
}

export async function fetchFavorites(userId: string): Promise<string[]> {
  const client = requireBackend();
  const { data, error } = await client.from('favorites').select('listing_id').eq('user_id', userId);
  if (error) throw error;
  return data.map((favorite) => favorite.listing_id);
}

export async function setFavorite(userId: string, listingId: string, favorite: boolean) {
  const client = requireBackend();
  const result = favorite
    ? await client.from('favorites').insert({ user_id: userId, listing_id: listingId })
    : await client.from('favorites').delete().eq('user_id', userId).eq('listing_id', listingId);
  if (result.error) throw result.error;
}

export async function fetchOrders(userId: string, language: 'ru' | 'kk'): Promise<Order[]> {
  const client = requireBackend();
  const { data, error } = await client
    .from('orders')
    .select('id, listing_id, customer_id, owner_id, status, starts_at, duration_hours, object_address, comment, hourly_rate_snapshot, total_amount, listing_title_snapshot, listing_image_snapshot, created_at, updated_at')
    .or(`customer_id.eq.${userId},owner_id.eq.${userId}`)
    .order('created_at', { ascending: false });
  if (error) throw error;
  const classic = data.map((order) => ({ ...mapOrder(order, language), isOwner: order.owner_id === userId }));
  try {
    const openRequests = await fetchServiceRequests(userId, language);
    const ids = new Set(classic.map((o) => o.id));
    return [...openRequests.filter((o) => !ids.has(o.id)), ...classic];
  } catch (srError) {
    console.warn('service_requests unavailable, using classic orders only', srError);
    return classic;
  }
}

export async function createOrder(input: {
  listingId: string;
  customerId: string;
  startsAt: Date;
  durationHours: number;
  address: string;
  comment: string;
}, language: 'ru' | 'kk'): Promise<Order> {
  const client = requireBackend();
  const { data: listing, error: listingError } = await client
    .from('equipment_listings')
    .select('owner_id, availability')
    .eq('id', input.listingId)
    .eq('is_active', true)
    .single();
  if (listingError) throw listingError;
  if (listing.owner_id === input.customerId) {
    throw new Error('Владелец не может заказать собственную технику. Выберите объявление другого владельца.');
  }
  const bookingWeekdayLabel = new Intl.DateTimeFormat('en-US', { weekday: 'short', timeZone: 'Asia/Almaty' })
    .format(input.startsAt);
  const bookingWeekday = ({
    Mon: 'mon', Tue: 'tue', Wed: 'wed', Thu: 'thu', Fri: 'fri', Sat: 'sat', Sun: 'sun',
  } as const)[bookingWeekdayLabel as 'Mon' | 'Tue' | 'Wed' | 'Thu' | 'Fri' | 'Sat' | 'Sun'];
  if (!bookingWeekday || !listing.availability.includes(bookingWeekday)) {
    throw new Error('Выбранная дата недоступна для этой техники. Выберите одну из предложенных свободных дат.');
  }
  if (input.address.trim().length < 5) {
    throw new Error('Укажите полный адрес строительного объекта (не менее 5 символов).');
  }

  const { data, error } = await client
    .from('orders')
    .insert({
      listing_id: input.listingId,
      customer_id: input.customerId,
      owner_id: listing.owner_id,
      starts_at: input.startsAt.toISOString(),
      duration_hours: input.durationHours,
      object_address: input.address.trim(),
      comment: input.comment.trim(),
      hourly_rate_snapshot: 1,
      total_amount: 1,
      listing_title_snapshot: '',
      listing_image_snapshot: '',
    })
    .select('id, listing_id, customer_id, owner_id, status, starts_at, duration_hours, object_address, comment, hourly_rate_snapshot, total_amount, listing_title_snapshot, listing_image_snapshot, created_at, updated_at')
    .single();
  if (error) throw error;
  return { ...mapOrder(data, language), isOwner: false };
}

export async function setOrderStatus(orderId: string, status: OrderStatus) {
  const client = requireBackend();

  // 1) service_requests first (быстрые заявки / inDriver-flow)
  const srStatus =
    status === 'declined' || status === 'cancelled'
      ? 'cancelled'
      : status === 'pending'
        ? 'open'
        : status;

  const { data: srRows, error: srError } = await client
    .from('service_requests')
    .update({ status: srStatus })
    .eq('id', orderId)
    .select('id');
  if (srError) {
    const msg = formatBackendError(srError);
    // если таблицы нет / не тот id — пробуем orders
    if (!/permission denied|42501|PGRST/i.test(msg) && srRows === null) {
      // fall through
    } else if (srRows && srRows.length > 0) {
      return;
    } else if (!/does not exist|PGRST205/i.test(msg)) {
      // try orders below unless hard permission on service_requests only
    }
  } else if (srRows && srRows.length > 0) {
    return;
  }

  // 2) classic orders table
  const { data: orderRows, error: orderError } = await client
    .from('orders')
    .update({ status })
    .eq('id', orderId)
    .select('id');
  if (orderError) throw new Error(formatBackendError(orderError));
  if (orderRows && orderRows.length > 0) return;

  if (srError) throw new Error(formatBackendError(srError));
  throw new Error('Заявка не найдена или нет прав на изменение статуса. Выполните FIX_ORDERS.sql.');
}

export type ServiceRequestInput = {
  customerId: string;
  listingId?: string | null;
  category?: string | null;
  city: string;
  pyatakName?: string | null;
  title: string;
  address: string;
  comment?: string;
  durationHours?: number;
  hourlyRate?: number;
  imageUrl?: string;
};

function mapServiceRequest(row: any, userId: string, language: 'ru' | 'kk'): Order {
  const statusMap: Record<string, Order['status']> = {
    open: 'Заявка отправлена',
    accepted: 'accepted',
    in_progress: 'in_progress',
    completed: 'completed',
    cancelled: 'cancelled',
  };
  return {
    id: row.id,
    listingId: row.listing_id || 'service-request',
    listingTitle: row.title || row.category || 'Заявка',
    image: row.image_url || '',
    date: new Date(row.created_at).toLocaleString(language === 'ru' ? 'ru-RU' : 'kk-KZ', {
      dateStyle: 'medium',
      timeStyle: 'short',
    }),
    duration: row.duration_hours ?? 4,
    address: row.object_address,
    comment: row.comment || '',
    total: Number(row.hourly_rate || 0) * (row.duration_hours || 4),
    status: statusMap[row.status] ?? 'Заявка отправлена',
    createdAt: row.created_at,
    // open: любой не-заказчик может принять; после accept — только accepted_by
    isOwner:
      row.status === 'open'
        ? row.customer_id !== userId
        : row.accepted_by === userId,
    customerId: row.customer_id,
    acceptedBy: row.accepted_by ?? null,
  };
}

/** Создать открытую заявку — видна всем авторизованным владельцам */
export async function createServiceRequest(input: ServiceRequestInput, language: 'ru' | 'kk'): Promise<Order> {
  const client = requireBackend();
  const { data, error } = await client
    .from('service_requests')
    .insert({
      customer_id: input.customerId,
      listing_id: input.listingId && /^[0-9a-f-]{36}$/i.test(input.listingId) ? input.listingId : null,
      category: input.category ?? null,
      city: input.city,
      pyatak_name: input.pyatakName ?? null,
      title: input.title,
      object_address: input.address.trim(),
      comment: (input.comment || '').trim(),
      duration_hours: input.durationHours || 4,
      hourly_rate: input.hourlyRate || 0,
      image_url: input.imageUrl || '',
      status: 'open',
    })
    .select('*')
    .single();
  if (error) throw error;
  return mapServiceRequest(data, input.customerId, language);
}

/** Все открытые + мои заявки service_requests */
export async function fetchServiceRequests(userId: string, language: 'ru' | 'kk'): Promise<Order[]> {
  const client = requireBackend();
  const { data, error } = await client
    .from('service_requests')
    .select('*')
    .or(`status.eq.open,customer_id.eq.${userId},accepted_by.eq.${userId}`)
    .order('created_at', { ascending: false })
    .limit(100);
  if (error) throw error;
  return (data || []).map((row) => mapServiceRequest(row, userId, language));
}

/** Владелец принимает открытую заявку */
export async function acceptServiceRequest(requestId: string, ownerId: string) {
  const client = requireBackend();
  const { data, error } = await client
    .from('service_requests')
    .update({ status: 'accepted', accepted_by: ownerId })
    .eq('id', requestId)
    .eq('status', 'open')
    .select('id, status, accepted_by, customer_id');
  if (error) {
    const msg = formatBackendError(error);
    if (/permission denied|42501/i.test(msg)) {
      throw new Error('Нет прав на service_requests. Выполните supabase/FIX_ORDERS.sql в SQL Editor.');
    }
    throw new Error(msg);
  }
  if (!data?.length) {
    throw new Error('Не удалось принять заявку: уже принята другим или нет доступа. Обновите список заказов.');
  }
  const row = data[0];
  // Создаём чат customer ↔ owner
  try {
    await ensureConversation({
      serviceRequestId: row.id,
      customerId: row.customer_id,
      ownerId,
      userId: ownerId,
    });
  } catch (chatError) {
    console.warn('Conversation after accept failed', chatError);
  }
}

/** Найти или создать диалог по order_id или service_request_id */
export async function ensureConversation(input: {
  orderId?: string | null;
  serviceRequestId?: string | null;
  customerId: string;
  ownerId: string;
  userId: string;
}): Promise<string> {
  const client = requireBackend();
  if (input.customerId === input.ownerId) {
    throw new Error('Нельзя создать чат с самим собой.');
  }

  // 1) поиск
  let existing: { id: string } | null = null;
  if (input.serviceRequestId) {
    const { data } = await client
      .from('conversations')
      .select('id')
      .eq('service_request_id', input.serviceRequestId)
      .maybeSingle();
    existing = data;
  }
  if (!existing && input.orderId) {
    const { data } = await client
      .from('conversations')
      .select('id')
      .eq('order_id', input.orderId)
      .maybeSingle();
    existing = data;
  }
  if (existing?.id) return existing.id;

  // 2) создание
  const payload: Record<string, unknown> = {
    customer_id: input.customerId,
    owner_id: input.ownerId,
  };
  if (input.serviceRequestId) payload.service_request_id = input.serviceRequestId;
  if (input.orderId) payload.order_id = input.orderId;

  const { data: created, error } = await client
    .from('conversations')
    .insert(payload)
    .select('id')
    .single();
  if (error) {
    const msg = formatBackendError(error);
    if (/permission denied|42501/i.test(msg)) {
      throw new Error('Нет прав на conversations. Выполните supabase/FIX_CHAT.sql в SQL Editor.');
    }
    // race: already created
    if (input.serviceRequestId) {
      const { data } = await client
        .from('conversations')
        .select('id')
        .eq('service_request_id', input.serviceRequestId)
        .maybeSingle();
      if (data?.id) return data.id;
    }
    throw new Error(msg);
  }
  return created.id;
}

async function findConversationId(refId: string, userId: string): Promise<string | null> {
  const client = requireBackend();
  // service_request_id
  const { data: bySr } = await client
    .from('conversations')
    .select('id')
    .eq('service_request_id', refId)
    .or(`customer_id.eq.${userId},owner_id.eq.${userId}`)
    .maybeSingle();
  if (bySr?.id) return bySr.id;
  // order_id
  const { data: byOrder } = await client
    .from('conversations')
    .select('id')
    .eq('order_id', refId)
    .or(`customer_id.eq.${userId},owner_id.eq.${userId}`)
    .maybeSingle();
  return byOrder?.id ?? null;
}

export async function fetchMessagesForOrder(orderId: string, userId: string): Promise<ChatMessage[]> {
  const client = requireBackend();
  const conversationId = await findConversationId(orderId, userId);
  if (!conversationId) return [];

  const { data: conv, error: convError } = await client
    .from('conversations')
    .select('id, customer_id, owner_id')
    .eq('id', conversationId)
    .maybeSingle();
  if (convError) throw new Error(formatBackendError(convError));

  let customerName = 'Заказчик';
  let ownerName = 'Владелец';
  if (conv) {
    const ids = [conv.customer_id, conv.owner_id].filter(Boolean);
    const { data: profiles } = await client
      .from('profiles')
      .select('id, display_name')
      .in('id', ids);
    for (const p of profiles || []) {
      if (p.id === conv.customer_id) customerName = p.display_name?.trim() || 'Заказчик';
      if (p.id === conv.owner_id) ownerName = p.display_name?.trim() || 'Владелец';
    }
  }

  const { data, error } = await client
    .from('messages')
    .select('id, conversation_id, sender_id, body, created_at')
    .eq('conversation_id', conversationId)
    .order('created_at', { ascending: true });
  if (error) throw new Error(formatBackendError(error));

  const names = conv
    ? {
        customerId: conv.customer_id,
        ownerId: conv.owner_id,
        customerName,
        ownerName,
      }
    : undefined;

  return (data || []).map((message) => mapMessage(message, userId, names));
}

export async function sendMessage(
  orderId: string,
  userId: string,
  body: string,
  meta?: { customerId?: string; ownerId?: string },
) {
  const client = requireBackend();
  let conversationId = await findConversationId(orderId, userId);

  if (!conversationId) {
    // Догружаем заявку, чтобы создать чат
    let customerId = meta?.customerId;
    let ownerId = meta?.ownerId;
    if (!customerId || !ownerId) {
      const { data: sr } = await client
        .from('service_requests')
        .select('customer_id, accepted_by, status')
        .eq('id', orderId)
        .maybeSingle();
      if (sr?.accepted_by && sr.customer_id) {
        customerId = sr.customer_id;
        ownerId = sr.accepted_by;
      } else {
        const { data: ord } = await client
          .from('orders')
          .select('customer_id, owner_id')
          .eq('id', orderId)
          .maybeSingle();
        if (ord) {
          customerId = ord.customer_id;
          ownerId = ord.owner_id;
        }
      }
    }
    if (!customerId || !ownerId) {
      throw new Error('Чат доступен после принятия заявки. Сначала примите заявку в заказах.');
    }
    conversationId = await ensureConversation({
      serviceRequestId: orderId,
      orderId: null,
      customerId,
      ownerId,
      userId,
    });
  }

  const { error } = await client.from('messages').insert({
    conversation_id: conversationId,
    sender_id: userId,
    body: body.trim(),
  });
  if (error) throw new Error(formatBackendError(error));
}

export async function fetchNotifications(userId: string): Promise<NotificationRow[]> {
  const client = requireBackend();
  const { data, error } = await client
    .from('notifications')
    .select('id, user_id, order_id, kind, title, body, read_at, created_at')
    .eq('user_id', userId)
    .order('created_at', { ascending: false })
    .limit(50);
  if (error) throw error;
  return data;
}

export async function markNotificationsRead(userId: string) {
  const client = requireBackend();
  const { error } = await client
    .from('notifications')
    .update({ read_at: new Date().toISOString() })
    .eq('user_id', userId)
    .is('read_at', null);
  if (error) throw error;
}

export async function createListing(input: {
  ownerId: string;
  title: string;
  model: string;
  category: Listing['category'];
  hourlyRate: number;
  city: string;
  description: string;
  availability: Weekday[];
  operatorIncluded: boolean;
  deliveryAvailable: boolean;
  photos: string[];
  isOnline?: boolean;
  pyatakId?: string | null;
}): Promise<Listing> {
  const client = requireBackend();
  const uploadedPaths: string[] = [];

  try {
    const imageUrls = await Promise.all(input.photos.map(async (uri, index) => {
      const response = await fetch(uri);
      if (!response.ok) throw new Error(`Could not read listing photo (${response.status}).`);
      const photo = await response.blob();
      const path = `${input.ownerId}/${Date.now()}-${index}.jpg`;
      const { error } = await client.storage.from('equipment-images').upload(path, photo, {
        contentType: photo.type || 'image/jpeg',
        upsert: false,
      });
      if (error) throw error;
      uploadedPaths.push(path);
      return client.storage.from('equipment-images').getPublicUrl(path).data.publicUrl;
    }));

    const pyatakUuid =
      input.pyatakId && /^[0-9a-f-]{36}$/i.test(input.pyatakId) ? input.pyatakId : null;
    const { data, error } = await client
      .from('equipment_listings')
      .insert({
        owner_id: input.ownerId,
        title: input.title.trim(),
        model: input.model.trim(),
        category: input.category,
        hourly_rate: input.hourlyRate,
        city: input.city,
        description: input.description.trim(),
        specs: [],
        image_urls: imageUrls,
        availability: input.availability,
        operator_included: input.operatorIncluded,
        delivery_available: input.deliveryAvailable,
        is_online: Boolean(input.isOnline),
        online_at: input.isOnline ? new Date().toISOString() : null,
        pyatak_id: pyatakUuid,
      })
      .select('*')
      .single();
    if (error) throw error;
    return mapListing(data);
  } catch (error) {
    if (uploadedPaths.length) {
      const { error: cleanupError } = await client.storage.from('equipment-images').remove(uploadedPaths);
      if (cleanupError) console.error('Failed to clean up uploaded equipment photos', cleanupError);
    }
    throw error;
  }
}


function formatBackendError(error: unknown): string {
  if (!error) return 'Неизвестная ошибка';
  if (error instanceof Error && error.message) return error.message;
  if (typeof error === 'string') return error;
  if (typeof error === 'object') {
    const e = error as { message?: string; details?: string; hint?: string; code?: string; error_description?: string };
    const parts = [e.message, e.details, e.hint, e.error_description, e.code].filter(Boolean);
    if (parts.length) return parts.join(' — ');
    try { return JSON.stringify(error); } catch { return 'Ошибка сервера'; }
  }
  return String(error);
}

/** Владелец встаёт / сходит с пятака — все его активные объявления */
export async function setOwnerOnline(input: {
  ownerId: string;
  online: boolean;
  pyatakId?: string | null;
}): Promise<number> {
  const client = requireBackend();
  const payload: Record<string, unknown> = {
    is_online: input.online,
    online_at: input.online ? new Date().toISOString() : null,
  };
  // pyatak_id только валидный UUID (иначе FK error)
  if (input.online && input.pyatakId && /^[0-9a-f-]{36}$/i.test(input.pyatakId)) {
    payload.pyatak_id = input.pyatakId;
  }

  const { data, error } = await client
    .from('equipment_listings')
    .update(payload)
    .eq('owner_id', input.ownerId)
    .eq('is_active', true)
    .select('id');

  if (error) {
    const msg = formatBackendError(error);
    if (/permission denied|42501/i.test(msg)) {
      throw new Error(
        'Нет прав на поля is_online / pyatak_id. В Supabase SQL Editor выполните миграцию 20261101190000_grant_online_columns.sql (GRANT UPDATE на эти колонки).',
      );
    }
    throw new Error(msg);
  }

  const updated = data?.length ?? 0;
  if (updated === 0) {
    const { count, error: countError } = await client
      .from('equipment_listings')
      .select('id', { count: 'exact', head: true })
      .eq('owner_id', input.ownerId)
      .eq('is_active', true);
    if (countError) throw new Error(formatBackendError(countError));
    // 0 объявлений — не ошибка прав, вызывающий код покажет подсказку
    if (!count) return 0;
    throw new Error(
      'Не удалось обновить объявления (0 строк). Выполните supabase/FIX_ONLINE.sql в SQL Editor.',
    );
  }
  return updated;
}

/** Список пятаков (из БД, fallback пустой) */
export async function fetchPyataks(city?: string | null): Promise<Array<{ id: string; city: string; name: string; district?: string | null; sort_order: number }>> {
  const client = requireBackend();
  let query = client.from('pyataks').select('id, city, name, district, sort_order').order('sort_order', { ascending: true });
  if (city) query = query.eq('city', city);
  const { data, error } = await query;
  if (error) throw error;
  return data ?? [];
}

function normalizeKazakhstanPhone(phone: string) {
  const digits = phone.replace(/\D/g, '');
  if (digits.length === 10) return `+7${digits}`;
  if (digits.length === 11 && (digits.startsWith('7') || digits.startsWith('8'))) return `+7${digits.slice(1)}`;
  throw new Error('Введите номер Казахстана в формате +7 7XX XXX XX XX.');
}

function mapListing(row: ListingRow): Listing {
  const localListing = demoListings.find((listing) => listing.id === row.id);
  const extended = row as ListingRow & {
    is_online?: boolean | null;
    online_at?: string | null;
    pyatak_id?: string | null;
  };
  return {
    id: row.id,
    ownerId: row.owner_id,
    title: row.title,
    model: row.model,
    category: row.category,
    price: Number(row.hourly_rate),
    city: row.city,
    distance: localListing?.distance ?? '—',
    rating: Number(row.rating),
    reviews: row.review_count,
    image: row.image_urls?.[0] ?? localListing?.image ?? '',
    images: row.image_urls ?? [],
    availability: row.availability,
    available: row.is_active,
    operator: row.operator_included,
    delivery: row.delivery_available,
    owner: localListing?.owner ?? 'Владелец техники',
    experience: localListing?.experience ?? formatOwnerExperience(row.created_at),
    description: row.description,
    specs: row.specs ?? [],
    isOnline: Boolean(extended.is_online),
    onlineAt: extended.online_at ?? null,
    pyatakId: extended.pyatak_id ?? null,
  };
}

function mapOrder(row: OrderRow, language: 'ru' | 'kk'): Order {
  return {
    id: row.id,
    listingId: row.listing_id,
    listingTitle: row.listing_title_snapshot,
    image: row.listing_image_snapshot,
    date: new Date(row.starts_at).toLocaleString(language === 'ru' ? 'ru-RU' : 'kk-KZ', {
      dateStyle: 'medium',
      timeStyle: 'short',
    }),
    duration: row.duration_hours,
    address: row.object_address,
    comment: row.comment,
    total: Number(row.total_amount),
    status: row.status === 'pending' ? 'Заявка отправлена' : row.status,
    createdAt: row.created_at,
  };
}

export type ChatMessage = {
  id: string;
  text: string;
  mine: boolean;
  time: string;
  senderId?: string;
  senderName: string;
  senderRole: 'you' | 'customer' | 'owner' | 'other';
};

function mapMessage(
  row: MessageRow,
  userId: string,
  names?: { customerId?: string; ownerId?: string; customerName?: string; ownerName?: string },
): ChatMessage {
  const mine = row.sender_id === userId;
  let senderRole: ChatMessage['senderRole'] = 'other';
  let senderName = 'Участник';
  if (mine) {
    senderRole = 'you';
    senderName = 'Вы';
  } else if (names?.customerId && row.sender_id === names.customerId) {
    senderRole = 'customer';
    senderName = names.customerName || 'Заказчик';
  } else if (names?.ownerId && row.sender_id === names.ownerId) {
    senderRole = 'owner';
    senderName = names.ownerName || 'Владелец';
  }
  return {
    id: row.id,
    text: row.body,
    mine,
    time: new Date(row.created_at).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' }),
    senderId: row.sender_id,
    senderName,
    senderRole,
  };
}

function formatOwnerExperience(createdAt: string) {
  const years = Math.max(0, new Date().getFullYear() - new Date(createdAt).getFullYear());
  return years > 0 ? `На площадке с ${new Date(createdAt).getFullYear()} года` : 'Новый владелец';
}

function weekdayForToday(): Weekday {
  const day = new Intl.DateTimeFormat('en-US', { weekday: 'short', timeZone: 'Asia/Almaty' }).format(new Date()).toLowerCase();
  const weekdays: Record<string, Weekday> = {
    mon: 'mon', tue: 'tue', wed: 'wed', thu: 'thu', fri: 'fri', sat: 'sat', sun: 'sun',
  };
  return weekdays[day] ?? 'mon';
}
