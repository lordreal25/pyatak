import './global.css';
import { useEffect, useMemo, useState } from 'react';
import type { User } from '@supabase/supabase-js';
import {
  ActivityIndicator,
  Alert,
  Image,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StatusBar,
  StyleSheet,
  Text,
  TextInput,
  View,
  useWindowDimensions,
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Feather } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';
import { PortalHost } from '@rn-primitives/portal';
import { Badge } from './components/ui/badge';
import { Button } from './components/ui/button';
import { Text as ReusableText } from './components/ui/text';
import AnimatedBottomNav from './src/components/AnimatedBottomNav';
import type { NavItem } from './src/components/AnimatedBottomNav';
import RangeSlider from './src/components/RangeSlider';
import SwitchToggle from './src/components/SwitchToggle';
import { backendConfigured } from './src/backend/client';
import {
  createListing as createBackendListing,
  createOrder as createBackendOrder,
  createServiceRequest as createBackendServiceRequest,
  acceptServiceRequest as acceptBackendServiceRequest,
  setOwnerOnline as setBackendOwnerOnline,
  fetchFavorites,
  fetchListings,
  fetchMessagesForOrder,
  fetchNotifications,
  fetchOrders,
  fetchOwnerListings,
  fetchProfile,
  getCurrentUser,
  markNotificationsRead,
  registerWithEmail,
  requestPhoneCode,
  sendMessage as sendBackendMessage,
  setOrderStatus as setBackendOrderStatus,
  setFavorite as setBackendFavorite,
  signInWithEmail,
  signOut,
  subscribeToAuthChanges,
  updateProfile as updateBackendProfile,
  verifyPhoneCode,
} from './src/backend/service';
import type { BackendNotification } from './src/backend/service';
import type { OrderStatus, Weekday } from './src/backend/database.types';
import { GoOnlineButton } from './src/components/GoOnlineButton';
import { categories, cities, demoListings, demoPyataks, formatPrice } from './src/data';
import { AppTab, Category, Listing, Order } from './src/types';

const ORANGE = '#FF6B00';
const STORAGE_KEY = 'pyatak-marketplace-v1';
type Language = 'ru' | 'kk';
type Screen = 'main' | 'details' | 'booking' | 'owner' | 'add-listing' | 'notifications' | 'settings' | 'pyatak-select' | 'quick-request';
type Filters = {
  category: Category | null;
  available: boolean;
  operator: boolean;
  delivery: boolean;
  maxPrice: number | null;
  date: string | null;
  city: string | null;
};
type AppState = {
  favorites: string[];
  orders: Order[];
  listings: Listing[];
  language: Language;
  city: string;
  pyatakId: string | null;
  pyatakName: string | null;
  userName: string;
  phone: string;
  messages: { id: string; text: string; mine: boolean; time: string; senderName?: string; senderRole?: string }[];
};
const weekdays = [
  { id: 'mon', ru: 'Пн', kk: 'Дс' },
  { id: 'tue', ru: 'Вт', kk: 'Сс' },
  { id: 'wed', ru: 'Ср', kk: 'Ср' },
  { id: 'thu', ru: 'Чт', kk: 'Бс' },
  { id: 'fri', ru: 'Пт', kk: 'Жм' },
  { id: 'sat', ru: 'Сб', kk: 'Сб' },
  { id: 'sun', ru: 'Вс', kk: 'Жс' },
];


function isAppTab(key: string): key is AppTab {
  return key === 'home' || key === 'catalog' || key === 'orders' || key === 'messages' || key === 'profile';
}

function isUuid(id: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(id);
}

function isLocalOrderId(id: string) {
  return id.startsWith('quick-') || id.startsWith('local-') || !isUuid(id);
}

function mergeOrders(remote: Order[], local: Order[]) {
  const remoteIds = new Set(remote.map((o) => o.id));
  const keptLocal = local.filter((o) => isLocalOrderId(o.id) && !remoteIds.has(o.id));
  return [...keptLocal, ...remote];
}

function safeAlert(title: string, message?: string) {
  const text = message ? `${title}\n\n${message}` : title;
  try {
    if (Platform.OS === 'web' && typeof window !== 'undefined' && typeof window.alert === 'function') {
      window.alert(text);
      return;
    }
  } catch {
    // ignore and fall back
  }
  Alert.alert(title, message);
}


const initialState: AppState = {
  favorites: [],
  orders: [],
  listings: demoListings,
  language: 'ru',
  city: 'Алматы',
  pyatakId: null,
  pyatakName: null,
  userName: '',
  phone: '',
  messages: [
    { id: 'welcome', text: 'Здравствуйте! Чем можем помочь с выбором техники?', mine: false, time: '10:24', senderName: 'Пятак', senderRole: 'other' },
  ],
};

const copy = {
  ru: {
    home: 'Главная', catalog: 'Каталог', favorites: 'Избранное', orders: 'Заказы', messages: 'Сообщения', profile: 'Профиль',
    search: 'Какую технику ищем?', hero: 'Нужна техника? Найдём!', heroSub: 'Закажи спецтехнику для своего объекта за пару минут.',
    find: 'Найти технику', nearby: 'Популярная техника рядом', offers: 'Выгодные предложения',
    recent: 'Недавно добавленные', all: 'Все', rentOut: 'Сдать технику в аренду',
    from: 'от', hour: 'час', available: 'Свободна', unavailable: 'Занята', filters: 'Фильтры',
    list: 'Список', map: 'Карта', category: 'Категория', availability: 'Доступность',
    operator: 'С оператором', delivery: 'Доставка на объект', reset: 'Сбросить', show: 'Показать объявления',
    details: 'О технике', characteristics: 'Характеристики', owner: 'Владелец', reviews: 'отзывов',
    area: 'Район работы', calendar: 'Ближайшая доступность', chooseDate: 'Дата и время',
    duration: 'Продолжительность', hours: 'часов', address: 'Адрес объекта', addressHint: 'Город, улица, номер объекта',
    comment: 'Комментарий', commentHint: 'Дополнительные детали для владельца', estimate: 'Предварительная стоимость',
    requestNote: 'Это заявка, не оплата. Владелец подтвердит заказ отдельно.',
    order: 'Заказать', send: 'Отправить заявку', sent: 'Заявка отправлена',
    emptyOrders: 'Здесь появятся ваши заявки', emptyOrdersSub: 'Выберите технику и отправьте заявку владельцу.',
    status: 'Ожидает ответа владельца', orderInfo: 'Заказ не подтверждён. Дождитесь ответа владельца техники.',
    inbox: 'Входящие', messageHint: 'Написать сообщение…', sendMessage: 'Отправить',
    demoData: 'Демонстрационные данные', demoSub: 'Каталог работает в демо-режиме. Заявки и избранное сохраняются на устройстве.',
    ownerCabinet: 'Кабинет владельца', ownerTitle: 'Ваш бизнес в движении',
    newRequests: 'Новые заявки', activeOrders: 'Активные заказы', listings: 'Объявления',
    revenue: 'Выручка за период', views: 'Просмотры', addListing: 'Добавить технику',
    listingWizard: 'Новое объявление', step: 'Шаг', next: 'Далее', saveListing: 'Опубликовать объявление',
    photos: 'Фотографии', addPhotos: 'Добавить фото', title: 'Название техники', model: 'Марка и модель',
    price: 'Цена за час', description: 'Описание', city: 'Город', signIn: 'Войти или зарегистрироваться',
    name: 'Ваше имя', phone: 'Номер телефона', save: 'Сохранить', language: 'Язык приложения',
    notifications: 'Уведомления', noNotifications: 'Пока нет новых уведомлений',
    mapDemo: 'Карта появится после подключения картографического сервиса.',
    selectCity: 'Выберите город', selectPyatak: 'Выберите пятак', pyatak: 'Пятак', allPyataks: 'Все пятаки', pyatakHint: 'Чем ближе пятак — тем быстрее и дешевле подача', noPyataks: 'Пока нет пятаков в этом городе', dateToday: 'Сегодня, 14:00', dateTomorrow: 'Завтра, 09:00',
    dateWeekend: 'Суббота, 09:00', saved: 'Сохранено', noResults: 'Ничего не найдено',
    sendCode: 'Получить код по SMS', verifyCode: 'Подтвердить код и войти', phoneCode: 'Код из SMS',
    sendAgain: 'Отправить код ещё раз', backendRequired: 'Добавьте URL и публичный ключ Supabase в .env, перезапустите Expo.',
    register: 'Зарегистрироваться', login: 'Войти', haveAccount: 'Уже есть аккаунт? Войти', noAccount: 'Нет аккаунта? Зарегистрироваться',
    email: 'Электронная почта', password: 'Пароль', emailHint: 'name@example.com', passwordHint: 'Минимум 6 символов',
    authRequiredFields: 'Заполните почту и пароль.',
    emailConfirmation: 'Регистрация почти завершена. Подтвердите адрес по ссылке из письма, затем войдите.',
    emailAuthError: 'Не удалось войти. Проверьте почту и пароль.',
    emailRegisterError: 'Не удалось зарегистрироваться. Проверьте адрес почты и попробуйте ещё раз.',
    usePhone: 'Войти по SMS', useEmail: 'Войти по почте',
    listingPublishFailed: 'Публикация не удалась. Проверьте соединение и настройки Supabase.',
    orderFailed: 'Не удалось отправить заявку.',
    requestLogin: 'Войдите в аккаунт, чтобы отправить заявку владельцу.',
    authPrompt: 'Создайте аккаунт или войдите, чтобы отправлять заявки и синхронизировать данные.',
    signOut: 'Выйти из аккаунта', profileSaved: 'Профиль сохранён.',
    pendingStatus: 'Ожидает ответа владельца', acceptedStatus: 'Заявка подтверждена',
    declinedStatus: 'Заявка отклонена', inProgressStatus: 'Заказ выполняется',
    completedStatus: 'Заказ завершён', cancelledStatus: 'Заявка отменена',
    emptyChat: 'Чтобы начать переписку с владельцем, отправьте заявку на аренду.',
    accept: 'Принять', decline: 'Отклонить', startWork: 'Начать работу', complete: 'Завершить',
    authPhoneHint: '+7 700 000 00 00',
    remoteMode: 'Данные синхронизируются с Supabase. Оплата онлайн не подключена.',
    settings: 'Настройки', preferredCity: 'Город', account: 'Аккаунт',
    enterCode: 'Введите код из SMS', cancelOrder: 'Отменить заявку',
    ordersLoading: 'Загружаем заказы…', quickRequest: 'Быстрая заявка', quickRequestSub: 'Опишите, какая техника нужна — онлайн-владельцы на пятаке откликнутся', needCategory: 'Тип техники', needAddress: 'Адрес объекта', sendRequest: 'Отправить заявку всем', requestSentAll: 'Заявка ушла онлайн-владельцам', activeOrders: 'Активные', doneOrders: 'Завершённые', allOrders: 'Все', openChat: 'Написать', emptyOrders: 'Пока нет заказов', emptyOrdersSub: 'Создайте заявку с главной или из каталога', myRequests: 'Мои заявки', incomingRequests: 'Входящие', authRequired: 'Войдите, чтобы увидеть ваши заказы.',
    saveProfileError: 'Не удалось сохранить профиль. Проверьте подключение и повторите попытку.',
    otpSent: 'Код отправлен, проверьте SMS.',
    signInToSaveSettings: 'Войдите, чтобы сохранять настройки в аккаунте.',
    smsSetupRequired: 'Для входа по SMS включите Phone Auth и настройте SMS-провайдера в Supabase.',
  },
  kk: {
    home: 'Басты бет', catalog: 'Каталог', favorites: 'Таңдаулылар', orders: 'Тапсырыстар', messages: 'Хабарламалар', profile: 'Профиль',
    search: 'Қандай техника іздейсіз?', hero: 'Техника керек пе? Табамыз!', heroSub: 'Нысаныңызға арнайы техниканы бірнеше минутта тапсырыс беріңіз.',
    find: 'Техника табу', nearby: 'Жақын маңдағы танымал техника', offers: 'Тиімді ұсыныстар',
    recent: 'Жаңадан қосылған', all: 'Барлығы', rentOut: 'Техниканы жалға беру',
    from: 'бастап', hour: 'сағ', available: 'Бос', unavailable: 'Бос емес', filters: 'Сүзгілер',
    list: 'Тізім', map: 'Карта', category: 'Санат', availability: 'Қолжетімділік',
    operator: 'Операторымен', delivery: 'Нысанға жеткізу', reset: 'Тазалау', show: 'Хабарландыруларды көру',
    details: 'Техника туралы', characteristics: 'Сипаттамалары', owner: 'Иесі', reviews: 'пікір',
    area: 'Жұмыс аймағы', calendar: 'Жақын қолжетімділік', chooseDate: 'Күні мен уақыты',
    duration: 'Ұзақтығы', hours: 'сағат', address: 'Нысан мекенжайы', addressHint: 'Қала, көше, нысан нөмірі',
    comment: 'Түсініктеме', commentHint: 'Иесіне арналған қосымша ақпарат', estimate: 'Алдын ала құны',
    requestNote: 'Бұл — өтінім, төлем емес. Иесі тапсырысты бөлек растайды.',
    order: 'Тапсырыс беру', send: 'Өтінім жіберу', sent: 'Өтінім жіберілді',
    emptyOrders: 'Өтінімдеріңіз осында көрсетіледі', emptyOrdersSub: 'Техниканы таңдап, иесіне өтінім жіберіңіз.',
    status: 'Иесінің жауабын күтуде', orderInfo: 'Тапсырыс расталған жоқ. Техника иесінің жауабын күтіңіз.',
    inbox: 'Кіріс', messageHint: 'Хабарлама жазу…', sendMessage: 'Жіберу',
    demoData: 'Демо деректер', demoSub: 'Каталог демо режимінде. Өтінімдер мен таңдаулылар құрылғыда сақталады.',
    ownerCabinet: 'Иесінің кабинеті', ownerTitle: 'Бизнесіңіз қозғалыста',
    newRequests: 'Жаңа өтінімдер', activeOrders: 'Белсенді тапсырыстар', listings: 'Хабарландырулар',
    revenue: 'Кезеңдегі кіріс', views: 'Қаралымдар', addListing: 'Техника қосу',
    listingWizard: 'Жаңа хабарландыру', step: 'Қадам', next: 'Келесі', saveListing: 'Хабарландыру жариялау',
    photos: 'Фотосуреттер', addPhotos: 'Фото қосу', title: 'Техника атауы', model: 'Маркасы мен моделі',
    price: 'Сағатына бағасы', description: 'Сипаттама', city: 'Қала', signIn: 'Кіру немесе тіркелу',
    name: 'Атыңыз', phone: 'Телефон нөмірі', save: 'Сақтау', language: 'Қолданба тілі',
    notifications: 'Хабарландырулар', noNotifications: 'Әзірше жаңа хабарландыру жоқ',
    mapDemo: 'Карта картографиялық сервис қосылғаннан кейін пайда болады.',
    selectCity: 'Қаланы таңдаңыз', selectPyatak: 'Пятакты таңдаңыз', pyatak: 'Пятак', allPyataks: 'Барлық пятактар', pyatakHint: 'Пятак неғұрлым жақын болса, соғұрлым тез және арзан', noPyataks: 'Бұл қалада пятак жоқ', dateToday: 'Бүгін, 14:00', dateTomorrow: 'Ертең, 09:00',
    dateWeekend: 'Сенбі, 09:00', saved: 'Сақталды', noResults: 'Ештеңе табылмады',
    sendCode: 'SMS кодын алу', verifyCode: 'Кодты растау және кіру', phoneCode: 'SMS коды',
    sendAgain: 'Кодты қайта жіберу', backendRequired: 'Supabase URL және ашық кілтін .env файлына қосып, Expo-ны қайта іске қосыңыз.',
    register: 'Тіркелу', login: 'Кіру', haveAccount: 'Аккаунтыңыз бар ма? Кіру', noAccount: 'Аккаунтыңыз жоқ па? Тіркелу',
    email: 'Электрондық пошта', password: 'Құпиясөз', emailHint: 'name@example.com', passwordHint: 'Кемінде 6 таңба',
    authRequiredFields: 'Пошта мен құпиясөзді толтырыңыз.',
    emailConfirmation: 'Тіркелу аяқталуға жақын. Хаттағы сілтеме арқылы поштаңызды растаңыз, содан кейін кіріңіз.',
    emailAuthError: 'Кіру мүмкін болмады. Пошта мен құпиясөзді тексеріңіз.',
    emailRegisterError: 'Тіркелу мүмкін болмады. Пошта мекенжайын тексеріп, қайталап көріңіз.',
    usePhone: 'SMS арқылы кіру', useEmail: 'Пошта арқылы кіру',
    listingPublishFailed: 'Жариялау орындалмады. Байланыс пен Supabase баптауларын тексеріңіз.',
    orderFailed: 'Өтінім жіберілмеді.',
    requestLogin: 'Техника иесіне өтінім жіберу үшін аккаунтыңызға кіріңіз.',
    authPrompt: 'Өтінім жіберіп, деректерді синхрондау үшін аккаунт ашыңыз немесе кіріңіз.',
    signOut: 'Аккаунттан шығу', profileSaved: 'Профиль сақталды.',
    pendingStatus: 'Иесінің жауабын күтуде', acceptedStatus: 'Өтінім расталды',
    declinedStatus: 'Өтінім қабылданбады', inProgressStatus: 'Тапсырыс орындалуда',
    completedStatus: 'Тапсырыс аяқталды', cancelledStatus: 'Өтінім тоқтатылды',
    emptyChat: 'Иесімен сөйлесуді бастау үшін жалға алу өтінімін жіберіңіз.',
    accept: 'Қабылдау', decline: 'Қабылдамау', startWork: 'Жұмысты бастау', complete: 'Аяқтау',
    authPhoneHint: '+7 700 000 00 00',
    remoteMode: 'Деректер Supabase-пен синхрондалады. Онлайн төлем қосылмаған.',
    settings: 'Баптаулар', preferredCity: 'Қала', account: 'Аккаунт',
    enterCode: 'SMS кодын енгізіңіз', cancelOrder: 'Өтінімді тоқтату',
    ordersLoading: 'Тапсырыстар жүктелуде…', quickRequest: 'Жылдам өтінім', quickRequestSub: 'Қандай техника керек екенін жазыңыз — пятактағы онлайн иелер жауап береді', needCategory: 'Техника түрі', needAddress: 'Нысан мекенжайы', sendRequest: 'Барлығына жіберу', requestSentAll: 'Өтінім онлайн иелерге жіберілді', activeOrders: 'Белсенді', doneOrders: 'Аяқталған', allOrders: 'Барлығы', openChat: 'Жазу', emptyOrders: 'Әзірге тапсырыс жоқ', emptyOrdersSub: 'Басты беттен немесе каталогтан өтінім жасаңыз', myRequests: 'Менің өтінімдерім', incomingRequests: 'Кіріс', authRequired: 'Тапсырыстарды көру үшін жүйеге кіріңіз.',
    saveProfileError: 'Профиль сақталмады. Байланысты тексеріп, қайталап көріңіз.',
    otpSent: 'Код жіберілді, SMS-ті тексеріңіз.',
    signInToSaveSettings: 'Баптауларды аккаунтта сақтау үшін жүйеге кіріңіз.',
    smsSetupRequired: 'SMS арқылы кіру үшін Supabase-та Phone Auth пен SMS провайдерін баптаңыз.',
  },
};

const categoryKK: Record<Category, string> = {
  Экскаваторы: 'Экскаваторлар', Погрузчики: 'Тиегіштер', Автокраны: 'Автокрандар',
  Самосвалы: 'Самосвалдар', Автовышки: 'Автокөтергіштер', Манипуляторы: 'Манипуляторлар',
  'Дорожная техника': 'Жол техникасы', Другое: 'Басқа',
};

const moneyPerHour = (price: number, language: Language) =>
  `${language === 'ru' ? 'от ' : ''}${formatPrice(price)}/${language === 'ru' ? 'час' : 'сағ'}`;

function getUpcomingBookingDates(availability?: string[]) {
  const availableDays = new Set(
    (availability?.length ? availability : weekdays.map((day) => day.id)).map((d) => d.toLowerCase()),
  );
  const dates: Date[] = [];
  const now = new Date();
  for (let offset = 0; offset < 21 && dates.length < 5; offset += 1) {
    const candidate = new Date(now.getTime());
    candidate.setDate(now.getDate() + offset);
    candidate.setHours(offset === 0 ? 15 : 9, 0, 0, 0);
    if (candidate <= now) continue;
    // 0=Sun .. 6=Sat → mon/tue/... keys
    const jsDay = candidate.getDay();
    const dayId = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'][jsDay];
    if (!availableDays.has(dayId)) continue;
    dates.push(candidate);
  }
  // Fallback: если фильтр дней пустой/ломаный — всё равно даём ближайшие слоты
  if (!dates.length) {
    for (let offset = 1; offset <= 5; offset += 1) {
      const candidate = new Date(now.getTime());
      candidate.setDate(now.getDate() + offset);
      candidate.setHours(9, 0, 0, 0);
      dates.push(candidate);
    }
  }
  return dates;
}

