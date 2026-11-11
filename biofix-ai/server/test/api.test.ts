import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import type { AddressInfo } from 'node:net';
import type { Server } from 'node:http';
import { createApp } from '../src/index.js';
import type { PlayClient, PlayProductPurchase, PlaySubscription } from '../src/play.js';
import { Store } from '../src/store.js';

delete process.env.ANTHROPIC_API_KEY;
process.env.ADMIN_TOKEN = 'test-admin-token-0123456789abcdef';
process.env.PLAY_RTDN_SECRET = 'rtdn-secret-0123456789';
process.env.AUDIT_LOG = 'off';

/** Stand-in for Google Play: tests put purchases here and the server "verifies" against it. */
const subs = new Map<string, PlaySubscription>();
const products = new Map<string, PlayProductPurchase>();
const acked: string[] = [];
const play: PlayClient & { subs: typeof subs; products: typeof products; acked: string[] } = {
  packageName: 'com.biofix.ai',
  subs, products, acked,
  async getSubscription(token) { return subs.get(token) ?? null; },
  async acknowledgeSubscription(_productId, token) { acked.push(token); },
  async getProduct(productId, token) { return products.get(`${productId}:${token}`) ?? null; },
};

const mails: { to: string; code: string }[] = [];
const mailer = { async sendResetCode(to: string, code: string) { mails.push({ to, code }); } };

let server: Server;
let store: Store;
let base = '';
let A = '';
let B = '';

