import { fetch as expoFetch } from 'expo/fetch';
import { Platform } from 'react-native';
import type { Lang } from '../i18n';
import type { StreamEvent } from './types';

export interface ApiConfig {
  baseUrl: string;
  /** Session token from sign-in; empty before login. */
  token: string;
  lang: Lang;
  adminToken: string;
  /** Called when the server says the session is no longer valid. */
  onUnauthorized: () => void;
}

export class ApiError extends Error {
  constructor(public code: string, public status = 0) { super(code); }
}

/** Server error codes → i18n keys shown to the user. */
export const ERROR_KEY: Record<string, string> = {
  network: 'e_offline', quota: 'e_quota', photo_plan: 'e_photo_plan', plan_required: 'e_plan_required',
  not_enough_points: 'e_points', billing_not_configured: 'e_billing', not_configured: 'e_not_configured',
  admin_only: 'e_admin', invalid_input: 'e_invalid', need_device: 'f_need', need_input: 'a_need', need_lessons: 'ef_need',
  listing_limit: 'e_listing_limit', pdf_empty: 'e_pdf_empty', pdf_failed: 'e_pdf_failed',
  rate_limited: 'e_rate', refused: 'e_refused', invalid_json: 'e_json', prompt_too_large: 'e_big',
  image_rejected: 'e_img', generic: 'e_generic', no_session: 'e_session', insecure_url: 'e_insecure',
  // sign-in
  invalid_email: 'au_e_email', weak_password: 'au_e_weak', email_taken: 'au_e_taken', bad_credentials: 'au_e_creds',
  bad_code: 'au_e_code', too_many_attempts: 'au_e_many', email_unverified: 'ev_e_needed', mail_not_configured: 'e_mail_cfg',
  // payments
  manage_in_play: 'b_e_manage', use_play: 'b_e_use_play', use_points: 'b_e_use_points', unknown_product: 'b_e_invalid',
  purchase_invalid: 'b_e_invalid', purchase_in_use: 'b_e_in_use', purchase_pending: 'b_e_pending',
  purchase_inactive: 'b_e_inactive', play_unavailable: 'b_e_unavailable', store_error: 'b_e_store', no_product: 'b_e_no_product',
  // abuse limits
  slow_down: 'e_slow', not_image: 'e_not_image', file_unreadable: 'e_file_unreadable', file_too_long: 'e_file_long',
  job_failed: 'k_job_failed',
};

/** Plain http is acceptable only for a server on this machine (development). */
const LOOPBACK = /^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?(\/|$)/i;

export function createApi(cfg: () => ApiConfig) {
  async function req<T>(method: string, path: string, body?: unknown, signal?: AbortSignal): Promise<T> {
    const c = cfg();
    // Release builds never send credentials or personal data over an unencrypted connection.
    if (!__DEV__ && !/^https:\/\//i.test(c.baseUrl) && !LOOPBACK.test(c.baseUrl)) throw new ApiError('insecure_url');
    const headers: Record<string, string> = { 'content-type': 'application/json', 'x-lang': c.lang };
    if (c.token) headers.authorization = `Bearer ${c.token}`;
    if (c.adminToken) headers['x-admin-token'] = c.adminToken;
    let res: Response;
    try {
      res = await fetch(c.baseUrl.replace(/\/+$/, '') + '/api' + path, {
        method, headers, body: body === undefined ? undefined : JSON.stringify(body), signal,
      });
    } catch (e) {
      if (signal?.aborted) throw new ApiError('cancelled');
      throw new ApiError('network');
    }
    let json: unknown = null;
    try { json = await res.json(); } catch { /* empty body */ }
    if (!res.ok) {
      const code = (json as { error?: string } | null)?.error || 'generic';
      if (res.status === 401 && code === 'no_session' && c.token) c.onUnauthorized();
      throw new ApiError(code, res.status);
    }
    return json as T;
  }

  /**
   * POST whose answer arrives one JSON object per line while the server is still working
   * (instant results first, then the AI answer as it is written). `onEvent` is called for each line.
   * Resolves when the answer is complete; rejects with ApiError like the other calls.
   */
  async function stream(path: string, body: unknown, onEvent: (e: StreamEvent) => void, signal?: AbortSignal): Promise<void> {
    const c = cfg();
    if (!__DEV__ && !/^https:\/\//i.test(c.baseUrl) && !LOOPBACK.test(c.baseUrl)) throw new ApiError('insecure_url');
    const headers: Record<string, string> = { 'content-type': 'application/json', accept: 'application/x-ndjson', 'x-lang': c.lang };
    if (c.token) headers.authorization = `Bearer ${c.token}`;
    if (c.adminToken) headers['x-admin-token'] = c.adminToken;
    const fail = () => new ApiError(signal?.aborted ? 'cancelled' : 'network');
    // React Native's own fetch only hands over a finished response; Expo's can be read while it arrives.
    const doFetch = (Platform.OS === 'web' ? fetch : expoFetch) as typeof fetch;
    let res: Response;
    try {
      res = await doFetch(c.baseUrl.replace(/\/+$/, '') + '/api' + path, { method: 'POST', headers, body: JSON.stringify(body), signal });
    } catch {
      throw fail();
    }
    if (!res.ok) {
      let code = 'generic';
      try { code = ((await res.json()) as { error?: string }).error || 'generic'; } catch { /* no body */ }
      if (res.status === 401 && code === 'no_session' && c.token) c.onUnauthorized();
      throw new ApiError(code, res.status);
    }

    let finished = false;
    const handle = (line: string) => {
      if (!line.trim()) return;
      const e = JSON.parse(line) as StreamEvent;
      if (e.type === 'error') throw new ApiError(e.error || 'generic');
      if (e.type === 'done') finished = true;
      if (e.type !== 'ping') onEvent(e);
    };
    try {
      const reader = res.body?.getReader();
      if (!reader) {
        (await res.text()).split('\n').forEach(handle); // no streaming here: process the whole answer at once
      } else {
        // Lines are cut on the newline byte before decoding, so a character split across two network
        // packets (every Turkish letter is two bytes) is never decoded in halves.
        const decoder = new TextDecoder();
        let buf = new Uint8Array(0);
        for (;;) {
          const { done, value } = await reader.read();
          if (value?.length) {
            const next = new Uint8Array(buf.length + value.length);
            next.set(buf);
            next.set(value, buf.length);
            buf = next;
            for (let nl = buf.indexOf(10); nl >= 0; nl = buf.indexOf(10)) {
              handle(decoder.decode(buf.subarray(0, nl)));
              buf = buf.subarray(nl + 1);
            }
          }
          if (done) break;
        }
        if (buf.length) handle(decoder.decode(buf));
      }
    } catch (e) {
      if (e instanceof ApiError) throw e;
      throw fail();
    }
    if (!finished) throw fail(); // the connection dropped before the answer was complete
  }

  return {
    stream,
    get: <T>(p: string, signal?: AbortSignal) => req<T>('GET', p, undefined, signal),
    post: <T>(p: string, b?: unknown, signal?: AbortSignal) => req<T>('POST', p, b ?? {}, signal),
    patch: <T>(p: string, b: unknown) => req<T>('PATCH', p, b),
    del: <T>(p: string) => req<T>('DELETE', p),
  };
}

export type Api = ReturnType<typeof createApi>;

export const qs = (o: Record<string, string>) =>
  '?' + Object.entries(o).filter(([, v]) => v !== '').map(([k, v]) => `${k}=${encodeURIComponent(v)}`).join('&');
