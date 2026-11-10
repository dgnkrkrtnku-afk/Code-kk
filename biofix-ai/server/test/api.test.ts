import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import type { AddressInfo } from 'node:net';
import type { Server } from 'node:http';
import { createApp } from '../src/index.js';
import { Store } from '../src/store.js';

delete process.env.ANTHROPIC_API_KEY;
process.env.ADMIN_TOKEN = 'test-admin-token';

let server: Server;
let base = '';
const UA = 'user_aaaaaaaaaaaaaaaa';
const UB = 'user_bbbbbbbbbbbbbbbb';

async function call(method: string, path: string, body?: unknown, user = UA, extra: Record<string, string> = {}) {
  const res = await fetch(base + path, {
    method,
    headers: { 'content-type': 'application/json', 'x-user-id': user, 'x-lang': 'tr', ...extra },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  return { status: res.status, json: (await res.json()) as any };
}

before(async () => {
  server = createApp(new Store(null)).listen(0);
  await new Promise((r) => server.once('listening', r));
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}/api`;
});
after(() => server.close());

test('requires a user id', async () => {
  const r = await fetch(base + '/me');
  assert.equal(r.status, 401);
});

test('new user gets welcome points and free plan', async () => {
  const { json } = await call('GET', '/me');
  assert.equal(json.user.points, 500);
  assert.equal(json.user.plan, 'free');
  assert.equal(json.plan.quota, 5);
  assert.equal(json.ai, false);
});

test('diagnose without AI returns offline sources', async () => {
  const { status, json } = await call('POST', '/diagnose', { q: 'Cihaz açılmıyor güç LED yanıp sönüyor', dev: 'Örnek Hasta Monitörü PM-12' });
  assert.equal(status, 200);
  assert.ok(json.offline.docs.length > 0);
  assert.ok(json.offline.sols.some((s: any) => s.model === 'Hasta Monitörü PM-12'));
});

test('teach, vote and verification reward', async () => {
  const t = await call('POST', '/solutions', { brand: 'Örnek', model: 'X1', symptom: 'Ekran yanmıyor', steps: '1. Fişi çek\n2. Sigortayı ölç ve değiştir' });
  assert.equal(t.status, 200);
  assert.equal(t.json.me.user.points, 520);
  const id = t.json.item.id;
  const self = await call('POST', `/solutions/${id}/vote`, { v: 'ok' });
  assert.equal(self.status, 400);
  const v = await call('POST', `/solutions/${id}/vote`, { v: 'ok' }, UB);
  assert.equal(v.json.me.user.points, 505);
  await call('POST', `/solutions/${id}/simulate`, {});
  const me = await call('GET', '/me');
  assert.equal(me.json.user.points, 620);
  const mine = await call('GET', '/solutions?tab=mine');
  assert.equal(mine.json.items[0].status, 'ver');
});

test('plans gate selling and reviews; points buy a plan', async () => {
  assert.equal((await call('POST', '/listings', {})).status, 402);
  const p = await call('POST', '/me/plan', { plan: 'pro', how: 'pts' });
  assert.equal(p.json.user.plan, 'pro');
  assert.equal(p.json.user.points, 20);
  const l = await call('GET', '/listings?cat=device');
  assert.equal(l.json.items.length, 4);
  const id = l.json.items[0].id;
  const rv = await call('POST', `/listings/${id}/reviews`, { stars: 5, rel: 5, svc: 4, use: 5, val: 4, again: true, months: 'rv_m2', text: 'Uzun süredir sorunsuz.', declared: true });
  assert.equal(rv.json.awarded, 15);
  const d = await call('GET', `/listings/${id}`);
  assert.ok(d.json.reviews.some((r: any) => r.mine));
});

test('courses hide locked lessons until bought', async () => {
  const list = await call('GET', '/courses', undefined, UB);
  const id = list.json.items[0].id;
  const c = await call('GET', `/courses/${id}`, undefined, UB);
  assert.equal(c.json.item.lessons[1].c, null);
  const b = await call('POST', `/courses/${id}/buy`, { how: 'card' }, UB);
  assert.ok(b.json.item.lessons[1].c);
});

test('admin endpoints need the token', async () => {
  assert.equal((await call('GET', '/admin/overview')).status, 403);
  const h = { 'x-admin-token': 'test-admin-token' };
  const add = await call('POST', '/admin/docs', { title: 'Pompa', brand: 'Örnek', model: 'IP-1', text: '# Alarm\nOklüzyon alarmında hattı kontrol edin ve sensörü temizleyin.' }, UA, h);
  assert.equal(add.json.chunks, 1);
  const s = await call('GET', '/admin/search?q=oklüzyon', undefined, UA, h);
  assert.equal(s.json.hits[0].title, 'Pompa');
});