async function call(method: string, path: string, body?: unknown, token = A, extra: Record<string, string> = {}) {
  const res = await fetch(base + path, {
    method,
    headers: { 'content-type': 'application/json', 'x-lang': 'tr', ...(token ? { authorization: `Bearer ${token}` } : {}), ...extra },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await res.text();
  return { status: res.status, json: (text ? JSON.parse(text) : null) as any };
}
const register = (email: string, name: string, password = 'correct horse') =>
  call('POST', '/auth/register', { email, password, name }, '');
const inDays = (n: number) => new Date(Date.now() + n * 86_400_000).toISOString();
const activeSub = (productId: string, over: Partial<PlaySubscription> = {}): PlaySubscription => ({
  state: 'SUBSCRIPTION_STATE_ACTIVE', productId, basePlanId: 'monthly', expiresAt: inDays(30), autoRenew: true,
  acknowledged: false, accountId: null, orderId: 'GPA.1', ...over,
});

before(async () => {
  store = new Store(null);
  server = createApp(store, { mailer, play }).listen(0);
  await new Promise((r) => server.once('listening', r));
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}/api`;
  A = (await register('ayse@example.com', 'Ayşe K.')).json.token;
  B = (await register('burak@example.com', 'Burak Ş.')).json.token;
});
after(() => server.close());

/* ------------------------------------------------------------------ sign-in */

test('requests without a session are rejected', async () => {
  assert.equal((await call('GET', '/me', undefined, '')).status, 401);
  assert.equal((await call('GET', '/me', undefined, 'not-a-real-token')).status, 401);
});

test('register validates input and refuses duplicates', async () => {
  assert.equal((await register('not-an-email', 'Xx')).json.error, 'invalid_email');
  assert.equal((await register('new@example.com', 'Xx', 'short')).json.error, 'weak_password');
  const dup = await register('AYSE@example.com ', 'Someone');
  assert.equal(dup.status, 409);
  assert.equal(dup.json.error, 'email_taken');
});

test('new account gets welcome points, free plan, and no stored secrets in the profile', async () => {
  const { json } = await call('GET', '/me');
  assert.equal(json.user.email, 'ayse@example.com');
  assert.equal(json.user.points, 500);
  assert.equal(json.user.plan, 'free');
  assert.equal(json.plan.quota, 5);
  assert.equal(json.billing.google, true);
  assert.ok(!JSON.stringify(json).includes('scrypt'));
  const stored = Object.values(store.db.users).find((u) => u.email === 'ayse@example.com')!;
  assert.match(stored.passHash, /^scrypt\$/);
  assert.ok(!JSON.stringify(store.db.sessions).includes(A), 'session tokens are stored hashed');
});

test('login works with the right password only, and logout ends the session', async () => {
  const wrong = await call('POST', '/auth/login', { email: 'ayse@example.com', password: 'nope nope' }, '');
  assert.equal(wrong.status, 401);
  const unknown = await call('POST', '/auth/login', { email: 'nobody@example.com', password: 'correct horse' }, '');
  assert.equal(unknown.json.error, 'bad_credentials');
  const ok = await call('POST', '/auth/login', { email: ' Ayse@Example.com', password: 'correct horse' }, '');
  assert.equal(ok.status, 200);
  const t = ok.json.token;
  assert.equal((await call('GET', '/me', undefined, t)).status, 200);
  await call('POST', '/auth/logout', {}, t);
  assert.equal((await call('GET', '/me', undefined, t)).status, 401);
});

test('repeated wrong passwords are rate limited', async () => {
  await register('lock@example.com', 'Lock Test');
  let last = 0;
  for (let i = 0; i < 12; i++) last = (await call('POST', '/auth/login', { email: 'lock@example.com', password: 'wrong-pass' }, '')).status;
  assert.equal(last, 429);
});

test('password reset by e-mailed code signs out old sessions', async () => {
  const old = (await register('reset@example.com', 'Reset Me')).json.token;
  assert.equal((await call('POST', '/auth/forgot', { email: 'nobody@example.com' }, '')).status, 200);
  assert.equal(mails.length, 0, 'no mail for unknown addresses');
  await call('POST', '/auth/forgot', { email: 'reset@example.com' }, '');
  await new Promise((r) => setTimeout(r, 20));
  const { code } = mails.at(-1)!;
  const badCode = code === '000000' ? '111111' : '000000';
  assert.equal((await call('POST', '/auth/reset', { email: 'reset@example.com', code: badCode, password: 'brand new pass' }, '')).json.error, 'bad_code');
  const done = await call('POST', '/auth/reset', { email: 'reset@example.com', code, password: 'brand new pass' }, '');
  assert.equal(done.status, 200);
  assert.equal((await call('GET', '/me', undefined, old)).status, 401);
  assert.equal((await call('POST', '/auth/reset', { email: 'reset@example.com', code, password: 'another pass 1' }, '')).json.error, 'bad_code');
  assert.equal((await call('POST', '/auth/login', { email: 'reset@example.com', password: 'brand new pass' }, '')).status, 200);
});

test('change password needs the current one; delete account removes the user and their content', async () => {
  const t = (await register('gone@example.com', 'Gone Soon')).json.token;
  assert.equal((await call('POST', '/me/password', { current: 'wrong wrong', next: 'new password 1' }, t)).status, 403);
  assert.equal((await call('POST', '/me/password', { current: 'correct horse', next: 'new password 1' }, t)).status, 200);
  await call('POST', '/solutions', { brand: 'Örnek', model: 'Silinecek', symptom: 'Deneme arızası', steps: '1. Aç\n2. Kapat ve yeniden dene' }, t);
  assert.equal((await call('POST', '/me/delete', { password: 'correct horse' }, t)).status, 403);
  assert.equal((await call('POST', '/me/delete', { password: 'new password 1' }, t)).status, 200);
  assert.equal((await call('GET', '/me', undefined, t)).status, 401);
  assert.equal((await call('POST', '/auth/login', { email: 'gone@example.com', password: 'new password 1' }, '')).status, 401);
  const all = await call('GET', '/solutions?tab=all&q=Silinecek');
  assert.equal(all.json.items.length, 0);
});

/* ------------------------------------------------------------------ app features */

test('diagnose without AI returns offline sources', async () => {
  const { status, json } = await call('POST', '/diagnose', { q: 'Cihaz açılmıyor güç LED yanıp sönüyor', dev: 'Örnek Hasta Monitörü PM-12' });
  assert.equal(status, 200);
  assert.ok(json.offline.docs.length > 0);
  assert.ok(json.offline.sols.some((s: any) => s.model === 'Hasta Monitörü PM-12'));
});

test('teach, vote and verification reward', async () => {
  const t = await call('POST', '/solutions', { brand: 'Örnek', model: 'X1', symptom: 'Ekran yanmıyor', steps: '1. Fişi çek\n2. Sigortayı ölç ve değiştir' });
  assert.equal(t.status, 200);
  assert.equal(t.json.item.by, 'Ayşe K.');
  assert.equal(t.json.me.user.points, 520);
  const id = t.json.item.id;
  assert.equal((await call('POST', `/solutions/${id}/vote`, { v: 'ok' })).status, 400);
  const v = await call('POST', `/solutions/${id}/vote`, { v: 'ok' }, B);
  assert.equal(v.json.me.user.points, 505);
  await call('POST', `/solutions/${id}/simulate`, {});
  assert.equal((await call('GET', '/me')).json.user.points, 620);
  assert.equal((await call('GET', '/solutions?tab=mine')).json.items[0].status, 'ver');
});

test('plans gate selling and reviews; a plan bought with points has an end date', async () => {
  assert.equal((await call('POST', '/listings', {})).status, 402);
  const p = await call('POST', '/me/plan', { plan: 'pro', how: 'pts' });
  assert.equal(p.json.user.plan, 'pro');
  assert.equal(p.json.user.points, 20);
  const until = Date.parse(p.json.user.planUntil);
  assert.ok(until > Date.now() + 27 * 86_400_000 && until < Date.now() + 32 * 86_400_000);
  const l = await call('GET', '/listings?cat=device');
  assert.equal(l.json.items.length, 4);
  const id = l.json.items[0].id;
  const rv = await call('POST', `/listings/${id}/reviews`, { stars: 5, rel: 5, svc: 4, use: 5, val: 4, again: true, months: 'rv_m2', text: 'Uzun süredir sorunsuz.', declared: true });
  assert.equal(rv.json.awarded, 15);
  assert.ok((await call('GET', `/listings/${id}`)).json.reviews.some((r: any) => r.mine));
});

test('a plan that ran out falls back to free', async () => {
  const u = Object.values(store.db.users).find((x) => x.email === 'ayse@example.com')!;
  u.planUntil = inDays(-1);
  assert.equal((await call('GET', '/me')).json.user.plan, 'free');
});

test('courses hide locked lessons until bought', async () => {
  const id = (await call('GET', '/courses', undefined, B)).json.items[0].id;
  assert.equal((await call('GET', `/courses/${id}`, undefined, B)).json.item.lessons[1].c, null);
  const b = await call('POST', `/courses/${id}/buy`, { how: 'card' }, B);
  assert.ok(b.json.item.lessons[1].c);
});

test('admin endpoints need the token', async () => {
  assert.equal((await call('GET', '/admin/overview')).status, 403);
  const h = { 'x-admin-token': 'test-admin-token-0123456789abcdef' };
  const add = await call('POST', '/admin/docs', { title: 'Pompa', brand: 'Örnek', model: 'IP-1', text: '# Alarm\nOklüzyon alarmında hattı kontrol edin ve sensörü temizleyin.' }, A, h);
  assert.equal(add.json.chunks, 1);
  assert.equal((await call('GET', '/admin/search?q=oklüzyon', undefined, A, h)).json.hits[0].title, 'Pompa');
});

/* ------------------------------------------------------------------ Google Play */

test('a verified Play subscription activates the plan and is acknowledged', async () => {
  play.subs.set('tok-pro-0001', activeSub('biofix_pro'));
  const r = await call('POST', '/billing/google/subscription', { productId: 'biofix_pro', purchaseToken: 'tok-pro-0001' });
  assert.equal(r.status, 200);
  assert.equal(r.json.me.user.plan, 'pro');
  assert.equal(r.json.me.user.sub.autoRenew, true);
  assert.ok(!JSON.stringify(r.json).includes('tok-pro-0001'), 'the purchase token is not sent back to the app');
  assert.deepEqual(play.acked, ['tok-pro-0001']);
  // While a Play subscription is active, the plan can't be switched with points or to free here.
  assert.equal((await call('POST', '/me/plan', { plan: 'free', how: 'card' })).json.error, 'manage_in_play');
});

test('fake, mismatched, pending and re-used purchases are refused', async () => {
  const post = (b: unknown, t = B) => call('POST', '/billing/google/subscription', b, t);
  assert.equal((await post({ productId: 'biofix_pro', purchaseToken: 'made-up-token' })).json.error, 'purchase_invalid');
  assert.equal((await post({ productId: 'biofix_org', purchaseToken: 'tok-pro-0001' })).status, 409, 'token belongs to another account');
  play.subs.set('tok-biz-0002', activeSub('biofix_biz'));
  assert.equal((await post({ productId: 'biofix_org', purchaseToken: 'tok-biz-0002' })).json.error, 'purchase_invalid', 'product must match');
  play.subs.set('tok-pend-003', activeSub('biofix_pro', { state: 'SUBSCRIPTION_STATE_PENDING' }));
  assert.equal((await post({ productId: 'biofix_pro', purchaseToken: 'tok-pend-003' })).json.error, 'purchase_pending');
  play.subs.set('tok-other-04', activeSub('biofix_pro', { accountId: 'someone-else' }));
  assert.equal((await post({ productId: 'biofix_pro', purchaseToken: 'tok-other-04' })).json.error, 'purchase_in_use');
  assert.equal((await call('GET', '/me', undefined, B)).json.user.plan, 'free');
});

test('an expired or refunded subscription downgrades on the next request and via RTDN', async () => {
  // Renewal: Google reports a later expiry → plan stays.
  const u = Object.values(store.db.users).find((x) => x.email === 'ayse@example.com')!;
  u.sub!.expiresAt = inDays(-1);
  play.subs.set('tok-pro-0001', activeSub('biofix_pro', { expiresAt: inDays(29), acknowledged: true }));
  assert.equal((await call('GET', '/me')).json.user.plan, 'pro');
  // Cancelled but still paid for: access continues.
  play.subs.set('tok-pro-0001', activeSub('biofix_pro', { state: 'SUBSCRIPTION_STATE_CANCELED', autoRenew: false, expiresAt: inDays(5) }));
  const note = (n: unknown) => fetch(`${base}/billing/rtdn?token=rtdn-secret-0123456789`, {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ message: { data: Buffer.from(JSON.stringify(n)).toString('base64') } }),
  });
  assert.equal((await note({ subscriptionNotification: { purchaseToken: 'tok-pro-0001' } })).status, 204);
  let me = (await call('GET', '/me')).json;
  assert.equal(me.user.plan, 'pro');
  assert.equal(me.user.sub.autoRenew, false);
  // Expired: Google says so → free.
  play.subs.set('tok-pro-0001', activeSub('biofix_pro', { state: 'SUBSCRIPTION_STATE_EXPIRED', expiresAt: inDays(-1) }));
  await note({ subscriptionNotification: { purchaseToken: 'tok-pro-0001' } });
  me = (await call('GET', '/me')).json;
  assert.equal(me.user.plan, 'free');
  assert.equal(me.user.sub, null);
  // The notification endpoint needs its secret.
  const noSecret = await fetch(`${base}/billing/rtdn?token=wrong`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{}' });
  assert.equal(noSecret.status, 403);
});

test('point packs are credited exactly once and clawed back on refund', async () => {
  const before = (await call('GET', '/me', undefined, B)).json.user.points;
  play.products.set('biofix_points_1500:tok-pts-0001', { purchased: true, orderId: 'GPA.2', accountId: null, quantity: 1 });
  const body = { productId: 'biofix_points_1500', purchaseToken: 'tok-pts-0001' };
  const [r1, r2] = await Promise.all([call('POST', '/billing/google/points', body, B), call('POST', '/billing/google/points', body, B)]);
  assert.deepEqual([r1.json.credited, r2.json.credited].sort(), [0, 1500]);
  assert.equal((await call('POST', '/billing/google/points', body, B)).json.credited, 0);
  assert.equal((await call('GET', '/me', undefined, B)).json.user.points, before + 1500);
  assert.equal((await call('POST', '/billing/google/points', body, A)).status, 409, 'another account cannot reuse the token');
  assert.equal((await call('POST', '/billing/google/points', { productId: 'biofix_points_500', purchaseToken: 'tok-nope-001' }, B)).json.error, 'purchase_invalid');
  play.products.set('biofix_points_500:tok-pend-0002', { purchased: false, orderId: '', accountId: null, quantity: 1 });
  assert.equal((await call('POST', '/billing/google/points', { productId: 'biofix_points_500', purchaseToken: 'tok-pend-0002' }, B)).json.error, 'purchase_pending');
  // Refund → voided purchase notification → points are taken back once.
  const voided = { message: { data: Buffer.from(JSON.stringify({ voidedPurchaseNotification: { purchaseToken: 'tok-pts-0001' } })).toString('base64') } };
  for (let i = 0; i < 2; i++) {
    await fetch(`${base}/billing/rtdn?token=rtdn-secret-0123456789`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(voided) });
  }
  assert.equal((await call('GET', '/me', undefined, B)).json.user.points, before);
});

test('demo payments can be switched off', async () => {
  process.env.DEMO_PAYMENTS = 'false';
  try {
    assert.equal((await call('POST', '/me/plan', { plan: 'pro', how: 'card' }, B)).json.error, 'use_play');
    assert.equal((await call('POST', '/billing/demo/points', { productId: 'biofix_points_500' }, B)).status, 403);
    const id = (await call('GET', '/courses', undefined, B)).json.items[1].id;
    assert.equal((await call('POST', `/courses/${id}/buy`, { how: 'card' }, B)).json.error, 'use_points');
    assert.equal((await call('GET', '/me', undefined, B)).json.demoPayments, false);
  } finally {
    delete process.env.DEMO_PAYMENTS;
  }
  const demo = await call('POST', '/billing/demo/points', { productId: 'biofix_points_500' }, B);
  assert.equal(demo.json.credited, 500);
});
