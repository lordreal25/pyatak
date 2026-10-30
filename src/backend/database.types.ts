import type { Category } from '../types';

export type OrderStatus = 'pending' | 'accepted' | 'declined' | 'in_progress' | 'completed' | 'cancelled';
export type Weekday = 'mon' | 'tue' | 'wed' | 'thu' | 'fri' | 'sat' | 'sun';

type Table<Row, Insert, Update = Partial<Insert>> = {
  Row: Row;
  Insert: Insert;
  Update: Update;
  Relationships: [];
};

type ProfileRow = {
  id: string;
  display_name: string;
  avatar_url: string | null;
  preferred_language: 'ru' | 'kk';
  preferred_city: string;
  created_at: string;
  updated_at: string;
};

type ListingRow = {
  id: string;
  owner_id: string;
  title: string;
  model: string;
  category: Category;
  hourly_rate: number;
  city: string;
  description: string;
  specs: string[];
  image_urls: string[];
  availability: Weekday[];
  operator_included: boolean;
  delivery_available: boolean;
  is_active: boolean;
  rating: number;
  review_count: number;
  created_at: string;
  updated_at: string;
};

type OrderRow = {
  id: string;
  listing_id: string;
  customer_id: string;
  owner_id: string;
  status: OrderStatus;
  starts_at: string;
  duration_hours: number;
  object_address: string;
  comment: string;
  hourly_rate_snapshot: number;
  total_amount: number;
  listing_title_snapshot: string;
  listing_image_snapshot: string;
  created_at: string;
  updated_at: string;
};

type ConversationRow = {
  id: string;
  order_id: string;
  customer_id: string;
  owner_id: string;
  created_at: string;
};

type MessageRow = {
  id: string;
  conversation_id: string;
  sender_id: string;
  body: string;
  created_at: string;
};

type FavoriteRow = {
  user_id: string;
  listing_id: string;
  created_at: string;
};

type ReviewRow = {
  id: string;
  order_id: string;
  listing_id: string;
  author_id: string;
  rating: number;
  body: string;
  created_at: string;
};

type NotificationRow = {
  id: string;
  user_id: string;
  order_id: string | null;
  kind: 'order_created' | 'order_status' | 'new_message';
  title: string;
  body: string;
  read_at: string | null;
  created_at: string;
};

export type Database = {
  public: {
    Tables: {
      profiles: Table<
        ProfileRow,
        Pick<ProfileRow, 'id'> & Partial<Pick<ProfileRow, 'display_name' | 'avatar_url' | 'preferred_language' | 'preferred_city'>>,
        Partial<Pick<ProfileRow, 'display_name' | 'avatar_url' | 'preferred_language' | 'preferred_city'>>
      >;
      equipment_listings: Table<
        ListingRow,
        Pick<ListingRow, 'owner_id' | 'title' | 'model' | 'category' | 'hourly_rate' | 'city'> &
          Partial<Pick<ListingRow, 'description' | 'specs' | 'image_urls' | 'availability' | 'operator_included' | 'delivery_available' | 'is_active'>>,
        Partial<Pick<ListingRow, 'title' | 'model' | 'category' | 'hourly_rate' | 'city' | 'description' | 'specs' | 'image_urls' | 'availability' | 'operator_included' | 'delivery_available' | 'is_active'>>
      >;
      orders: Table<
        OrderRow,
        Pick<OrderRow, 'listing_id' | 'customer_id' | 'owner_id' | 'starts_at' | 'duration_hours' | 'object_address'> &
          Partial<Pick<OrderRow, 'comment' | 'hourly_rate_snapshot' | 'total_amount' | 'listing_title_snapshot' | 'listing_image_snapshot'>>,
        Pick<OrderRow, 'status'>
      >;
      conversations: Table<
        ConversationRow,
        Pick<ConversationRow, 'order_id' | 'customer_id' | 'owner_id'>,
        never
      >;
      messages: Table<
        MessageRow,
        Pick<MessageRow, 'conversation_id' | 'sender_id' | 'body'>,
        never
      >;
      favorites: Table<FavoriteRow, Pick<FavoriteRow, 'user_id' | 'listing_id'>, never>;
      reviews: Table<
        ReviewRow,
        Pick<ReviewRow, 'order_id' | 'listing_id' | 'author_id' | 'rating'> & Partial<Pick<ReviewRow, 'body'>>,
        never
      >;
      notifications: Table<NotificationRow, never, Pick<NotificationRow, 'read_at'>>;
    };
    Views: Record<string, never>;
    Functions: Record<string, never>;
    Enums: {
      equipment_category: Category;
      order_status: OrderStatus;
    };
    CompositeTypes: Record<string, never>;
  };
};
