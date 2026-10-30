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
  return data.map((order) => ({ ...mapOrder(order, language), isOwner: order.owner_id === userId }));
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
  const { error } = await client.from('orders').update({ status }).eq('id', orderId);
  if (error) throw error;
}

export async function fetchMessagesForOrder(orderId: string, userId: string): Promise<Array<{ id: string; text: string; mine: boolean; time: string }>> {
  const client = requireBackend();
  const { data: conversation, error: conversationError } = await client
    .from('conversations')
    .select('id')
    .eq('order_id', orderId)
    .or(`customer_id.eq.${userId},owner_id.eq.${userId}`)
    .single();
  if (conversationError) throw conversationError;

  const { data, error } = await client
    .from('messages')
    .select('id, conversation_id, sender_id, body, created_at')
    .eq('conversation_id', conversation.id)
    .order('created_at', { ascending: true });
  if (error) throw error;
  return data.map((message) => mapMessage(message, userId));
}

export async function sendMessage(orderId: string, userId: string, body: string) {
  const client = requireBackend();
  const { data: conversation, error: conversationError } = await client
    .from('conversations')
    .select('id, customer_id, owner_id')
    .eq('order_id', orderId)
    .or(`customer_id.eq.${userId},owner_id.eq.${userId}`)
    .single();
  if (conversationError) throw conversationError;

  const { error } = await client.from('messages').insert({
    conversation_id: conversation.id,
    sender_id: userId,
    body: body.trim(),
  });
  if (error) throw error;
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

function normalizeKazakhstanPhone(phone: string) {
  const digits = phone.replace(/\D/g, '');
  if (digits.length === 10) return `+7${digits}`;
  if (digits.length === 11 && (digits.startsWith('7') || digits.startsWith('8'))) return `+7${digits.slice(1)}`;
  throw new Error('Введите номер Казахстана в формате +7 7XX XXX XX XX.');
}

function mapListing(row: ListingRow): Listing {
  const localListing = demoListings.find((listing) => listing.id === row.id);
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
    image: row.image_urls[0] ?? localListing?.image ?? '',
    images: row.image_urls,
    availability: row.availability,
    available: row.is_active,
    operator: row.operator_included,
    delivery: row.delivery_available,
    owner: localListing?.owner ?? 'Владелец техники',
    experience: localListing?.experience ?? formatOwnerExperience(row.created_at),
    description: row.description,
    specs: row.specs,
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

function mapMessage(row: MessageRow, userId: string) {
  return {
    id: row.id,
    text: row.body,
    mine: row.sender_id === userId,
    time: new Date(row.created_at).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' }),
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
