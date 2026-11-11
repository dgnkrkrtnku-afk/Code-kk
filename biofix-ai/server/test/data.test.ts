// Reading data without AI: specified values, measured values, logs and tables.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { analyzeData, digestText, judgeReading, parseExpected, parseNumber } from '../src/data.js';

test('numbers are read with a decimal comma or a decimal point', () => {
  assert.equal(parseNumber('4,61'), 4.61);
  assert.equal(parseNumber('4.61'), 4.61);
  assert.equal(parseNumber('1.234,5'), 1234.5);
  assert.equal(parseNumber('1,234.5'), 1234.5);
  assert.equal(parseNumber('-12'), -12);
  assert.equal(parseNumber('−0,5'), -0.5, 'a typographic minus sign');
  assert.equal(parseNumber('192.168.1.25'), null);
  assert.equal(parseNumber('abc'), null);
});

test('specified values are understood the way manuals write them', () => {
  const spec = (s: string) => { const e = parseExpected(s); return e && [e.lo, e.hi, e.nominal, e.unit]; };
  const near = (a: (number | string | null)[] | null, b: (number | string | null)[]) => {
    assert.ok(a, 'parsed');
    a!.forEach((v, i) => (typeof v === 'number' && typeof b[i] === 'number' ? assert.ok(Math.abs(v - (b[i] as number)) < 1e-9, `${v} ≈ ${b[i]}`) : assert.equal(v, b[i])));
  };
  // target ± tolerance
  near(spec('5,0 V ± 0,25 V'), [4.75, 5.25, 5, 'V']);
  near(spec('5 V +/- 0.25 V'), [4.75, 5.25, 5, 'V']);
  near(spec('12 V ±5%'), [11.4, 12.6, 12, 'V']);
  near(spec('12 V ± %5'), [11.4, 12.6, 12, 'V']);
  near(spec('5 V ± 250 mV'), [4.75, 5.25, 5, 'V']);
  // ranges
  near(spec('4,75–5,25 V'), [4.75, 5.25, null, 'V']);
  near(spec('4.75 - 5.25 V'), [4.75, 5.25, null, 'V']);
  near(spec('10 ile 12 V arası'), [10, 12, null, 'V']);
  near(spec('between 10 and 12 V'), [10, 12, null, 'V']);
  // limits on one side, in Turkish and English, as symbols and as words
  near(spec('≥ 11,5 V'), [11.5, null, null, 'V']);
  near(spec('en az 2 MΩ'), [2, null, null, 'MΩ']);
  near(spec('at least 2 Mohm'), [2, null, null, 'Mohm']);
  near(spec('11,5 V ve üzeri'), [11.5, null, null, 'V']);
  near(spec('< 0,5 Ω'), [null, 0.5, null, 'Ω']);
  near(spec('max 300 µA'), [null, 300, null, 'µA']);
  near(spec('300 µA altında olmalı'), [null, 300, null, 'µA']);
  near(spec('no more than 0.2 ohm'), [null, 0.2, null, 'ohm']);
  // a target without limits
  near(spec('5 V'), [null, null, 5, 'V']);
  // the "2" of TP2 is part of a name, not the value
  near(spec('TP2 noktasında 5,0 V ± 0,25 V'), [4.75, 5.25, 5, 'V']);
  near(spec('C14 üzerinde en az 3,3 V'), [3.3, null, null, 'V']);
  assert.equal(parseExpected('Konnektör temiz olmalı'), null);
});