function bookingDateLabel(date: Date, language: Language) {
  return date.toLocaleString(language === 'ru' ? 'ru-RU' : 'kk-KZ', {
    dateStyle: 'medium',
    timeStyle: 'short',
  });
}

function orderStatusLabel(order: Order, language: Language) {
  const statusKey: Record<string, keyof typeof copy.ru> = {
    'Заявка отправлена': 'pendingStatus',
    pending: 'pendingStatus',
    accepted: 'acceptedStatus',
    declined: 'declinedStatus',
    in_progress: 'inProgressStatus',
    completed: 'completedStatus',
    cancelled: 'cancelledStatus',
  };
  const key = statusKey[order.status] ?? 'pendingStatus';
  return copy[language][key];
}


const CHAT_STORAGE_PREFIX = 'pyatak-chat-';

async function loadLocalChat(orderId: string): Promise<Array<{ id: string; text: string; mine: boolean; time: string; senderName?: string; senderRole?: string }>> {
  try {
    const raw = await AsyncStorage.getItem(CHAT_STORAGE_PREFIX + orderId);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

async function saveLocalChat(orderId: string, messages: Array<{ id: string; text: string; mine: boolean; time: string; senderName?: string; senderRole?: string }>) {
  try {
    await AsyncStorage.setItem(CHAT_STORAGE_PREFIX + orderId, JSON.stringify(messages.slice(-200)));
  } catch (error) {
    console.warn('saveLocalChat failed', error);
  }
}

function App() {
  const [data, setData] = useState<AppState>(initialState);
  const [hydrated, setHydrated] = useState(false);
  const [backendUser, setBackendUser] = useState<User | null>(null);
  const [ownerOnline, setOwnerOnline] = useState(false);
  const [backendOwnerListings, setBackendOwnerListings] = useState<Listing[]>([]);
  const [backendNotifications, setBackendNotifications] = useState<BackendNotification[]>([]);
  const [remoteListings, setRemoteListings] = useState<Listing[] | null>(null);
  const [backendLoading, setBackendLoading] = useState(false);
  const [backendError, setBackendError] = useState('');
  const [backendRefreshKey, setBackendRefreshKey] = useState(0);
  const [authCode, setAuthCode] = useState('');
  const [authCodeSent, setAuthCodeSent] = useState(false);
  const [authMethod, setAuthMethod] = useState<'email' | 'phone'>('email');
  const [emailAuthMode, setEmailAuthMode] = useState<'register' | 'login'>('register');
  const [profileEmail, setProfileEmail] = useState('');
  const [authPassword, setAuthPassword] = useState('');
  const [backendBusy, setBackendBusy] = useState(false);
  const [accountLoading, setAccountLoading] = useState(false);
  const [accountError, setAccountError] = useState('');
  const [accountRefreshKey, setAccountRefreshKey] = useState(0);
  const [ordersRefreshKey, setOrdersRefreshKey] = useState(0);
  const [activeTab, setActiveTab] = useState<AppTab>('home');
  const [screen, setScreen] = useState<Screen>('main');
  const [selected, setSelected] = useState<Listing | null>(null);
  const [search, setSearch] = useState('');
  const [filters, setFilters] = useState<Filters>({
    category: null, available: false, operator: false, delivery: false, maxPrice: null, date: null, city: null,
  });
  const [filterOpen, setFilterOpen] = useState(false);
  const [cityOpen, setCityOpen] = useState(false);
  const [ordersFilter, setOrdersFilter] = useState<'all' | 'active' | 'done'>('all');
  const [quickCategory, setQuickCategory] = useState<Category | null>(null);
  const [quickComment, setQuickComment] = useState('');
  const [mapMode, setMapMode] = useState(false);
  const [favoritesOnly, setFavoritesOnly] = useState(false);
  const [imageIndex, setImageIndex] = useState(0);
  const [date, setDate] = useState('');
  const [duration, setDuration] = useState(4);
  const [address, setAddress] = useState('');
  const [comment, setComment] = useState('');
  const [messageText, setMessageText] = useState('');
  const [chatOrderId, setChatOrderId] = useState<string | null>(null);
  const [profileOpen, setProfileOpen] = useState(false);
  const [profileName, setProfileName] = useState('');
  const [profilePhone, setProfilePhone] = useState('');
  const [wizardStep, setWizardStep] = useState(1);
  const [listingTitle, setListingTitle] = useState('');
  const [listingModel, setListingModel] = useState('');
  const [listingCategory, setListingCategory] = useState<Category>('Экскаваторы');
  const [listingPrice, setListingPrice] = useState('');
  const [listingDescription, setListingDescription] = useState('');
  const [listingPhotos, setListingPhotos] = useState<string[]>([]);
  const [listingDays, setListingDays] = useState(weekdays.map((day) => day.id));
  const [listingOperator, setListingOperator] = useState(false);
  const [listingDelivery, setListingDelivery] = useState(false);
  const { width: windowWidth } = useWindowDimensions();
  const t = copy[data.language];

  useEffect(() => {
    AsyncStorage.getItem(STORAGE_KEY)
      .then((stored) => {
        if (stored) {
          const parsed = JSON.parse(stored) as Partial<AppState>;
          const restoredOrders = Array.isArray(parsed.orders) ? parsed.orders : [];
          setData({
            ...initialState,
            ...parsed,
            orders: restoredOrders,
            pyatakId: parsed.pyatakId ?? null,
            pyatakName: parsed.pyatakName ?? null,
            listings: [...demoListings, ...(parsed.listings ?? []).filter((item) => !demoListings.some((demo) => demo.id === item.id))],
          });
        }
      })
      .catch((error: unknown) => {
        console.error('Unable to load saved Pyatak data', error);
        Alert.alert('Ошибка загрузки', 'Не удалось загрузить сохранённые данные. Попробуйте перезапустить приложение.');
      })
      .finally(() => setHydrated(true));
  }, []);

  useEffect(() => {
    if (!hydrated) return;
    AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(data)).catch((error: unknown) => {
      console.error('Unable to save Pyatak data', error);
      Alert.alert('Ошибка сохранения', 'Не удалось сохранить изменения на устройстве.');
    });
  }, [data, hydrated]);

  useEffect(() => {
    if (!hydrated || !backendConfigured) return;
    let active = true;
    let accountRequest = 0;
    let loadedAccountId: string | null = null;
    const applyUser = async (user: User | null) => {
      if (!active) return;
      const requestId = ++accountRequest;
      if (user?.id !== loadedAccountId) {
        loadedAccountId = user?.id ?? null;
        // Не трогаем локальные заявки (local- / quick-) — иначе пропадают после refresh
        setData((current) => ({
          ...current,
          orders: current.orders.filter((order) => isLocalOrderId(order.id)),
        }));
        setBackendOwnerListings([]);
        setBackendNotifications([]);
      }
      setBackendUser(user);
      if (!user) {
        setAccountLoading(false);
        setAccountError('');
        setBackendOwnerListings([]);
        setBackendNotifications([]);
        setRemoteListings(null);
        // Сохраняем локальные заказы после обновления страницы
        setData((current) => ({
          ...current,
          orders: current.orders.filter((order) => isLocalOrderId(order.id)),
        }));
        return;
      }
      setAccountLoading(true);
      setAccountError('');
      try {
        const profile = await fetchProfile(user.id);
        const [favorites, orders, ownerListings, notifications] = await Promise.all([
          fetchFavorites(user.id),
          fetchOrders(user.id, profile.preferred_language),
          fetchOwnerListings(user.id),
          fetchNotifications(user.id),
        ]);
        if (!active || requestId !== accountRequest) return;
        setData((current) => ({
          ...current,
          userName: profile.display_name,
          phone: user.phone ?? '',
          language: profile.preferred_language,
          city: profile.preferred_city || current.city,
          favorites,
          orders: mergeOrders(orders, current.orders),
        }));
        setBackendOwnerListings(ownerListings);
        setBackendNotifications(notifications);
      } catch (error) {
        console.error('Unable to load Supabase account data', error);
        if (active && requestId === accountRequest) {
          setAccountError(data.language === 'ru'
            ? 'Не удалось загрузить профиль и заказы. Проверьте подключение и попробуйте ещё раз.'
            : 'Профиль мен тапсырыстар жүктелмеді. Байланысты тексеріп, қайталап көріңіз.');
          Alert.alert('Ошибка синхронизации', 'Не удалось загрузить данные аккаунта. Проверьте подключение и попробуйте снова.');
        }
      } finally {
        if (active && requestId === accountRequest) setAccountLoading(false);
      }
    };

    const unsubscribe = subscribeToAuthChanges((user) => { void applyUser(user); });
    getCurrentUser()
      .then((user) => applyUser(user))
      .catch((error: unknown) => {
        console.error('Unable to restore Supabase session', error);
        if (active) Alert.alert('Ошибка авторизации', 'Не удалось восстановить сессию. Перезапустите приложение или войдите снова.');
      });

    return () => {
      active = false;
      unsubscribe();
    };
  }, [accountRefreshKey, data.language, hydrated]);

  useEffect(() => {
    if (!backendConfigured || !backendUser || activeTab !== 'orders') return;
    let active = true;
    setAccountLoading(true);
    setAccountError('');
    fetchOrders(backendUser.id, data.language)
      .then((orders) => {
        if (active) setData((current) => ({ ...current, orders: mergeOrders(orders, current.orders) }));
      })
      .catch((error: unknown) => {
        console.error('Unable to refresh Supabase orders', error);
        if (active) setAccountError(data.language === 'ru'
          ? 'Не удалось обновить заказы. Проверьте подключение и повторите попытку.'
          : 'Тапсырыстар жаңартылмады. Байланысты тексеріп, қайталап көріңіз.');
      })
      .finally(() => { if (active) setAccountLoading(false); });
    return () => { active = false; };
  }, [activeTab, backendUser, data.language, ordersRefreshKey]);

  useEffect(() => {
    if (!hydrated || !backendConfigured) return;
    let active = true;
    setBackendLoading(true);
    setBackendError('');
    fetchListings({
      query: search,
      city: filters.city || data.city,
      category: filters.category,
      maxPrice: filters.maxPrice,
      available: filters.available || Boolean(filters.date),
      operator: filters.operator,
      delivery: filters.delivery,
      onlineOnly: Boolean((filters as { onlineOnly?: boolean }).onlineOnly),
    })
      .then((results) => {
        if (active) setRemoteListings(results);
      })
      .catch((error: unknown) => {
        console.error('Unable to load Supabase equipment listings', error);
        if (active) {
          setBackendError(data.language === 'ru' ? 'Не удалось загрузить каталог. Проверьте подключение и повторите попытку.' : 'Каталог жүктелмеді. Байланысты тексеріп, қайталап көріңіз.');
        }
      })
      .finally(() => {
        if (active) setBackendLoading(false);
      });
    return () => { active = false; };
  }, [backendRefreshKey, data.city, data.language, filters, hydrated, search]);


  // Обновляем объявления владельца при входе в кабинет
  useEffect(() => {
    if (screen !== 'owner' || !backendConfigured || !backendUser) return;
    let active = true;
    fetchOwnerListings(backendUser.id)
      .then((ownerListings) => {
        if (!active) return;
        setBackendOwnerListings(ownerListings);
        setOwnerOnline(ownerListings.some((item) => item.isOnline));
      })
      .catch((error: unknown) => {
        console.error('Unable to refresh owner listings', error);
      });
    return () => { active = false; };
  }, [screen, backendUser, backendConfigured, backendRefreshKey]);

  useEffect(() => {
    if (activeTab !== 'messages') return;
    const orderId =
      chatOrderId ||
      data.orders.find((o) => o.status === 'accepted' || o.status === 'in_progress' || o.status === 'completed')?.id ||
      data.orders[0]?.id ||
      null;
    if (!orderId) {
      setData((current) => ({ ...current, messages: [] }));
      return;
    }
    if (chatOrderId !== orderId) setChatOrderId(orderId);
    let active = true;
    (async () => {
      const local = await loadLocalChat(orderId);
      if (!active) return;
      if (local.length) setData((current) => ({ ...current, messages: local }));
      if (backendConfigured && backendUser) {
        try {
          const remote = await fetchMessagesForOrder(orderId, backendUser.id);
          if (!active) return;
          // remote wins if has data; else keep local
          if (remote.length) {
            setData((current) => ({ ...current, messages: remote }));
            await saveLocalChat(orderId, remote);
          } else if (!local.length) {
            setData((current) => ({ ...current, messages: [] }));
          }
        } catch (error) {
          console.warn('Unable to load Supabase messages, using local', error);
          if (active && !local.length) setData((current) => ({ ...current, messages: [] }));
        }
      }
    })();
    return () => { active = false; };
  }, [activeTab, backendUser, data.orders, chatOrderId, backendConfigured]);

  useEffect(() => {
    if (screen !== 'notifications' || !backendUser || !backendConfigured) return;
    markNotificationsRead(backendUser.id)
      .then(() => setBackendNotifications((current) => current.map((item) => ({ ...item, read_at: item.read_at ?? new Date().toISOString() }))))
      .catch((error: unknown) => {
        console.error('Unable to mark Supabase notifications as read', error);
        Alert.alert('Ошибка', 'Не удалось отметить уведомления прочитанными.');
      });
  }, [backendUser, screen]);

  const listings = useMemo(() => {
    const query = search.trim().toLocaleLowerCase();
    // Если с сервера пусто — показываем демо, чтобы заявки с карточек работали
    const source = remoteListings && remoteListings.length > 0 ? remoteListings : data.listings;
    const filtered = source.filter((item) => {
      if (backendUser && item.ownerId === backendUser.id) return false;
      const matchesSearch = !query || `${item.title} ${item.model} ${item.category} ${item.city}`.toLocaleLowerCase().includes(query);
      return matchesSearch
        && (!filters.category || item.category === filters.category)
        && (!filters.available || item.available)
        && (!filters.operator || item.operator)
        && (!filters.delivery || item.delivery)
        && (!(filters as { onlineOnly?: boolean }).onlineOnly || item.isOnline)
        && (filters.maxPrice === null || item.price <= filters.maxPrice)
        && (!filters.city || item.city === filters.city)
        && (!data.pyatakId || !item.pyatakId || item.pyatakId === data.pyatakId || !item.isOnline)
        && (!filters.date || item.available)
        && (!favoritesOnly || data.favorites.includes(item.id));
    });
    // Онлайн на пятаке — выше в выдаче
    return filtered.sort((a, b) => Number(Boolean(b.isOnline)) - Number(Boolean(a.isOnline)));
  }, [backendUser, data.favorites, data.listings, data.pyatakId, favoritesOnly, filters, remoteListings, search]);

  const toggleFavorite = async (id: string) => {
    const isFavorite = data.favorites.includes(id);
    if (backendConfigured && backendUser && !id.startsWith('own-')) {
      try {
        await setBackendFavorite(backendUser.id, id, !isFavorite);
      } catch (error) {
        console.error('Unable to update Supabase favorite', error);
        Alert.alert('Ошибка', 'Не удалось обновить избранное. Попробуйте ещё раз.');
        return;
      }
    }
    setData((current) => ({
      ...current,
      favorites: current.favorites.includes(id) ? current.favorites.filter((item) => item !== id) : [...current.favorites, id],
    }));
  };

  const openListing = (item: Listing) => {
    setSelected(item);
    setImageIndex(0);
    setScreen('details');
  };

  const goToTab = (tab: AppTab) => {
    setActiveTab(tab);
    setScreen('main');
    if (tab === 'catalog') {
      setSearch('');
      setMapMode(false);
      setFavoritesOnly(false);
    }
  };

  const submitOrder = async () => {
    if (!selected) {
      safeAlert(t.order, data.language === 'ru' ? 'Сначала выберите технику' : 'Алдымен техниканы таңдаңыз');
      return;
    }

    const slots = getUpcomingBookingDates(selected.availability);
    let selectedBookingDate =
      (date ? slots.find((candidate) => candidate.toISOString() === date) : undefined) ?? slots[0];

    if (!selectedBookingDate) {
      selectedBookingDate = new Date();
      selectedBookingDate.setDate(selectedBookingDate.getDate() + 1);
      selectedBookingDate.setHours(9, 0, 0, 0);
    }

    const finalAddress = address.trim().length >= 3
      ? address.trim()
      : (data.language === 'ru' ? 'Адрес уточню по телефону' : 'Мекенжайды телефон арқылы нақтылаймын');

    // Сервер только для реальных UUID + авторизованный пользователь
    if (backendConfigured && backendUser && isUuid(selected.id)) {
      setBackendBusy(true);
      try {
        const order = await createBackendOrder({
          listingId: selected.id,
          customerId: backendUser.id,
          startsAt: selectedBookingDate,
          durationHours: duration || 4,
          address: finalAddress,
          comment: comment.trim(),
        }, data.language);
        setData((current) => ({ ...current, orders: mergeOrders([order], current.orders) }));
        setScreen('main');
        setActiveTab('orders');
        setOrdersFilter('all');
        setAddress('');
        setComment('');
        safeAlert(t.sent, data.language === 'ru'
          ? 'Заявка отправлена владельцу. Оплата не производилась.'
          : 'Өтінім иесіне жіберілді. Төлем жасалған жоқ.');
      } catch (error) {
        console.error('Unable to create Supabase order', error);
        const details = error instanceof Error ? error.message : String(error);
        const localOrder: Order = {
          id: `local-${Date.now()}`,
          listingId: selected.id,
          listingTitle: `${selected.title} ${selected.model}`,
          image: selected.image,
          date: bookingDateLabel(selectedBookingDate, data.language),
          duration: duration || 4,
          address: finalAddress,
          comment: comment.trim(),
          total: selected.price * (duration || 4),
          status: 'Заявка отправлена',
          createdAt: new Date().toISOString(),
        };
        setData((current) => ({ ...current, orders: [localOrder, ...current.orders] }));
        setScreen('main');
        setActiveTab('orders');
        setOrdersFilter('all');
        setAddress('');
        setComment('');
        safeAlert(
          t.sent,
          data.language === 'ru'
            ? `Заявка сохранена на устройстве (сервер недоступен).\n\n${details}`
            : `Өтінім құрылғыда сақталды (сервер қолжетімсіз).\n\n${details}`,
        );
      } finally {
        setBackendBusy(false);
      }
      return;
    }

    // Демо / без UUID: публикуем как service_request, чтобы видели другие
    if (backendConfigured && backendUser) {
      setBackendBusy(true);
      try {
        const order = await createBackendServiceRequest({
          customerId: backendUser.id,
          listingId: selected.id,
          category: selected.category,
          city: data.city || selected.city,
          pyatakName: data.pyatakName,
          title: `${selected.title} ${selected.model}`,
          address: finalAddress,
          comment: comment.trim(),
          durationHours: duration || 4,
          hourlyRate: selected.price,
          imageUrl: selected.image,
        }, data.language);
        setData((current) => ({ ...current, orders: mergeOrders([order], current.orders) }));
        setScreen('main');
        setActiveTab('orders');
        setOrdersFilter('all');
        setAddress('');
        setComment('');
        safeAlert(
          t.sent,
          data.language === 'ru'
            ? 'Заявка опубликована. Владельцы техники в городе её видят.'
            : 'Өтінім жарияланды. Қаладағы техника иелері оны көреді.',
        );
      } catch (error) {
        console.error('Unable to create service request', error);
        const details = error instanceof Error ? error.message : String(error);
        const order: Order = {
          id: `local-${Date.now()}`,
          listingId: selected.id,
          listingTitle: `${selected.title} ${selected.model}`,
          image: selected.image,
          date: bookingDateLabel(selectedBookingDate, data.language),
          duration: duration || 4,
          address: finalAddress,
          comment: comment.trim(),
          total: selected.price * (duration || 4),
          status: 'Заявка отправлена',
          createdAt: new Date().toISOString(),
        };
        setData((current) => ({ ...current, orders: [order, ...current.orders] }));
        setScreen('main');
        setActiveTab('orders');
        setOrdersFilter('all');
        setAddress('');
        setComment('');
        safeAlert(
          t.sent,
          data.language === 'ru'
            ? `Заявка сохранена только у вас. Чтобы её видели другие — примените миграцию service_requests в Supabase.\n\n${details}`
            : `Өтінім тек сізде сақталды.\n\n${details}`,
        );
      } finally {
        setBackendBusy(false);
      }
      return;
    }

    if (backendConfigured && !backendUser) {
      safeAlert(
        t.profile,
        data.language === 'ru'
          ? 'Войдите в аккаунт, чтобы заявку видели владельцы техники. Без входа заявка останется только на этом устройстве.'
          : 'Техника иелері көруі үшін аккаунтқа кіріңіз.',
      );
      // всё равно сохраняем локально
    }

    const order: Order = {
      id: `local-${Date.now()}`,
      listingId: selected.id,
      listingTitle: `${selected.title} ${selected.model}`,
      image: selected.image,
      date: bookingDateLabel(selectedBookingDate, data.language),
      duration: duration || 4,
      address: finalAddress,
      comment: comment.trim(),
      total: selected.price * (duration || 4),
      status: 'Заявка отправлена',
      createdAt: new Date().toISOString(),
    };
    setData((current) => ({ ...current, orders: [order, ...current.orders] }));
    setScreen('main');
    setActiveTab('orders');
    setOrdersFilter('all');
    setAddress('');
    setComment('');
    safeAlert(
      t.sent,
      data.language === 'ru'
        ? 'Заявка сохранена локально. Чтобы её видели другие люди — войдите в аккаунт.'
        : 'Өтінім жергілікті сақталды. Басқалар көруі үшін аккаунтқа кіріңіз.',
    );
  };

  const saveProfile = async () => {
    if (backendConfigured && !backendUser) {
      if (authMethod === 'phone') {
        if (authCodeSent) await verifyAuthCode();
        else await sendAuthCode();
      } else await submitEmailAuth();
      return;
    }
    if (!profileName.trim()) {
      Alert.alert('Укажите имя', 'Введите имя, чтобы сохранить профиль.');
      return;
    }
    if (backendConfigured) {
      if (!backendUser) return;
      setBackendBusy(true);
      try {
        await updateBackendProfile(backendUser.id, profileName.trim(), data.language, data.city);
      } catch (error) {
        console.error('Unable to update Supabase profile', error);
        Alert.alert('Ошибка сохранения', t.saveProfileError);
        return;
      } finally {
        setBackendBusy(false);
      }
    }
    setData((current) => ({ ...current, userName: profileName.trim(), phone: profilePhone.trim() }));
    setProfileOpen(false);
    if (backendConfigured) Alert.alert(t.profile, t.profileSaved);
  };

  const submitEmailAuth = async () => {
    if (!profileEmail.trim() || !authPassword) {
      Alert.alert(t.profile, t.authRequiredFields);
      return;
    }
    if (emailAuthMode === 'register' && !profileName.trim()) {
      Alert.alert(t.name, data.language === 'ru' ? 'Введите имя для регистрации.' : 'Тіркелу үшін атыңызды енгізіңіз.');
      return;
    }
    if (authPassword.length < 6) {
      Alert.alert(t.password, t.passwordHint);
      return;
    }
    setBackendBusy(true);
    try {
      if (emailAuthMode === 'register') {
        const result = await registerWithEmail(profileEmail, authPassword, profileName);
        if (result.emailConfirmationRequired) {
          setEmailAuthMode('login');
          Alert.alert(t.profile, t.emailConfirmation);
          return;
        }
        if (result.user && profileName.trim()) {
          await updateBackendProfile(result.user.id, profileName.trim(), data.language, data.city);
          setData((current) => ({ ...current, userName: profileName.trim() }));
        }
      } else {
        await signInWithEmail(profileEmail, authPassword);
      }
      setAuthPassword('');
      setProfileOpen(false);
    } catch (error) {
      console.error(`Unable to ${emailAuthMode} with Supabase email`, error);
      Alert.alert(t.profile, emailAuthMode === 'register' ? t.emailRegisterError : t.emailAuthError);
    } finally {
      setBackendBusy(false);
    }
  };

  const sendAuthCode = async () => {
    if (!backendConfigured) {
      Alert.alert(t.profile, t.backendRequired);
      return;
    }
    if (!profilePhone.trim()) {
      Alert.alert(t.phone, t.authPhoneHint);
      return;
    }
    setBackendBusy(true);
    try {
      await requestPhoneCode(profilePhone, profileName);
      setAuthCodeSent(true);
      Alert.alert(t.profile, t.otpSent);
    } catch (error) {
      console.error('Unable to request Supabase SMS code', error);
      Alert.alert('Не удалось отправить код', 'Проверьте номер и настройки Phone Auth/SMS в Supabase.');
    } finally {
      setBackendBusy(false);
    }
  };

  const verifyAuthCode = async () => {
    if (!authCode.trim()) {
      Alert.alert(t.phoneCode, t.phoneCode);
      return;
    }
    setBackendBusy(true);
    try {
      const user = await verifyPhoneCode(profilePhone, authCode);
      setBackendUser(user);
      setAuthCode('');
      setAuthCodeSent(false);
      setProfileOpen(false);
      if (user?.phone) setData((current) => ({ ...current, phone: user.phone ?? current.phone }));
      if (user && profileName.trim()) {
        try {
          await updateBackendProfile(user.id, profileName.trim(), data.language, data.city);
          setData((current) => ({ ...current, userName: profileName.trim() }));
        } catch (error) {
          console.error('Unable to save profile after Supabase sign-in', error);
          Alert.alert('Ошибка профиля', t.saveProfileError);
        }
      }
    } catch (error) {
      console.error('Unable to verify Supabase SMS code', error);
      Alert.alert('Не удалось войти', 'Проверьте SMS-код и попробуйте ещё раз.');
    } finally {
      setBackendBusy(false);
    }
  };

  const changeOrderStatus = async (order: Order, status: OrderStatus) => {
    if (!backendUser || !backendConfigured) {
      setData((current) => ({
        ...current,
        orders: current.orders.map((item) => (item.id === order.id ? { ...item, status } : item)),
      }));
      return;
    }
    setBackendBusy(true);
    try {
      if (status === 'accepted' && order.isOwner) {
        // Сначала service_request (открытые заявки), потом classic orders
        try {
          await acceptBackendServiceRequest(order.id, backendUser.id);
        } catch (acceptError) {
          console.warn('acceptServiceRequest failed, trying setOrderStatus', acceptError);
          await setBackendOrderStatus(order.id, 'accepted');
        }
      } else if ((status === 'declined' || status === 'cancelled') && order.isOwner) {
        await setBackendOrderStatus(order.id, 'cancelled');
      } else {
        await setBackendOrderStatus(order.id, status);
      }

      // Оптимистично обновляем UI сразу
      setData((current) => ({
        ...current,
        orders: current.orders.map((item) =>
          item.id === order.id
            ? {
                ...item,
                status: status === 'declined' ? 'cancelled' : status === 'accepted' ? 'accepted' : status,
                isOwner: status === 'accepted' ? true : item.isOwner,
              }
            : item,
        ),
      }));
      setOrdersRefreshKey((key) => key + 1);
      if (status === 'accepted') {
        safeAlert(
          data.language === 'ru' ? 'Заявка принята' : 'Өтінім қабылданды',
          data.language === 'ru' ? 'Клиент увидит статус «Подтверждена».' : 'Клиент статусты көреді.',
        );
      }
    } catch (error) {
      console.error('Unable to update Supabase order status', error);
      let details = 'Не удалось обновить статус заявки.';
      if (error instanceof Error) details = error.message;
      else if (error && typeof error === 'object') {
        const e = error as { message?: string; details?: string };
        details = [e.message, e.details].filter(Boolean).join(' — ') || details;
      }
      safeAlert('Ошибка заказа', details);
    } finally {
      setBackendBusy(false);
    }
  };

  const logout = async () => {
    try {
      await signOut();
      setAuthCode('');
      setAuthCodeSent(false);
    } catch (error) {
      console.error('Unable to sign out from Supabase', error);
      Alert.alert('Ошибка', 'Не удалось выйти из аккаунта. Попробуйте ещё раз.');
    }
  };

  const changeLanguage = async () => {
    const language: Language = data.language === 'ru' ? 'kk' : 'ru';
    if (backendConfigured && backendUser) {
      try {
        await updateBackendProfile(backendUser.id, data.userName, language, data.city);
      } catch (error) {
        console.error('Unable to update preferred language', error);
        Alert.alert('Ошибка', 'Не удалось сохранить язык в профиле.');
        return;
      }
    }
    setData((current) => ({ ...current, language }));
  };

  const changePreferredCity = async (city: string) => {
    if (backendConfigured && backendUser) {
      setBackendBusy(true);
      try {
        await updateBackendProfile(backendUser.id, data.userName, data.language, city);
      } catch (error) {
        console.error('Unable to save preferred city', error);
        Alert.alert('Ошибка', t.saveProfileError);
        return;
      } finally {
        setBackendBusy(false);
      }
    } else if (backendConfigured) {
      Alert.alert(t.settings, t.signInToSaveSettings);
      setCityOpen(false);
      return;
    }
    setData((current) => ({ ...current, city, pyatakId: null, pyatakName: null }));
    setCityOpen(false);
    // После выбора города сразу предлагаем выбрать пятак
    setScreen('pyatak-select');
  };

  const cancelOrder = (order: Order) => {
    if (!backendUser) return;
    Alert.alert(t.cancelOrder, t.orderInfo, [
      { text: data.language === 'ru' ? 'Назад' : 'Артқа', style: 'cancel' },
      {
        text: t.cancelOrder,
        style: 'destructive',
        onPress: () => { void changeOrderStatus(order, 'cancelled'); },
      },
    ]);
  };

  const openChat = (order: Order) => {
    setChatOrderId(order.id);
    setActiveTab('messages');
    setScreen('main');
  };

  const sendMessage = async () => {
    const text = messageText.trim();
    if (!text) return;

    const order =
      data.orders.find((o) => o.id === chatOrderId) ||
      data.orders.find((o) => o.status === 'accepted' || o.status === 'in_progress') ||
      data.orders[0];

    if (!order) {
      safeAlert(t.messages, t.emptyChat);
      return;
    }

    const now = new Date();
    const localMsg = {
      id: `local-${Date.now()}`,
      text,
      mine: true as const,
      time: now.toLocaleTimeString(data.language === 'ru' ? 'ru-RU' : 'kk-KZ', { hour: '2-digit', minute: '2-digit' }),
      senderName: data.userName?.trim() || (data.language === 'ru' ? 'Вы' : 'Сіз'),
      senderRole: 'you',
    };

    // 1) Сразу показываем локально — чат не «молчаливый»
    const nextMessages = [...data.messages, localMsg];
    setData((current) => ({ ...current, messages: nextMessages }));
    setMessageText('');
    await saveLocalChat(order.id, nextMessages);

    // 2) Пытаемся отправить на сервер
    if (backendConfigured && backendUser) {
      setBackendBusy(true);
      try {
        await sendBackendMessage(order.id, backendUser.id, text, {
          customerId: order.customerId,
          ownerId: order.acceptedBy || (order.isOwner ? backendUser.id : undefined),
        });
        const remote = await fetchMessagesForOrder(order.id, backendUser.id);
        if (remote.length) {
          setData((current) => ({ ...current, messages: remote }));
          await saveLocalChat(order.id, remote);
        }
      } catch (error) {
        console.warn('Server send failed, message kept locally', error);
        // не пугаем блокирующей ошибкой — сообщение уже в локальном чате
      } finally {
        setBackendBusy(false);
      }
    }
  };

  const choosePhotos = async () => {
    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) {
      Alert.alert('Нужен доступ к фото', 'Разрешите доступ к галерее, чтобы добавить фотографии техники.');
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      allowsMultipleSelection: true,
      selectionLimit: 5,
      quality: 0.75,
    });
    if (!result.canceled) setListingPhotos(result.assets.map((asset) => asset.uri).slice(0, 5));
  };


  const toggleOwnerOnline = async (next: boolean) => {
    if (!backendConfigured || !backendUser) {
      safeAlert(
        t.profile,
        data.language === 'ru'
          ? 'Войдите в аккаунт, чтобы встать на пятак. Без входа статус виден только вам.'
          : 'Пятакқа тұру үшін аккаунтқа кіріңіз.',
      );
      setOwnerOnline(next);
      setData((current) => ({
        ...current,
        listings: current.listings.map((item) =>
          item.id.startsWith('own-')
            ? { ...item, isOnline: next, pyatakId: current.pyatakId, pyatakName: current.pyatakName }
            : item,
        ),
      }));
      return;
    }
    if (next && !data.pyatakId && !data.pyatakName) {
      safeAlert(
        data.language === 'ru' ? 'Выберите пятак' : 'Пятакты таңдаңыз',
        data.language === 'ru'
          ? 'Сначала выберите пятак в шапке приложения, затем встаньте на него.'
          : 'Алдымен пятакты таңдаңыз.',
      );
      setScreen('pyatak-select');
      return;
    }
    setBackendBusy(true);
    try {
      const pyatakUuid =
        data.pyatakId && /^[0-9a-f-]{36}$/i.test(data.pyatakId) ? data.pyatakId : null;
      const updated = await setBackendOwnerOnline({
        ownerId: backendUser.id,
        online: next,
        pyatakId: pyatakUuid,
      });
      setOwnerOnline(next);
      setBackendOwnerListings((current) =>
        current.map((item) => ({
          ...item,
          isOnline: next,
          onlineAt: next ? new Date().toISOString() : null,
          pyatakId: pyatakUuid ?? item.pyatakId,
          pyatakName: data.pyatakName ?? item.pyatakName,
        })),
      );
      setBackendRefreshKey((k) => k + 1);
      if (next && updated === 0) {
        safeAlert(
          data.language === 'ru' ? 'Почти готово' : 'Дайын дерлік',
          data.language === 'ru'
            ? 'Статус сохранён, но у вас нет своих объявлений. Добавьте технику — тогда клиенты увидят вас на пятаке.'
            : 'Статус сақталды, бірақ жарияланым жоқ. Техника қосыңыз.',
        );
      } else {
        safeAlert(
          next
            ? (data.language === 'ru' ? 'Вы на пятаке' : 'Сіз пятактасыз')
            : (data.language === 'ru' ? 'Вы офлайн' : 'Сіз офлайнсыз'),
          next
            ? (data.language === 'ru'
              ? `Статус «онлайн» · обновлено объявлений: ${updated}${data.pyatakName ? ` · ${data.pyatakName}` : ''}`
              : `Онлайн · ${updated}`)
            : (data.language === 'ru'
              ? 'Клиенты больше не видят вас на пятаке.'
              : 'Клиенттер сізді пятакта көрмейді.'),
        );
      }
    } catch (error) {
      console.error('setOwnerOnline failed', error);
      let details = 'Неизвестная ошибка';
      if (error instanceof Error) details = error.message;
      else if (typeof error === 'string') details = error;
      else if (error && typeof error === 'object') {
        const e = error as { message?: string; details?: string; hint?: string };
        details = [e.message, e.details, e.hint].filter(Boolean).join(' — ') || JSON.stringify(error);
      }
      safeAlert(
        data.language === 'ru' ? 'Не удалось сменить статус' : 'Статусты өзгерту мүмкін болмады',
        details,
      );
    } finally {
      setBackendBusy(false);
    }
  };

  const publishListing = async () => {
    const numericPrice = Number(listingPrice.replace(/\s/g, '').replace(',', '.'));
    if (!listingTitle.trim() || !listingModel.trim() || !Number.isFinite(numericPrice) || numericPrice <= 0 || listingDays.length === 0) {
      Alert.alert('Проверьте объявление', 'Добавьте название, модель, корректную цену за час и хотя бы один день доступности.');
      return;
    }
    const newListing: Listing = {
      id: `own-${Date.now()}`,
      title: listingTitle.trim(),
      model: listingModel.trim(),
      category: listingCategory,
      price: numericPrice,
      city: data.city,
      distance: 'Рядом',
      rating: 0,
      reviews: 0,
      image: listingPhotos[0] ?? demoListings[0].image,
      images: listingPhotos.length ? listingPhotos : undefined,
      availability: listingDays,
      available: true,
      operator: listingOperator,
      delivery: listingDelivery,
      owner: data.userName || 'Ваше объявление',
      experience: 'Новое объявление',
      description: listingDescription.trim() || 'Уточните детали у владельца техники.',
      specs: ['Цена за час указана', listingOperator ? 'Оператор предоставляется' : 'Без оператора', listingDelivery ? 'Доставка на объект' : 'Доставка не включена'],
    };
    if (backendConfigured) {
      if (!backendUser) {
        Alert.alert(t.profile, t.requestLogin);
        setActiveTab('profile');
        setScreen('main');
        return;
      }
      setBackendBusy(true);
      try {
        const listing = await createBackendListing({
          ownerId: backendUser.id,
          title: listingTitle.trim(),
          model: listingModel.trim(),
          category: listingCategory,
          hourlyRate: numericPrice,
          city: data.city,
          description: listingDescription.trim(),
          availability: listingDays as Weekday[],
          operatorIncluded: listingOperator,
          deliveryAvailable: listingDelivery,
          photos: listingPhotos,
          isOnline: ownerOnline,
          pyatakId: data.pyatakId,
        });
        setBackendOwnerListings((current) => [listing, ...current]);
        setRemoteListings((current) => current ? [listing, ...current] : current);
        resetListingForm();
        setScreen('owner');
        Alert.alert(t.saveListing, 'Объявление опубликовано. Заказы оформляются без онлайн-оплаты.');
      } catch (error) {
        console.error('Unable to publish Supabase listing', error);
        const details = error instanceof Error ? error.message : String(error);
        Alert.alert(t.saveListing, `${t.listingPublishFailed}\n\n${details}`);
      } finally {
        setBackendBusy(false);
      }
      return;
    }
    setData((current) => ({ ...current, listings: [newListing, ...current.listings] }));
    resetListingForm();
    setScreen('owner');
    Alert.alert('Черновик сохранён', 'Объявление сохранено на устройстве в демо-режиме. Для публикации на маркетплейсе понадобится сервер.');
  };

  const resetListingForm = () => {
    setListingTitle('');
    setListingModel('');
    setListingPrice('');
    setListingDescription('');
    setListingPhotos([]);
    setListingDays(weekdays.map((day) => day.id));
    setListingOperator(false);
    setListingDelivery(false);
    setWizardStep(1);
  };

  const openProfileEditor = () => {
    setProfileName(data.userName);
    setProfilePhone(data.phone);
    setAuthCode('');
    setAuthCodeSent(false);
    setAuthMethod('email');
    setEmailAuthMode('register');
    setProfileEmail(backendUser?.email ?? '');
    setAuthPassword('');
    setProfileOpen(true);
  };

  const header = (title: string, backAction?: () => void) => (
    <View style={styles.pageHeader}>
      {backAction ? (
        <Pressable onPress={backAction} style={styles.backButton} accessibilityLabel="Назад">
          <Feather name="arrow-left" size={21} color={COLORS.ink} />
        </Pressable>
      ) : null}
      <Text style={styles.pageTitle}>{title}</Text>
      {!backAction ? <View style={{ width: 36 }} /> : null}
    </View>
  );

  const listingCard = (item: Listing, compact = false) => {
    const isFavorite = data.favorites.includes(item.id);
    return (
      <Pressable
        key={item.id}
        style={[styles.listingCard, compact && styles.compactCard, !compact && styles.marketplaceCard]}
        onPress={() => openListing(item)}
      >
        <View style={styles.cardImageWrap}>
          <Image source={{ uri: item.image }} style={styles.cardImage} resizeMode="cover" />
          <View style={[styles.availabilityBadge, styles.marketplaceStatus]}>
            <View style={[styles.availabilityDot, item.isOnline ? { backgroundColor: '#22C55E' } : (!item.available && styles.busyDot)]} />
            <Badge variant={item.available || item.isOnline ? 'secondary' : 'outline'} className={item.isOnline ? 'bg-green-50 border-green-100' : (item.available ? 'bg-green-50 border-green-100' : 'bg-white/90')}>
              <ReusableText className={item.isOnline || item.available ? 'text-green-700 text-[10px]' : 'text-neutral-700 text-[10px]'}>
                {item.isOnline ? (data.language === 'ru' ? 'На пятаке' : 'Пятакте') : (item.available ? t.available : t.unavailable)}
              </ReusableText>
            </Badge>
          </View>
          <Pressable
            style={styles.favoriteButton}
            onPress={(event) => {
              event.stopPropagation();
              toggleFavorite(item.id);
            }}
            accessibilityLabel={isFavorite ? 'Убрать из избранного' : 'В избранное'}
          >
            <Feather name="heart" size={18} color={isFavorite ? ORANGE : '#222'} />
          </Pressable>
        </View>
        <View style={styles.cardContent}>
          <View style={styles.marketplaceCategoryRow}>
            <Badge variant="outline" className="border-orange-200 bg-orange-50">
              <ReusableText className="text-orange-700 text-[10px] font-semibold">
                {data.language === 'kk' ? categoryKK[item.category] : item.category}
              </ReusableText>
            </Badge>
            <View style={styles.marketplaceRating}>
              <Feather name="star" size={13} color="#E99A1E" />
              <Text style={styles.marketplaceRatingText}>{item.rating ? item.rating.toFixed(1) : (data.language === 'ru' ? 'Новый' : 'Жаңа')}</Text>
              {item.reviews > 0 ? <Text style={styles.marketplaceReviewCount}>({item.reviews})</Text> : null}
            </View>
          </View>
          <Text style={styles.listingName} numberOfLines={1}>{item.title}</Text>
          <Text style={styles.listingModel} numberOfLines={1}>{item.model}</Text>
          <Text style={styles.listingPrice}>{moneyPerHour(item.price, data.language)}</Text>
          <View style={[styles.cardMeta, styles.marketplaceMeta]}>
            <View style={styles.inlineMeta}>
              <Feather name="map-pin" size={13} color={COLORS.muted} />
              <Text style={styles.metaText}>{item.city} · {item.distance}</Text>
            </View>
          </View>
        </View>
      </Pressable>
    );
  };

  const categoryRail = () => (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.categoryRail}>
      {categories.map((item) => (
        <Pressable
          key={item.title}
          style={styles.categoryItem}
          onPress={() => {
            setFilters((current) => ({ ...current, category: current.category === item.title ? null : item.title }));
            setActiveTab('catalog');
            setFavoritesOnly(false);
            setScreen('main');
          }}
        >
          <View style={[styles.categoryIcon, filters.category === item.title && styles.categoryIconSelected]}>
            <Feather name={item.icon as keyof typeof Feather.glyphMap} size={22} color={filters.category === item.title ? ORANGE : COLORS.ink} />
          </View>
          <Text style={styles.categoryLabel} numberOfLines={2}>{data.language === 'kk' ? categoryKK[item.title] : item.title}</Text>
        </Pressable>
      ))}
    </ScrollView>
  );

  const homeScreen = () => (
    <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
      <View style={styles.topHeader}>
        <View>
          <Text style={styles.brand}>ПЯТАК<Text style={styles.brandDot}>.</Text></Text>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 2 }}>
            <Pressable style={styles.citySelector} onPress={() => setCityOpen(true)}>
              <Feather name="map-pin" size={13} color={ORANGE} />
              <Text style={styles.cityText}>{data.city}</Text>
              <Feather name="chevron-down" size={14} color={COLORS.muted} />
            </Pressable>
            <Pressable
              style={[styles.citySelector, { backgroundColor: data.pyatakName ? '#FFF7F1' : '#F5F5F5' }]}
              onPress={() => setScreen('pyatak-select')}
            >
              <Feather name="navigation" size={12} color={ORANGE} />
              <Text style={[styles.cityText, { maxWidth: 120 }]} numberOfLines={1}>
                {data.pyatakName || t.pyatak}
              </Text>
              <Feather name="chevron-down" size={14} color={COLORS.muted} />
            </Pressable>
          </View>
        </View>
        <Pressable style={styles.iconButton} onPress={() => setScreen('notifications')} accessibilityLabel={t.notifications}>
          <Feather name="bell" size={20} color={COLORS.ink} />
        </Pressable>
      </View>

      <View style={styles.searchBox}>
        <Feather name="search" size={19} color={COLORS.muted} />
        <TextInput value={search} onChangeText={setSearch} placeholder={t.search} placeholderTextColor="#A0A0A0" style={styles.searchInput} returnKeyType="search" onSubmitEditing={() => { setActiveTab('catalog'); setMapMode(false); setFavoritesOnly(false); setScreen('main'); }} />
        {search ? <Pressable onPress={() => setSearch('')}><Feather name="x-circle" size={17} color={COLORS.muted} /></Pressable> : null}
      </View>

      {categoryRail()}

      <View style={styles.hero}>
        <View style={styles.heroTextBlock}>
          <Text style={styles.heroTitle}>{t.hero}</Text>
          <Text style={styles.heroSubtitle}>{t.heroSub}</Text>
          <Pressable style={styles.heroButton} onPress={() => setScreen('quick-request')}>
            <Text style={styles.heroButtonText}>{t.find}</Text>
            <Feather name="arrow-right" size={17} color={ORANGE} />
          </Pressable>
        </View>
        <View style={styles.heroDecor}>
          <Feather name="truck" size={75} color="rgba(255,255,255,0.22)" />
          <View style={styles.heroCircle} />
        </View>
        <View style={styles.heroSpeckle} />
      </View>

      {search ? (
        <View style={styles.section}>
          <SectionHeading title={t.catalog} action={t.all} onPress={() => goToTab('catalog')} />
          {listings.length ? <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.horizontalCards}>{listings.slice(0, 5).map((item) => listingCard(item, true))}</ScrollView> : <EmptyState title={t.noResults} />}
        </View>
      ) : (
        <>
          <View style={styles.section}>
            <SectionHeading title={t.nearby} action={t.all} onPress={() => goToTab('catalog')} />
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.horizontalCards}>{data.listings.slice(0, 4).map((item) => listingCard(item, true))}</ScrollView>
          </View>
          <View style={styles.section}>
            <SectionHeading title={t.offers} action={t.all} onPress={() => goToTab('catalog')} />
            <Pressable style={styles.offerCard} onPress={() => goToTab('catalog')}>
              <View style={styles.offerIcon}><Feather name="zap" size={18} color={ORANGE} /></View>
              <View style={{ flex: 1 }}>
                <Text style={styles.offerTitle}>{data.language === 'ru' ? 'Техника на ваш объект' : 'Нысаныңызға техника'}</Text>
                <Text style={styles.offerSubtitle}>{data.language === 'ru' ? 'Уточните цену и свободное время у владельца' : 'Баға мен бос уақытты иесінен біліңіз'}</Text>
              </View>
              <Feather name="arrow-up-right" size={17} color={COLORS.muted} />
            </Pressable>
          </View>
          <View style={styles.section}>
            <SectionHeading title={t.recent} action={t.all} onPress={() => goToTab('catalog')} />
            {data.listings.slice(4, 7).map((item) => listingCard(item))}
          </View>
        </>
      )}

      <Pressable style={styles.ownerBanner} onPress={() => setScreen('owner')}>
        <View style={styles.ownerBannerIcon}><Feather name="briefcase" size={20} color={ORANGE} /></View>
        <View style={{ flex: 1 }}>
          <Text style={styles.ownerBannerTitle}>{t.rentOut}</Text>
          <Text style={styles.ownerBannerSubtitle}>{data.language === 'ru' ? 'Заявки и объявления — в одном месте' : 'Өтінімдер мен хабарландырулар бір жерде'}</Text>
        </View>
        <Feather name="chevron-right" size={19} color={COLORS.ink} />
      </Pressable>
      <DemoNote text={backendConfigured ? t.remoteMode : t.demoSub} />
    </ScrollView>
  );

  const catalogScreen = () => (
    <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
      {header(favoritesOnly ? t.favorites : t.catalog)}
      <View style={styles.searchBox}>
        <Feather name="search" size={19} color={COLORS.muted} />
        <TextInput value={search} onChangeText={setSearch} placeholder={t.search} placeholderTextColor="#A0A0A0" style={styles.searchInput} returnKeyType="search" />
        {!!search && <Pressable onPress={() => setSearch('')}><Feather name="x-circle" size={17} color={COLORS.muted} /></Pressable>}
      </View>
      <View style={styles.catalogControls}>
        <Pressable style={styles.filterButton} onPress={() => setFilterOpen(true)}>
          <Feather name="sliders" size={17} color={COLORS.ink} />
          <Text style={styles.filterButtonText}>{t.filters}</Text>
          {(filters.category || filters.available || filters.operator || filters.delivery || filters.maxPrice || filters.city || filters.date) ? <View style={styles.filterCount} /> : null}
        </Pressable>
        <View style={styles.viewToggle}>
          <Pressable onPress={() => setMapMode(false)} style={[styles.toggleOption, !mapMode && styles.toggleOptionActive]}>
            <Feather name="list" size={15} color={!mapMode ? COLORS.ink : COLORS.muted} /><Text style={[styles.toggleLabel, !mapMode && styles.toggleLabelActive]}>{t.list}</Text>
          </Pressable>
          <Pressable onPress={() => setMapMode(true)} style={[styles.toggleOption, mapMode && styles.toggleOptionActive]}>
            <Feather name="map" size={15} color={mapMode ? COLORS.ink : COLORS.muted} /><Text style={[styles.toggleLabel, mapMode && styles.toggleLabelActive]}>{t.map}</Text>
          </Pressable>
        </View>
      </View>
      {(filters.category || filters.city || filters.maxPrice || filters.date) ? (
        <View style={styles.activeFilters}>
          {filters.category ? <Pressable style={styles.activeFilter} onPress={() => setFilters((current) => ({ ...current, category: null }))}><Text style={styles.activeFilterText}>{data.language === 'kk' ? categoryKK[filters.category] : filters.category}</Text><Feather name="x" size={14} color={ORANGE} /></Pressable> : null}
          {filters.city ? <Pressable style={styles.activeFilter} onPress={() => setFilters((current) => ({ ...current, city: null }))}><Text style={styles.activeFilterText}>{filters.city}</Text><Feather name="x" size={14} color={ORANGE} /></Pressable> : null}
          {filters.maxPrice ? <Pressable style={styles.activeFilter} onPress={() => setFilters((current) => ({ ...current, maxPrice: null }))}><Text style={styles.activeFilterText}>≤ {formatPrice(filters.maxPrice)}</Text><Feather name="x" size={14} color={ORANGE} /></Pressable> : null}
          {filters.date ? <Pressable style={styles.activeFilter} onPress={() => setFilters((current) => ({ ...current, date: null }))}><Text style={styles.activeFilterText}>{filters.date}</Text><Feather name="x" size={14} color={ORANGE} /></Pressable> : null}
        </View>
      ) : null}
      {backendError ? <View style={styles.backendError}><Text style={styles.backendErrorText}>{backendError}</Text><Pressable onPress={() => setBackendRefreshKey((key) => key + 1)}><Text style={styles.sectionAction}>{data.language === 'ru' ? 'Повторить' : 'Қайталау'}</Text></Pressable></View> : null}
      {mapMode ? (
        <View style={styles.mapPlaceholder}>
          <View style={styles.mapGrid} />
          <View style={styles.mapPin}><Feather name="map-pin" size={20} color="#fff" /></View>
          <Text style={styles.mapTitle}>{data.city}</Text>
          <Text style={styles.mapHint}>{t.mapDemo}</Text>
          <Pressable style={styles.mapListButton} onPress={() => setMapMode(false)}><Feather name="list" size={16} color={ORANGE} /><Text style={styles.mapListText}>{t.list}</Text></Pressable>
        </View>
      ) : backendLoading && !remoteListings ? <ActivityIndicator style={styles.backendLoader} color={ORANGE} /> : listings.length ? listings.map((item) => listingCard(item)) : <EmptyState title={favoritesOnly ? t.favorites : t.noResults} />}
      <DemoNote text={backendConfigured ? t.remoteMode : t.demoSub} />
    </ScrollView>
  );

  const detailsScreen = () => {
    if (!selected) return null;
    const images = selected.images?.length ? selected.images : [selected.image];
    const galleryWidth = windowWidth - 40;
    return (
      <View style={styles.flex}>
        <ScrollView contentContainerStyle={[styles.scrollContent, { paddingBottom: 124 }]} showsVerticalScrollIndicator={false}>
          {header(t.details, () => setScreen('main'))}
          <View style={styles.detailImageWrap}>
            <ScrollView
              horizontal
              pagingEnabled
              showsHorizontalScrollIndicator={false}
              onMomentumScrollEnd={(event) => setImageIndex(Math.round(event.nativeEvent.contentOffset.x / galleryWidth))}
            >
              {images.map((image, index) => <Image key={`${image}-${index}`} source={{ uri: image }} style={[styles.detailImage, { width: galleryWidth }]} resizeMode="cover" />)}
            </ScrollView>
            <Pressable style={styles.detailFavorite} onPress={() => toggleFavorite(selected.id)}>
              <Feather name="heart" size={20} color={data.favorites.includes(selected.id) ? ORANGE : COLORS.ink} />
            </Pressable>
            <View style={styles.imageCounter}><Text style={styles.imageCounterText}>{imageIndex + 1} / {images.length}</Text></View>
          </View>
          <View style={styles.detailIntro}>
            <View style={styles.detailCategory}><Text style={styles.detailCategoryText}>{data.language === 'kk' ? categoryKK[selected.category] : selected.category}</Text></View>
            <Text style={styles.detailTitle}>{selected.title}</Text>
            <Text style={styles.detailModel}>{selected.model}</Text>
            <View style={styles.detailMetaLine}>
              <View style={styles.inlineMeta}><Feather name="map-pin" size={15} color={COLORS.muted} /><Text style={styles.metaText}>{selected.city} · {selected.distance}</Text></View>
              <View style={styles.inlineMeta}><Feather name="star" size={15} color="#F6A623" /><Text style={styles.metaText}>{selected.rating ? `${selected.rating.toFixed(1)} (${selected.reviews})` : 'Новый владелец'}</Text></View>
            </View>
            <Text style={styles.detailPrice}>{moneyPerHour(selected.price, data.language)}</Text>
          </View>
          <View style={styles.divider} />
          <View style={styles.detailSection}>
            <Text style={styles.sectionTitle}>{t.details}</Text>
            <Text style={styles.description}>{selected.description}</Text>
          </View>
          <View style={styles.detailSection}>
            <Text style={styles.sectionTitle}>{t.characteristics}</Text>
            <View style={styles.specGrid}>
              {selected.specs.map((spec, index) => <View key={spec} style={styles.specItem}><Feather name={['check-circle', 'sliders', 'truck', 'user'][index % 4] as keyof typeof Feather.glyphMap} size={16} color={ORANGE} /><Text style={styles.specText}>{spec}</Text></View>)}
            </View>
          </View>
          <View style={styles.detailSection}>
            <Text style={styles.sectionTitle}>{t.owner}</Text>
            <View style={styles.ownerInfo}>
              <View style={styles.ownerAvatar}><Feather name="user" size={22} color={ORANGE} /></View>
              <View style={{ flex: 1 }}><Text style={styles.ownerName}>{selected.owner}</Text><Text style={styles.ownerExperience}>{selected.experience}</Text></View>
              <View style={styles.verifiedBadge}><Feather name="check" size={13} color="#268A55" /><Text style={styles.verifiedText}>{selected.rating ? '4.9' : 'Новый'}</Text></View>
            </View>
          </View>
          <View style={styles.detailSection}>
            <Text style={styles.sectionTitle}>{t.area}</Text>
            <View style={styles.areaCard}><Feather name="map-pin" size={18} color={ORANGE} /><View><Text style={styles.areaCity}>{selected.city}</Text><Text style={styles.ownerExperience}>{selected.distance} от вас · {selected.delivery ? t.delivery : 'Самовывоз'}</Text></View></View>
          </View>
          <View style={styles.detailSection}>
            <Text style={styles.sectionTitle}>{t.calendar}</Text>
            <View style={styles.calendarRow}><Feather name="calendar" size={17} color={ORANGE} /><Text style={styles.description}>{selected.availability?.length ? selected.availability.map((day) => weekdays.find((item) => item.id === day)?.[data.language] ?? day).join(' · ') : selected.available ? 'Сегодня · Завтра · Сб, Вс' : 'Доступность уточняйте у владельца'}</Text></View>
          </View>
        </ScrollView>
        <SafeAreaView edges={['bottom']} style={styles.stickyOrderBar}>
          <View><Text style={styles.stickyPrice}>{formatPrice(selected.price)}<Text style={styles.stickyPerHour}> / {t.hour}</Text></Text><Text style={styles.stickyCaption}>{t.requestNote}</Text></View>
          <Pressable
            style={{ backgroundColor: ORANGE, borderRadius: 16, paddingHorizontal: 22, paddingVertical: 14, flexDirection: 'row', alignItems: 'center', gap: 8 }}
            onPress={() => {
              const firstSlot = getUpcomingBookingDates(selected.availability)[0];
              setDate(firstSlot ? firstSlot.toISOString() : '');
              setDuration(4);
              if (!address.trim()) {
                setAddress(data.language === 'ru' ? 'Адрес уточню по телефону' : 'Мекенжайды телефон арқылы нақтылаймын');
              }
              setScreen('booking');
            }}
          >
            <Text style={{ color: '#fff', fontWeight: '800', fontSize: 14 }}>{t.order}</Text>
            <Feather name="arrow-right" size={17} color="#fff" />
          </Pressable>
        </SafeAreaView>
      </View>
    );
  };

  const bookingScreen = () => {
    if (!selected) return null;
    const total = selected.price * duration;
    const availableBookingDates = getUpcomingBookingDates(selected.availability);
    const selectedBookingDate = availableBookingDates.find((candidate) => candidate.toISOString() === date)
      ?? availableBookingDates[0];
    return (
      <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView contentContainerStyle={styles.scrollContent} keyboardShouldPersistTaps="handled">
          {header(t.order, () => setScreen('details'))}
          <View style={styles.bookingListing}>
            <Image source={{ uri: selected.image }} style={styles.bookingThumb} />
            <View style={{ flex: 1 }}><Text style={styles.bookingTitle}>{selected.title}</Text><Text style={styles.ownerExperience}>{selected.model}</Text><Text style={styles.bookingPrice}>{moneyPerHour(selected.price, data.language)}</Text></View>
          </View>
          <FormLabel title={t.chooseDate} />
          <View style={styles.dateChoices}>
            {availableBookingDates.map((value) => {
              const isSelected = selectedBookingDate?.getTime() === value.getTime();
              const label = value.toLocaleString(data.language === 'ru' ? 'ru-RU' : 'kk-KZ', {
                weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit',
                timeZone: 'Asia/Almaty',
              });
              return <Pressable key={value.toISOString()} onPress={() => setDate(value.toISOString())} style={[styles.dateChoice, isSelected && styles.dateChoiceActive]}>
                <Text style={[styles.dateChoiceText, isSelected && styles.dateChoiceTextActive]}>{label}</Text>
              </Pressable>;
            })}
          </View>
          <FormLabel title={t.duration} />
          <View style={styles.durationControl}>
            <Pressable style={styles.durationButton} onPress={() => setDuration((value) => Math.max(1, value - 1))}><Feather name="minus" size={18} color={COLORS.ink} /></Pressable>
            <Text style={styles.durationText}>{duration} {t.hours}</Text>
            <Pressable style={styles.durationButton} onPress={() => setDuration((value) => Math.min(24, value + 1))}><Feather name="plus" size={18} color={COLORS.ink} /></Pressable>
          </View>
          <FormLabel title={t.address} />
          <TextInput value={address} onChangeText={setAddress} placeholder={t.addressHint} placeholderTextColor="#A0A0A0" style={styles.formInput} />
          <FormLabel title={t.comment} />
          <TextInput value={comment} onChangeText={setComment} placeholder={t.commentHint} placeholderTextColor="#A0A0A0" style={[styles.formInput, styles.multilineInput]} multiline textAlignVertical="top" />
          <View style={styles.costCard}>
            <View style={styles.costLine}><Text style={styles.costLabel}>{formatPrice(selected.price)} × {duration} {t.hours}</Text><Text style={styles.costAmount}>{formatPrice(total)}</Text></View>
            <View style={styles.divider} />
            <View style={styles.costLine}><Text style={styles.totalLabel}>{t.estimate}</Text><Text style={styles.totalAmount}>{formatPrice(total)}</Text></View>
            <Text style={styles.disclaimer}>{t.requestNote}</Text>
          </View>
          <Pressable
            style={{ marginTop: 18, backgroundColor: ORANGE, borderRadius: 16, paddingVertical: 16, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, opacity: backendBusy ? 0.6 : 1 }}
            onPress={() => { void submitOrder(); }}
            disabled={backendBusy}
          >
            <Text style={{ color: '#fff', fontWeight: '800', fontSize: 15 }}>{backendBusy ? '…' : t.send}</Text>
            <Feather name="arrow-right" size={18} color="#fff" />
          </Pressable>
        </ScrollView>
      </KeyboardAvoidingView>
    );
  };

  const ordersScreen = () => {
    const activeStatuses = new Set(['Заявка отправлена', 'pending', 'accepted', 'in_progress']);
    const doneStatuses = new Set(['completed', 'cancelled', 'declined']);
    const filtered = data.orders.filter((order) => {
      if (ordersFilter === 'active') return activeStatuses.has(order.status);
      if (ordersFilter === 'done') return doneStatuses.has(order.status);
      return true;
    });

    const statusColor = (status: string) => {
      if (status === 'completed') return '#16A34A';
      if (status === 'declined' || status === 'cancelled') return '#DC2626';
      if (status === 'in_progress' || status === 'accepted') return ORANGE;
      return '#2563EB';
    };

    return (
      <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
        {header(t.orders)}

        {/* Быстрая заявка */}
        <Pressable
          style={{ backgroundColor: ORANGE, borderRadius: 18, padding: 16, marginBottom: 14, flexDirection: 'row', alignItems: 'center', gap: 12 }}
          onPress={() => setScreen('quick-request')}
        >
          <View style={{ width: 42, height: 42, borderRadius: 14, backgroundColor: 'rgba(255,255,255,0.2)', alignItems: 'center', justifyContent: 'center' }}>
            <Feather name="zap" size={20} color="#fff" />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={{ color: '#fff', fontWeight: '800', fontSize: 15 }}>{t.quickRequest}</Text>
            <Text style={{ color: 'rgba(255,255,255,0.85)', fontSize: 11, marginTop: 3 }} numberOfLines={2}>{t.quickRequestSub}</Text>
          </View>
          <Feather name="arrow-right" size={18} color="#fff" />
        </Pressable>

        {/* Фильтры */}
        <View style={{ flexDirection: 'row', gap: 8, marginBottom: 14 }}>
          {([
            ['all', t.allOrders],
            ['active', t.activeOrders],
            ['done', t.doneOrders],
          ] as const).map(([key, label]) => (
            <Pressable
              key={key}
              onPress={() => setOrdersFilter(key)}
              style={{
                paddingHorizontal: 14,
                paddingVertical: 8,
                borderRadius: 20,
                backgroundColor: ordersFilter === key ? ORANGE : COLORS.light,
              }}
            >
              <Text style={{ fontSize: 12, fontWeight: '700', color: ordersFilter === key ? '#fff' : COLORS.ink }}>{label}</Text>
            </Pressable>
          ))}
        </View>

        {backendConfigured && !backendUser && !data.orders.length ? (
          <EmptyState title={t.orders} subtitle={t.authRequired} action={t.signIn} onAction={openProfileEditor} />
        ) : null}
        {backendConfigured && backendUser && accountLoading && !data.orders.length ? (
          <View style={styles.accountLoading}>
            <ActivityIndicator color={ORANGE} />
            <Text style={styles.ownerExperience}>{t.ordersLoading}</Text>
          </View>
        ) : null}
        {accountError ? (
          <View style={styles.accountError}>
            <Text style={styles.accountErrorText}>{accountError}</Text>
            <Pressable onPress={() => setOrdersRefreshKey((key) => key + 1)}>
              <Text style={styles.sectionAction}>{data.language === 'ru' ? 'Повторить' : 'Қайталау'}</Text>
            </Pressable>
          </View>
        ) : null}

        {filtered.length ? filtered.map((order) => (
          <View key={order.id} style={styles.orderCard}>
            <View style={styles.orderTop}>
              <Image source={{ uri: order.image || 'https://images.unsplash.com/photo-1580901368919-7738efb0f87e?auto=format&fit=crop&w=400&q=80' }} style={styles.orderThumb} />
              <View style={{ flex: 1 }}>
                <Text style={styles.orderTitle}>{order.listingTitle}</Text>
                <Text style={styles.ownerExperience}>{order.date} · {order.duration} {t.hours}</Text>
                {(order.status === 'pending' || order.status === 'Заявка отправлена') ? (
                  <Text style={{ fontSize: 11, fontWeight: '700', color: order.isOwner ? ORANGE : '#2563EB', marginTop: 4 }}>
                    {order.isOwner
                      ? (data.language === 'ru' ? 'Входящая заявка — примите или отклоните' : 'Кіріс өтінім')
                      : (data.language === 'ru' ? 'Ожидает ответа владельца' : 'Жауап күтілуде')}
                  </Text>
                ) : null}
                {order.isOwner ? (
                  <Text style={{ color: ORANGE, fontSize: 11, fontWeight: '600', marginTop: 2 }}>{t.incomingRequests}</Text>
                ) : null}
              </View>
            </View>

            <View style={[styles.orderStatus, { backgroundColor: statusColor(order.status) + '18' }]}>
              <View style={[styles.statusDot, { backgroundColor: statusColor(order.status) }]} />
              <Text style={[styles.orderStatusText, { color: statusColor(order.status) }]}>{orderStatusLabel(order, data.language)}</Text>
            </View>

            {(order.status === 'Заявка отправлена' || order.status === 'pending') && !order.isOwner ? (
              <View style={styles.orderInfo}>
                <Feather name="info" size={15} color={ORANGE} />
                <Text style={styles.orderInfoText}>{t.orderInfo}</Text>
              </View>
            ) : null}

            <View style={styles.orderBottom}>
              <Text style={styles.metaText} numberOfLines={1}>{order.address}</Text>
              <Text style={styles.orderTotal}>{formatPrice(order.total)}</Text>
            </View>

            {/* Действия владельца */}
            {backendConfigured && order.isOwner ? (
              <View style={styles.orderActions}>
                {(order.status === 'pending' || order.status === 'Заявка отправлена') ? (
                  <>
                    <Pressable style={styles.orderActionSecondary} onPress={() => { void changeOrderStatus(order, 'declined'); }} disabled={backendBusy}>
                      <Text style={styles.orderActionSecondaryText}>{t.decline}</Text>
                    </Pressable>
                    <Pressable style={styles.orderActionPrimary} onPress={() => { void changeOrderStatus(order, 'accepted'); }} disabled={backendBusy}>
                      <Text style={styles.orderActionPrimaryText}>{t.accept}</Text>
                    </Pressable>
                  </>
                ) : null}
                {order.status === 'accepted' ? (
                  <Pressable style={styles.orderActionPrimary} onPress={() => { void changeOrderStatus(order, 'in_progress'); }} disabled={backendBusy}>
                    <Text style={styles.orderActionPrimaryText}>{t.startWork}</Text>
                  </Pressable>
                ) : null}
                {order.status === 'in_progress' ? (
                  <Pressable style={styles.orderActionPrimary} onPress={() => { void changeOrderStatus(order, 'completed'); }} disabled={backendBusy}>
                    <Text style={styles.orderActionPrimaryText}>{t.complete}</Text>
                  </Pressable>
                ) : null}
              </View>
            ) : null}

            {/* Действия клиента */}
            <View style={{ flexDirection: 'row', gap: 8, marginTop: 10 }}>
              {!order.isOwner && (order.status === 'pending' || order.status === 'Заявка отправлена') ? (
                <Pressable
                  style={[styles.cancelOrderButton, { flex: 1 }]}
                  onPress={() => {
                    if (isLocalOrderId(order.id) || !backendConfigured || !backendUser) {
                      setData((current) => ({
                        ...current,
                        orders: current.orders.map((item) =>
                          item.id === order.id ? { ...item, status: 'cancelled' } : item,
                        ),
                      }));
                      return;
                    }
                    void cancelOrder(order);
                  }}
                  disabled={backendBusy}
                >
                  <Text style={styles.cancelOrderText}>{t.cancelOrder}</Text>
                </Pressable>
              ) : null}
              <Pressable
                style={{ flex: 1, backgroundColor: COLORS.light, borderRadius: 12, paddingVertical: 10, alignItems: 'center', flexDirection: 'row', justifyContent: 'center', gap: 6 }}
                onPress={() => openChat(order)}
              >
                <Feather name="message-circle" size={15} color={COLORS.ink} />
                <Text style={{ fontWeight: '700', fontSize: 12, color: COLORS.ink }}>{t.openChat}</Text>
              </Pressable>
            </View>
          </View>
        )) : null}

        {!accountLoading && filtered.length === 0 && !(backendConfigured && !backendUser && data.orders.length === 0) ? (
          <EmptyState title={t.emptyOrders} subtitle={t.emptyOrdersSub} action={t.quickRequest} onAction={() => setScreen('quick-request')} />
        ) : null}
      </ScrollView>
    );
  };

  const profileScreen = () => (
    <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
      {header(t.profile)}
      <View style={styles.profileHero}>
        <View style={styles.profileAvatar}><Feather name="user" size={31} color={ORANGE} /></View>
        <View style={{ flex: 1 }}><Text style={styles.profileName}>{data.userName || t.profile}</Text><Text style={styles.ownerExperience}>{data.phone || t.signIn}</Text></View>
        <Pressable style={styles.editIcon} onPress={openProfileEditor}><Feather name={backendConfigured && !backendUser ? 'log-in' : 'edit-2'} size={17} color={COLORS.ink} /></Pressable>
      </View>
      <Pressable style={styles.profileRow} onPress={() => goToTab('orders')}><View style={styles.profileRowIcon}><Feather name="file-text" size={18} color={ORANGE} /></View><Text style={styles.profileRowText}>{t.orders}</Text><View style={styles.profileCount}><Text style={styles.profileCountText}>{data.orders.length}</Text></View><Feather name="chevron-right" size={18} color={COLORS.muted} /></Pressable>
      <Pressable style={styles.profileRow} onPress={() => { setActiveTab('catalog'); setSearch(''); setFavoritesOnly(true); setScreen('main'); }}><View style={styles.profileRowIcon}><Feather name="heart" size={18} color={ORANGE} /></View><Text style={styles.profileRowText}>{t.favorites}</Text><View style={styles.profileCount}><Text style={styles.profileCountText}>{data.favorites.length}</Text></View><Feather name="chevron-right" size={18} color={COLORS.muted} /></Pressable>
      <Pressable style={styles.profileRow} onPress={() => { void changeLanguage(); }}><View style={styles.profileRowIcon}><Feather name="globe" size={18} color={ORANGE} /></View><Text style={styles.profileRowText}>{t.language}</Text><Text style={styles.languageValue}>{data.language === 'ru' ? 'Русский' : 'Қазақша'}</Text><Feather name="chevron-right" size={18} color={COLORS.muted} /></Pressable>
      <Pressable style={styles.profileRow} onPress={() => setScreen('settings')}><View style={styles.profileRowIcon}><Feather name="settings" size={18} color={ORANGE} /></View><Text style={styles.profileRowText}>{t.settings}</Text><Feather name="chevron-right" size={18} color={COLORS.muted} /></Pressable>
      <Pressable style={styles.profileRow} onPress={() => setScreen('notifications')}><View style={styles.profileRowIcon}><Feather name="bell" size={18} color={ORANGE} /></View><Text style={styles.profileRowText}>{t.notifications}</Text><Feather name="chevron-right" size={18} color={COLORS.muted} /></Pressable>
      <View style={styles.profileDivider} />
      <Pressable style={styles.ownerProfileCard} onPress={() => setScreen('owner')}>
        <View style={styles.ownerProfileIcon}><Feather name="briefcase" size={21} color="#fff" /></View>
        <View style={{ flex: 1 }}><Text style={styles.ownerProfileTitle}>{t.ownerCabinet}</Text><Text style={styles.ownerProfileSub}>{data.language === 'ru' ? 'Управляйте техникой и заявками' : 'Техниканы және өтінімдерді басқарыңыз'}</Text></View>
        <Feather name="arrow-up-right" size={18} color={COLORS.ink} />
      </Pressable>
      {backendConfigured && backendUser ? <Pressable style={styles.signOutButton} onPress={() => { void logout(); }}><Feather name="log-out" size={17} color={COLORS.ink} /><Text style={styles.signOutText}>{t.signOut}</Text></Pressable> : null}
      {!backendUser ? <DemoNote text={backendConfigured ? t.authPrompt : t.demoSub} /> : null}
    </ScrollView>
  );

  const settingsScreen = () => (
    <ScrollView contentContainerStyle={styles.scrollContent}>
      {header(t.settings, () => setScreen('main'))}
      <View style={styles.settingsIntro}>
        <Text style={styles.settingsTitle}>{t.settings}</Text>
        <Text style={styles.settingsSubtitle}>{backendConfigured && backendUser ? t.remoteMode : t.signInToSaveSettings}</Text>
      </View>
      <FormLabel title={t.account} />
      <Pressable style={styles.profileRow} onPress={openProfileEditor}>
        <View style={styles.profileRowIcon}><Feather name="user" size={18} color={ORANGE} /></View>
        <Text style={styles.profileRowText}>{data.userName || t.signIn}</Text>
        <Feather name="chevron-right" size={18} color={COLORS.muted} />
      </Pressable>
      <FormLabel title={t.language} />
      <Pressable style={styles.profileRow} onPress={() => { void changeLanguage(); }}>
        <View style={styles.profileRowIcon}><Feather name="globe" size={18} color={ORANGE} /></View>
        <Text style={styles.profileRowText}>{data.language === 'ru' ? 'Русский' : 'Қазақша'}</Text>
        <Feather name="chevron-right" size={18} color={COLORS.muted} />
      </Pressable>
      <FormLabel title={t.preferredCity} />
      <Pressable style={styles.profileRow} onPress={() => setCityOpen(true)}>
        <View style={styles.profileRowIcon}><Feather name="map-pin" size={18} color={ORANGE} /></View>
        <Text style={styles.profileRowText}>{data.city}</Text>
        <Feather name="chevron-right" size={18} color={COLORS.muted} />
      </Pressable>
      {accountError ? <View style={styles.accountError}><Text style={styles.accountErrorText}>{accountError}</Text><Pressable onPress={() => setAccountRefreshKey((key) => key + 1)}><Text style={styles.sectionAction}>{data.language === 'ru' ? 'Повторить' : 'Қайталау'}</Text></Pressable></View> : null}
      <DemoNote text={backendConfigured ? (backendUser ? t.remoteMode : t.authPrompt) : t.demoSub} />
    </ScrollView>
  );

  const ownerScreen = () => {
    const ownListings = backendConfigured && backendUser ? backendOwnerListings : data.listings.filter((item) => item.id.startsWith('own-') || item.ownerId === backendUser?.id);
    return (
      <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
        {header(t.ownerCabinet, () => setScreen('main'))}
        <View style={styles.ownerDashboardHero}><Text style={styles.ownerDashboardEyebrow}>{t.ownerCabinet}</Text><Text style={styles.ownerDashboardTitle}>{t.ownerTitle}</Text><Text style={styles.ownerDashboardSub}>{data.userName ? `${data.userName} · ${data.city}` : data.city}</Text></View>
        <View style={{ marginBottom: 14 }}>
          <GoOnlineButton
            isOnline={ownerOnline}
            pyatakName={data.pyatakName}
            onToggle={toggleOwnerOnline}
          />
          <Text style={{ marginTop: 8, fontSize: 12, color: COLORS.muted, lineHeight: 17 }}>
            {data.language === 'ru'
              ? (ownerOnline
                ? 'Клиенты видят вашу технику как доступную на пятаке. Нажмите ещё раз, чтобы уйти в офлайн.'
                : 'Встаньте на пятак — ваша техника появится у клиентов как «онлайн» рядом.')
              : (ownerOnline
                ? 'Клиенттер техникаңызды пятакта көреді.'
                : 'Пятакқа тұрыңыз — техника онлайн болады.')}
          </Text>
        </View>
        <View style={styles.statsGrid}>
          <StatCard icon="inbox" title={t.newRequests} value={String(data.orders.filter((order) => order.isOwner && (order.status === 'pending' || order.status === 'Заявка отправлена')).length)} />
          <StatCard icon="activity" title={t.activeOrders} value={String(data.orders.filter((order) => order.isOwner && (order.status === 'accepted' || order.status === 'in_progress')).length)} />
          <StatCard icon="layers" title={t.listings} value={String(ownListings.length)} />
          <StatCard icon="bar-chart-2" title={t.views} value="—" />
        </View>
        <View style={styles.revenueCard}><View style={styles.revenueIcon}><Feather name="trending-up" size={18} color={ORANGE} /></View><View><Text style={styles.revenueLabel}>{t.revenue}</Text><Text style={styles.revenueAmount}>0 ₸</Text></View><Text style={styles.revenuePeriod}>{data.language === 'ru' ? 'за месяц' : 'осы айда'}</Text></View>
        <Pressable style={styles.primaryButton} onPress={() => { setWizardStep(1); setScreen('add-listing'); }}><Feather name="plus" size={19} color="#fff" /><Text style={styles.primaryButtonText}>{t.addListing}</Text></Pressable>
        {ownListings.length ? <View style={styles.section}><SectionHeading title={t.listings} />{ownListings.map((item) => listingCard(item))}</View> : <View style={styles.ownerEmpty}><Feather name="package" size={23} color={ORANGE} /><Text style={styles.ownerEmptyText}>{data.language === 'ru' ? 'Добавьте первую единицу техники' : 'Алғашқы техникаңызды қосыңыз'}</Text></View>}
        <DemoNote text={backendConfigured ? t.remoteMode : t.demoSub} />
      </ScrollView>
    );
  };

  const addListingScreen = () => (
    <ScrollView contentContainerStyle={styles.scrollContent} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
      {header(t.listingWizard, () => setScreen('owner'))}
      <View style={styles.wizardProgress}>
        {[1, 2, 3].map((step) => <View key={step} style={[styles.wizardSegment, wizardStep >= step && styles.wizardSegmentActive]} />)}
      </View>
      <Text style={styles.wizardStepLabel}>{t.step} {wizardStep} / 3</Text>
      {wizardStep === 1 ? (
        <>
          <Text style={styles.wizardTitle}>{t.photos}</Text>
          <Pressable style={styles.photoPicker} onPress={() => { void choosePhotos().catch((error: unknown) => { console.error('Unable to select listing photos', error); Alert.alert('Ошибка', 'Не удалось открыть галерею. Попробуйте ещё раз.'); }); }}>
            {listingPhotos.length ? <ScrollView horizontal showsHorizontalScrollIndicator={false}>{listingPhotos.map((uri) => <Image key={uri} source={{ uri }} style={styles.pickedPhoto} />)}</ScrollView> : <><View style={styles.photoPickerIcon}><Feather name="camera" size={22} color={ORANGE} /></View><Text style={styles.photoPickerTitle}>{t.addPhotos}</Text><Text style={styles.photoPickerHint}>До 5 фотографий</Text></>}
          </Pressable>
          <FormLabel title={t.title} /><TextInput value={listingTitle} onChangeText={setListingTitle} placeholder="Например, Гусеничный экскаватор" placeholderTextColor="#A0A0A0" style={styles.formInput} />
          <FormLabel title={t.model} /><TextInput value={listingModel} onChangeText={setListingModel} placeholder="Марка и модель техники" placeholderTextColor="#A0A0A0" style={styles.formInput} />
        </>
      ) : wizardStep === 2 ? (
        <>
          <Text style={styles.wizardTitle}>{t.category}</Text>
          <View style={styles.categoryChoices}>{categories.map((item) => <Pressable key={item.title} style={[styles.categoryChoice, listingCategory === item.title && styles.categoryChoiceActive]} onPress={() => setListingCategory(item.title)}><Text style={[styles.categoryChoiceText, listingCategory === item.title && styles.categoryChoiceTextActive]}>{data.language === 'kk' ? categoryKK[item.title] : item.title}</Text></Pressable>)}</View>
          <FormLabel title={t.price} /><TextInput value={listingPrice} onChangeText={setListingPrice} placeholder="18 000" placeholderTextColor="#A0A0A0" style={styles.formInput} keyboardType="decimal-pad" />
          <FormLabel title={t.city} /><Pressable style={styles.formInput} onPress={() => setCityOpen(true)}><Text style={styles.cityInputText}>{data.city}</Text></Pressable>
        </>
      ) : (
        <>
          <Text style={styles.wizardTitle}>{t.description}</Text>
          <TextInput value={listingDescription} onChangeText={setListingDescription} placeholder="Расскажите о состоянии техники, характеристиках и условиях аренды" placeholderTextColor="#A0A0A0" style={[styles.formInput, styles.descriptionInput]} multiline textAlignVertical="top" />
          <FormLabel title={data.language === 'ru' ? 'Дни доступности' : 'Қолжетімді күндер'} />
          <View style={styles.weekdayChoices}>{weekdays.map((day) => <Pressable key={day.id} style={[styles.weekdayChoice, listingDays.includes(day.id) && styles.weekdayChoiceActive]} onPress={() => setListingDays((current) => current.includes(day.id) ? current.filter((value) => value !== day.id) : [...current, day.id])}><Text style={[styles.weekdayText, listingDays.includes(day.id) && styles.weekdayTextActive]}>{day[data.language]}</Text></Pressable>)}</View>
          <View style={styles.ownerOptions}><SwitchToggle label={t.operator} value={listingOperator} onValueChange={setListingOperator} /><SwitchToggle label={t.delivery} value={listingDelivery} onValueChange={setListingDelivery} /></View>
          <View style={styles.ownerTip}><Feather name="info" size={17} color={ORANGE} /><Text style={styles.ownerTipText}>{backendConfigured ? t.remoteMode : (data.language === 'ru' ? 'Заявки и публикация пока работают только локально на этом устройстве.' : 'Өтінімдер мен жариялау әзірше тек осы құрылғыда жұмыс істейді.')}</Text></View>
        </>
      )}
      {wizardStep < 3 ? <Pressable style={styles.primaryButton} onPress={() => setWizardStep((step) => Math.min(3, step + 1))}><Text style={styles.primaryButtonText}>{t.next}</Text><Feather name="arrow-right" size={18} color="#fff" /></Pressable> : <Pressable style={styles.primaryButton} onPress={() => { void publishListing(); }} disabled={backendBusy}><Feather name="check" size={18} color="#fff" /><Text style={styles.primaryButtonText}>{backendBusy ? '…' : t.saveListing}</Text></Pressable>}
    </ScrollView>
  );

  const notificationScreen = () => (
    <ScrollView contentContainerStyle={styles.scrollContent}>
      {header(t.notifications, () => setScreen('main'))}
      {backendNotifications.length ? backendNotifications.map((notification) => (
        <View key={notification.id} style={styles.notificationCard}>
          <View style={styles.notificationIcon}><Feather name={notification.kind === 'new_message' ? 'message-circle' : 'bell'} size={17} color={ORANGE} /></View>
          <View style={styles.notificationBody}><Text style={styles.notificationTitle}>{notification.title}</Text><Text style={styles.notificationText}>{notification.body}</Text><Text style={styles.notificationTime}>{new Date(notification.created_at).toLocaleString(data.language === 'ru' ? 'ru-RU' : 'kk-KZ', { dateStyle: 'medium', timeStyle: 'short' })}</Text></View>
          {!notification.read_at ? <View style={styles.notificationUnread} /> : null}
        </View>
      )) : <EmptyState title={t.noNotifications} subtitle={data.language === 'ru' ? 'Здесь появятся обновления по вашим заявкам.' : 'Өтінімдеріңіз туралы жаңартулар осында көрсетіледі.'} />}
      {!backendUser && backendConfigured ? <DemoNote text={t.requestLogin} /> : null}
    </ScrollView>
  );

  if (!hydrated) {
    return <SafeAreaProvider><SafeAreaView style={styles.loadingScreen}><ActivityIndicator color={ORANGE} size="large" /><Text style={styles.loadingText}>ПЯТАК</Text></SafeAreaView></SafeAreaProvider>;
  }



  const submitQuickRequest = async () => {
    if (!quickCategory) {
      safeAlert(t.needCategory, data.language === 'ru' ? 'Выберите тип техники' : 'Техника түрін таңдаңыз');
      return;
    }
    if (address.trim().length < 3) {
      safeAlert(t.needAddress, data.language === 'ru' ? 'Укажите адрес объекта' : 'Нысан мекенжайын енгізіңіз');
      return;
    }

    const title = `${quickCategory}${data.pyatakName ? ' · ' + data.pyatakName : ''}`;
    const finalAddress = address.trim();

    if (backendConfigured && backendUser) {
      setBackendBusy(true);
      try {
        const order = await createBackendServiceRequest({
          customerId: backendUser.id,
          category: quickCategory,
          city: data.city,
          pyatakName: data.pyatakName,
          title,
          address: finalAddress,
          comment: quickComment.trim() || (data.pyatakName ? `Пятак: ${data.pyatakName}` : ''),
          durationHours: duration || 4,
          imageUrl: 'https://images.unsplash.com/photo-1580901368919-7738efb0f87e?auto=format&fit=crop&w=400&q=80',
        }, data.language);
        setData((current) => ({ ...current, orders: mergeOrders([order], current.orders) }));
        setQuickCategory(null);
        setQuickComment('');
        setAddress('');
        setScreen('main');
        setActiveTab('orders');
        setOrdersFilter('all');
        safeAlert(t.sent, data.language === 'ru'
          ? 'Заявка опубликована — владельцы в городе её видят.'
          : 'Өтінім жарияланды — қаладағы иелер көреді.');
      } catch (error) {
        console.error(error);
        const details = error instanceof Error ? error.message : String(error);
        safeAlert(t.orderFailed, details);
      } finally {
        setBackendBusy(false);
      }
      return;
    }

    if (backendConfigured && !backendUser) {
      safeAlert(
        t.profile,
        data.language === 'ru'
          ? 'Войдите, чтобы заявку видели другие. Сейчас сохраним только на этом устройстве.'
          : 'Басқалар көруі үшін кіріңіз.',
      );
    }

    const order: Order = {
      id: `quick-${Date.now()}`,
      listingId: 'quick-request',
      listingTitle: title,
      image: 'https://images.unsplash.com/photo-1580901368919-7738efb0f87e?auto=format&fit=crop&w=400&q=80',
      date: data.language === 'ru' ? 'Как можно скорее' : 'Мүмкіндігінше тез',
      duration: duration || 4,
      address: finalAddress,
      comment: quickComment.trim() || (data.pyatakName ? `Пятак: ${data.pyatakName}` : ''),
      total: 0,
      status: 'Заявка отправлена',
      createdAt: new Date().toISOString(),
    };
    setData((current) => ({ ...current, orders: [order, ...current.orders] }));
    setQuickCategory(null);
    setQuickComment('');
    setAddress('');
    setScreen('main');
    setActiveTab('orders');
    setOrdersFilter('all');
    safeAlert(t.sent, t.requestSentAll);
  };

  const quickRequestScreen = () => (
    <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView contentContainerStyle={styles.scrollContent} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
        {header(t.quickRequest, () => setScreen('main'))}
        <Text style={{ color: COLORS.muted, fontSize: 13, marginBottom: 16, lineHeight: 18 }}>{t.quickRequestSub}</Text>

        <View style={{ backgroundColor: '#FFF7F1', borderRadius: 14, padding: 12, marginBottom: 16, flexDirection: 'row', alignItems: 'center', gap: 10 }}>
          <Feather name="map-pin" size={16} color={ORANGE} />
          <View style={{ flex: 1 }}>
            <Text style={{ fontWeight: '700', color: COLORS.ink, fontSize: 13 }}>{data.city}{data.pyatakName ? ` · ${data.pyatakName}` : ''}</Text>
            <Text style={{ color: COLORS.muted, fontSize: 11, marginTop: 2 }}>
              {data.language === 'ru' ? 'Заявка уйдёт владельцам на этом пятаке' : 'Өтінім осы пятактағы иелерге кетеді'}
            </Text>
          </View>
          <Pressable onPress={() => setScreen('pyatak-select')}>
            <Text style={{ color: ORANGE, fontWeight: '700', fontSize: 12 }}>{data.language === 'ru' ? 'Изменить' : 'Өзгерту'}</Text>
          </Pressable>
        </View>

        <FormLabel title={t.needCategory} />
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 14 }}>
          {categories.map((item) => {
            const active = quickCategory === item.title;
            return (
              <Pressable
                key={item.title}
                onPress={() => setQuickCategory(item.title)}
                style={{
                  paddingHorizontal: 12,
                  paddingVertical: 9,
                  borderRadius: 14,
                  borderWidth: 1.5,
                  borderColor: active ? ORANGE : '#EFEFEF',
                  backgroundColor: active ? '#FFF7F1' : '#fff',
                }}
              >
                <Text style={{ fontSize: 12, fontWeight: '700', color: active ? ORANGE : COLORS.ink }}>
                  {data.language === 'kk' ? (categoryKK[item.title] || item.title) : item.title}
                </Text>
              </Pressable>
            );
          })}
        </View>

        <FormLabel title={t.duration} />
        <View style={styles.durationControl}>
          <Pressable style={styles.durationButton} onPress={() => setDuration((value) => Math.max(1, value - 1))}>
            <Feather name="minus" size={18} color={COLORS.ink} />
          </Pressable>
          <Text style={styles.durationText}>{duration} {t.hours}</Text>
          <Pressable style={styles.durationButton} onPress={() => setDuration((value) => Math.min(24, value + 1))}>
            <Feather name="plus" size={18} color={COLORS.ink} />
          </Pressable>
        </View>

        <FormLabel title={t.needAddress} />
        <TextInput
          value={address}
          onChangeText={setAddress}
          placeholder={data.language === 'ru' ? 'Улица, объект, ориентир' : 'Көше, нысан, бағдар'}
          placeholderTextColor="#A0A0A0"
          style={styles.formInput}
        />

        <FormLabel title={t.comment} />
        <TextInput
          value={quickComment}
          onChangeText={setQuickComment}
          placeholder={data.language === 'ru' ? 'Например: нужен экскаватор с оператором' : 'Мысалы: операторы бар экскаватор керек'}
          placeholderTextColor="#A0A0A0"
          style={[styles.formInput, { minHeight: 80, textAlignVertical: 'top' }]}
          multiline
        />

        <Pressable
          style={[styles.primaryButton, { marginTop: 8, opacity: backendBusy ? 0.6 : 1 }]}
          onPress={submitQuickRequest}
          disabled={backendBusy}
        >
          <Text style={styles.primaryButtonText}>{t.sendRequest}</Text>
        </Pressable>
      </ScrollView>
    </KeyboardAvoidingView>
  );

  const pyatakSelectScreen = () => {
    const cityPyataks = demoPyataks
      .filter((p) => p.city === data.city)
      .sort((a, b) => a.sort_order - b.sort_order);

    const selectPyatak = (id: string | null, name: string | null) => {
      setData((current) => ({ ...current, pyatakId: id, pyatakName: name }));
      setScreen('main');
    };

    return (
      <View style={{ flex: 1, backgroundColor: '#fff' }}>
        <View style={styles.topHeader}>
          <Pressable
            style={styles.iconButton}
            onPress={() => setScreen('main')}
            accessibilityLabel="Назад"
          >
            <Feather name="arrow-left" size={20} color={COLORS.ink} />
          </Pressable>
          <View style={{ flex: 1, marginLeft: 10 }}>
            <Text style={styles.brand}>ПЯТАК<Text style={styles.brandDot}>.</Text></Text>
            <Text style={{ color: COLORS.muted, fontSize: 12, marginTop: 2 }}>{data.city}</Text>
          </View>
        </View>

        <ScrollView contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 40 }} showsVerticalScrollIndicator={false}>
          <Text style={{ fontSize: 22, fontWeight: '800', color: COLORS.ink, marginTop: 8 }}>{t.selectPyatak}</Text>
          <Text style={{ color: COLORS.muted, fontSize: 13, marginTop: 6, marginBottom: 18, lineHeight: 18 }}>{t.pyatakHint}</Text>

          {/* Все пятаки / сброс */}
          <Pressable
            onPress={() => selectPyatak(null, null)}
            style={{
              flexDirection: 'row',
              alignItems: 'center',
              paddingVertical: 14,
              paddingHorizontal: 14,
              borderRadius: 16,
              borderWidth: 1.5,
              borderColor: !data.pyatakId ? ORANGE : '#EFEFEF',
              backgroundColor: !data.pyatakId ? '#FFF7F1' : '#fff',
              marginBottom: 10,
            }}
          >
            <View style={{ width: 40, height: 40, borderRadius: 12, backgroundColor: !data.pyatakId ? ORANGE : COLORS.light, alignItems: 'center', justifyContent: 'center', marginRight: 12 }}>
              <Feather name="map" size={18} color={!data.pyatakId ? '#fff' : COLORS.ink} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={{ fontSize: 15, fontWeight: '700', color: COLORS.ink }}>{t.allPyataks}</Text>
              <Text style={{ fontSize: 12, color: COLORS.muted, marginTop: 2 }}>Показать всю технику города</Text>
            </View>
            {!data.pyatakId ? <Feather name="check" size={18} color={ORANGE} /> : null}
          </Pressable>

          {cityPyataks.length === 0 ? (
            <View style={{ paddingVertical: 40, alignItems: 'center' }}>
              <Feather name="map-pin" size={36} color={COLORS.muted} />
              <Text style={{ color: COLORS.muted, marginTop: 12, fontSize: 14 }}>{t.noPyataks}</Text>
            </View>
          ) : (
            cityPyataks.map((p) => {
              const selected = data.pyatakId === p.id;
              return (
                <Pressable
                  key={p.id}
                  onPress={() => selectPyatak(p.id, p.name)}
                  style={{
                    flexDirection: 'row',
                    alignItems: 'center',
                    paddingVertical: 14,
                    paddingHorizontal: 14,
                    borderRadius: 16,
                    borderWidth: 1.5,
                    borderColor: selected ? ORANGE : '#EFEFEF',
                    backgroundColor: selected ? '#FFF7F1' : '#fff',
                    marginBottom: 10,
                  }}
                >
                  <View style={{ width: 40, height: 40, borderRadius: 12, backgroundColor: selected ? ORANGE : COLORS.light, alignItems: 'center', justifyContent: 'center', marginRight: 12 }}>
                    <Feather name="map-pin" size={18} color={selected ? '#fff' : COLORS.ink} />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={{ fontSize: 15, fontWeight: '700', color: COLORS.ink }}>{p.name}</Text>
                    {p.district ? (
                      <Text style={{ fontSize: 12, color: COLORS.muted, marginTop: 2 }}>{p.district} район</Text>
                    ) : null}
                  </View>
                  {selected ? <Feather name="check" size={18} color={ORANGE} /> : null}
                </Pressable>
              );
            })
          )}
        </ScrollView>
      </View>
    );
  };


  const messagesScreen = () => {
    const chatOrders = data.orders.length
      ? data.orders
      : [];
    const activeOrder =
      data.orders.find((o) => o.id === chatOrderId) ||
      chatOrders[0] ||
      data.orders[0] ||
      null;

    return (
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <View style={[styles.scrollContent, { flex: 1, paddingBottom: 0 }]}>
          {header(t.messages)}

          {/* Выбор заявки для чата */}
          {chatOrders.length > 0 ? (
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ maxHeight: 44, marginBottom: 10 }}>
              {chatOrders.map((o) => {
                const active = activeOrder?.id === o.id;
                return (
                  <Pressable
                    key={o.id}
                    onPress={() => setChatOrderId(o.id)}
                    style={{
                      paddingHorizontal: 12,
                      paddingVertical: 8,
                      borderRadius: 14,
                      marginRight: 8,
                      backgroundColor: active ? ORANGE : COLORS.light,
                    }}
                  >
                    <Text style={{ fontSize: 12, fontWeight: '700', color: active ? '#fff' : COLORS.ink }} numberOfLines={1}>
                      {o.listingTitle}
                    </Text>
                  </Pressable>
                );
              })}
            </ScrollView>
          ) : null}

          {activeOrder ? (
            <Text style={{ fontSize: 12, color: COLORS.muted, marginBottom: 8 }}>
              {activeOrder.listingTitle} · {orderStatusLabel(activeOrder, data.language)}
            </Text>
          ) : null}

          <ScrollView
            style={{ flex: 1 }}
            contentContainerStyle={{ paddingBottom: 12, flexGrow: 1, justifyContent: data.messages.length ? 'flex-start' : 'center' }}
            showsVerticalScrollIndicator={false}
          >
            {data.messages.length ? data.messages.map((msg) => {
              const roleTag =
                msg.mine || msg.senderRole === 'you'
                  ? (data.language === 'ru' ? 'Вы' : 'Сіз')
                  : msg.senderRole === 'owner'
                    ? (data.language === 'ru' ? 'Владелец' : 'Иесі')
                    : msg.senderRole === 'customer'
                      ? (data.language === 'ru' ? 'Заказчик' : 'Тапсырыс беруші')
                      : null;
              const name = msg.senderName || roleTag || (msg.mine ? (data.language === 'ru' ? 'Вы' : 'Сіз') : (data.language === 'ru' ? 'Собеседник' : 'Сөйлесуші'));
              return (
              <View
                key={msg.id}
                style={{
                  alignSelf: msg.mine ? 'flex-end' : 'flex-start',
                  backgroundColor: msg.mine ? ORANGE : COLORS.light,
                  borderRadius: 16,
                  paddingHorizontal: 14,
                  paddingVertical: 10,
                  marginBottom: 8,
                  maxWidth: '82%',
                }}
              >
                <Text style={{
                  color: msg.mine ? 'rgba(255,255,255,0.9)' : ORANGE,
                  fontSize: 11,
                  fontWeight: '800',
                  marginBottom: 4,
                }}>
                  {name}{roleTag && msg.senderName && roleTag !== msg.senderName ? ` · ${roleTag}` : ''}
                </Text>
                <Text style={{ color: msg.mine ? '#fff' : COLORS.ink, fontSize: 14, lineHeight: 20 }}>{msg.text}</Text>
                <Text style={{ color: msg.mine ? 'rgba(255,255,255,0.75)' : COLORS.muted, fontSize: 10, marginTop: 4, textAlign: 'right' }}>{msg.time}</Text>
              </View>
              );
            }) : (
              <EmptyState
                title={t.messages}
                subtitle={
                  activeOrder
                    ? (data.language === 'ru' ? 'Напишите первое сообщение по этой заявке' : 'Осы өтінім бойынша алғашқы хабарлама жазыңыз')
                    : t.emptyChat
                }
              />
            )}
          </ScrollView>

          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 10, borderTopWidth: 1, borderTopColor: '#F0F0F0' }}>
            <TextInput
              value={messageText}
              onChangeText={setMessageText}
              placeholder={t.messageHint}
              placeholderTextColor="#A0A0A0"
              style={{ flex: 1, backgroundColor: COLORS.light, borderRadius: 16, paddingHorizontal: 14, paddingVertical: 12, fontSize: 14, color: COLORS.ink }}
              onSubmitEditing={() => { void sendMessage(); }}
              returnKeyType="send"
            />
            <Pressable
              onPress={() => { void sendMessage(); }}
              disabled={backendBusy || !messageText.trim()}
              style={{ width: 46, height: 46, borderRadius: 16, backgroundColor: ORANGE, alignItems: 'center', justifyContent: 'center', opacity: messageText.trim() ? 1 : 0.5 }}
            >
              <Feather name="send" size={18} color="#fff" />
            </Pressable>
          </View>
        </View>
      </KeyboardAvoidingView>
    );
  };

  const renderScreen = () => {
    if (screen === 'quick-request') return quickRequestScreen();
    if (screen === 'pyatak-select') return pyatakSelectScreen();
    if (screen === 'details') return detailsScreen();
    if (screen === 'booking') return bookingScreen();
    if (screen === 'owner') return ownerScreen();
    if (screen === 'add-listing') return addListingScreen();
    if (screen === 'notifications') return notificationScreen();
    if (screen === 'settings') return settingsScreen();
    if (activeTab === 'catalog') return catalogScreen();
    if (activeTab === 'orders') return ordersScreen();
    if (activeTab === 'messages') return messagesScreen();
    if (activeTab === 'profile') return profileScreen();
    return homeScreen();
  };

  return (
    <SafeAreaProvider>
      <SafeAreaView style={styles.app} edges={['top']}>
        <StatusBar barStyle="dark-content" />
        {renderScreen()}
        {screen === 'main' ? (
          <SafeAreaView edges={['bottom']}>
            <AnimatedBottomNav
              activeKey={activeTab}
              onChange={(key) => { if (isAppTab(key)) goToTab(key); }}
              items={([
              ['home', 'home', t.home],
              ['catalog', 'search', t.catalog],
              ['orders', 'file-text', t.orders],
              ['messages', 'message-circle', t.messages],
              ['profile', 'user', t.profile],
              ] as [AppTab, keyof typeof Feather.glyphMap, string][]).map(([key, icon, label]): NavItem => ({
                key,
                label,
                icon: <Feather name={icon} size={19} color={activeTab === key ? ORANGE : '#858585'} />,
              }))}
            />
          </SafeAreaView>
        ) : null}
      </SafeAreaView>

      <Modal visible={filterOpen} animationType="slide" transparent onRequestClose={() => setFilterOpen(false)}>
        <View style={styles.modalScrim}>
          <View style={styles.filterSheet}>
            <View style={styles.sheetHandle} />
            <View style={styles.sheetHeader}><Text style={styles.sheetTitle}>{t.filters}</Text><Pressable onPress={() => setFilterOpen(false)}><Feather name="x" size={21} color={COLORS.ink} /></Pressable></View>
            <ScrollView style={styles.filterBody} showsVerticalScrollIndicator={false}>
              <Text style={styles.filterSectionTitle}>{t.category}</Text>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.filterCategoryRail}>
                {categories.map((item) => <Pressable key={item.title} style={[styles.filterCategory, filters.category === item.title && styles.filterCategoryActive]} onPress={() => setFilters((current) => ({ ...current, category: current.category === item.title ? null : item.title }))}><Text style={[styles.filterCategoryText, filters.category === item.title && styles.filterCategoryTextActive]}>{data.language === 'kk' ? categoryKK[item.title] : item.title}</Text></Pressable>)}
              </ScrollView>
              <View style={styles.priceFilterHeader}>
                <Text style={styles.filterSectionTitle}>{data.language === 'ru' ? 'Цена за час' : 'Сағаттық баға'}</Text>
                <Text style={styles.priceFilterValue}>≤ {formatPrice(filters.maxPrice ?? 25000)}</Text>
              </View>
              <RangeSlider
                min={10000}
                max={25000}
                step={1000}
                value={filters.maxPrice ?? 25000}
                accessibilityLabel={data.language === 'ru' ? 'Максимальная цена аренды за час' : 'Жалға алудың сағаттық ең жоғары бағасы'}
                onValueChange={(price) => setFilters((current) => ({ ...current, maxPrice: price >= 25000 ? null : price }))}
              />
              <View style={styles.priceFilterBounds}><Text style={styles.priceFilterBound}>{formatPrice(10000)}</Text><Text style={styles.priceFilterBound}>{formatPrice(25000)}</Text></View>
              <Text style={styles.filterSectionTitle}>{data.language === 'ru' ? 'Дата аренды' : 'Жалдау күні'}</Text>
              <View style={styles.filterChoiceRow}>
                {['Сегодня', 'Завтра', 'На выходных'].map((day) => <Pressable key={day} style={[styles.filterCategory, filters.date === day && styles.filterCategoryActive]} onPress={() => setFilters((current) => ({ ...current, date: current.date === day ? null : day }))}><Text style={[styles.filterCategoryText, filters.date === day && styles.filterCategoryTextActive]}>{data.language === 'kk' ? ({ Сегодня: 'Бүгін', Завтра: 'Ертең', 'На выходных': 'Демалыста' } as Record<string, string>)[day] : day}</Text></Pressable>)}
              </View>
              <Text style={styles.filterSectionTitle}>{t.city}</Text>
              <View style={styles.filterChoiceRow}>
                {cities.map((city) => <Pressable key={city} style={[styles.filterCategory, filters.city === city && styles.filterCategoryActive]} onPress={() => setFilters((current) => ({ ...current, city: current.city === city ? null : city }))}><Text style={[styles.filterCategoryText, filters.city === city && styles.filterCategoryTextActive]}>{city}</Text></Pressable>)}
              </View>
              <Text style={styles.filterSectionTitle}>{t.availability}</Text>
              <SwitchToggle label={t.available} value={filters.available} onValueChange={(value) => setFilters((current) => ({ ...current, available: value }))} />
              <SwitchToggle
                label={data.language === 'ru' ? 'Только на пятаке (онлайн)' : 'Тек пятакта (онлайн)'}
                value={Boolean((filters as { onlineOnly?: boolean }).onlineOnly)}
                onValueChange={(value) => setFilters((current) => ({ ...current, onlineOnly: value }))}
              />
              <SwitchToggle label={t.operator} value={filters.operator} onValueChange={(value) => setFilters((current) => ({ ...current, operator: value }))} />
              <SwitchToggle label={t.delivery} value={filters.delivery} onValueChange={(value) => setFilters((current) => ({ ...current, delivery: value }))} />
            </ScrollView>
            <View style={styles.sheetActions}>
              <Pressable style={styles.resetButton} onPress={() => setFilters({ category: null, available: false, operator: false, delivery: false, onlineOnly: false, maxPrice: null, date: null, city: null })}><Text style={styles.resetText}>{t.reset}</Text></Pressable>
              <Pressable style={styles.applyButton} onPress={() => setFilterOpen(false)}><Text style={styles.applyText}>{t.show} ({listings.length})</Text></Pressable>
            </View>
          </View>
        </View>
      </Modal>

      <Modal visible={cityOpen} transparent animationType="fade" onRequestClose={() => setCityOpen(false)}>
        <Pressable style={styles.modalScrimCenter} onPress={() => setCityOpen(false)}>
          <Pressable style={styles.cityDialog} onPress={(event) => event.stopPropagation()}>
            <Text style={styles.sheetTitle}>{t.selectCity}</Text>
            {cities.map((city) => <Pressable key={city} style={styles.cityOption} onPress={() => { void changePreferredCity(city); }} disabled={backendBusy}><Text style={styles.cityOptionText}>{city}</Text>{data.city === city ? <Feather name="check" size={18} color={ORANGE} /> : null}</Pressable>)}
          </Pressable>
        </Pressable>
      </Modal>

      <Modal visible={profileOpen} transparent animationType="fade" onRequestClose={() => setProfileOpen(false)}>
        <View style={styles.modalScrimCenter}>
          <View style={styles.profileDialog}>
            <View style={styles.sheetHeader}><Text style={styles.sheetTitle}>{t.profile}</Text><Pressable onPress={() => setProfileOpen(false)}><Feather name="x" size={21} color={COLORS.ink} /></Pressable></View>
            {backendConfigured && !backendUser ? <View style={styles.authModeRow}>
              <Pressable style={[styles.authModeButton, authMethod === 'email' && styles.authModeButtonActive]} onPress={() => setAuthMethod('email')}><Text style={[styles.authModeText, authMethod === 'email' && styles.authModeTextActive]}>{t.useEmail}</Text></Pressable>
              <Pressable style={[styles.authModeButton, authMethod === 'phone' && styles.authModeButtonActive]} onPress={() => setAuthMethod('phone')}><Text style={[styles.authModeText, authMethod === 'phone' && styles.authModeTextActive]}>{t.usePhone}</Text></Pressable>
            </View> : null}
            {backendConfigured && !backendUser && authMethod === 'email' ? <>
              <View style={styles.authModeRow}>
                <Pressable style={[styles.authModeButton, emailAuthMode === 'register' && styles.authModeButtonActive]} onPress={() => setEmailAuthMode('register')}><Text style={[styles.authModeText, emailAuthMode === 'register' && styles.authModeTextActive]}>{t.register}</Text></Pressable>
                <Pressable style={[styles.authModeButton, emailAuthMode === 'login' && styles.authModeButtonActive]} onPress={() => setEmailAuthMode('login')}><Text style={[styles.authModeText, emailAuthMode === 'login' && styles.authModeTextActive]}>{t.login}</Text></Pressable>
              </View>
              {emailAuthMode === 'register' ? <><FormLabel title={t.name} /><TextInput value={profileName} onChangeText={setProfileName} placeholder={data.language === 'ru' ? 'Ваше имя' : 'Атыңыз'} placeholderTextColor="#A0A0A0" style={styles.formInput} editable={!backendBusy} /></> : null}
              <FormLabel title={t.email} /><TextInput value={profileEmail} onChangeText={setProfileEmail} placeholder={t.emailHint} placeholderTextColor="#A0A0A0" style={styles.formInput} keyboardType="email-address" autoCapitalize="none" autoComplete="email" editable={!backendBusy} />
              <FormLabel title={t.password} /><TextInput value={authPassword} onChangeText={setAuthPassword} placeholder={t.passwordHint} placeholderTextColor="#A0A0A0" style={styles.formInput} secureTextEntry autoCapitalize="none" autoComplete={emailAuthMode === 'register' ? 'new-password' : 'current-password'} editable={!backendBusy} />
              <Pressable style={styles.authSwitch} onPress={() => setEmailAuthMode(emailAuthMode === 'register' ? 'login' : 'register')}><Text style={styles.sectionAction}>{emailAuthMode === 'register' ? t.haveAccount : t.noAccount}</Text></Pressable>
            </> : null}
            {backendConfigured && !backendUser && authMethod === 'phone' ? <>
            <FormLabel title={t.name} /><TextInput value={profileName} onChangeText={setProfileName} placeholder={data.language === 'ru' ? 'Ваше имя' : 'Атыңыз'} placeholderTextColor="#A0A0A0" style={styles.formInput} editable={!backendBusy} />
            <FormLabel title={t.phone} /><TextInput value={profilePhone} onChangeText={setProfilePhone} placeholder={t.authPhoneHint} placeholderTextColor="#A0A0A0" style={styles.formInput} keyboardType="phone-pad" editable={!backendUser && !backendBusy} />
            {authCodeSent ? <>
              <FormLabel title={t.phoneCode} />
              <TextInput value={authCode} onChangeText={setAuthCode} placeholder={t.enterCode} placeholderTextColor="#A0A0A0" style={styles.formInput} keyboardType="number-pad" textContentType="oneTimeCode" editable={!backendBusy} />
              <Pressable onPress={() => { void sendAuthCode(); }} disabled={backendBusy}><Text style={styles.sectionAction}>{t.sendAgain}</Text></Pressable>
            </> : null}
            <Text style={styles.disclaimer}>{t.smsSetupRequired}</Text>
            </> : null}
            {backendConfigured && backendUser ? <><FormLabel title={t.name} /><TextInput value={profileName} onChangeText={setProfileName} placeholder={data.language === 'ru' ? 'Ваше имя' : 'Атыңыз'} placeholderTextColor="#A0A0A0" style={styles.formInput} editable={!backendBusy} /><Text style={styles.disclaimer}>{backendUser.email ?? backendUser.phone ?? profilePhone}</Text></> : null}
            {!backendConfigured ? <Text style={styles.disclaimer}>{data.language === 'ru' ? 'Демо-профиль хранится на этом устройстве. Авторизация не подключена.' : 'Демо профиль осы құрылғыда сақталады. Авторизация қосылмаған.'}</Text> : null}
            <Pressable style={styles.primaryButton} onPress={() => { void saveProfile(); }} disabled={backendBusy}>
              {backendBusy ? <ActivityIndicator color="#fff" /> : <Text style={styles.primaryButtonText}>{backendConfigured && !backendUser ? (authMethod === 'phone' ? (authCodeSent ? t.verifyCode : t.sendCode) : (emailAuthMode === 'register' ? t.register : t.login)) : t.save}</Text>}
            </Pressable>
          </View>
        </View>
      </Modal>
      <PortalHost />
    </SafeAreaProvider>
  );
}

