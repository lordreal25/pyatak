export type Category =
  | 'Экскаваторы'
  | 'Погрузчики'
  | 'Автокраны'
  | 'Самосвалы'
  | 'Автовышки'
  | 'Манипуляторы'
  | 'Дорожная техника'
  | 'Другое';

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
