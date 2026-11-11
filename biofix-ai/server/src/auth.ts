// Account security primitives: password hashing, session tokens, reset codes, rate limiting.
import { createHash, randomBytes, randomInt, scrypt as scryptCb, timingSafeEqual, type ScryptOptions } from 'node:crypto';

const scrypt = (password: string, salt: Buffer, keylen: number, opts: ScryptOptions) =>
  new Promise<Buffer>((resolve, reject) => scryptCb(password, salt, keylen, opts, (e, key) => (e ? reject(e) : resolve(key))));

// scrypt cost: N=2^15, r=8, p=1 (~32 MB, tens of ms). Stored in the hash so it can be raised later.
const N = 32768;
const R = 8;
const P = 1;
const KEYLEN = 32;
const MAXMEM = 128 * N * R * 2;

export const MIN_PASSWORD = 8;
export const MAX_PASSWORD = 200;

export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16);
  const key = await scrypt(password, salt, KEYLEN, { N, r: R, p: P, maxmem: MAXMEM });
  return `scrypt$${N}$${R}$${P}$${salt.toString('base64')}$${key.toString('base64')}`;
}

export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  const [alg, n, r, p, saltB64, keyB64] = stored.split('$');
  if (alg !== 'scrypt' || !saltB64 || !keyB64) return false;
  const expected = Buffer.from(keyB64, 'base64');
  const cost = { N: Number(n), r: Number(r), p: Number(p) };
  const key = await scrypt(password, Buffer.from(saltB64, 'base64'), expected.length, { ...cost, maxmem: 128 * cost.N * cost.r * 2 });
  return key.length === expected.length && timingSafeEqual(key, expected);
}

/** A hash to verify against when the e-mail is unknown, so both paths take the same time. */
let dummy: Promise<string> | null = null;
export const dummyHash = () => (dummy ??= hashPassword(randomBytes(16).toString('hex')));

export const sha256 = (s: string) => createHash('sha256').update(s).digest('hex');

// The passwords attackers try first. Not a breach database, just the obvious ones (8+ characters).
const COMMON = new Set(`password password1 password12 password123 passw0rd p@ssw0rd p@ssword 12345678 123456789 1234567890
01234567 012345678 0123456789 87654321 987654321 11111111 111111111 1111111111 00000000 000000000 12341234 11223344
1q2w3e4r 1q2w3e4r5t 1qaz2wsx qwertyui qwertyuiop qwerty12 qwerty123 qwerty1234 asdfghjk asdfghjkl zxcvbnm1 q1w2e3r4
abc12345 abcd1234 abcdefgh a1b2c3d4 aa123456 iloveyou iloveyou1 sunshine princess football baseball superman
trustno1 welcome1 welcome123 letmein1 letmein123 admin123 admin1234 administrator changeme changeme1 master123
dragon123 monkey123 michael1 computer internet whatever starwars 1234abcd 123123123 147258369 789456123
sifre123 sifre1234 parola123 şifre123 123456aa 123456ab galatasaray fenerbahce besiktas trabzonspor istanbul34
biofix123 biofixai biomedikal`.split(/\s+/));

/** True when a password is too short or too guessable to accept. */
export function weakPassword(password: string, email = '', name = ''): boolean {
  if (password.length < MIN_PASSWORD) return true;
  const p = password.toLowerCase();
  if (COMMON.has(p)) return true;
  if (/^(.)\1+$/.test(p)) return true; // one character repeated
  const local = email.split('@')[0];
  if (email && (p === email || (local.length >= 4 && p === local))) return true;
  if (name && p === name.trim().toLowerCase()) return true;
  return false;
}

/** Opaque session token; only its SHA-256 is stored. */
export const newSessionToken = () => randomBytes(32).toString('base64url');

export const SESSION_TTL_MS = 90 * 24 * 60 * 60 * 1000; // sliding: 90 days since last use
export const MAX_SESSIONS_PER_USER = 10;

export const newResetCode = () => String(randomInt(0, 1_000_000)).padStart(6, '0');
export const RESET_TTL_MS = 15 * 60 * 1000;
export const RESET_MAX_ATTEMPTS = 5;
export const resetHash = (email: string, code: string) => sha256(`${email}:${code}`);

export const normalizeEmail = (s: string) => String(s).trim().toLowerCase();
export const validEmail = (s: string) => s.length <= 254 && /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(s);

/** Fixed-window in-memory limiter. Enough for one server process; use Redis if you scale out. */
export class RateLimiter {
  private hits = new Map<string, { n: number; resetAt: number }>();

  /** Returns false when `key` has exceeded `max` within the window. */
  take(key: string, max: number, windowMs: number): boolean {
    const now = Date.now();
    const h = this.hits.get(key);
    if (!h || h.resetAt <= now) {
      if (this.hits.size > 50_000) this.sweep(now);
      this.hits.set(key, { n: 1, resetAt: now + windowMs });
      return true;
    }
    h.n++;
    return h.n <= max;
  }

  /** True when `key` has already used up `max` in the current window (does not count as a hit). */
  exhausted(key: string, max: number): boolean {
    const h = this.hits.get(key);
    return !!h && h.resetAt > Date.now() && h.n >= max;
  }

  reset(key: string) { this.hits.delete(key); }

  private sweep(now: number) {
    for (const [k, v] of this.hits) if (v.resetAt <= now) this.hits.delete(k);
  }
}