const COLORS = { ink: '#222222', muted: '#777777', line: '#EEEEEE', light: '#F5F5F5', orange: ORANGE };

function SectionHeading({ title, action, onPress }: { title: string; action?: string; onPress?: () => void }) {
  return <View style={styles.sectionHeading}><Text style={styles.sectionTitle}>{title}</Text>{action ? <Pressable onPress={onPress}><Text style={styles.sectionAction}>{action}</Text></Pressable> : null}</View>;
}

function FormLabel({ title }: { title: string }) {
  return <Text style={styles.formLabel}>{title}</Text>;
}

function DemoNote({ text }: { text: string }) {
  return <View style={styles.demoNote}><Feather name="info" size={14} color="#858585" /><Text style={styles.demoNoteText}>{text}</Text></View>;
}

function EmptyState({ title, subtitle, action, onAction }: { title: string; subtitle?: string; action?: string; onAction?: () => void }) {
  return <View style={styles.emptyState}><View style={styles.emptyIcon}><Feather name="search" size={23} color={ORANGE} /></View><Text style={styles.emptyTitle}>{title}</Text>{subtitle ? <Text style={styles.emptySubtitle}>{subtitle}</Text> : null}{action ? <Pressable style={styles.emptyAction} onPress={onAction}><Text style={styles.emptyActionText}>{action}</Text></Pressable> : null}</View>;
}

