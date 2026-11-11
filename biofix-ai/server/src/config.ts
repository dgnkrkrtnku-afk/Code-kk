// Environment-driven settings with production-safe defaults.

export const isProd = () => process.env.NODE_ENV === 'production';

/**
 * Demo payments let "card" purchases succeed without charging. They are on by default while
 * developing and OFF by default in production, so forgetting the variable can't give plans away.
 */
export function demoPayments(): boolean {
  const v = process.env.DEMO_PAYMENTS;
  if (v === 'true') return true;
  if (v === 'false') return false;
  return !isProd();
}

export const MIN_ADMIN_TOKEN = 24;
/** The developer key, or '' when unset or too short to be safe against guessing. */
export function adminToken(): string {
  const t = process.env.ADMIN_TOKEN || '';
  return t.length >= MIN_ADMIN_TOKEN ? t : '';
}

export const MIN_RTDN_SECRET = 16;
export function rtdnSecret(): string {
  const t = process.env.PLAY_RTDN_SECRET || '';
  return t.length >= MIN_RTDN_SECRET ? t : '';
}

/** Points given to a new account. They are worth money once real payments are on, so default to 0 then. */
export function welcomePoints(): number {
  const v = Number(process.env.WELCOME_POINTS);
  if (process.env.WELCOME_POINTS !== undefined && Number.isFinite(v) && v >= 0) return Math.floor(v);
  return demoPayments() ? 500 : 0;
}

/** Origins allowed to call the API from a browser. Native apps are not subject to CORS. */
export function corsOrigins(): string[] {
  return (process.env.CORS_ORIGIN || '').split(',').map((s) => s.trim()).filter(Boolean);
}

/** Things worth fixing before real users arrive. Printed at startup. */
export function securityWarnings(o: { play: boolean; mail: boolean; encrypted: boolean }): string[] {
  const w: string[] = [];
  const prod = isProd();
  if (!prod) w.push('NODE_ENV is not "production": demo payments default to ON and any website may call the API (CORS).');
  if (demoPayments()) w.push('Demo payments are ON: plans and courses can be obtained without paying. Set DEMO_PAYMENTS=false.');
  if (process.env.ADMIN_TOKEN && !adminToken()) w.push(`ADMIN_TOKEN is shorter than ${MIN_ADMIN_TOKEN} characters and is being ignored. Use: openssl rand -base64 32`);
  if (process.env.PLAY_RTDN_SECRET && !rtdnSecret()) w.push(`PLAY_RTDN_SECRET is shorter than ${MIN_RTDN_SECRET} characters and is being ignored.`);
  if (!o.encrypted) w.push('The data file is not encrypted at rest. Set DATA_ENCRYPTION_KEY (openssl rand -base64 32).');
  if (!o.mail) w.push('SMTP_URL is not set: password reset e-mails cannot be sent.');
  if (prod && !process.env.TRUST_PROXY) w.push('TRUST_PROXY is not set: behind a reverse proxy, rate limits and HTTPS detection will not see the real client.');
  if (prod && !o.play) w.push('Google Play is not configured: purchases cannot be verified.');
  return w;
}