test('a measured value is judged against the specification, with honest "cannot tell" answers', () => {
  const j = (spec: string, measured: string) => { const r = judgeReading(spec, measured); return [r.status, r.deviation]; };
  assert.deepEqual(j('5,0 V ± 0,25 V', '4,6 V'), ['low', -8]);
  assert.deepEqual(j('5,0 V ± 0,25 V', '4.6'), ['low', -8], 'no unit typed: the specified unit is assumed');
  assert.deepEqual(j('5,0 V ± 0,25 V', '5,1 V'), ['ok', 2]);
  assert.deepEqual(j('5,0 V ± 0,25 V', '5.4v'), ['high', 8], 'a unit typed in lower case');
  assert.deepEqual(j('5,0 V ± 0,25 V', '4600 mV'), ['low', -8], 'another unit of the same kind is converted');
  assert.deepEqual(j('4,75–5,25 V', '4,75 V'), ['ok', null], 'exactly on the limit is within it');
  assert.deepEqual(j('en az 2 MΩ', '1,5 MΩ'), ['low', -25]);
  assert.deepEqual(j('en az 2 MΩ', '500 kΩ'), ['low', -75]);
  assert.deepEqual(j('en az 2 MΩ', '20 MΩ'), ['ok', null]);
  assert.deepEqual(j('max 300 µA', '350 uA'), ['high', 16.7]);
  assert.deepEqual(j('max 300 µA', '0,2 mA'), ['ok', null]);
  // No limits were specified: the deviation is reported, but nothing is called good or bad.
  assert.deepEqual(j('5 V', '4,6 V'), ['unknown', -8]);
  // Not comparable, or not a number: no verdict.
  assert.deepEqual(j('5,0 V ± 0,25 V', '120 Ω'), ['unknown', null]);
  assert.deepEqual(j('5,0 V ± 0,25 V', 'ölçemedim'), ['unknown', null]);
  assert.deepEqual(j('Konnektör temiz olmalı', '5 V'), ['unknown', null]);
  assert.deepEqual(j('en az 2 MΩ', '3 mohm'), ['unknown', null], '"mohm" could be milli or mega: not guessed');
  // A label typed before the value does not confuse it.
  assert.deepEqual(j('5,0 V ± 0,25 V', 'TP2: 4,6 V'), ['low', -8]);
});

const LOG = `2026-11-10 08:14:02 INFO  PSU 5V rail 4.61V
2026-11-10 08:14:03 ERROR COMM timeout board=PSU
2026-11-10 08:14:03 ERROR E21
2026-11-10 08:20:11 INFO  PSU 5V rail 4.60V
2026-11-10 08:20:12 ERROR COMM timeout board=PSU
2026-11-10 08:20:12 ERROR E21
2026-11-10 08:31:40 WARN  fan speed low rpm=1180
2026-11-10 08:45:09 INFO  PSU 5V rail 4.58V
2026-11-10 08:45:10 ERROR COMM timeout board=PSU
2026-11-10 08:45:10 ERROR E-21
2026-11-10 09:02:10 INFO  PSU 5V rail 4.52V
2026-11-10 09:02:11 ERROR E24 measured at TP2
`;

test('a device log is summarised: time span, error counts, codes, readings and repeated messages', () => {
  const d = analyzeData(LOG)!;
  assert.equal(d.kind, 'log');
  assert.deepEqual([d.lines, d.from, d.to], [12, '2026-11-10 08:14:02', '2026-11-10 09:02:11']);
  assert.deepEqual([d.errors, d.warnings], [7, 1]);
  // "E-21" and "E21" are the same code; TP2 is a test point, not a code.
  assert.deepEqual(d.codes, [
    { code: 'E21', count: 3, first: '2026-11-10 08:14:03', last: '2026-11-10 08:45:10' },
    { code: 'E24', count: 1, first: '2026-11-10 09:02:11', last: '2026-11-10 09:02:11' },
  ]);
  assert.deepEqual(d.series, [{ name: 'PSU 5V rail', unit: 'V', n: 4, min: 4.52, max: 4.61, mean: 4.578, first: 4.61, last: 4.52, trend: 'down' }]);
  assert.deepEqual(d.repeated, [{ text: 'ERROR COMM timeout board=PSU', count: 3 }, { text: 'ERROR E21', count: 3 }]);
  const text = digestText(d);
  assert.match(text, /^log, 12 lines, from 2026-11-10 08:14:02 to 2026-11-10 09:02:11$/m);
  assert.match(text, /codes: E21 ×3 \(first 2026-11-10 08:14:03, last 2026-11-10 08:45:10\); E24 ×1/);
  assert.match(text, /reading "PSU 5V rail" \[V\]: n=4 min=4.52 max=4.61 mean=4.578 first=4.61 last=4.52 trend=down/);
});

test('a code the manual lists is counted wherever it appears; other code-like words only on error lines', () => {
  const log = `08:00:01 status TP2 ok\n08:00:02 status A5 active\n08:00:03 status A5 active\n08:00:04 ERROR Q3 hot\n08:00:05 status TP2 ok`;
  assert.deepEqual(analyzeData(log)?.codes ?? [], [], 'TP2, A5 and Q3 are not codes by themselves');
  const known = analyzeData(log, (c) => c === 'A5')!;
  assert.deepEqual(known.codes, [{ code: 'A5', count: 2, first: '08:00:02', last: '08:00:03' }]);
  // "error 105" and "hata kodu: 12" name codes by number; a time after the word does not.
  const words = analyzeData('10:00:00 error 105 pump stalled\n10:00:05 hata kodu: 12\n10:00:09 error 105 pump stalled\n10:01:00 alarm 10:02 reset')!;
  assert.deepEqual(words.codes.map((c) => [c.code, c.count]), [['105', 2], ['12', 1]]);
});

