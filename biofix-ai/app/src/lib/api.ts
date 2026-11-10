import type { Lang } from '../i18n';

export interface ApiConfig { baseUrl: string; userId: string; name: string; lang: Lang; adminToken: string }

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
  image_rejected: 'e_img', generic: 'e_generic', no_user: 'e_session',
};

export function createApi(cfg: () => ApiConfig) {
  async function req<T>(method: string, path: string, body?: unknown, signal?: AbortSignal): Promise<T> {
    const c = cfg();
    const headers: Record<string, string> = {
      'content-type': 'application/json',
      'x-user-id': c.userId,
      'x-lang': c.lang,
    };
    if (c.name) headers['x-user-name'] = encodeURIComponent(c.name); // headers are ASCII-only
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
    if (!res.ok) throw new ApiError((json as { error?: string } | null)?.error || 'generic', res.status);
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
