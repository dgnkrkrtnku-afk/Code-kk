// Secrets (session token, developer key) live in the OS keystore: Android Keystore / iOS Keychain.
// The web build has no keystore, so it falls back to browser storage — fine for development only.
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as SecureStore from 'expo-secure-store';
import { Platform } from 'react-native';

const web = Platform.OS === 'web';

export const SESSION_KEY = 'biofix.session';
export const ADMIN_KEY = 'biofix.admin';

export async function secureGet(key: string): Promise<string> {
  try {
    return (web ? await AsyncStorage.getItem(key) : await SecureStore.getItemAsync(key)) || '';
  } catch {
    return '';
  }
}

export async function secureSet(key: string, value: string): Promise<void> {
  try {
    if (!value) await (web ? AsyncStorage.removeItem(key) : SecureStore.deleteItemAsync(key));
    else await (web ? AsyncStorage.setItem(key, value) : SecureStore.setItemAsync(key, value));
  } catch { /* storage unavailable: the value stays in memory for this run */ }
}
