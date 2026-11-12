// The calendar the daily allowances follow, and which accounts the weekly clean-up removes.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Store, todayKey } from '../src/store.js';

test('the day changes at midnight in Türkiye, not at midnight UTC', () => {
  // 23:59 on 11 November in Istanbul is 20:59 UTC; one minute later it is the 12th there, still the 11th in UTC.
  assert.equal(todayKey(Date.UTC(2026, 10, 11, 20, 59)), '2026-11-11');
  assert.equal(todayKey(Date.UTC(2026, 10, 11, 21, 0)), '2026-11-12');
  assert.equal(todayKey(Date.UTC(2026, 10, 11, 22, 30)), '2026-11-12');
  assert.match(todayKey(), /^\d{4}-\d{2}-\d{2}$/);
});

test('the daily allowance starts again on a new day', () => {
  const store = new Store(null);
  const u = store.createUser('day@example.com', 'hash', 'Gün Testi');
  u.usage = { d: '2000-01-01', n: 5 };
  assert.equal(store.usedToday(u), 0, 'yesterday\'s count does not carry over');
  u.usage.n = 3;
  assert.equal(store.usedToday(u), 3);
});

test('the clean-up removes only registrations that never verified, never older accounts', () => {
  const store = new Store(null);
  const week = 8 * 24 * 60 * 60 * 1000;
  const old = new Date(Date.now() - week).toISOString();
  const unverified = store.createUser('never@example.com', 'hash', 'Doğrulamayan');
  unverified.createdAt = old;
  const verified = store.createUser('ok@example.com', 'hash', 'Doğrulayan');
  verified.createdAt = old;
  verified.emailVerified = true;
  // An account made before address verification existed has no value at all; it verifies at its next sign-in.
  const legacy = store.createUser('legacy@example.com', 'hash', 'Eski Hesap');
  legacy.createdAt = old;
  delete legacy.emailVerified;
  const recent = store.createUser('new@example.com', 'hash', 'Yeni Kayıt'); // still inside its week

  store.purge();
  const left = Object.values(store.db.users).map((u) => u.email).sort();
  assert.deepEqual(left, ['legacy@example.com', 'new@example.com', 'ok@example.com']);
  assert.ok(recent.emailVerified === false);
});
