import express, { type NextFunction, type Request, type Response } from 'express';
import { PDFParse } from 'pdf-parse';
import { z } from 'zod';
import * as ai from './ai.js';
import { chunkText, devOf, NEED_OK, prefixMatchCount, solStatus } from './kb.js';
import { isPlan, PLANS, planForClient, planPrice, PT, PT_PER_USD, ptsFor } from './plans.js';
import { todayKey, uid, type Store } from './store.js';
import type { Course, HistoryItem, Lang, Listing, Solution, User } from './types.js';

/* ------------------------------------------------------------------ helpers */

interface Ctx { user: User; lang: Lang; isAdmin: boolean }
type Req = Request & { ctx: Ctx };

export class HttpError extends Error {
  constructor(public status: number, public code: string) { super(code); }
}
const bad = (code: string) => new HttpError(400, code);
const forbidden = (code = 'forbidden') => new HttpError(403, code);
const notFound = () => new HttpError(404, 'not_found');

const ImageZ = z.object({
  data: z.string().min(16).max(12_000_000),
  mediaType: z.enum(['image/jpeg', 'image/png', 'image/webp']),
});

function parse<S extends z.ZodType>(schema: S, body: unknown): z.infer<S> {
  const r = schema.safeParse(body);
  if (!r.success) throw bad('invalid_input');
  return r.data;
}

const wrap = (fn: (req: Req, res: Response) => unknown) =>
  (req: Request, res: Response, next: NextFunction) => {
    Promise.resolve(fn(req as Req, res)).catch(next);
  };

const DEMO = () => process.env.DEMO_PAYMENTS !== 'false';

/* ------------------------------------------------------------------ router */

