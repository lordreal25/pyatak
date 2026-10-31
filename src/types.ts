export type Category =
  | 'Экскаваторы'
  | 'Погрузчики'
  | 'Автокраны'
  | 'Самосвалы'
  | 'Автовышки'
  | 'Манипуляторы'
  | 'Дорожная техника'
  | 'Другое';

export type OwnerLevel = 'novice' | 'expert' | 'pro';

export type Pyatak = {
  id: string;
  city: string;
  name: string;
  district?: string | null;
  sort_order: number;
};

export type Listing = {
  id: string;
  ownerId?: string;
  title: string;
  model: string;
  category: Category;
  price: number;
  city: string;
  distance: string;
  rating: number;
  reviews: number;
  image: string;
  images?: string[];
  availability?: string[];
  available: boolean;
  operator: boolean;
  delivery: boolean;
  owner: string;
  experience: string;
  description: string;
  specs: string[];

  // Новые поля по ТЗ
  pyatakId?: string | null;
  pyatakName?: string | null;
  isOnline?: boolean;
  onlineAt?: string | null;
  equipmentVerified?: boolean;
  ownerLevel?: OwnerLevel;
  phoneVerified?: boolean;
  documentsVerified?: boolean;
  companyVerified?: boolean;
  completedOrders?: number;
};

export type Order = {
  id: string;
  listingId: string;
  listingTitle: string;
  image: string;
  date: string;
  duration: number;
  address: string;
  comment: string;
  total: number;
  status: 'Заявка отправлена' | 'pending' | 'accepted' | 'declined' | 'in_progress' | 'completed' | 'cancelled';
  createdAt: string;
  isOwner?: boolean;
};

export type AppTab = 'home' | 'catalog' | 'orders' | 'messages' | 'profile';

export const LEVEL_LABELS: Record<OwnerLevel, string> = {
  novice: 'Новичок',
  expert: 'Эксперт',
  pro: 'Профи',
};

export const LEVEL_COLORS: Record<OwnerLevel, string> = {
  novice: 'bg-gray-100 text-gray-600',
  expert: 'bg-blue-100 text-blue-700',
  pro: 'bg-amber-100 text-amber-700',
};