test('key=value readings and Turkish logs are understood', () => {
  const log = `10.11.2026 08:00:00 T1=36,5C T2=37,1C SpO2: 97 %
10.11.2026 08:05:00 T1=36,9C T2=37,0C SpO2: 96 %
10.11.2026 08:10:00 T1=37,4C T2=37,1C SpO2: 95 %
10.11.2026 08:15:00 T1=38,2C T2=37,0C SpO2: 91 %
10.11.2026 08:15:01 UYARI: SpO2 düşük
10.11.2026 08:15:02 HATA: sensör bağlantısı koptu`;
  const d = analyzeData(log)!;
  assert.deepEqual([d.from, d.to, d.errors, d.warnings], ['10.11.2026 08:00:00', '10.11.2026 08:15:02', 1, 1]);
  const byName = Object.fromEntries(d.series.map((s) => [s.name, s]));
  assert.deepEqual([byName.T1.unit, byName.T1.min, byName.T1.max, byName.T1.trend], ['C', 36.5, 38.2, 'up']);
  assert.deepEqual([byName.T2.n, byName.T2.trend], [4, 'flat']);
  assert.deepEqual([byName.SpO2.unit, byName.SpO2.first, byName.SpO2.last, byName.SpO2.trend], ['%', 97, 91, 'down']);
});

test('a table of measurements is summarised per column, with units from the header', () => {
  const csv = `Zaman;Çıkış gerilimi (V);Akım [mA];Not
2026-11-10 08:00;12,02;410;
2026-11-10 08:10;11,95;415;
2026-11-10 08:20;11,71;440;
2026-11-10 08:30;11,40;470;fan durdu
2026-11-10 08:40;11,12;505;`;
  const d = analyzeData(csv)!;
  assert.equal(d.kind, 'table');
  assert.deepEqual([d.lines, d.from, d.to], [6, '2026-11-10 08:00', '2026-11-10 08:40']);
  assert.deepEqual(d.series, [
    { name: 'Çıkış gerilimi', unit: 'V', n: 5, min: 11.12, max: 12.02, mean: 11.64, first: 12.02, last: 11.12, trend: 'down' },
    { name: 'Akım', unit: 'mA', n: 5, min: 410, max: 505, mean: 448, first: 410, last: 505, trend: 'up' },
  ]);
  // Comma-separated with decimal points, no header, and a row counter that is not a measurement.
  const plain = analyzeData('1,4.61\n2,4.60\n3,4.58\n4,4.52')!;
  assert.deepEqual(plain.series.map((s) => [s.name, s.n, s.min, s.max]), [['#2', 4, 4.52, 4.61]]);
});

test('ordinary prose is not data', () => {
  assert.equal(analyzeData('Cihaz açılmıyor.\nGüç kablosunu değiştirdim ama sonuç alamadım.\nDün de aynı hata vardı.'), null);
  assert.equal(analyzeData('tek satır'), null);
  assert.equal(analyzeData(''), null);
});

test('very large inputs are bounded and odd inputs do not throw', () => {
  const big = Array.from({ length: 60_000 }, (_, i) => `2026-11-10 08:${String(i % 60).padStart(2, '0')}:00 rail=${(4.6 + (i % 7) / 100).toFixed(2)}V`).join('\n');
  const started = Date.now();
  const d = analyzeData(big)!;
  assert.equal(d.lines, 20_000, 'only the first 20 000 lines are read');
  assert.ok(Date.now() - started < 3000, 'fast enough to run before the instant results');
  for (const odd of ['====\n----\n====', ';;;;\n;;;;\n;;;;', '%%%\n$$$\n###', 'a=\nb=\nc=', '1\n2\n3', '\u0000\u0001\n\n\n']) {
    assert.doesNotThrow(() => analyzeData(odd), JSON.stringify(odd));
  }
  for (const odd of ['', '±', '5 ± ', '- - -', '≥', '1e999 V', '5 V ± 0 V']) {
    assert.doesNotThrow(() => { parseExpected(odd); judgeReading(odd, odd); }, JSON.stringify(odd));
  }
});