function StatCard({ icon, title, value }: { icon: keyof typeof Feather.glyphMap; title: string; value: string }) {
  return <View style={styles.statCard}><Feather name={icon} size={17} color={ORANGE} /><Text style={styles.statValue}>{value}</Text><Text style={styles.statLabel}>{title}</Text></View>;
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  app: { flex: 1, backgroundColor: '#fff' },
  loadingScreen: { flex: 1, backgroundColor: '#fff', alignItems: 'center', justifyContent: 'center', gap: 12 },
  loadingText: { color: ORANGE, fontSize: 13, fontWeight: '900', letterSpacing: 2 },
  scrollContent: { paddingHorizontal: 20, paddingTop: 10, paddingBottom: 28 },
  topHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 18 },
  brand: { color: COLORS.ink, fontSize: 25, letterSpacing: 1.8, fontWeight: '900' },
  brandDot: { color: ORANGE },
  citySelector: { flexDirection: 'row', alignItems: 'center', gap: 5, marginTop: 3 },
  cityText: { fontSize: 13, color: COLORS.ink, fontWeight: '600' },
  iconButton: { width: 42, height: 42, borderRadius: 15, backgroundColor: COLORS.light, alignItems: 'center', justifyContent: 'center' },
  searchBox: { minHeight: 52, borderRadius: 16, backgroundColor: COLORS.light, flexDirection: 'row', alignItems: 'center', paddingHorizontal: 15, gap: 11 },
  searchInput: { flex: 1, fontSize: 14, color: COLORS.ink, paddingVertical: 13 },
  categoryRail: { gap: 17, paddingTop: 18, paddingBottom: 17 },
  categoryItem: { width: 68, alignItems: 'center', gap: 7 },
  categoryIcon: { width: 54, height: 54, borderRadius: 18, backgroundColor: COLORS.light, alignItems: 'center', justifyContent: 'center' },
  categoryIconSelected: { backgroundColor: '#FFF1E8', borderWidth: 1, borderColor: '#FFD4B8' },
  categoryLabel: { minHeight: 30, textAlign: 'center', fontSize: 10, lineHeight: 13, color: '#555', fontWeight: '500' },
  hero: { minHeight: 183, borderRadius: 22, backgroundColor: ORANGE, padding: 21, overflow: 'hidden', justifyContent: 'center' },
  heroTextBlock: { zIndex: 2, width: '75%' },
  heroTitle: { fontSize: 23, lineHeight: 28, fontWeight: '800', color: '#fff', letterSpacing: -0.5 },
  heroSubtitle: { color: 'rgba(255,255,255,0.9)', fontSize: 12, lineHeight: 17, marginTop: 7, maxWidth: 240 },
  heroButton: { height: 39, paddingHorizontal: 13, borderRadius: 12, backgroundColor: '#fff', flexDirection: 'row', alignItems: 'center', gap: 8, alignSelf: 'flex-start', marginTop: 14 },
  heroButtonText: { color: ORANGE, fontWeight: '700', fontSize: 12 },
  heroDecor: { position: 'absolute', right: 1, bottom: 1, width: 130, height: 120, justifyContent: 'center', alignItems: 'center' },
  heroCircle: { width: 105, height: 105, borderRadius: 55, borderWidth: 1, borderColor: 'rgba(255,255,255,0.26)', position: 'absolute', right: -17, bottom: -34 },
  heroSpeckle: { position: 'absolute', width: 110, height: 110, borderRadius: 55, backgroundColor: 'rgba(255,255,255,0.07)', top: -70, right: 65 },
  section: { marginTop: 26 },
  sectionHeading: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 },
  sectionTitle: { fontSize: 17, color: COLORS.ink, fontWeight: '700', letterSpacing: -0.3 },
  sectionAction: { color: ORANGE, fontSize: 12, fontWeight: '700' },
  horizontalCards: { gap: 12, paddingRight: 20 },
  listingCard: { borderRadius: 17, backgroundColor: '#fff', borderWidth: 1, borderColor: '#F0F0F0', overflow: 'hidden', marginBottom: 13 },
  marketplaceCard: { borderRadius: 20, borderColor: '#E8E8E8', marginBottom: 17 },
  marketplaceStatus: { backgroundColor: 'transparent', paddingHorizontal: 0, paddingVertical: 0 },
  marketplaceCategoryRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 },
  marketplaceRating: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  marketplaceRatingText: { color: COLORS.ink, fontSize: 11, fontWeight: '700' },
  marketplaceReviewCount: { color: COLORS.muted, fontSize: 10 },
  marketplaceMeta: { paddingTop: 10, borderTopWidth: 1, borderTopColor: '#F1F1F1' },
  compactCard: { width: 245, marginBottom: 0 },
  cardImageWrap: { height: 160, position: 'relative', backgroundColor: '#E8E8E8' },
  cardImage: { width: '100%', height: '100%' },
  availabilityBadge: { position: 'absolute', top: 11, left: 11, backgroundColor: 'rgba(255,255,255,0.95)', borderRadius: 20, paddingHorizontal: 9, paddingVertical: 6, flexDirection: 'row', alignItems: 'center', gap: 5 },
  availabilityDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: '#2BA66B' },
  busyDot: { backgroundColor: '#E49B28' },
  availabilityText: { color: COLORS.ink, fontSize: 10, fontWeight: '600' },
  favoriteButton: { position: 'absolute', top: 9, right: 9, width: 34, height: 34, borderRadius: 17, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(255,255,255,0.96)' },
  cardContent: { paddingHorizontal: 13, paddingTop: 12, paddingBottom: 13 },
  listingName: { color: COLORS.ink, fontSize: 14, fontWeight: '700' },
  listingModel: { color: COLORS.muted, fontSize: 12, marginTop: 3 },
  listingPrice: { color: ORANGE, fontSize: 14, fontWeight: '700', marginTop: 10 },
  cardMeta: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 10 },
  inlineMeta: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  metaText: { color: COLORS.muted, fontSize: 10, fontWeight: '500' },
  offerCard: { borderRadius: 16, backgroundColor: '#FFF8F3', borderWidth: 1, borderColor: '#FCE4D4', padding: 14, flexDirection: 'row', alignItems: 'center', gap: 12 },
  offerIcon: { width: 38, height: 38, borderRadius: 13, backgroundColor: '#fff', justifyContent: 'center', alignItems: 'center' },
  offerTitle: { color: COLORS.ink, fontSize: 13, fontWeight: '700' },
  offerSubtitle: { color: COLORS.muted, fontSize: 11, marginTop: 4, lineHeight: 15 },
  ownerBanner: { marginTop: 26, padding: 15, borderRadius: 17, backgroundColor: COLORS.light, flexDirection: 'row', alignItems: 'center', gap: 12 },
  ownerBannerIcon: { width: 42, height: 42, borderRadius: 14, backgroundColor: '#fff', alignItems: 'center', justifyContent: 'center' },
  ownerBannerTitle: { color: COLORS.ink, fontSize: 13, fontWeight: '700' },
  ownerBannerSubtitle: { color: COLORS.muted, fontSize: 10, marginTop: 4 },
  demoNote: { flexDirection: 'row', gap: 7, alignItems: 'flex-start', marginTop: 20, paddingHorizontal: 3 },
  demoNoteText: { flex: 1, color: '#858585', fontSize: 10, lineHeight: 15 },
  pageHeader: { flexDirection: 'row', alignItems: 'center', minHeight: 44, marginBottom: 16 },
  pageTitle: { flex: 1, fontSize: 22, fontWeight: '800', color: COLORS.ink, letterSpacing: -0.45, marginLeft: 1 },
  backButton: { width: 36, height: 36, borderRadius: 12, backgroundColor: COLORS.light, justifyContent: 'center', alignItems: 'center', marginRight: 11 },
  catalogControls: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 13, marginBottom: 17 },
  filterButton: { height: 40, borderWidth: 1, borderColor: '#EAEAEA', borderRadius: 12, paddingHorizontal: 12, flexDirection: 'row', alignItems: 'center', gap: 7 },
  filterButtonText: { color: COLORS.ink, fontWeight: '600', fontSize: 12 },
  filterCount: { width: 7, height: 7, borderRadius: 4, backgroundColor: ORANGE },
  viewToggle: { flexDirection: 'row', backgroundColor: COLORS.light, borderRadius: 12, padding: 3 },
  toggleOption: { height: 33, paddingHorizontal: 10, borderRadius: 9, flexDirection: 'row', alignItems: 'center', gap: 5 },
  toggleOptionActive: { backgroundColor: '#fff' },
  toggleLabel: { color: COLORS.muted, fontSize: 11 },
  toggleLabelActive: { color: COLORS.ink, fontWeight: '600' },
  activeFilter: { flexDirection: 'row', alignItems: 'center', gap: 7, alignSelf: 'flex-start', backgroundColor: '#FFF1E8', paddingHorizontal: 11, paddingVertical: 7, borderRadius: 20, marginTop: -7, marginBottom: 13 },
  activeFilters: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  activeFilterText: { color: ORANGE, fontSize: 11, fontWeight: '600' },
  mapPlaceholder: { minHeight: 390, borderRadius: 20, backgroundColor: '#EAF0EA', alignItems: 'center', justifyContent: 'center', paddingHorizontal: 35, overflow: 'hidden' },
  mapGrid: { position: 'absolute', top: 0, right: 0, bottom: 0, left: 0, opacity: 0.6, backgroundColor: '#EAF0EA', borderWidth: 1, borderColor: '#D5E0D5' },
  mapPin: { width: 45, height: 45, backgroundColor: ORANGE, borderRadius: 24, alignItems: 'center', justifyContent: 'center', marginBottom: 12 },
  mapTitle: { fontSize: 19, fontWeight: '800', color: COLORS.ink },
  mapHint: { fontSize: 12, color: COLORS.muted, textAlign: 'center', lineHeight: 18, marginTop: 7 },
  mapListButton: { marginTop: 16, borderRadius: 12, backgroundColor: '#fff', paddingHorizontal: 14, paddingVertical: 10, flexDirection: 'row', alignItems: 'center', gap: 7 },
  mapListText: { color: ORANGE, fontSize: 12, fontWeight: '700' },
  detailImageWrap: { height: 248, backgroundColor: '#eee', borderRadius: 19, overflow: 'hidden', position: 'relative' },
  detailImage: { width: '100%', height: '100%' },
  detailFavorite: { position: 'absolute', right: 13, top: 13, width: 40, height: 40, borderRadius: 20, backgroundColor: '#fff', justifyContent: 'center', alignItems: 'center' },
  imageCounter: { position: 'absolute', right: 12, bottom: 12, backgroundColor: 'rgba(34,34,34,0.65)', paddingHorizontal: 10, paddingVertical: 5, borderRadius: 10 },
  imageCounterText: { color: '#fff', fontSize: 10, fontWeight: '600' },
  detailIntro: { paddingTop: 17 },
  detailCategory: { alignSelf: 'flex-start', borderRadius: 20, backgroundColor: '#FFF1E8', paddingHorizontal: 10, paddingVertical: 5 },
  detailCategoryText: { color: ORANGE, fontSize: 10, fontWeight: '700' },
  detailTitle: { fontSize: 22, fontWeight: '800', color: COLORS.ink, marginTop: 10, letterSpacing: -0.4 },
  detailModel: { color: COLORS.muted, fontSize: 14, marginTop: 3 },
  detailMetaLine: { flexDirection: 'row', gap: 17, marginTop: 12, flexWrap: 'wrap' },
  detailPrice: { color: ORANGE, fontSize: 20, fontWeight: '800', marginTop: 15 },
  divider: { height: 1, backgroundColor: COLORS.line, marginVertical: 18 },
  detailSection: { marginBottom: 21 },
  description: { color: '#626262', fontSize: 13, lineHeight: 20, marginTop: 9 },
  specGrid: { marginTop: 11, gap: 12 },
  specItem: { flexDirection: 'row', gap: 9, alignItems: 'center' },
  specText: { color: '#555', fontSize: 13 },
  ownerInfo: { flexDirection: 'row', alignItems: 'center', gap: 11, marginTop: 12 },
  ownerAvatar: { width: 45, height: 45, borderRadius: 16, backgroundColor: '#FFF1E8', alignItems: 'center', justifyContent: 'center' },
  ownerName: { color: COLORS.ink, fontSize: 13, fontWeight: '700' },
  ownerExperience: { color: COLORS.muted, fontSize: 11, marginTop: 4 },
  verifiedBadge: { backgroundColor: '#EFF8F1', paddingHorizontal: 8, paddingVertical: 5, borderRadius: 9, flexDirection: 'row', alignItems: 'center', gap: 3 },
  verifiedText: { color: '#268A55', fontSize: 10, fontWeight: '600' },
  areaCard: { borderRadius: 14, backgroundColor: COLORS.light, padding: 13, flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 11 },
  areaCity: { color: COLORS.ink, fontSize: 13, fontWeight: '600' },
  calendarRow: { flexDirection: 'row', gap: 9, alignItems: 'center' },
  stickyOrderBar: { position: 'absolute', left: 0, right: 0, bottom: 0, backgroundColor: '#fff', borderTopWidth: 1, borderTopColor: COLORS.line, paddingHorizontal: 20, paddingTop: 12, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 9 },
  stickyPrice: { color: COLORS.ink, fontSize: 17, fontWeight: '800' },
  stickyPerHour: { color: COLORS.muted, fontSize: 11, fontWeight: '500' },
  stickyCaption: { color: COLORS.muted, fontSize: 9, marginTop: 3, maxWidth: 200 },
  primaryButtonSmall: { height: 48, paddingHorizontal: 24, backgroundColor: ORANGE, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  primaryButton: { minHeight: 52, paddingHorizontal: 17, backgroundColor: ORANGE, borderRadius: 15, alignItems: 'center', justifyContent: 'center', flexDirection: 'row', gap: 10, marginTop: 19 },
  primaryButtonText: { color: '#fff', fontSize: 14, fontWeight: '700' },
  bookingListing: { flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: COLORS.light, borderRadius: 16, padding: 11, marginBottom: 21 },
  bookingThumb: { width: 68, height: 68, borderRadius: 13, backgroundColor: '#ddd' },
  bookingTitle: { color: COLORS.ink, fontSize: 13, fontWeight: '700' },
  bookingPrice: { color: ORANGE, fontSize: 12, fontWeight: '700', marginTop: 6 },
  formLabel: { color: COLORS.ink, fontSize: 13, fontWeight: '600', marginBottom: 9, marginTop: 17 },
  dateChoices: { flexDirection: 'row', gap: 7 },
  dateChoice: { flex: 1, minHeight: 44, borderRadius: 12, borderWidth: 1, borderColor: '#EAEAEA', alignItems: 'center', justifyContent: 'center', paddingHorizontal: 5 },
  dateChoiceActive: { borderColor: ORANGE, backgroundColor: '#FFF7F1' },
  dateChoiceText: { color: '#555', fontSize: 10, fontWeight: '500' },
  dateChoiceTextActive: { color: ORANGE, fontWeight: '700' },
  durationControl: { height: 48, borderRadius: 13, backgroundColor: COLORS.light, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 7 },
  durationButton: { width: 36, height: 36, borderRadius: 11, backgroundColor: '#fff', alignItems: 'center', justifyContent: 'center' },
  durationText: { color: COLORS.ink, fontWeight: '700', fontSize: 14 },
  formInput: { minHeight: 49, borderRadius: 13, backgroundColor: COLORS.light, paddingHorizontal: 14, paddingVertical: 13, color: COLORS.ink, fontSize: 13, borderWidth: 1, borderColor: 'transparent' },
  authModeRow: { flexDirection: 'row', gap: 4, backgroundColor: COLORS.light, borderRadius: 12, padding: 3, marginBottom: 9 },
  authModeButton: { flex: 1, minHeight: 36, alignItems: 'center', justifyContent: 'center', borderRadius: 10 },
  authModeButtonActive: { backgroundColor: '#fff' },
  authModeText: { color: COLORS.muted, fontSize: 11, fontWeight: '600' },
  authModeTextActive: { color: COLORS.ink },
  authSwitch: { alignSelf: 'center', paddingVertical: 8 },
  multilineInput: { minHeight: 90 },
  costCard: { marginTop: 22, padding: 15, backgroundColor: '#FBFBFB', borderWidth: 1, borderColor: '#F0F0F0', borderRadius: 16 },
  costLine: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  costLabel: { color: COLORS.muted, fontSize: 12 },
  costAmount: { color: COLORS.ink, fontSize: 13, fontWeight: '600' },
  totalLabel: { color: COLORS.ink, fontSize: 13, fontWeight: '700' },
  totalAmount: { color: ORANGE, fontSize: 18, fontWeight: '800' },
  disclaimer: { color: COLORS.muted, fontSize: 10, lineHeight: 15, marginTop: 10 },
  emptyState: { flex: 1, minHeight: 300, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 36, paddingVertical: 30 },
  emptyIcon: { width: 56, height: 56, borderRadius: 20, backgroundColor: '#FFF1E8', alignItems: 'center', justifyContent: 'center', marginBottom: 16 },
  emptyTitle: { color: COLORS.ink, fontSize: 16, fontWeight: '700', textAlign: 'center' },
  emptySubtitle: { color: COLORS.muted, fontSize: 12, textAlign: 'center', lineHeight: 18, marginTop: 7 },
  emptyAction: { backgroundColor: ORANGE, paddingHorizontal: 19, paddingVertical: 12, borderRadius: 13, marginTop: 17 },
  emptyActionText: { color: '#fff', fontSize: 12, fontWeight: '700' },
  orderCard: { borderRadius: 17, backgroundColor: '#fff', borderWidth: 1, borderColor: '#EFEFEF', padding: 14, marginBottom: 13 },
  orderTop: { flexDirection: 'row', alignItems: 'center', gap: 11 },
  orderThumb: { width: 66, height: 66, borderRadius: 12, backgroundColor: '#eee' },
  orderTitle: { color: COLORS.ink, fontSize: 13, fontWeight: '700', lineHeight: 18 },
  orderStatus: { flexDirection: 'row', alignItems: 'center', gap: 7, backgroundColor: '#FFF7E9', paddingVertical: 8, paddingHorizontal: 10, borderRadius: 10, alignSelf: 'flex-start', marginTop: 13 },
  statusDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: '#E49B28' },
  orderStatusText: { color: '#9A6811', fontSize: 10, fontWeight: '600' },
  orderInfo: { flexDirection: 'row', alignItems: 'flex-start', gap: 7, marginTop: 12 },
  orderInfoText: { color: COLORS.muted, fontSize: 10, lineHeight: 15, flex: 1 },
  orderBottom: { borderTopWidth: 1, borderTopColor: COLORS.line, paddingTop: 11, marginTop: 12, flexDirection: 'row', justifyContent: 'space-between', gap: 8, alignItems: 'center' },
  orderTotal: { color: COLORS.ink, fontSize: 13, fontWeight: '700' },
  chatContent: { paddingHorizontal: 19, paddingBottom: 19, flexGrow: 1 },
  chatDate: { textAlign: 'center', color: COLORS.muted, fontSize: 10, marginVertical: 15 },
  messageBubble: { maxWidth: '83%', paddingHorizontal: 13, paddingTop: 10, paddingBottom: 7, borderRadius: 16, marginBottom: 9 },
  messageOther: { alignSelf: 'flex-start', backgroundColor: COLORS.light, borderBottomLeftRadius: 5 },
  messageMine: { alignSelf: 'flex-end', backgroundColor: ORANGE, borderBottomRightRadius: 5 },
  messageText: { color: COLORS.ink, fontSize: 13, lineHeight: 18 },
  messageTextMine: { color: '#fff' },
  messageTime: { textAlign: 'right', color: COLORS.muted, fontSize: 9, marginTop: 4 },
  messageTimeMine: { color: 'rgba(255,255,255,0.8)' },
  demoChatNotice: { flexDirection: 'row', gap: 7, alignItems: 'flex-start', marginTop: 14, paddingHorizontal: 5 },
  demoChatText: { flex: 1, color: COLORS.muted, fontSize: 10, lineHeight: 15 },
  chatComposer: { borderTopWidth: 1, borderTopColor: COLORS.line, paddingHorizontal: 16, paddingTop: 10, flexDirection: 'row', gap: 9, alignItems: 'center', backgroundColor: '#fff' },
  chatInput: { flex: 1, minHeight: 44, borderRadius: 14, backgroundColor: COLORS.light, paddingHorizontal: 14, color: COLORS.ink, fontSize: 13 },
  sendButton: { width: 43, height: 43, borderRadius: 15, backgroundColor: ORANGE, justifyContent: 'center', alignItems: 'center' },
  sendButtonDisabled: { backgroundColor: '#D6D6D6' },
  profileHero: { backgroundColor: COLORS.light, borderRadius: 18, padding: 15, flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 18 },
  profileAvatar: { width: 56, height: 56, borderRadius: 19, backgroundColor: '#fff', alignItems: 'center', justifyContent: 'center' },
  profileName: { color: COLORS.ink, fontSize: 16, fontWeight: '700' },
  editIcon: { width: 36, height: 36, borderRadius: 12, backgroundColor: '#fff', justifyContent: 'center', alignItems: 'center' },
  profileRow: { minHeight: 56, flexDirection: 'row', alignItems: 'center', gap: 11, borderBottomWidth: 1, borderBottomColor: '#F2F2F2' },
  profileRowIcon: { width: 34, height: 34, borderRadius: 11, backgroundColor: '#FFF5EE', alignItems: 'center', justifyContent: 'center' },
  profileRowText: { flex: 1, color: COLORS.ink, fontSize: 13, fontWeight: '600' },
  profileCount: { minWidth: 25, paddingHorizontal: 7, height: 22, borderRadius: 11, backgroundColor: COLORS.light, alignItems: 'center', justifyContent: 'center' },
  profileCountText: { color: COLORS.muted, fontSize: 10, fontWeight: '600' },
  languageValue: { color: COLORS.muted, fontSize: 11, marginRight: 1 },
  profileDivider: { height: 1, backgroundColor: COLORS.line, marginVertical: 20 },
  ownerProfileCard: { flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: '#FFF7F1', borderRadius: 16, padding: 14 },
  ownerProfileIcon: { width: 42, height: 42, backgroundColor: ORANGE, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  ownerProfileTitle: { color: COLORS.ink, fontSize: 13, fontWeight: '700' },
  ownerProfileSub: { color: COLORS.muted, fontSize: 10, marginTop: 4 },
  ownerDashboardHero: { borderRadius: 21, padding: 20, backgroundColor: ORANGE, marginBottom: 15 },
  ownerDashboardEyebrow: { color: 'rgba(255,255,255,0.78)', fontSize: 11, fontWeight: '600' },
  ownerDashboardTitle: { color: '#fff', fontSize: 21, fontWeight: '800', marginTop: 9 },
  ownerDashboardSub: { color: 'rgba(255,255,255,0.88)', fontSize: 12, marginTop: 5 },
  statsGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  statCard: { width: '48%', minHeight: 110, padding: 13, borderWidth: 1, borderColor: '#EFEFEF', borderRadius: 16, backgroundColor: '#fff' },
  statValue: { color: COLORS.ink, fontSize: 22, fontWeight: '800', marginTop: 8 },
  statLabel: { color: COLORS.muted, fontSize: 10, marginTop: 2 },
  revenueCard: { marginTop: 12, backgroundColor: COLORS.light, borderRadius: 16, padding: 14, flexDirection: 'row', alignItems: 'center', gap: 11 },
  revenueIcon: { width: 39, height: 39, borderRadius: 13, backgroundColor: '#fff', alignItems: 'center', justifyContent: 'center' },
  revenueLabel: { color: COLORS.muted, fontSize: 10 },
  revenueAmount: { color: COLORS.ink, fontSize: 18, fontWeight: '800', marginTop: 3 },
  revenuePeriod: { color: COLORS.muted, fontSize: 10, marginLeft: 'auto' },
  ownerEmpty: { borderWidth: 1, borderColor: '#EFEFEF', borderRadius: 16, padding: 19, alignItems: 'center', gap: 8, marginTop: 18 },
  ownerEmptyText: { color: COLORS.muted, fontSize: 11, textAlign: 'center' },
  wizardProgress: { flexDirection: 'row', gap: 6, marginTop: 5 },
  wizardSegment: { height: 4, flex: 1, borderRadius: 2, backgroundColor: '#EBEBEB' },
  wizardSegmentActive: { backgroundColor: ORANGE },
  wizardStepLabel: { color: COLORS.muted, fontSize: 11, marginTop: 10 },
  wizardTitle: { color: COLORS.ink, fontSize: 20, fontWeight: '800', marginTop: 18, marginBottom: 3 },
  photoPicker: { borderWidth: 1, borderStyle: 'dashed', borderColor: '#E3D0C2', backgroundColor: '#FFFAF6', minHeight: 140, borderRadius: 16, alignItems: 'center', justifyContent: 'center', marginTop: 14 },
  photoPickerIcon: { width: 45, height: 45, borderRadius: 15, backgroundColor: '#fff', justifyContent: 'center', alignItems: 'center' },
  photoPickerTitle: { color: COLORS.ink, fontSize: 12, fontWeight: '600', marginTop: 8 },
  photoPickerHint: { color: COLORS.muted, fontSize: 10, marginTop: 4 },
  pickedPhoto: { width: 106, height: 120, borderRadius: 12, margin: 8 },
  categoryChoices: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 4 },
  categoryChoice: { borderRadius: 12, borderWidth: 1, borderColor: '#EAEAEA', paddingHorizontal: 11, paddingVertical: 10 },
  categoryChoiceActive: { borderColor: ORANGE, backgroundColor: '#FFF7F1' },
  categoryChoiceText: { color: '#555', fontSize: 11 },
  categoryChoiceTextActive: { color: ORANGE, fontWeight: '700' },
  cityInputText: { color: COLORS.ink, fontSize: 13 },
  descriptionInput: { minHeight: 145, marginTop: 9 },
  weekdayChoices: { flexDirection: 'row', justifyContent: 'space-between', gap: 5 },
  weekdayChoice: { flex: 1, height: 39, borderWidth: 1, borderColor: '#EAEAEA', borderRadius: 11, alignItems: 'center', justifyContent: 'center' },
  weekdayChoiceActive: { backgroundColor: '#FFF1E8', borderColor: ORANGE },
  weekdayText: { color: COLORS.muted, fontSize: 10, fontWeight: '600' },
  weekdayTextActive: { color: ORANGE },
  ownerOptions: { marginTop: 15 },
  ownerTip: { flexDirection: 'row', gap: 8, backgroundColor: '#FFF7F1', padding: 12, borderRadius: 13, marginTop: 16 },
  ownerTipText: { color: '#666', fontSize: 10, flex: 1, lineHeight: 15 },
  modalScrim: { flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(20,20,20,0.32)' },
  filterSheet: { maxHeight: '90%', backgroundColor: '#fff', borderTopLeftRadius: 25, borderTopRightRadius: 25, paddingHorizontal: 20, paddingTop: 9, paddingBottom: 27 },
  sheetHandle: { width: 37, height: 4, borderRadius: 2, backgroundColor: '#DADADA', alignSelf: 'center', marginBottom: 17 },
  sheetHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 },
  sheetTitle: { color: COLORS.ink, fontSize: 18, fontWeight: '800' },
  filterSectionTitle: { color: COLORS.ink, fontSize: 12, fontWeight: '700', marginTop: 12, marginBottom: 9 },
  priceFilterHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  priceFilterValue: { color: ORANGE, fontSize: 12, fontWeight: '700' },
  priceFilterBounds: { flexDirection: 'row', justifyContent: 'space-between' },
  priceFilterBound: { color: COLORS.muted, fontSize: 10 },
  filterBody: { flexShrink: 1 },
  filterCategoryRail: { gap: 7, paddingBottom: 5 },
  filterCategory: { borderRadius: 20, borderWidth: 1, borderColor: '#EAEAEA', paddingHorizontal: 11, paddingVertical: 8 },
  filterCategoryActive: { borderColor: ORANGE, backgroundColor: '#FFF1E8' },
  filterCategoryText: { color: '#666', fontSize: 10 },
  filterCategoryTextActive: { color: ORANGE, fontWeight: '700' },
  filterChoiceRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 7 },
  sheetActions: { flexDirection: 'row', gap: 10, marginTop: 20 },
  resetButton: { flex: 1, height: 48, borderWidth: 1, borderColor: '#EAEAEA', borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  resetText: { color: COLORS.ink, fontSize: 12, fontWeight: '600' },
  applyButton: { flex: 1.5, height: 48, borderRadius: 14, backgroundColor: ORANGE, alignItems: 'center', justifyContent: 'center' },
  applyText: { color: '#fff', fontSize: 12, fontWeight: '700' },
  modalScrimCenter: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: 'rgba(20,20,20,0.36)', padding: 22 },
  cityDialog: { width: '100%', backgroundColor: '#fff', borderRadius: 20, padding: 19 },
  cityOption: { minHeight: 47, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', borderBottomWidth: 1, borderBottomColor: '#F2F2F2' },
  cityOptionText: { color: COLORS.ink, fontSize: 13, fontWeight: '500' },
  profileDialog: { width: '100%', backgroundColor: '#fff', borderRadius: 20, padding: 19 },
  backendError: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12, marginBottom: 13, padding: 12, borderRadius: 12, backgroundColor: '#FFF7F1' },
  backendErrorText: { flex: 1, color: '#8D3A00', fontSize: 11, lineHeight: 16 },
  backendLoader: { marginVertical: 36 },
  orderActions: { flexDirection: 'row', gap: 9, marginTop: 13 },
  orderActionPrimary: { flex: 1, minHeight: 42, borderRadius: 12, backgroundColor: ORANGE, alignItems: 'center', justifyContent: 'center' },
  orderActionPrimaryText: { color: '#fff', fontSize: 12, fontWeight: '700' },
  orderActionSecondary: { flex: 1, minHeight: 42, borderRadius: 12, borderWidth: 1, borderColor: '#EAEAEA', alignItems: 'center', justifyContent: 'center' },
  orderActionSecondaryText: { color: COLORS.ink, fontSize: 12, fontWeight: '600' },
  signOutButton: { minHeight: 48, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 9, marginTop: 18, borderRadius: 14, backgroundColor: COLORS.light },
  signOutText: { color: COLORS.ink, fontSize: 12, fontWeight: '600' },
  notificationCard: { flexDirection: 'row', alignItems: 'flex-start', gap: 12, padding: 14, borderRadius: 16, backgroundColor: COLORS.light, marginBottom: 10 },
  notificationIcon: { width: 36, height: 36, borderRadius: 12, backgroundColor: '#fff', alignItems: 'center', justifyContent: 'center' },
  notificationBody: { flex: 1 },
  notificationTitle: { color: COLORS.ink, fontSize: 13, fontWeight: '700' },
  notificationText: { color: COLORS.muted, fontSize: 11, lineHeight: 16, marginTop: 4 },
  notificationTime: { color: COLORS.muted, fontSize: 10, marginTop: 7 },
  notificationUnread: { width: 7, height: 7, borderRadius: 4, backgroundColor: ORANGE, marginTop: 5 },
  accountLoading: { minHeight: 120, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10 },
  accountError: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12, marginVertical: 12, padding: 13, borderRadius: 13, backgroundColor: '#FFF7F1' },
  accountErrorText: { flex: 1, color: '#8D3A00', fontSize: 11, lineHeight: 16 },
  cancelOrderButton: { alignSelf: 'flex-start', marginTop: 13, paddingHorizontal: 13, paddingVertical: 10, borderRadius: 12, borderWidth: 1, borderColor: '#E8E8E8' },
  cancelOrderText: { color: '#9B2C2C', fontSize: 11, fontWeight: '600' },
  settingsIntro: { padding: 17, borderRadius: 17, backgroundColor: COLORS.light, marginBottom: 8 },
  settingsTitle: { color: COLORS.ink, fontSize: 17, fontWeight: '700' },
  settingsSubtitle: { color: COLORS.muted, fontSize: 11, lineHeight: 16, marginTop: 6 },
});

export default App;
