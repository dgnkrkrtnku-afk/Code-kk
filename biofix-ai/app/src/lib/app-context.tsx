import AsyncStorage from '@react-native-async-storage/async-storage';
import { getLocales } from 'expo-localization';
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { useColorScheme } from 'react-native';
import { translate, type Key, type Lang } from '../i18n';
import { ApiError, createApi, ERROR_KEY, type Api } from './api';
import { ADMIN_KEY, secureGet, secureSet, SESSION_KEY } from './secure';
import { makeColors, type Colors } from './theme';
import type { AuthResult, Me } from './types';

export const RATES = { USD: 1, EUR: 0.92, TRY: 42, GBP: 0.79 } as const; // indicative only
export type Currency = keyof typeof RATES;

/** Non-secret preferences, kept in plain storage. Secrets are in ./secure. */
export interface Settings {
  lang: Lang;
  cur: Currency;
  theme: 'system' | 'light' | 'dark';
  contrast: boolean;
  apiUrl: string;
}

const KEY = 'biofix.settings.v2';

/** Server address compiled into the build (set EXPO_PUBLIC_API_URL when building). */
const BAKED_URL = (process.env.EXPO_PUBLIC_API_URL || '').trim();
/**
 * Only development builds may point the app at another server. A release build always talks to the
 * address it was built with, so nobody can be talked into sending their password somewhere else.
 */
export const CAN_EDIT_SERVER = __DEV__;
const DEFAULT_URL = BAKED_URL || (__DEV__ ? 'http://localhost:8787' : '');
/** A release build without a server address cannot work; the shell shows an explanation instead. */
export const CONFIG_ERROR = !__DEV__ && !BAKED_URL;
export const PRIVACY_URL = (process.env.EXPO_PUBLIC_PRIVACY_URL || '').trim();

function defaults(): Settings {
  const lc = getLocales()[0]?.languageCode;
  return { lang: lc === 'tr' ? 'tr' : lc ? 'en' : 'tr', cur: 'USD', theme: 'system', contrast: false, apiUrl: DEFAULT_URL };
}

interface Ctx {
  ready: boolean;
  s: Settings;
  update: (patch: Partial<Settings>) => void;
  t: (k: Key | string, ...a: (string | number)[]) => string;
  money: (usd: number, cur?: Currency) => string;
  num: (n: number) => string;
  /** Format an ISO time as a local date. */
  date: (iso: string) => string;
  c: Colors;
  dark: boolean;
  api: Api;
  /** Session token; empty when signed out. */
  token: string;
  signIn: (r: AuthResult) => void;
  /** Ends the session on the server (this device, or every device) and locally. */
  signOut: (everywhere?: boolean) => Promise<void>;
  /** Clear the session on this device only (the server already ended it, e.g. after account deletion). */
  forget: () => void;
  adminToken: string;
  setAdminToken: (v: string) => void;
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
  const [token, setToken] = useState('');
  const [adminToken, setAdminTokenState] = useState('');
  const [me, setMe] = useState<Me | null>(null);
  const [meError, setMeError] = useState('');
  const [toastMsg, setToastMsg] = useState('');
  const [version, setVersion] = useState(0);
  const live = useRef({ s, token, adminToken });
  live.current = { s, token, adminToken };
  const scheme = useColorScheme();

  useEffect(() => {
    (async () => {
      try {
        const raw = await AsyncStorage.getItem(KEY);
        const stored: Partial<Settings> = raw ? JSON.parse(raw) : {};
        const next = { ...defaults(), ...stored };
        if (!CAN_EDIT_SERVER || !next.apiUrl) next.apiUrl = DEFAULT_URL;
        setS(next);
      } catch { /* keep defaults */ }
      setToken(await secureGet(SESSION_KEY));
      setAdminTokenState(await secureGet(ADMIN_KEY));
      setReady(true);
    })();
  }, []);

  const update = useCallback((patch: Partial<Settings>) => {
    setS((prev) => {
      const next = { ...prev, ...patch };
      if (!CAN_EDIT_SERVER) next.apiUrl = DEFAULT_URL;
      AsyncStorage.setItem(KEY, JSON.stringify(next)).catch(() => {});
      return next;
    });
  }, []);

  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const toast = useCallback((m: string) => {
    setToastMsg(m);
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => setToastMsg(''), 3400);
  }, []);

  const clearSession = useCallback(() => {
    setToken('');
    setMe(null);
    setMeError('');
    secureSet(SESSION_KEY, '');
  }, []);

  const api = useMemo(() => createApi(() => {
    const v = live.current;
    return {
      baseUrl: v.s.apiUrl, token: v.token, lang: v.s.lang, adminToken: v.adminToken,
      // The server no longer accepts this session (expired, password changed, account deleted).
      onUnauthorized: () => { clearSession(); toast(translate(v.s.lang, 'e_session')); },
    };
  }), [clearSession, toast]);

  const signIn = useCallback((r: AuthResult) => {
    live.current.token = r.token; // usable by requests made before the next render
    setToken(r.token);
    setMe(r.me);
    setMeError('');
    secureSet(SESSION_KEY, r.token);
  }, []);

  const signOut = useCallback(async (everywhere = false) => {
    try { await api.post(everywhere ? '/auth/logout-all' : '/auth/logout'); } catch { /* signing out locally is what matters */ }
    clearSession();
  }, [api, clearSession]);

  const setAdminToken = useCallback((v: string) => {
    live.current.adminToken = v;
    setAdminTokenState(v);
    secureSet(ADMIN_KEY, v);
  }, []);

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

  const date = useCallback((iso: string) => {
    const d = new Date(iso);
    return Number.isNaN(d.getTime()) ? '' : d.toLocaleDateString(locale, { day: 'numeric', month: 'long', year: 'numeric' });
  }, [locale]);

  const errText = useCallback((e: unknown) => {
    const code = e instanceof ApiError ? e.code : 'generic';
    return translate(live.current.s.lang, ERROR_KEY[code] || 'e_generic');
  }, []);

  const refreshMe = useCallback(async () => {
    try {
      setMe(await api.get<Me>('/me'));
      setMeError('');
    } catch (e) {
      setMeError(errText(e));
    }
  }, [api, errText]);

  useEffect(() => { if (ready && token) refreshMe(); }, [ready, token, adminToken, s.apiUrl, s.lang, refreshMe]);

  const dark = s.theme === 'dark' || (s.theme === 'system' && scheme === 'dark');
  const c = useMemo(() => makeColors(dark, s.contrast), [dark, s.contrast]);
  const bump = useCallback(() => setVersion((v) => v + 1), []);

  const value: Ctx = {
    ready, s, update, t, money, num, date, c, dark, api, token, signIn, signOut, forget: clearSession, adminToken, setAdminToken,
    me, setMe, refreshMe, meError, toast, toastMsg, errText, version, bump,
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
