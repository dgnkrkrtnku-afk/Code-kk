import express, { type NextFunction, type Request, type Response } from 'express';
import { timingSafeEqual } from 'node:crypto';
import { PDFArray, PDFDict, PDFDocument, PDFName, PDFStream, type PDFPage } from 'pdf-lib';
import { PDFParse } from 'pdf-parse';
import { z } from 'zod';
import * as ai from './ai.js';
import {
  dummyHash, hashPassword, MAX_PASSWORD, newResetCode, newSessionToken, normalizeEmail, RateLimiter,
  RESET_MAX_ATTEMPTS, RESET_TTL_MS, resetHash, SESSION_TTL_MS, sha256, UNVERIFIED_HOLD_MS, validEmail, VERIFY_MAX_ATTEMPTS,
  VERIFY_TTL_MS, verifyPassword, weakPassword,
} from './auth.js';
import { Billing, PLAY_BASE_PLANS, PLAY_SUBSCRIPTIONS, POINT_PACKS, type PlayNotification } from './billing.js';
import { adminToken, demoPayments, rtdnSecret } from './config.js';
import { bad, forbidden, HttpError, notFound } from './errors.js';
import { chunkText, devOf, NEED_OK, prefixMatchCount, sameDevice, solStatus, splitLessons } from './kb.js';
import type { Mailer } from './mailer.js';
import { isPlan, PLANS, planForClient, planPrice, PT, PT_PER_USD, ptsFor } from './plans.js';
import type { PlayClient } from './play.js';
import { COUNTRIES } from './seed.js';
import { todayKey, uid, type Store } from './store.js';
import type { Chunk, Course, Diagnosis, Doc, HistoryItem, Lang, Listing, Solution, User } from './types.js';

/* ------------------------------------------------------------------ helpers */

interface Ctx { user: User; lang: Lang; isAdmin: boolean; sessionKey: string }
type Req = Request & { ctx: Ctx };

export type AiService = Pick<typeof ai,
  'aiConfigured' | 'diagnose' | 'followUp' | 'precheck' | 'identifyDevice' | 'transcribePage' | 'transcribePdf' | 'indexSections'>;

/** Things the router talks to outside this process; tests pass fakes. */
export interface Deps { mailer: Mailer; play: PlayClient | null; ai?: AiService }

const ImageZ = z.object({
  data: z.string().min(16).max(12_000_000).regex(/^[A-Za-z0-9+/]+={0,2}$/),
  mediaType: z.enum(['image/jpeg', 'image/png', 'image/webp']),
});
type Image = z.infer<typeof ImageZ>;

/** Reject uploads that are not really the image type they claim to be (checks the file signature). */
function checkImage(img: Image | null | undefined): Image | null {
  if (!img) return null;
  const head = Buffer.from(img.data.slice(0, 24), 'base64');
  const ok = img.mediaType === 'image/jpeg' ? head.subarray(0, 3).equals(Buffer.from([0xff, 0xd8, 0xff]))
    : img.mediaType === 'image/png' ? head.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))
      : head.subarray(0, 4).toString('latin1') === 'RIFF' && head.subarray(8, 12).toString('latin1') === 'WEBP';
  if (!ok) throw bad('not_image');
  return img;
}

const B64 = /^[A-Za-z0-9+/]+={0,2}$/;
/** A file attached to a fault report: a PDF or a plain-text file such as an error log. */
const FileZ = z.object({
  name: z.string().trim().min(1).max(200),
  mediaType: z.enum(['application/pdf', 'text/plain']),
  data: z.string().min(4).max(11_000_000).regex(B64),
});
/** Longest PDF a technician may attach to one question (every page is read by the AI and costs tokens). */
const MAX_ATTACH_PAGES = Number(process.env.MAX_ATTACH_PAGES) || 30;

