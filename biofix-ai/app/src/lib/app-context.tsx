import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Crypto from 'expo-crypto';
import { getLocales } from 'expo-localization';
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { useColorScheme } from 'react-native';
import { translate, type Key, type Lang } from '../i18n';
import { ApiError, createApi, ERROR_KEY, type Api } from './api';
import { makeColors, type Colors } from './theme';
import type { Me } from './types';

export const RATES = { USD: 1, EUR: 0.92, TRY: 42, GBP: 0.79 } as const; // indicative only
export type Currency = keyof typeof RATES;

export interface Settings {
  lang: Lang;
  cur: Currency;
  theme: 'system' | 'light' | 'dark';
  contrast: boolean;
  apiUrl: string;
  adminToken: string;
  name: string;
  userId: string;
}

const KEY = 'biofix.settings.v1';
const DEFAULT_URL = process.env.EXPO_PUBLIC_API_URL || 'http://localhost:8787';

function defaults(): Settings {
  const lc = getLocales()[0]?.languageCode;
  return {
    lang: lc === 'tr' ? 'tr' : lc ? 'en' : 'tr',
    cur: 'USD', theme: 'system', contrast: false, apiUrl: DEFAULT_URL, adminToken: '', name: '',
    userId: Crypto.randomUUID().replace(/-/g, ''),
  };
}

interface Ctx {
  ready: boolean;
  s: Settings;
  update: (patch: Partial<Settings>) => void;
  t: (k: Key | string, ...a: (string | number)[]) => string;
  money: (usd: number, cur?: Currency) => string;
  num: (n: number) => string;
  c: Colors;
  dark: boolean;
  api: Api;
  me: Me | null;
  setMe: (m: Me) => void;
  refreshMe: () => Promise<void>;
  meError: string;
  toast: (msg: string) => void;
  toastMsg: string;
  errText: (e: unknown) => string;
  /** Bumped after mutations so list screens re-fetch when focused. */
  version: number;
  bump: () => void;
}

const AppCtx = createContext<Ctx | null>(null);

export function AppProvider({ children }: { children: ReactNode }) {
  const [s, setS] = useState<Settings>(defaults);
  const [ready, setReady] = useState(false);
  const [me, setMe] = useState<Me | null>(null);
  const [meError, setMeError] = useState('');
  const [toastMsg, setToastMsg] = useState('');
  const [version, setVersion] = useState(0);
  const sRef = useRef(s);
  sRef.current = s;
  const scheme = useColorScheme();

  useEffect(() => {
    AsyncStorage.getItem(KEY)
      .then((raw) => { if (raw) setS({ ...defaults(), ...JSON.parse(raw) }); })
      .catch(() => {})
      .finally(() => setReady(true));
  }, []);

  const update = useCallback((patch: Partial<Settings>) => {
    setS((prev) => {
      const next = { ...prev, ...patch };
      AsyncStorage.setItem(KEY, JSON.stringify(next)).catch(() => {});
      return next;
    });
  }, []);

  const api = useMemo(() => createApi(() => {
    const v = sRef.current;
    return { baseUrl: v.apiUrl, userId: v.userId, name: v.name, lang: v.lang, adminToken: v.adminToken };
  }), []);

  const t = useCallback((k: Key | string, ...a: (string | number)[]) => translate(s.lang, k, ...a), [s.lang]);
  const locale = s.lang === 'tr' ? 'tr-TR' : 'en-US';
  const money = useCallback((usd: number, cur?: Currency) => {
    const cc = cur || s.cur;
    try {
      return new Intl.NumberFormat(locale, { style: 'currency', currency: cc, maximumFractionDigits: 0 }).format(usd * RATES[cc]);
    } catch {
      return `${Math.round(usd * RATES[cc])} ${cc}`;
    }
  }, [s.cur, locale]);
  const num = useCallback((n: number) => Number(n).toLocaleString(locale), [locale]);

  const errText = useCallback((e: unknown) => {
    const code = e instanceof ApiError ? e.code : 'generic';
    return translate(sRef.current.lang, ERROR_KEY[code] || 'e_generic');
  }, []);

  const refreshMe = useCallback(async () => {
    try {
      setMe(await api.get<Me>('/me'));
      setMeError('');
    } catch (e) {
      setMeError(errText(e));
    }
  }, [api, errText]);

  useEffect(() => { if (ready) refreshMe(); }, [ready, s.apiUrl, s.adminToken, s.lang, refreshMe]);

  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const toast = useCallback((m: string) => {
    setToastMsg(m);
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => setToastMsg(''), 3400);
  }, []);

  const dark = s.theme === 'dark' || (s.theme === 'system' && scheme === 'dark');
  const c = useMemo(() => makeColors(dark, s.contrast), [dark, s.contrast]);
  const bump = useCallback(() => setVersion((v) => v + 1), []);

  const value: Ctx = {
    ready, s, update, t, money, num, c, dark, api, me, setMe, refreshMe, meError, toast, toastMsg, errText, version, bump,
  };
  return <AppCtx.Provider value={value}>{children}</AppCtx.Provider>;
}

export function useApp(): Ctx {
  const v = useContext(AppCtx);
  if (!v) throw new Error('useApp outside AppProvider');
  return v;
}

/** Plan quota/sell use -1 for unlimited on the wire. */
export const unlimited = (n: number) => n < 0;