export function createRouter(store: Store) {
  const r = express.Router();
  const db = () => store.db;

  // Identity: the app generates a random device id and sends it on every call.
  // Replace with real authentication (e.g. OAuth / magic link) before production.
  r.use((req, _res, next) => {
    if (req.path === '/health') return next();
    const id = String(req.header('x-user-id') || '');
    if (!/^[A-Za-z0-9_-]{16,64}$/.test(id)) return next(new HttpError(401, 'no_user'));
    const lang: Lang = req.header('x-lang') === 'en' ? 'en' : 'tr';
    const token = process.env.ADMIN_TOKEN;
    const isAdmin = !!token && req.header('x-admin-token') === token;
    const user = store.user(id);
    let name = '';
    try { name = decodeURIComponent(String(req.header('x-user-name') || '')).trim().slice(0, 40); } catch { /* ignore bad encoding */ }
    if (name && name !== user.name) { user.name = name; store.save(); }
    (req as Req).ctx = { user, lang, isAdmin };
    next();
  });

  const displayName = (c: Ctx) => c.user.name || (c.lang === 'tr' ? 'Sen' : 'You');

  /* ---------- views */

  const solView = (s: Solution, c: Ctx) => ({
    id: s.id, by: s.by, brand: s.brand, model: s.model, symptom: s.symptom, code: s.code, steps: s.steps, part: s.part,
    photo: s.photo, photoNote: s.photoNote, ok: s.ok, fail: s.fail, ai: s.ai, date: s.date,
    status: solStatus(s), mine: s.userId === c.user.id, myVote: s.votes[c.user.id] ?? null,
    canDelete: s.userId === c.user.id || c.isAdmin, checking: pendingChecks.has(s.id),
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
        id: u.id, name: u.name, plan: u.plan, billing: u.billing, points: u.points, ledger: u.ledger.slice(0, 20),
        usedToday: store.usedToday(u), quotes: u.quotes, owned: u.owned,
      },
      plan: planForClient(u.plan),
      plans: Object.fromEntries(Object.keys(PLANS).map((k) => [k, planForClient(k as keyof typeof PLANS)])),
      pt: PT, ptPerUsd: PT_PER_USD, needOk: NEED_OK, fee: db().fee,
      ai: ai.aiConfigured(), isAdmin: c.isAdmin, demoPayments: DEMO(),
    };
  };

  /* ---------- background AI pre-check of taught solutions */

  const pendingChecks = new Set<string>();
  function runPrecheck(s: Solution, photo: z.infer<typeof ImageZ> | null, lang: Lang) {
    if (!ai.aiConfigured()) return;
    pendingChecks.add(s.id);
    const hits = store.index.search(`${devOf(s)} ${s.symptom} ${s.steps}`, devOf(s), 5, 'doc');
    ai.precheck(s, hits, photo, lang)
      .then(({ ai: check, photoNote }) => {
        s.ai = check;
        if (photoNote) s.photoNote = photoNote;
        store.reindex();
        store.save();
      })
      .catch((e) => console.warn('precheck failed', s.id, e instanceof Error ? e.message : e))
      .finally(() => pendingChecks.delete(s.id));
  }

  function checkReward(s: Solution, lang: Lang) {
    if (!s.userId || s.rewarded || solStatus(s) !== 'ver') return;
    const owner = db().users[s.userId];
    if (!owner) return;
    s.rewarded = true;
    store.award(owner, PT.verified, 'pt_verified');
    void lang;
  }

  /* ================================================================ account */

  r.get('/health', (_req, res) => { res.json({ ok: true, ai: ai.aiConfigured(), model: ai.MODEL }); });

  r.get('/me', wrap((req, res) => { res.json(meView(req.ctx)); }));

  r.patch('/me', wrap((req, res) => {
    const b = parse(z.object({ billing: z.enum(['month', 'year']).optional() }), req.body);
    if (b.billing) req.ctx.user.billing = b.billing;
    store.save();
    res.json(meView(req.ctx));
  }));

  r.post('/me/plan', wrap((req, res) => {
    const b = parse(z.object({ plan: z.string(), how: z.enum(['card', 'pts']) }), req.body);
    if (!isPlan(b.plan)) throw bad('invalid_plan');
    const u = req.ctx.user;
    const price = planPrice(b.plan, u.billing);
    if (price > 0 && b.how === 'pts') {
      const pp = ptsFor(price);
      if (u.points < pp) throw bad('not_enough_points');
      store.award(u, -pp, 'pt_spend');
    } else if (price > 0 && !DEMO()) {
      // Production: verify a Google Play Billing purchase token here before activating.
      throw new HttpError(501, 'billing_not_configured');
    }
    u.plan = b.plan;
    store.save();
    res.json(meView(req.ctx));
  }));

  r.post('/me/reset', wrap((req, res) => {
    const u = req.ctx.user;
    delete db().users[u.id];
    db().sols = db().sols.filter((s) => s.userId !== u.id);
    db().reviews = db().reviews.filter((x) => x.userId !== u.id);
    db().courses = db().courses.filter((c) => c.ownerId !== u.id);
    db().listings = db().listings.filter((l) => l.ownerId !== u.id);
    db().sols.forEach((s) => { delete s.votes[u.id]; });
    store.reindex();
    req.ctx.user = store.user(u.id);
    res.json(meView(req.ctx));
  }));

  /* ================================================================ assistant */

  r.get('/devices', wrap((_req, res) => {
    const list = [...new Set(db().docs.map(devOf).concat(db().sols.map(devOf)).filter(Boolean))].sort();
    res.json({ devices: list });
  }));

  r.post('/diagnose', wrap(async (req, res) => {
    const c = req.ctx;
    const b = parse(z.object({ q: z.string().max(4000).default(''), dev: z.string().max(200).default(''), image: ImageZ.nullable().optional() }), req.body);
    const q = b.q.trim();
    if (!q && !b.image) throw bad('need_input');
    const qq = `${q} ${b.dev}`;
    const hits = store.index.search(qq, b.dev, 7, 'doc');
    const sols = store.index.search(qq, b.dev, 5, 'sol')
      .filter((e) => solStatus(e.sol) !== 'rej' && !(e.sol.ai?.safe && solStatus(e.sol) !== 'ver'))
      .slice(0, 4);

    if (!ai.aiConfigured()) {
      res.json({
        offline: {
          docs: hits.slice(0, 4).map((e) => ({ title: e.doc.title, h: e.doc.chunks[e.ci].h, t: e.doc.chunks[e.ci].t })),
          sols: sols.map((e) => solView(e.sol, c)),
        },
      });
      return;
    }
    const plan = PLANS[c.user.plan];
    if (store.usedToday(c.user) >= plan.quota) throw new HttpError(402, 'quota');
    if (b.image && !plan.photo) throw new HttpError(402, 'photo_plan');

    const result = await ai.diagnose(q, b.dev, hits, sols, b.image ?? null, c.lang);
    const used = result.community.map((n) => sols[n - 1]).filter(Boolean).map((e) => e.sol.id);
    const item: HistoryItem = {
      id: uid(), q, dev: b.dev, date: todayKey(), res: result, done: {}, follow: [],
      solIds: used.length ? used : sols.slice(0, 2).map((e) => e.sol.id),
      srcs: hits.map((e) => ({ title: e.doc.title, h: e.doc.chunks[e.ci].h, t: e.doc.chunks[e.ci].t })),
    };
    c.user.history.unshift(item);
    c.user.history = c.user.history.slice(0, 20);
    c.user.usage.n = store.usedToday(c.user) + 1;
    store.save();
    res.json({ item: historyView(item, c) });
  }));

  r.get('/history', wrap((req, res) => {
    res.json({ items: req.ctx.user.history.map((x) => historyView(x, req.ctx)) });
  }));

  r.post('/history/:id/follow-up', wrap(async (req, res) => {
    const c = req.ctx;
    const x = c.user.history.find((h) => h.id === req.params.id);
    if (!x) throw notFound();
    const { q } = parse(z.object({ q: z.string().trim().min(1).max(1000) }), req.body);
    const a = await ai.followUp(x, q, c.lang);
    x.follow.push({ q, a });
    store.save();
    res.json({ item: historyView(x, c) });
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
    const q = String(req.query.q || '');
    const list = db().sols.filter((s) => {
      if (q && !prefixMatchCount(q, `${devOf(s)} ${s.symptom} ${s.code}`)) return false;
      if (tab === 'mine') return s.userId === c.user.id;
      if (tab === 'verify') return s.userId !== c.user.id && !s.votes[c.user.id] && solStatus(s) === 'pen';
      return true;
    });
    res.json({ items: list.map((s) => solView(s, c)) });
  }));

  r.post('/solutions', wrap((req, res) => {
    const c = req.ctx;
    const b = parse(z.object({
      brand: z.string().trim().max(80).default(''), model: z.string().trim().max(120).default(''),
      symptom: z.string().trim().min(5).max(300), code: z.string().trim().max(40).default(''),
      steps: z.string().trim().min(20).max(6000), part: z.string().trim().max(300).default(''),
      photo: ImageZ.nullable().optional(), photoPreview: z.string().max(400_000).optional(),
    }), req.body);
    if (!b.brand && !b.model) throw bad('need_device');
    const s: Solution = {
      id: uid(), userId: c.user.id, by: displayName(c), brand: b.brand, model: b.model, symptom: b.symptom, code: b.code,
      steps: b.steps, part: b.part, photo: b.photoPreview || '', photoNote: '', ok: 0, fail: 0, votes: {}, ai: null,
      rewarded: false, date: todayKey(),
    };
    db().sols.unshift(s);
    store.award(c.user, PT.teach, 'pt_teach');
    store.reindex();
    store.save();
    runPrecheck(s, b.photo ?? null, c.lang);
    res.json({ item: solView(s, c), me: meView(c) });
  }));

  r.post('/solutions/:id/vote', wrap((req, res) => {
    const c = req.ctx;
    const s = db().sols.find((x) => x.id === req.params.id);
    if (!s) throw notFound();
    const { v } = parse(z.object({ v: z.enum(['ok', 'fail']) }), req.body);
    if (s.userId === c.user.id || s.votes[c.user.id]) throw bad('cannot_vote');
    s.votes[c.user.id] = v;
    s[v]++;
    store.award(c.user, PT.vote, 'pt_vote');
    checkReward(s, c.lang);
    store.reindex();
    store.save();
    res.json({ item: solView(s, c), me: meView(c) });
  }));

  // Demo only: lets a tester see the verification reward without three other accounts.
  r.post('/solutions/:id/simulate', wrap((req, res) => {
    const c = req.ctx;
    if (!DEMO()) throw forbidden();
    const s = db().sols.find((x) => x.id === req.params.id);
    if (!s) throw notFound();
    if (s.userId !== c.user.id) throw forbidden();
    s.ok += NEED_OK;
    checkReward(s, c.lang);
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

  r.post('/courses', wrap((req, res) => {
    const c = req.ctx;
    if (!PLANS[c.user.plan].teach) throw new HttpError(402, 'plan_required');
    const b = parse(z.object({
      title: z.string().trim().min(1).max(160), cat: z.enum(['svc', 'use']), level: z.enum(['b', 'i', 'a']),
      hours: z.number().int().min(1).max(500), usd: z.number().positive().max(100000),
      desc: z.string().trim().max(3000).default(''), lessonsText: z.string().max(200000),
    }), req.body);
    const lessons = chunkText(b.lessonsText).map((x, i) => ({ t: x.h || `${c.lang === 'tr' ? 'Ders' : 'Lesson'} ${i + 1}`, c: x.t }));
    if (!lessons.length) throw bad('need_lessons');
    const co: Course = {
      id: uid(), ownerId: c.user.id, title: b.title, by: displayName(c), cat: b.cat, level: b.level, hours: b.hours,
      usd: b.usd, rating: 0, n: 0, desc: b.desc, lessons,
    };
    db().courses.unshift(co);
    store.save();
    res.json({ item: courseView(co, c, true) });
  }));

  const sell = (co: Course) => {
    db().sales.unshift({ courseId: co.id, title: co.title, usd: co.usd, fee: (co.usd * db().fee) / 100, sellerId: co.ownerId, date: todayKey() });
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
      throw new HttpError(501, 'billing_not_configured');
    }
    c.user.owned.push(co.id);
    sell(co);
    store.save();
    res.json({ item: courseView(co, c, true), me: meView(c) });
  }));

  r.post('/courses/:id/simulate-sale', wrap((req, res) => {
    const c = req.ctx;
    if (!DEMO()) throw forbidden();
    const co = db().courses.find((x) => x.id === req.params.id);
    if (!co) throw notFound();
    if (co.ownerId !== c.user.id) throw forbidden();
    sell(co);
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
    const q = String(req.query.q || '');
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
      usd: z.number().positive().max(10_000_000), country: z.string().length(2), reg: z.string().trim().max(120).default(''),
      desc: z.string().trim().max(3000).default(''), declared: z.literal(true),
    }), req.body);
    const l: Listing = {
      id: 'm' + uid(), ownerId: c.user.id, cat: b.cat, cond: b.cond, tr: b.name, en: b.name, brand: b.brand, model: b.model,
      year: b.year, stock: b.stock, usd: b.usd, c: b.country.toUpperCase(), reg: b.reg, seller: c.user.name || displayName(c),
      ok: 1, dtr: b.desc, den: b.desc,
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
    db().reports.push({ listingId: l.id, userId: req.ctx.user.id, date: todayKey() });
    store.save();
    res.json({ ok: true });
  }));

  /* ================================================================ developer panel (admin token) */

  const admin = (req: Req) => { if (!req.ctx.isAdmin) throw forbidden('admin_only'); };

  r.get('/admin/overview', wrap((req, res) => {
    admin(req);
    const d = db();
    res.json({
      fee: d.fee,
      sales: d.sales.slice(0, 20),
      totalSales: d.sales.reduce((a, x) => a + x.usd, 0),
      totalFee: d.sales.reduce((a, x) => a + x.fee, 0),
      docs: d.docs.map((x) => ({ id: x.id, title: x.title, brand: x.brand, model: x.model, kind: x.kind, chunks: x.chunks.length })),
      chunkCount: d.docs.reduce((a, x) => a + x.chunks.length, 0),
      solCount: d.sols.length,
      reports: d.reports.length,
    });
  }));

  r.patch('/admin/fee', wrap((req, res) => {
    admin(req);
    const { fee } = parse(z.object({ fee: z.number().int().min(0).max(90) }), req.body);
    db().fee = fee;
    store.save();
    res.json({ fee });
  }));

  r.post('/admin/docs', wrap((req, res) => {
    admin(req);
    const b = parse(z.object({
      title: z.string().trim().min(1).max(200), brand: z.string().trim().max(80).default(''), model: z.string().trim().max(120).default(''),
      text: z.string().min(20).max(2_000_000),
    }), req.body);
    const doc = { id: uid(), title: b.title, brand: b.brand, model: b.model, kind: 'manual' as const, chunks: chunkText(b.text), createdAt: todayKey() };
    db().docs.unshift(doc);
    store.reindex();
    store.save();
    res.json({ id: doc.id, chunks: doc.chunks.length });
  }));

  r.delete('/admin/docs/:id', wrap((req, res) => {
    admin(req);
    db().docs = db().docs.filter((x) => x.id !== req.params.id);
    store.reindex();
    store.save();
    res.json({ ok: true });
  }));

  r.post('/admin/extract-pdf', wrap(async (req, res) => {
    admin(req);
    const { data } = parse(z.object({ data: z.string().min(16).max(40_000_000) }), req.body);
    const parser = new PDFParse({ data: Buffer.from(data, 'base64') });
    try {
      const out = await parser.getText();
      const text = out.text || '';
      if (text.replace(/\s/g, '').length < 40) throw bad('pdf_empty');
      res.json({ text });
    } catch (e) {
      if (e instanceof HttpError) throw e;
      throw bad('pdf_failed');
    } finally {
      await parser.destroy();
    }
  }));

  r.post('/admin/ocr', wrap(async (req, res) => {
    admin(req);
    const { image } = parse(z.object({ image: ImageZ }), req.body);
    res.json({ text: await ai.transcribePage(image) });
  }));

  r.get('/admin/search', wrap((req, res) => {
    admin(req);
    const q = String(req.query.q || '');
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
  if (err && typeof err === 'object' && 'type' in err && (err as { type: string }).type === 'entity.too.large') {
    res.status(413).json({ error: 'prompt_too_large' });
    return;
  }
  console.error(err);
  res.status(500).json({ error: 'generic' });
}