/** Check that an attachment really is what it claims to be and is small enough to read. */
async function checkFile(f: z.infer<typeof FileZ> | null | undefined): Promise<ai.Attachment | null> {
  if (!f) return null;
  const bytes = Buffer.from(f.data, 'base64');
  const name = f.name.replace(/[\u0000-\u001f<>"]/g, ' ').slice(0, 120);
  if (f.mediaType === 'application/pdf') {
    if (!bytes.subarray(0, 1024).includes('%PDF-')) throw bad('file_unreadable');
    let pages = 0;
    try {
      const pdf = await PDFDocument.load(bytes, { ignoreEncryption: true });
      if (pdf.isEncrypted) throw new Error('encrypted');
      pages = pdf.getPageCount();
    } catch {
      throw bad('file_unreadable');
    }
    if (pages < 1) throw bad('file_unreadable');
    if (pages > MAX_ATTACH_PAGES) throw bad('file_too_long');
    return { kind: 'pdf', name, data: f.data };
  }
  const text = bytes.toString('utf8').replace(/\u0000/g, '');
  if (!text.trim()) throw bad('file_unreadable');
  if (text.length > 200_000) throw bad('file_too_long');
  return { kind: 'text', name, text };
}

/** The error code to show for anything thrown while a response is already streaming. */
function codeOf(e: unknown): string {
  if (e instanceof HttpError) return e.code;
  if (e instanceof ai.AiError) return e.code;
  return 'generic';
}

/**
 * Start a streamed answer: one JSON object per line, written as soon as it is known.
 * The client shows each line when it arrives instead of waiting for the whole answer.
 */
function ndjson(res: Response) {
  res.status(200);
  res.setHeader('Content-Type', 'application/x-ndjson; charset=utf-8');
  res.setHeader('X-Accel-Buffering', 'no'); // nginx: pass each line through instead of buffering
  res.flushHeaders();
  // Keeps mobile networks and proxies from closing the connection while the model is thinking.
  const ping = setInterval(() => { if (!res.writableEnded && !res.destroyed) res.write('{"type":"ping"}\n'); }, 15_000);
  return {
    send(o: unknown) { if (!res.writableEnded && !res.destroyed) res.write(JSON.stringify(o) + '\n'); },
    end() { clearInterval(ping); if (!res.writableEnded) res.end(); },
  };
}
const wantsStream = (req: Request) => (req.header('accept') || '').includes('application/x-ndjson');

/** Display names appear next to other people's content: no control characters or markup. */
const NameZ = z.string().trim().min(2).max(40).regex(/^[^\u0000-\u001f\u007f<>]*$/);

/** Security-relevant events as one JSON line each, without personal data (user ids, never e-mails). */
function audit(event: string, fields: Record<string, unknown> = {}) {
  if (process.env.AUDIT_LOG === 'off') return;
  console.log(JSON.stringify({ t: new Date().toISOString(), audit: event, ...fields }));
}

/** Larger request bodies are only accepted on the few routes that need them, and only after sign-in. */
const body = (limit: string) => express.json({ limit });

function parse<S extends z.ZodType>(schema: S, body: unknown): z.infer<S> {
  const r = schema.safeParse(body);
  if (!r.success) throw bad('invalid_input');
  return r.data;
}

const wrap = (fn: (req: Req, res: Response) => unknown) =>
  (req: Request, res: Response, next: NextFunction) => {
    Promise.resolve().then(() => fn(req as Req, res)).catch(next);
  };

const DEMO = demoPayments;
const MIN = 60 * 1000;
const HOUR = 60 * MIN;
const DAY = 24 * HOUR;

/** Constant-time comparison for secrets. */
const safeEq = (a: string, b: string) => timingSafeEqual(Buffer.from(sha256(a)), Buffer.from(sha256(b)));

/* ------------------------------------------------------------------ router */

export function createRouter(store: Store, deps: Deps) {
  const r = express.Router();
  const db = () => store.db;
  const billing = new Billing(store, deps.play);
  const limiter = new RateLimiter();
  const AI: AiService = deps.ai ?? ai;

  const langOf = (req: Request): Lang => (req.header('x-lang') === 'en' ? 'en' : 'tr');
  const ipOf = (req: Request) => req.ip || 'unknown';
  const limit = (key: string, max: number, windowMs: number, code = 'too_many_attempts') => {
    if (!limiter.take(key, max, windowMs)) throw new HttpError(429, code);
  };
  const adminOf = (req: Request) => {
    const token = adminToken();
    const given = req.header('x-admin-token');
    if (!token || !given) return false;
    // Guessing the developer key: after 20 wrong tries an address is locked out of it for an hour.
    const key = `admin-fail:${ipOf(req)}`;
    if (limiter.exhausted(key, 20)) return false;
    if (safeEq(given, token)) return true;
    if (limiter.take(key, 20, HOUR) && limiter.exhausted(key, 20)) audit('admin_key_lockout', { ip: ipOf(req) });
    return false;
  };

  // Crude flood guard per address. Real DDoS protection belongs in front of the server (CDN / WAF).
  r.use((req, _res, next) => {
    limit(`ip:${ipOf(req)}`, 6000, 5 * MIN, 'slow_down');
    next();
  });

  const displayName = (c: Ctx) => c.user.name || (c.lang === 'tr' ? 'Kullanıcı' : 'User');

  /* ---------- views */

  const solView = (s: Solution, c: Ctx) => ({
    id: s.id, by: s.by, brand: s.brand, model: s.model, symptom: s.symptom, code: s.code, steps: s.steps, part: s.part,
    photo: s.photo, photoNote: s.photoNote, ok: s.ok, fail: s.fail, ai: s.ai, date: s.date,
    status: solStatus(s), mine: s.userId === c.user.id, myVote: s.votes[c.user.id] ?? null,
    canDelete: s.userId === c.user.id || c.isAdmin, checking: pendingChecks.has(s.id),
    // Flagged as a safety risk by the AI pre-check: stays unverified until a developer clears it.
    flagged: !!s.ai?.safe, canReview: c.isAdmin && !!s.ai?.safe,
  });

  const historyView = (x: HistoryItem, c: Ctx) => ({
    ...x, sols: x.solIds.map((id) => db().sols.find((s) => s.id === id)).filter((s): s is Solution => !!s).map((s) => solView(s, c)),
  });

  const hasCourse = (co: Course, c: Ctx) => co.ownerId === c.user.id || c.user.owned.includes(co.id);
  const courseView = (co: Course, c: Ctx, full: boolean) => {
    const own = hasCourse(co, c);
    return {
      id: co.id, title: co.title, by: co.by, cat: co.cat, level: co.level, hours: co.hours, usd: co.usd, rating: co.rating, n: co.n, desc: co.desc,
      lessonCount: co.lessons.length, mine: co.ownerId === c.user.id, owned: own, canDelete: co.ownerId === c.user.id || c.isAdmin,
      lessons: full ? co.lessons.map((l, i) => ({ t: l.t, c: own || i === 0 ? l.c : null })) : undefined,
      sales: co.ownerId === c.user.id ? db().sales.filter((s) => s.courseId === co.id).length : undefined,
    };
  };

  const pKey = (l: Pick<Listing, 'brand' | 'model'>) => `${l.brand}|${l.model}`.toLocaleLowerCase('tr');
  const agg = (l: Listing) => {
    const rs = db().reviews.filter((x) => x.key === pKey(l));
    if (!rs.length) return null;
    const av = (k: 'stars' | 'rel' | 'svc' | 'use' | 'val') => rs.reduce((a, x) => a + x[k], 0) / rs.length;
    return {
      n: rs.length, stars: av('stars'), rel: av('rel'), svc: av('svc'), use: av('use'), val: av('val'),
      again: Math.round((rs.filter((x) => x.again).length / rs.length) * 100),
    };
  };
  const listingView = (l: Listing, c: Ctx) => {
    const a = agg(l);
    return { ...l, ownerId: undefined, mine: l.ownerId === c.user.id, rating: a ? { stars: a.stars, n: a.n } : null };
  };

  const meView = (c: Ctx) => {
    const u = c.user;
    return {
      user: {
        id: u.id, email: u.email, emailVerified: !!u.emailVerified, name: u.name, plan: u.plan, planUntil: u.planUntil, billing: u.billing,
        // The purchase token stays on the server; the app only needs to know a Play subscription exists.
        sub: u.sub ? { productId: u.sub.productId, expiresAt: u.sub.expiresAt, autoRenew: u.sub.autoRenew } : null,
        points: u.points, ledger: u.ledger.slice(0, 20), usedToday: store.usedToday(u), quotes: u.quotes, owned: u.owned,
      },
      plan: planForClient(u.plan),
      plans: Object.fromEntries(Object.keys(PLANS).map((k) => [k, planForClient(k as keyof typeof PLANS)])),
      pt: PT, ptPerUsd: PT_PER_USD, needOk: NEED_OK, fee: db().fee,
      ai: AI.aiConfigured(), isAdmin: c.isAdmin, demoPayments: DEMO(),
      billing: {
        google: billing.enabled, packageName: billing.packageName,
        subs: PLAY_SUBSCRIPTIONS, basePlans: PLAY_BASE_PLANS, packs: POINT_PACKS,
      },
    };
  };

  /* ---------- background AI pre-check of taught solutions */

  const pendingChecks = new Set<string>();
  function runPrecheck(s: Solution, photo: z.infer<typeof ImageZ> | null, lang: Lang) {
    if (!AI.aiConfigured()) return;
    pendingChecks.add(s.id);
    const hits = store.index.search(`${devOf(s)} ${s.symptom} ${s.steps}`, devOf(s), 5, 'doc');
    AI.precheck(s, hits, photo, lang)
      .then(({ ai: check, photoNote }) => {
        s.ai = check;
        if (photoNote) s.photoNote = photoNote;
        store.reindex();
        store.save();
      })
      .catch((e) => console.warn('precheck failed', s.id, e instanceof Error ? e.message : e))
      .finally(() => pendingChecks.delete(s.id));
  }

  function checkReward(s: Solution) {
    if (!s.userId || s.rewarded || solStatus(s) !== 'ver') return;
    const owner = db().users[s.userId];
    if (!owner) return;
    // Over today's limit the reward is not lost: it is paid the next time someone confirms the solution.
    if (store.reward(owner, 'verified')) s.rewarded = true;
  }

  /* ================================================================ public: health, sign-in */

  r.get('/health', (_req, res) => {
    res.json({ ok: true }); // no configuration details for anonymous callers
  });

  /** Start a session for `u` and return the token together with the profile. */
  function signIn(req: Request, u: User) {
    const token = newSessionToken();
    const key = sha256(token);
    store.addSession(key, u.id);
    return { token, me: meView({ user: u, lang: langOf(req), isAdmin: adminOf(req), sessionKey: key }) };
  }

  /** An address is taken by a verified account, or by a registration still inside its verification window. */
  function addressTaken(email: string): boolean {
    const u = store.findByEmail(email);
    return !!u && (!!u.emailVerified || Date.now() - Date.parse(u.createdAt) < UNVERIFIED_HOLD_MS);
  }

  /** E-mail a fresh verification code (replacing any earlier one). Returns false when the hourly limit is used up. */
  function sendVerification(u: User, lang: Lang): boolean {
    if (!deps.mailer.enabled || !limiter.take(`verify-send:${u.id}`, 5, HOUR)) return false;
    const code = newResetCode();
    db().verifyCodes[u.id] = { codeHash: resetHash(u.email, code), expiresAt: Date.now() + VERIFY_TTL_MS, attempts: 0 };
    store.save();
    deps.mailer.sendVerifyCode(u.email, code, lang)
      .catch((e) => console.error('verification e-mail failed:', e instanceof Error ? e.message : e));
    return true;
  }

  r.post('/auth/register', wrap(async (req, res) => {
    limit(`register:${ipOf(req)}`, 30, HOUR); // per IP; hospitals often share one address
    const b = parse(z.object({ email: z.string().max(254), password: z.string().max(MAX_PASSWORD), name: NameZ }), req.body);
    const email = normalizeEmail(b.email);
    if (!validEmail(email)) throw bad('invalid_email');
    if (weakPassword(b.password, email, b.name)) throw bad('weak_password');
    // Every new account must prove its address, so there is no point creating one we cannot e-mail.
    if (!deps.mailer.enabled) throw new HttpError(503, 'mail_not_configured');
    if (addressTaken(email)) throw new HttpError(409, 'email_taken');
    const passHash = await hashPassword(b.password);
    if (addressTaken(email)) throw new HttpError(409, 'email_taken'); // registered while we were hashing
    // An older registration that never proved the address gives way to this one.
    const stale = store.findByEmail(email);
    if (stale) store.deleteUser(stale.id);
    const u = store.createUser(email, passHash, b.name);
    audit('register', { user: u.id });
    sendVerification(u, langOf(req));
    res.status(201).json(signIn(req, u));
  }));

  r.post('/auth/login', wrap(async (req, res) => {
    const b = parse(z.object({ email: z.string().max(254), password: z.string().max(MAX_PASSWORD) }), req.body);
    const email = normalizeEmail(b.email);
    limit(`login-ip:${ipOf(req)}`, 300, 15 * MIN);
    limit(`login:${ipOf(req)}:${email}`, 10, 15 * MIN);
    limit(`login-email:${email}`, 100, 15 * MIN);
    const u = store.findByEmail(email);
    // Always run the hash so a missing account and a wrong password take the same time.
    const ok = await verifyPassword(b.password, u ? u.passHash : await dummyHash());
    if (!u || !ok) {
      audit('login_failed', { ip: ipOf(req), user: u?.id ?? null });
      throw new HttpError(401, 'bad_credentials');
    }
    limiter.reset(`login:${ipOf(req)}:${email}`);
    audit('login', { user: u.id });
    // Signing in to an account that is still unverified: make sure a usable code is on its way.
    const vc = db().verifyCodes[u.id];
    if (!u.emailVerified && (!vc || vc.expiresAt < Date.now() || vc.attempts >= VERIFY_MAX_ATTEMPTS)) sendVerification(u, langOf(req));
    res.json(signIn(req, u));
  }));

  r.post('/auth/forgot', wrap((req, res) => {
    const b = parse(z.object({ email: z.string().max(254) }), req.body);
    const email = normalizeEmail(b.email);
    limit(`forgot-ip:${ipOf(req)}`, 10, HOUR);
    const u = store.findByEmail(email);
    if (u && limiter.take(`forgot:${email}`, 3, HOUR)) {
      const code = newResetCode();
      db().resetCodes[email] = { codeHash: resetHash(email, code), expiresAt: Date.now() + RESET_TTL_MS, attempts: 0 };
      store.save();
      deps.mailer.sendResetCode(email, code, langOf(req))
        .catch((e) => console.error('reset e-mail failed:', e instanceof Error ? e.message : e));
    }
    // Same answer whether or not the address has an account.
    res.json({ ok: true });
  }));

  r.post('/auth/reset', wrap(async (req, res) => {
    const b = parse(z.object({
      email: z.string().max(254), code: z.string().trim().regex(/^\d{6}$/), password: z.string().max(MAX_PASSWORD),
    }), req.body);
    const email = normalizeEmail(b.email);
    limit(`reset-ip:${ipOf(req)}`, 30, HOUR);
    const rc = db().resetCodes[email];
    const u = store.findByEmail(email);
    if (weakPassword(b.password, email, u?.name)) throw bad('weak_password');
    if (!rc || !u || rc.expiresAt < Date.now() || rc.attempts >= RESET_MAX_ATTEMPTS) throw bad('bad_code');
    rc.attempts++;
    store.save();
    if (!safeEq(rc.codeHash, resetHash(email, b.code))) throw bad('bad_code');
    delete db().resetCodes[email];
    u.passHash = await hashPassword(b.password);
    // The code arrived in this mailbox, which is exactly what address verification proves.
    u.emailVerified = true;
    delete db().verifyCodes[u.id];
    store.dropSessions(u.id); // sign out everywhere
    audit('password_reset', { user: u.id });
    res.json(signIn(req, u));
  }));

  // Google Play real-time developer notifications (Pub/Sub push). Authenticated by a secret in the URL.
  r.post('/billing/rtdn', wrap(async (req, res) => {
    const secret = rtdnSecret();
    const given = typeof req.query.token === 'string' ? req.query.token : '';
    if (!secret || !given || !safeEq(given, secret)) throw forbidden();
    const data = (req.body as { message?: { data?: unknown } } | undefined)?.message?.data;
    if (typeof data === 'string') {
      let n: PlayNotification | null = null;
      try { n = JSON.parse(Buffer.from(data, 'base64').toString('utf8')) as PlayNotification; } catch { /* not ours */ }
      if (n) await billing.handleNotification(n);
    }
    res.status(204).end();
  }));

  /* ================================================================ everything below needs a session */

  r.use(async (req, _res, next) => {
    const m = /^Bearer (\S+)$/.exec(req.header('authorization') || '');
    const key = m ? sha256(m[1]) : '';
    const sess = key ? db().sessions[key] : undefined;
    const now = Date.now();
    const user = sess ? db().users[sess.userId] : undefined;
    if (!sess || !user || now - sess.lastSeen > SESSION_TTL_MS) {
      if (sess) { delete db().sessions[key]; store.save(); }
      throw new HttpError(401, 'no_session');
    }
    if (now - sess.lastSeen > HOUR) { sess.lastSeen = now; store.save(); }
    // Per-account ceilings, far above what the app itself ever sends.
    limit(`user:${user.id}`, 900, 5 * MIN, 'slow_down');
    if (req.method !== 'GET') limit(`write:${user.id}`, 240, 10 * MIN, 'slow_down');
    billing.lapse(user, now);
    await billing.refresh(user, false, now);
    (req as Req).ctx = { user, lang: langOf(req), isAdmin: adminOf(req), sessionKey: key };
    next();
  });

  // Until the address is verified an account can only verify itself, sign out or delete itself.
  const OPEN_TO_UNVERIFIED = new Set(['/me', '/me/delete', '/auth/verify', '/auth/resend', '/auth/logout', '/auth/logout-all']);
  r.use((req, _res, next) => {
    if (!(req as Req).ctx.user.emailVerified && !OPEN_TO_UNVERIFIED.has(req.path)) throw new HttpError(403, 'email_unverified');
    next();
  });

  // Developer panel: checked here, before any large request body is read.
  r.use('/admin', (req, _res, next) => {
    if (!(req as Req).ctx.isAdmin) throw forbidden('admin_only');
    next();
  });

  /* ================================================================ account */

  r.post('/auth/logout', wrap((req, res) => {
    delete db().sessions[req.ctx.sessionKey];
    store.save();
    res.json({ ok: true });
  }));

  r.post('/auth/verify', wrap((req, res) => {
    const u = req.ctx.user;
    if (!u.emailVerified) {
      limit(`verify:${u.id}`, 30, HOUR);
      const { code } = parse(z.object({ code: z.string().trim().regex(/^\d{6}$/) }), req.body);
      const vc = db().verifyCodes[u.id];
      if (!vc || vc.expiresAt < Date.now() || vc.attempts >= VERIFY_MAX_ATTEMPTS) throw bad('bad_code');
      vc.attempts++;
      store.save();
      if (!safeEq(vc.codeHash, resetHash(u.email, code))) throw bad('bad_code');
      delete db().verifyCodes[u.id];
      u.emailVerified = true;
      store.save();
      audit('email_verified', { user: u.id });
    }
    res.json(meView(req.ctx));
  }));

  r.post('/auth/resend', wrap((req, res) => {
    const u = req.ctx.user;
    if (!u.emailVerified) {
      if (!deps.mailer.enabled) throw new HttpError(503, 'mail_not_configured');
      limit(`verify-send-ip:${ipOf(req)}`, 30, HOUR);
      if (!sendVerification(u, req.ctx.lang)) throw new HttpError(429, 'too_many_attempts');
    }
    res.json({ ok: true });
  }));

  r.post('/auth/logout-all', wrap((req, res) => {
    store.dropSessions(req.ctx.user.id);
    audit('logout_all', { user: req.ctx.user.id });
    res.json({ ok: true });
  }));

  r.get('/me', wrap((req, res) => { res.json(meView(req.ctx)); }));

  r.patch('/me', wrap((req, res) => {
    const b = parse(z.object({
      billing: z.enum(['month', 'year']).optional(), name: NameZ.optional(),
    }), req.body);
    if (b.billing) req.ctx.user.billing = b.billing;
    if (b.name) req.ctx.user.name = b.name;
    store.save();
    res.json(meView(req.ctx));
  }));

  r.post('/me/password', wrap(async (req, res) => {
    const u = req.ctx.user;
    limit(`password:${u.id}`, 10, 15 * MIN);
    const b = parse(z.object({ current: z.string().max(MAX_PASSWORD), next: z.string().max(MAX_PASSWORD) }), req.body);
    if (weakPassword(b.next, u.email, u.name)) throw bad('weak_password');
    if (!(await verifyPassword(b.current, u.passHash))) throw new HttpError(403, 'bad_credentials');
    u.passHash = await hashPassword(b.next);
    store.dropSessions(u.id, req.ctx.sessionKey); // other devices are signed out
    audit('password_changed', { user: u.id });
    res.json({ ok: true });
  }));

  r.post('/me/delete', wrap(async (req, res) => {
    const u = req.ctx.user;
    limit(`password:${u.id}`, 10, 15 * MIN);
    const b = parse(z.object({ password: z.string().max(MAX_PASSWORD) }), req.body);
    if (!(await verifyPassword(b.password, u.passHash))) throw new HttpError(403, 'bad_credentials');
    store.deleteUser(u.id);
    audit('account_deleted', { user: u.id });
    res.json({ ok: true });
  }));

  r.post('/me/plan', wrap((req, res) => {
    const b = parse(z.object({ plan: z.string(), how: z.enum(['card', 'pts']) }), req.body);
    if (!isPlan(b.plan)) throw bad('invalid_plan');
    const u = req.ctx.user;
    // A Play subscription is changed or cancelled in Google Play, not here.
    if (u.sub) throw new HttpError(409, 'manage_in_play');
    if (b.plan === 'free') {
      u.plan = 'free';
      u.planUntil = null;
    } else {
      if (b.how === 'pts') {
        const pp = ptsFor(planPrice(b.plan, u.billing));
        if (u.points < pp) throw bad('not_enough_points');
        store.award(u, -pp, 'pt_spend');
      } else if (!DEMO()) {
        throw bad('use_play'); // real card payments go through /billing/google/subscription
      }
      // Buying the plan you already have extends it; a different plan starts now.
      const now = Date.now();
      const from = u.plan === b.plan && u.planUntil && Date.parse(u.planUntil) > now ? Date.parse(u.planUntil) : now;
      const until = new Date(from);
      if (u.billing === 'year') until.setUTCFullYear(until.getUTCFullYear() + 1);
      else until.setUTCMonth(until.getUTCMonth() + 1);
      u.plan = b.plan;
      u.planUntil = until.toISOString();
    }
    store.save();
    res.json(meView(req.ctx));
  }));

  /* ================================================================ payments */

  const PurchaseZ = z.object({ productId: z.string().min(1).max(100), purchaseToken: z.string().min(10).max(4000) });

  r.post('/billing/google/subscription', wrap(async (req, res) => {
    const b = parse(PurchaseZ, req.body);
    await billing.activateSubscription(req.ctx.user, b.productId, b.purchaseToken);
    audit('subscription_verified', { user: req.ctx.user.id, product: b.productId });
    res.json({ me: meView(req.ctx) });
  }));

  r.post('/billing/google/points', wrap(async (req, res) => {
    const b = parse(PurchaseZ, req.body);
    const credited = await billing.creditPoints(req.ctx.user, b.productId, b.purchaseToken);
    if (credited) audit('points_purchased', { user: req.ctx.user.id, product: b.productId, points: credited });
    res.json({ credited, me: meView(req.ctx) });
  }));

  // Demo only: top up points without Google Play (Expo Go, web, local testing).
  r.post('/billing/demo/points', wrap((req, res) => {
    if (!DEMO()) throw forbidden();
    const { productId } = parse(z.object({ productId: z.string() }), req.body);
    const pack = POINT_PACKS.find((p) => p.productId === productId);
    if (!pack) throw bad('unknown_product');
    store.award(req.ctx.user, pack.points, 'pt_buy');
    store.save();
    res.json({ credited: pack.points, me: meView(req.ctx) });
  }));

  /* ================================================================ assistant */

  const deviceList = () => [...new Set(db().docs.map(devOf).concat(db().sols.map(devOf)).filter(Boolean))].sort();

  r.get('/devices', wrap((_req, res) => {
    res.json({ devices: deviceList() });
  }));

  // One tap away under the device selector: faults others already solved on this device, and its error codes.
  r.get('/quick', wrap((req, res) => {
    const dev = String(req.query.dev || '').slice(0, 200);
    if (!dev) { res.json({ faults: [], codes: [] }); return; }
    const faults = db().sols
      .filter((x) => sameDevice(devOf(x), dev) && solStatus(x) !== 'rej' && !x.ai?.safe)
      .sort((x, y) => Number(solStatus(y) === 'ver') - Number(solStatus(x) === 'ver') || y.ok - x.ok)
      .slice(0, 6)
      .map((x) => ({ id: x.id, symptom: x.symptom, code: x.code, status: solStatus(x) }));
    res.json({ faults, codes: store.index.codesOf(dev, 30).map((e) => ({ code: e.code, text: e.text })) });
  }));

  // Read the make and model from a photo of the device label, so the technician doesn't have to type or pick it.
  r.post('/identify-device', body('16mb'), wrap(async (req, res) => {
    const { image } = parse(z.object({ image: ImageZ }), req.body);
    const img = checkImage(image)!;
    limit(`ai-label:${req.ctx.user.id}`, 20, DAY, 'slow_down');
    const found = await AI.identifyDevice(img, deviceList());
    res.json({ ...found, label: `${found.brand} ${found.model}`.trim() });
  }));

  r.post('/diagnose', body('24mb'), wrap(async (req, res) => {
    const c = req.ctx;
    const b = parse(z.object({
      q: z.string().max(4000).default(''), dev: z.string().max(200).default(''),
      images: z.array(ImageZ).max(4).default([]),
      image: ImageZ.nullable().optional(), // a single photo, as older app versions send it
      file: FileZ.nullable().optional(),
    }), req.body);
    const q = b.q.trim();
    const images = [...b.images, ...(b.image ? [b.image] : [])].slice(0, 4).map((im) => checkImage(im)!);
    const file = await checkFile(b.file);
    if (!q && !images.length && !file) throw bad('need_input');

    // Step 1 — instant, no AI: what the manuals and other technicians already say about this.
    const qq = `${q} ${b.dev}`;
    const hits = store.index.search(qq, b.dev, 8, 'doc');
    // Never suggest a fix that failed for others or that the AI pre-check flagged as dangerous.
    const sols = store.index.search(qq, b.dev, 8, 'sol')
      .filter((e) => solStatus(e.sol) !== 'rej' && !e.sol.ai?.safe)
      .slice(0, 4);
    const codes = store.index.lookupCodes(q, b.dev);
    const srcs = hits.map((e) => ({ title: e.doc.title, h: e.doc.chunks[e.ci].h, t: e.doc.chunks[e.ci].t }));
    const quick = {
      codes: codes.map((e) => ({ code: e.code, text: e.text, device: e.device, title: e.title })),
      sols: sols.map((e) => solView(e.sol, c)),
      docs: srcs.slice(0, 4),
    };
    const streaming = wantsStream(req);

    if (!AI.aiConfigured()) {
      // No AI key on the server: the instant results are the answer.
      if (!streaming) { res.json({ quick, item: null }); return; }
      const out = ndjson(res);
      out.send({ type: 'quick', quick });
      out.send({ type: 'done', item: null });
      out.end();
      return;
    }

    const plan = PLANS[c.user.plan];
    if (store.usedToday(c.user) >= plan.quota) throw new HttpError(402, 'quota');
    if ((images.length || file) && !plan.photo) throw new HttpError(402, 'photo_plan');
    // "Unlimited" plans still have a ceiling, so a stolen or scripted account can't run up the AI bill.
    limit(`ai:${c.user.id}`, 40, 10 * MIN, 'slow_down');
    limit(`ai-day:${c.user.id}`, 300, DAY, 'slow_down');

    // Count the request before the (slow) AI call so parallel requests can't slip past the daily quota.
    c.user.usage.n = store.usedToday(c.user) + 1;
    const refund = () => { c.user.usage.n = Math.max(0, store.usedToday(c.user) - 1); }; // failed calls don't use up the quota
    const input: ai.DiagnoseInput = { q, dev: b.dev, hits, sols, codes, images, file, lang: c.lang };
    const record = (result: Diagnosis) => {
      const used = result.community.map((n) => sols[n - 1]).filter(Boolean).map((e) => e.sol.id);
      const item: HistoryItem = {
        id: uid(), q, dev: b.dev, date: todayKey(), res: result, done: {}, follow: [],
        solIds: used.length ? used : sols.slice(0, 2).map((e) => e.sol.id),
        srcs, codes: quick.codes,
        // Only the fact that something was attached is kept, never the photo or file itself.
        attached: images.length || file ? { photos: images.length, file: file?.name ?? '' } : undefined,
      };
      c.user.history.unshift(item);
      c.user.history = c.user.history.slice(0, 20);
      store.save();
      return historyView(item, c);
    };

    if (!streaming) {
      let result: Diagnosis;
      try { result = await AI.diagnose(input); } catch (e) { refund(); throw e; }
      res.json({ quick, item: record(result) });
      return;
    }

    // Step 2 — streamed: the instant results go out first, then the diagnosis as it is written.
    const out = ndjson(res);
    out.send({ type: 'quick', quick });
    const ctl = new AbortController();
    res.on('close', () => { if (!res.writableEnded) ctl.abort(); }); // the technician pressed Stop or left the screen
    try {
      const result = await AI.diagnose(input, { signal: ctl.signal, onPartial: (partial) => out.send({ type: 'partial', res: partial }) });
      out.send({ type: 'done', item: record(result) });
    } catch (e) {
      refund();
      if (codeOf(e) === 'generic') console.error('diagnosis failed:', e instanceof Error ? e.message : 'unknown');
      out.send({ type: 'error', error: codeOf(e) });
    }
    out.end();
  }));

  r.get('/history', wrap((req, res) => {
    res.json({ items: req.ctx.user.history.map((x) => historyView(x, req.ctx)) });
  }));

  r.post('/history/:id/follow-up', wrap(async (req, res) => {
    const c = req.ctx;
    const x = c.user.history.find((h) => h.id === req.params.id);
    if (!x) throw notFound();
    const { q } = parse(z.object({ q: z.string().trim().min(1).max(1000) }), req.body);
    if (x.follow.length >= 30) throw bad('invalid_input');
    if (!AI.aiConfigured()) throw new ai.AiError('not_configured');
    limit(`ai-follow:${c.user.id}`, 60, 10 * MIN, 'slow_down');
    const done = (a: string) => {
      x.follow.push({ q, a });
      store.save();
      return historyView(x, c);
    };
    if (!wantsStream(req)) { res.json({ item: done(await AI.followUp(x, q, c.lang)) }); return; }

    const out = ndjson(res);
    const ctl = new AbortController();
    res.on('close', () => { if (!res.writableEnded) ctl.abort(); });
    // Pieces arrive word by word; send them a few times a second rather than one line per word.
    let pending = '';
    let timer: NodeJS.Timeout | null = null;
    const flush = () => { timer = null; if (pending) { out.send({ type: 'delta', text: pending }); pending = ''; } };
    try {
      const a = await AI.followUp(x, q, c.lang, { signal: ctl.signal, onDelta: (piece) => { pending += piece; timer ??= setTimeout(flush, 80); } });
      if (timer) clearTimeout(timer);
      flush();
      out.send({ type: 'done', item: done(a) });
    } catch (e) {
      if (timer) clearTimeout(timer);
      if (codeOf(e) === 'generic') console.error('follow-up failed:', e instanceof Error ? e.message : 'unknown');
      out.send({ type: 'error', error: codeOf(e) });
    }
    out.end();
  }));

  r.patch('/history/:id/steps', wrap((req, res) => {
    const x = req.ctx.user.history.find((h) => h.id === req.params.id);
    if (!x) throw notFound();
    const b = parse(z.object({ i: z.number().int().min(0).max(50), done: z.boolean() }), req.body);
    x.done[b.i] = b.done;
    store.save();
    res.json({ ok: true });
  }));

  /* ================================================================ solutions */

  r.get('/solutions', wrap((req, res) => {
    const c = req.ctx;
    const tab = String(req.query.tab || 'verify');
    const q = String(req.query.q || '').slice(0, 200);
    const list = db().sols.filter((s) => {
      if (q && !prefixMatchCount(q, `${devOf(s)} ${s.symptom} ${s.code}`)) return false;
      if (tab === 'mine') return s.userId === c.user.id;
      if (tab === 'verify') return s.userId !== c.user.id && !s.votes[c.user.id] && solStatus(s) === 'pen';
      return true;
    });
    res.json({ items: list.slice(0, 200).map((s) => solView(s, c)) });
  }));

  r.post('/solutions', body('16mb'), wrap((req, res) => {
    const c = req.ctx;
    const b = parse(z.object({
      brand: z.string().trim().max(80).default(''), model: z.string().trim().max(120).default(''),
      symptom: z.string().trim().min(5).max(300), code: z.string().trim().max(40).default(''),
      steps: z.string().trim().min(20).max(6000), part: z.string().trim().max(300).default(''),
      photo: ImageZ.nullable().optional(),
    }), req.body);
    if (!b.brand && !b.model) throw bad('need_device');
    const photo = checkImage(b.photo);
    limit(`teach:${c.user.id}`, 20, DAY, 'slow_down');
    const s: Solution = {
      id: uid(), userId: c.user.id, by: displayName(c), brand: b.brand, model: b.model, symptom: b.symptom, code: b.code,
      steps: b.steps, part: b.part,
      // The preview other users see is built here from the verified upload. The app never supplies a URL,
      // so a solution can't point other people's phones at a third-party server.
      photo: photo && photo.data.length <= 400_000 ? `data:${photo.mediaType};base64,${photo.data}` : '',
      photoNote: '', ok: 0, fail: 0, votes: {}, ai: null, rewarded: false, date: todayKey(),
    };
    db().sols.unshift(s);
    const awarded = store.reward(c.user, 'teach');
    store.reindex();
    store.save();
    runPrecheck(s, photo, c.lang);
    res.json({ item: solView(s, c), me: meView(c), awarded });
  }));

  r.post('/solutions/:id/vote', wrap((req, res) => {
    const c = req.ctx;
    const s = db().sols.find((x) => x.id === req.params.id);
    if (!s) throw notFound();
    const { v } = parse(z.object({ v: z.enum(['ok', 'fail']) }), req.body);
    if (s.userId === c.user.id || s.votes[c.user.id]) throw bad('cannot_vote');
    s.votes[c.user.id] = v;
    s[v]++;
    const awarded = store.reward(c.user, 'vote');
    checkReward(s);
    store.reindex();
    store.save();
    res.json({ item: solView(s, c), me: meView(c), awarded });
  }));

  // Demo only: lets a tester see the verification reward without three other accounts.
  r.post('/solutions/:id/simulate', wrap((req, res) => {
    const c = req.ctx;
    if (!DEMO()) throw forbidden();
    const s = db().sols.find((x) => x.id === req.params.id);
    if (!s) throw notFound();
    if (s.userId !== c.user.id) throw forbidden();
    s.ok += NEED_OK;
    checkReward(s);
    store.reindex();
    store.save();
    res.json({ item: solView(s, c), me: meView(c) });
  }));

  r.delete('/solutions/:id', wrap((req, res) => {
    const c = req.ctx;
    const s = db().sols.find((x) => x.id === req.params.id);
    if (!s) throw notFound();
    if (s.userId !== c.user.id && !c.isAdmin) throw forbidden();
    db().sols = db().sols.filter((x) => x.id !== s.id);
    store.reindex();
    store.save();
    res.json({ ok: true });
  }));

  /* ================================================================ training */

  r.get('/courses', wrap((req, res) => {
    res.json({ items: db().courses.map((co) => courseView(co, req.ctx, false)) });
  }));

  r.get('/courses/:id', wrap((req, res) => {
    const co = db().courses.find((x) => x.id === req.params.id);
    if (!co) throw notFound();
    res.json({ item: courseView(co, req.ctx, true) });
  }));

  r.post('/courses', body('1mb'), wrap((req, res) => {
    const c = req.ctx;
    if (!PLANS[c.user.plan].teach) throw new HttpError(402, 'plan_required');
    const b = parse(z.object({
      title: z.string().trim().min(1).max(160), cat: z.enum(['svc', 'use']), level: z.enum(['b', 'i', 'a']),
      hours: z.number().int().min(1).max(500), usd: z.number().positive().max(100000),
      desc: z.string().trim().max(3000).default(''), lessonsText: z.string().max(200000),
    }), req.body);
    const lessons = splitLessons(b.lessonsText).map((x, i) => ({ t: x.h || `${c.lang === 'tr' ? 'Ders' : 'Lesson'} ${i + 1}`, c: x.t }));
    if (!lessons.length) throw bad('need_lessons');
    const co: Course = {
      id: uid(), ownerId: c.user.id, title: b.title, by: displayName(c), cat: b.cat, level: b.level, hours: b.hours,
      usd: b.usd, rating: 0, n: 0, desc: b.desc, lessons,
    };
    db().courses.unshift(co);
    store.save();
    res.json({ item: courseView(co, c, true) });
  }));

  const sell = (co: Course, how: 'pts' | 'card' | 'demo') => {
    db().sales.unshift({ courseId: co.id, title: co.title, usd: co.usd, fee: (co.usd * db().fee) / 100, sellerId: co.ownerId, date: todayKey(), how });
    co.n++;
  };

  r.post('/courses/:id/buy', wrap((req, res) => {
    const c = req.ctx;
    const co = db().courses.find((x) => x.id === req.params.id);
    if (!co) throw notFound();
    if (hasCourse(co, c)) throw bad('already_owned');
    const { how } = parse(z.object({ how: z.enum(['card', 'pts']) }), req.body);
    if (how === 'pts') {
      const pp = ptsFor(co.usd);
      if (c.user.points < pp) throw bad('not_enough_points');
      store.award(c.user, -pp, 'pt_spend');
    } else if (!DEMO()) {
      throw bad('use_points'); // outside demo mode courses are paid with points (bought through Google Play)
    }
    c.user.owned.push(co.id);
    sell(co, how === 'pts' ? 'pts' : 'demo');
    store.save();
    res.json({ item: courseView(co, c, true), me: meView(c) });
  }));

  r.post('/courses/:id/simulate-sale', wrap((req, res) => {
    const c = req.ctx;
    if (!DEMO()) throw forbidden();
    const co = db().courses.find((x) => x.id === req.params.id);
    if (!co) throw notFound();
    if (co.ownerId !== c.user.id) throw forbidden();
    sell(co, 'demo');
    store.save();
    res.json({ item: courseView(co, c, true) });
  }));

  r.delete('/courses/:id', wrap((req, res) => {
    const c = req.ctx;
    const co = db().courses.find((x) => x.id === req.params.id);
    if (!co) throw notFound();
    if (co.ownerId !== c.user.id && !c.isAdmin) throw forbidden();
    db().courses = db().courses.filter((x) => x.id !== co.id);
    store.save();
    res.json({ ok: true });
  }));

  /* ================================================================ marketplace */

  r.get('/listings', wrap((req, res) => {
    const c = req.ctx;
    const cat = String(req.query.cat || 'all');
    const cond = String(req.query.cond || 'all');
    const country = String(req.query.country || '');
    const q = String(req.query.q || '').slice(0, 200);
    const all = db().listings;
    const items = all
      .filter((l) => (cat === 'all' || l.cat === cat) && (cond === 'all' || l.cond === cond) && (!country || l.c === country))
      .map((l) => ({ l, s: q ? prefixMatchCount(q, `${l.tr} ${l.en} ${l.brand} ${l.model} ${l.seller}`) : 1 }))
      .filter((o) => o.s > 0)
      .sort((a, b) => b.s - a.s)
      .map((o) => listingView(o.l, c));
    res.json({ items, countries: [...new Set(all.map((l) => l.c))] });
  }));

  r.get('/listings/:id', wrap((req, res) => {
    const c = req.ctx;
    const l = db().listings.find((x) => x.id === req.params.id);
    if (!l) throw notFound();
    const reviews = db().reviews.filter((x) => x.key === pKey(l)).map((x) => ({ ...x, userId: undefined, mine: x.userId === c.user.id }));
    const knownFixes = db().sols.filter((s) => s.model && s.model.toLocaleLowerCase('tr') === l.model.toLocaleLowerCase('tr') && solStatus(s) === 'ver').length;
    res.json({ item: listingView(l, c), agg: agg(l), reviews, knownFixes });
  }));

  r.post('/listings', wrap((req, res) => {
    const c = req.ctx;
    const plan = PLANS[c.user.plan];
    if (!plan.sell) throw new HttpError(402, 'plan_required');
    if (db().listings.filter((l) => l.ownerId === c.user.id).length >= plan.sell) throw bad('listing_limit');
    const b = parse(z.object({
      cat: z.enum(['device', 'part', 'cons', 'acc']), cond: z.enum(['new', 'used', 'refurb']),
      name: z.string().trim().min(1).max(160), brand: z.string().trim().max(80).default(''), model: z.string().trim().max(120).default(''),
      year: z.number().int().min(0).max(2100).default(0), stock: z.number().int().min(1).max(1_000_000).default(1),
      usd: z.number().positive().max(10_000_000), country: z.string().length(2).transform((v) => v.toUpperCase()).refine((v) => COUNTRIES.includes(v)),
      reg: z.string().trim().max(120).default(''),
      desc: z.string().trim().max(3000).default(''), declared: z.literal(true),
    }), req.body);
    const l: Listing = {
      id: 'm' + uid(), ownerId: c.user.id, cat: b.cat, cond: b.cond, tr: b.name, en: b.name, brand: b.brand, model: b.model,
      year: b.year, stock: b.stock, usd: b.usd, c: b.country, reg: b.reg, seller: displayName(c),
      // The "verified seller" badge is granted by a developer after checking the seller's documents, never automatically.
      ok: 0, dtr: b.desc, den: b.desc,
    };
    db().listings.unshift(l);
    store.save();
    res.json({ item: listingView(l, c) });
  }));

  r.delete('/listings/:id', wrap((req, res) => {
    const c = req.ctx;
    const l = db().listings.find((x) => x.id === req.params.id);
    if (!l) throw notFound();
    if (l.ownerId !== c.user.id && !c.isAdmin) throw forbidden();
    db().listings = db().listings.filter((x) => x.id !== l.id);
    store.save();
    res.json({ ok: true });
  }));

  r.post('/listings/:id/quote', wrap((req, res) => {
    const c = req.ctx;
    const l = db().listings.find((x) => x.id === req.params.id);
    if (!l) throw notFound();
    const b = parse(z.object({ qty: z.number().int().min(1).max(100000), msg: z.string().trim().max(2000).default('') }), req.body);
    c.user.quotes.unshift({ id: l.id, title: c.lang === 'tr' ? l.tr : l.en, seller: l.seller, usd: l.usd, qty: b.qty, msg: b.msg, date: todayKey() });
    c.user.quotes = c.user.quotes.slice(0, 50);
    // Production: forward the request to the seller (email / in-app inbox).
    store.save();
    res.json({ me: meView(c) });
  }));

  r.post('/listings/:id/reviews', wrap((req, res) => {
    const c = req.ctx;
    if (c.user.plan === 'free') throw new HttpError(402, 'plan_required');
    const l = db().listings.find((x) => x.id === req.params.id);
    if (!l) throw notFound();
    const Star = z.number().int().min(1).max(5);
    const b = parse(z.object({
      stars: Star, rel: Star, svc: Star, use: Star, val: Star, again: z.boolean(),
      months: z.enum(['rv_m1', 'rv_m2', 'rv_m3']), text: z.string().trim().min(10).max(3000), declared: z.literal(true),
    }), req.body);
    const key = pKey(l);
    const first = !db().reviews.some((x) => x.userId === c.user.id && x.key === key);
    db().reviews = db().reviews.filter((x) => !(x.userId === c.user.id && x.key === key));
    db().reviews.unshift({
      id: uid(), key, userId: c.user.id, by: displayName(c), stars: b.stars, rel: b.rel, svc: b.svc, use: b.use, val: b.val,
      again: b.again, months: b.months, buyer: c.user.quotes.some((q) => q.id === l.id), text: b.text,
    });
    if (first) store.award(c.user, PT.review, 'pt_review');
    store.save();
    res.json({ awarded: first ? PT.review : 0, me: meView(c) });
  }));

  r.post('/listings/:id/report', wrap((req, res) => {
    const l = db().listings.find((x) => x.id === req.params.id);
    if (!l) throw notFound();
    const uidNow = req.ctx.user.id;
    if (!db().reports.some((x) => x.listingId === l.id && x.userId === uidNow)) {
      db().reports.push({ listingId: l.id, userId: uidNow, date: todayKey() });
    }
    store.save();
    res.json({ ok: true });
  }));

  /* ================================================================ developer panel (admin token) */

  /** Reading a scanned manual takes minutes; the app starts a job and asks for its progress. */
  interface Job { status: 'running' | 'done' | 'failed'; done: number; total: number; text: string; error: string; at: number }
  const jobs = new Map<string, Job>();
  const PAGES_PER_CALL = 4;
  const letters = (text: string) => text.replace(/\s/g, '').length;
  /** Fewer characters than this on a page means its text layer is missing (a scan) or it is a drawing. */
  const MIN_PAGE_TEXT = 40;

  /** A page with nothing drawn on it (a blank separator). When in doubt the answer is no, and the AI looks at the page. */
  function blankPage(page: PDFPage): boolean {
    try {
      const xobjects = page.node.Resources()?.lookup(PDFName.of('XObject'));
      if (xobjects instanceof PDFDict && xobjects.keys().length) return false; // an image (a scan) or an embedded drawing
      const contents = page.node.Contents();
      const streams = contents instanceof PDFArray ? contents.asArray().map((ref) => page.doc.context.lookup(ref)) : contents ? [contents] : [];
      return streams.reduce((n, st) => n + (st instanceof PDFStream ? st.getContentsSize() : 0), 0) < 64;
    } catch {
      return false;
    }
  }

  /** Consecutive page numbers, at most PAGES_PER_CALL together, so each transcript can be put back in its place. */
  function pageGroups(indices: number[]): number[][] {
    const groups: number[][] = [];
    for (const i of indices) {
      const last = groups[groups.length - 1];
      if (last && last.length < PAGES_PER_CALL && last[last.length - 1] === i - 1) last.push(i);
      else groups.push([i]);
    }
    return groups;
  }

  /**
   * The AI reads the given page groups; `slots` holds the text of every page in order and already
   * contains the pages whose own text layer was good enough.
   */
  async function readPdf(job: Job, pdf: PDFDocument, name: string, groups: number[][], slots: string[]) {
    let next = 0;
    const worker = async () => {
      while (job.status === 'running') {
        const idx = groups[next++];
        if (!idx) return;
        const part = await PDFDocument.create();
        (await part.copyPages(pdf, idx)).forEach((page) => part.addPage(page));
        const data = Buffer.from(await part.save()).toString('base64');
        slots[idx[0]] = await AI.transcribePdf(data, `${name} p.${idx[0] + 1}-${idx[idx.length - 1] + 1}`);
        job.done++;
      }
    };
    try {
      await Promise.all([worker(), worker()]); // two page groups at a time
      job.text = slots.filter(Boolean).join('\n\n');
      job.status = 'done';
    } catch (e) {
      job.status = 'failed';
      job.error = codeOf(e);
      console.warn('reading a PDF with the AI failed:', e instanceof Error ? e.message : 'unknown');
    }
    job.at = Date.now();
  }

  /**
   * Search words and error codes for a batch of sections. When the answer for a whole batch cannot be
   * used (cut off, malformed), the batch is halved until the troublesome section is alone and is left as it is.
   */
  async function indexBatch(doc: Doc, batch: Chunk[]): Promise<void> {
    try {
      const found = await AI.indexSections(doc.title, devOf(doc), batch);
      batch.forEach((chunk, j) => { chunk.k = found[j]?.keywords || ''; chunk.codes = found[j]?.codes || []; });
    } catch (e) {
      if (!(e instanceof ai.AiError) || e.code !== 'invalid_json') throw e;
      if (batch.length === 1) { batch[0].k = ''; batch[0].codes = []; return; }
      const half = Math.ceil(batch.length / 2);
      await indexBatch(doc, batch.slice(0, half));
      await indexBatch(doc, batch.slice(half));
    }
  }

  /**
   * Background pass over a manual: for every section the AI adds the words a technician would search
   * with (Turkish and English) and the error codes the section defines. Failure leaves the manual usable,
   * and running the pass again continues with the sections that are still missing.
   */
  async function indexDoc(doc: Doc) {
    if (!AI.aiConfigured() || doc.ai?.status === 'running') return;
    const todo = doc.chunks.filter((chunk) => chunk.k === undefined);
    const already = doc.chunks.length - todo.length;
    const state = { status: 'running' as 'running' | 'done' | 'failed', done: already, total: doc.chunks.length };
    doc.ai = state;
    store.save();
    try {
      for (let i = 0; i < todo.length; i += 10) {
        if (!db().docs.includes(doc)) return; // deleted while indexing
        await indexBatch(doc, todo.slice(i, i + 10));
        state.done = already + Math.min(todo.length, i + 10);
        store.reindex();
        store.save();
      }
      state.status = 'done';
    } catch (e) {
      state.status = 'failed';
      console.warn('indexing a manual with the AI failed:', e instanceof Error ? e.message : 'unknown');
    }
    store.save();
  }


  r.get('/admin/overview', wrap((req, res) => {
    const d = db();
    res.json({
      fee: d.fee,
      sales: d.sales.slice(0, 20),
      totalSales: d.sales.reduce((a, x) => a + x.usd, 0),
      totalFee: d.sales.reduce((a, x) => a + x.fee, 0),
      docs: d.docs.map((x) => ({
        id: x.id, title: x.title, brand: x.brand, model: x.model, kind: x.kind, chunks: x.chunks.length,
        codes: store.index.codesOf(devOf(x), 500).filter((e) => e.docId === x.id).length, ai: x.ai ?? null,
      })),
      ai: AI.aiConfigured(),
      chunkCount: d.docs.reduce((a, x) => a + x.chunks.length, 0),
      solCount: d.sols.length,
      reports: d.reports.length,
      pendingListings: d.listings.filter((l) => l.ownerId && !l.ok).slice(0, 100)
        .map((l) => ({ id: l.id, title: l.tr, seller: l.seller, brand: l.brand, model: l.model })),
    });
  }));

  r.patch('/admin/fee', wrap((req, res) => {
    const { fee } = parse(z.object({ fee: z.number().int().min(0).max(90) }), req.body);
    db().fee = fee;
    audit('admin_fee_changed', { by: req.ctx.user.id, fee });
    store.save();
    res.json({ fee });
  }));

  r.post('/admin/docs', body('3mb'), wrap((req, res) => {
    const b = parse(z.object({
      title: z.string().trim().min(1).max(200), brand: z.string().trim().max(80).default(''), model: z.string().trim().max(120).default(''),
      text: z.string().min(20).max(2_000_000),
    }), req.body);
    const doc = { id: uid(), title: b.title, brand: b.brand, model: b.model, kind: 'manual' as const, chunks: chunkText(b.text), createdAt: todayKey() };
    audit('admin_doc_added', { by: req.ctx.user.id, doc: doc.id });
    db().docs.unshift(doc);
    store.reindex();
    store.save();
    void indexDoc(doc); // in the background: search words and error codes for every section
    res.json({ id: doc.id, chunks: doc.chunks.length });
  }));

  // (Re)run the AI indexing pass for a manual, e.g. one that was added before an AI key was configured.
  r.post('/admin/docs/:id/index', wrap((req, res) => {
    const doc = db().docs.find((x) => x.id === req.params.id);
    if (!doc) throw notFound();
    if (!AI.aiConfigured()) throw new ai.AiError('not_configured');
    if (doc.ai?.status !== 'running') void indexDoc(doc);
    res.json({ ok: true });
  }));

  // A developer has checked the seller's company and device registration documents.
  r.post('/admin/listings/:id/verify', wrap((req, res) => {
    const l = db().listings.find((x) => x.id === req.params.id);
    if (!l) throw notFound();
    l.ok = 1;
    store.save();
    audit('admin_listing_verified', { by: req.ctx.user.id, listing: l.id });
    res.json({ item: listingView(l, req.ctx) });
  }));

  // A developer has reviewed a solution the AI flagged as a safety risk and judged it safe.
  r.post('/admin/solutions/:id/approve', wrap((req, res) => {
    const s = db().sols.find((x) => x.id === req.params.id);
    if (!s) throw notFound();
    if (s.ai) s.ai.safe = false;
    checkReward(s);
    store.reindex();
    store.save();
    audit('admin_solution_approved', { by: req.ctx.user.id, solution: s.id });
    res.json({ item: solView(s, req.ctx) });
  }));

  r.delete('/admin/docs/:id', wrap((req, res) => {
    audit('admin_doc_deleted', { by: req.ctx.user.id, doc: req.params.id });
    db().docs = db().docs.filter((x) => x.id !== req.params.id);
    store.reindex();
    store.save();
    res.json({ ok: true });
  }));

  r.post('/admin/ingest-pdf', body('45mb'), wrap(async (req, res) => {
    const b = parse(z.object({
      data: z.string().min(16).max(40_000_000).regex(B64), name: z.string().trim().max(200).default('manual'),
      ai: z.boolean().default(false), // read with the AI even when the PDF has a text layer (tables, diagrams, poor OCR)
    }), req.body);
    const bytes = Buffer.from(b.data, 'base64');
    let pdf: PDFDocument;
    let pages = 0;
    try {
      pdf = await PDFDocument.load(bytes, { ignoreEncryption: true });
      if (pdf.isEncrypted) throw new Error('encrypted');
      pages = pdf.getPageCount(); // throws for a file that is not really a PDF
    } catch {
      throw bad('pdf_failed');
    }
    if (pages < 1) throw bad('pdf_failed');
    if (pages > 600) throw bad('file_too_long');

    // The quick way: the PDF's own text layer, page by page.
    let own: string[] = [];
    const parser = new PDFParse({ data: bytes });
    try { own = (await parser.getText({ pageJoiner: '' })).pages.map((pg) => pg.text.trim()); } catch { own = []; } finally { await parser.destroy().catch(() => {}); }
    const slots = Array.from({ length: pages }, (_, i) => own[i] ?? '');
    // Pages the text layer does not cover: scans and drawings. Blank separator pages are left alone.
    const unread = slots.flatMap((text, i) => (letters(text) < MIN_PAGE_TEXT && !blankPage(pdf.getPage(i)) ? [i] : []));
    const toRead = b.ai ? slots.map((_, i) => i) : unread;

    if (!AI.aiConfigured() || !toRead.length) {
      const text = slots.filter(Boolean).join('\n\n');
      if (letters(text) < MIN_PAGE_TEXT) throw bad('pdf_empty'); // scanned, and no AI to read it
      // `scanned`: pages that could not be read this way, so the app can say the text is incomplete.
      res.json({ mode: 'text', pages, scanned: unread.length, text });
      return;
    }

    // Scanned or picture-heavy pages: the AI reads them, a few at a time, in the background.
    // Pages with a good text layer keep it, which is quicker, cheaper and exact.
    for (const [id, j] of jobs) if (j.status !== 'running' && Date.now() - j.at > HOUR) jobs.delete(id);
    if ([...jobs.values()].filter((j) => j.status === 'running').length >= 2) throw new HttpError(429, 'slow_down');
    const groups = pageGroups(toRead);
    for (const i of toRead) slots[i] = '';
    const id = uid();
    const job: Job = { status: 'running', done: 0, total: groups.length, text: '', error: '', at: Date.now() };
    jobs.set(id, job);
    audit('admin_pdf_ai_read', { by: req.ctx.user.id, pages: toRead.length });
    void readPdf(job, pdf, b.name, groups, slots);
    res.json({ mode: 'ai', pages, scanned: toRead.length, job: id });
  }));

  r.get('/admin/jobs/:id', wrap((req, res) => {
    const job = jobs.get(String(req.params.id));
    if (!job) throw notFound();
    res.json({ status: job.status, done: job.done, total: job.total, text: job.status === 'done' ? job.text : '', error: job.error });
  }));

  r.post('/admin/ocr', body('16mb'), wrap(async (req, res) => {
    const { image } = parse(z.object({ image: ImageZ }), req.body);
    res.json({ text: await AI.transcribePage(checkImage(image)!) });
  }));

  r.get('/admin/search', wrap((req, res) => {
    const q = String(req.query.q || '').slice(0, 500);
    const hits = store.index.search(q, '', 4).map((e) => (e.type === 'doc'
      ? { type: 'doc', title: e.doc.title, h: e.doc.chunks[e.ci].h, t: e.doc.chunks[e.ci].t }
      : { type: 'sol', title: '★ ' + devOf(e.sol), h: e.sol.symptom, t: e.sol.steps }));
    res.json({ hits });
  }));

  return r;
}

/** Translate thrown errors into `{ error: code }` JSON. */
export function errorHandler(err: unknown, _req: Request, res: Response, _next: NextFunction) {
  if (err instanceof HttpError) { res.status(err.status).json({ error: err.code }); return; }
  if (err instanceof ai.AiError) {
    const status = err.code === 'rate_limited' ? 429 : err.code === 'not_configured' ? 503 : 502;
    if (err.code === 'generic') console.error('AI error:', err.message);
    res.status(status).json({ error: err.code });
    return;
  }
  // Errors from the JSON body parser. They carry the raw request body, so they are answered but never logged:
  // a mistyped login request must not put a password in the log file.
  const type = err && typeof err === 'object' && 'type' in err ? String((err as { type: unknown }).type) : '';
  if (type === 'entity.too.large') { res.status(413).json({ error: 'prompt_too_large' }); return; }
  if (type.startsWith('entity.') || type.startsWith('encoding.') || type.startsWith('charset.') || type === 'request.aborted' || type === 'request.size.invalid') {
    res.status(400).json({ error: 'invalid_input' });
    return;
  }
  console.error(err instanceof Error ? err.stack || err.message : 'Unknown error');
  res.status(500).json({ error: 'generic' });
}
