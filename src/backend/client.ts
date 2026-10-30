import AsyncStorage from '@react-native-async-storage/async-storage';
import { createClient } from '@supabase/supabase-js';
import type { Database } from './database.types';

const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL?.trim();
const supabaseAnonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY?.trim();
let validSupabaseUrl = false;

if (Boolean(supabaseUrl) !== Boolean(supabaseAnonKey)) {
  console.error('Both EXPO_PUBLIC_SUPABASE_URL and EXPO_PUBLIC_SUPABASE_ANON_KEY are required.');
}

if (supabaseUrl && supabaseAnonKey) {
  try {
    const url = new URL(supabaseUrl);
    validSupabaseUrl = url.protocol === 'https:' || url.hostname === 'localhost' || url.hostname === '127.0.0.1';
    if (!validSupabaseUrl) {
      console.error('EXPO_PUBLIC_SUPABASE_URL must use HTTPS outside localhost.');
    }
  } catch (error) {
    console.error('EXPO_PUBLIC_SUPABASE_URL must be a valid absolute URL.', error);
  }
  if (supabaseAnonKey.startsWith('sb_secret_') || supabaseAnonKey.includes('service_role')) {
    validSupabaseUrl = false;
    console.error('Never expose a Supabase secret or service-role key in the mobile app.');
  }
}

export const backendConfigured = Boolean(supabaseUrl && supabaseAnonKey && validSupabaseUrl);

export const supabase = backendConfigured
  ? createClient<Database>(supabaseUrl!, supabaseAnonKey!, {
      auth: {
        storage: AsyncStorage,
        autoRefreshToken: true,
        persistSession: true,
        detectSessionInUrl: false,
      },
    })
  : null;
