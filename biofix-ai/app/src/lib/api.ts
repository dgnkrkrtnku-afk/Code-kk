import type { Lang } from '../i18n';

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
  slow_down: 'e_slow', not_image: 'e_not_image',
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
  return {
    get: <T>(p: string, signal?: AbortSignal) => req<T>('GET', p, undefined, signal),
    post: <T>(p: string, b?: unknown, signal?: AbortSignal) => req<T>('POST', p, b ?? {}, signal),
    patch: <T>(p: string, b: unknown) => req<T>('PATCH', p, b),
    del: <T>(p: string) => req<T>('DELETE', p),
  };
}

export type Api = ReturnType<typeof createApi>;

export const qs = (o: Record<string, string>) =>
  '?' + Object.entries(o).filter(([, v]) => v !== '').map(([k, v]) => `${k}=${encodeURIComponent(v)}`).join('&');
