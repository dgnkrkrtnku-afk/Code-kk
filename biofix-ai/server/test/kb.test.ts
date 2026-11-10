import { test } from 'node:test';
import assert from 'node:assert/strict';
import { chunkText, KnowledgeIndex, solStatus, toks } from '../src/kb.js';
import { SEED_DOCS } from '../src/seed.js';
import type { Doc } from '../src/types.js';

test('chunkText splits on markdown headings', () => {
  const c = chunkText('# A\nbir\n\n# B\niki');
  assert.deepEqual(c.map((x) => x.h), ['A', 'B']);
});

test('toks lowercases Turkish and stems long words', () => {
  assert.deepEqual(toks('Şarj SÜRESİ uzadı ve'), ['şarj', 'süresi', 'uzadı']);
});

test('solStatus thresholds', () => {
  assert.equal(solStatus({ ok: 3, fail: 0 }), 'ver');
  assert.equal(solStatus({ ok: 3, fail: 2 }), 'pen');
  assert.equal(solStatus({ ok: 0, fail: 3 }), 'rej');
});

test('search finds the right manual section', () => {
  const docs: Doc[] = SEED_DOCS.map((d, i) => ({ id: String(i), title: d.title, brand: d.brand, model: d.model, kind: 'sample', chunks: chunkText(d.text), createdAt: '' }));
  const ix = new KnowledgeIndex();
  ix.rebuild(docs, []);
  const hits = ix.search('defibrilatör şarj süresi uzadı', '', 3, 'doc');
  assert.ok(hits.length > 0);
  assert.match(hits[0].doc.chunks[hits[0].ci].h, /Şarj süresi/);
});
