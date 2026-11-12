import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parsePartialJson } from '../src/partial-json.js';

test('every prefix of a JSON document parses to a growing, never-wrong value', () => {
  const full = {
    summary: 'Güç kartı "5 V" hattında kısa devre \\ olası.\nİkinci satır ✓',
    first_action: 'TP2 noktasını ölç',
    confidence: 'high', grounded: true,
    causes: [{ title: 'Q3 MOSFET', why: 'iki yönde iletim', likelihood: 'high' }, { title: 'C14', why: 'şişmiş', likelihood: 'medium' }],
    steps: [{ title: 'Şebekeden ayır', detail: '2 dk bekle', measure: null, source: 1 }, { title: 'TP2', detail: '', measure: '4.9-5.1 V', source: 2 }],
    parts: [], warnings: ['ESD'], community: [1, 12], n: -3.5e2,
  };
  const text = JSON.stringify(full, null, 1);
  let lastSummary = '';
  let parsedSome = 0;
  for (let i = 0; i <= text.length; i++) {
    const v = parsePartialJson(text.slice(0, i)) as any;
    if (v === undefined) continue;
    parsedSome++;
    assert.equal(typeof v, 'object');
    // Strings only ever grow and are always a prefix of the final value.
    if (typeof v.summary === 'string') {
      assert.ok(full.summary.startsWith(v.summary), `prefix at ${i}: ${JSON.stringify(v.summary)}`);
      assert.ok(v.summary.length >= lastSummary.length);
      lastSummary = v.summary;
    }
    if (v.causes) assert.ok(v.causes.length <= 2);
    for (const c of v.causes ?? []) if (c.title) assert.ok(['Q3 MOSFET', 'C14'].some((t) => t.startsWith(c.title)));
    if (v.confidence !== undefined) assert.ok('high'.startsWith(v.confidence));
    if (v.grounded !== undefined) assert.equal(v.grounded, true);
  }
  assert.ok(parsedSome > text.length * 0.95);
  assert.deepEqual(parsePartialJson(text), full);
});

test('specific cut points', () => {
  assert.equal(parsePartialJson(''), undefined);
  assert.deepEqual(parsePartialJson('{'), {});
  assert.deepEqual(parsePartialJson('{"sum'), {}, 'a half-written member name is dropped');
  assert.deepEqual(parsePartialJson('{"summary"'), {});
  assert.deepEqual(parsePartialJson('{"summary":'), {});
  assert.deepEqual(parsePartialJson('{"summary":"Güç ka'), { summary: 'Güç ka' });
  assert.deepEqual(parsePartialJson('{"summary":"a\\'), { summary: 'a' }, 'dangling backslash');
  assert.deepEqual(parsePartialJson('{"summary":"a\\u00'), { summary: 'a' }, 'half a unicode escape');
  assert.deepEqual(parsePartialJson('{"summary":"a\\\\'), { summary: 'a\\' }, 'a complete escaped backslash is kept');
  assert.deepEqual(parsePartialJson('{"a":"x","grounded":tr'), { a: 'x' });
  assert.deepEqual(parsePartialJson('{"a":"x","n":12'), { a: 'x', n: 12 });
  assert.deepEqual(parsePartialJson('{"a":"x","n":-'), { a: 'x' });
  assert.deepEqual(parsePartialJson('{"steps":[{"title":"T1","detail":"d"},{"title":"T'), { steps: [{ title: 'T1', detail: 'd' }, { title: 'T' }] });
  assert.deepEqual(parsePartialJson('{"steps":[{"title":"T1"},'), { steps: [{ title: 'T1' }] });
  assert.deepEqual(parsePartialJson('{"w":["a","b'), { w: ['a', 'b'] });
});
