// Reading data without any AI: what a device log or a table of measurements contains (how many
// errors, which codes, how each reading moved), and whether a measured value is within the value a
// manual specifies. Everything here is exact arithmetic, so it is instant and can be trusted as is.
import { fold, normCode } from './kb.js';

/* ------------------------------------------------------------------ numbers and units */

/** "4,61" and "4.61" are the same number; "1.234,5" and "1,234.5" are thousands-separated. */
export function parseNumber(raw: string): number | null {
  let s = raw.trim().replace(/\s/g, '').replace(/−/g, '-');
  if (!/^[-+]?\d[\d.,]*$/.test(s)) return null;
  const comma = s.lastIndexOf(',');
  const dot = s.lastIndexOf('.');
  if (comma >= 0 && dot >= 0) s = comma > dot ? s.replace(/\./g, '').replace(',', '.') : s.replace(/,/g, '');
  else if (comma >= 0) s = s.replace(',', '.');
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}

/** Units that can be converted into each other: [spelling, family, factor to the family's base unit]. */
const OHM = 'Ω';
const MICRO = ['µ', 'μ', 'u']; // micro sign, Greek mu, and the "u" people type instead
const UNITS: [string, string, number][] = [
  ['mV', 'V', 1e-3], ['V', 'V', 1], ['kV', 'V', 1e3],
  ...MICRO.map((m): [string, string, number] => [`${m}A`, 'A', 1e-6]), ['mA', 'A', 1e-3], ['A', 'A', 1],
  [`m${OHM}`, OHM, 1e-3], ['mOhm', OHM, 1e-3], [OHM, OHM, 1], ['ohm', OHM, 1], ['Ohm', OHM, 1],
  [`k${OHM}`, OHM, 1e3], ['kohm', OHM, 1e3], ['kOhm', OHM, 1e3], [`M${OHM}`, OHM, 1e6], ['Mohm', OHM, 1e6], ['MOhm', OHM, 1e6],
  ['Hz', 'Hz', 1], ['kHz', 'Hz', 1e3], ['MHz', 'Hz', 1e6],
  ['mW', 'W', 1e-3], ['W', 'W', 1], ['kW', 'W', 1e3],
  ['ms', 's', 1e-3], ['s', 's', 1], ['sn', 's', 1],
  ['Pa', 'Pa', 1], ['kPa', 'Pa', 1e3], ['mbar', 'Pa', 100], ['bar', 'Pa', 1e5],
  ['mmHg', 'mmHg', 1], ['cmH2O', 'cmH2O', 1], ['psi', 'psi', 1],
  ['°C', '°C', 1], ['C', '°C', 1], ['%', '%', 1], ['J', 'J', 1], ['bpm', 'bpm', 1], ['rpm', 'rpm', 1],
  ['L/min', 'L/min', 1], ['l/min', 'L/min', 1], ['mL/h', 'mL/h', 1], ['ml/h', 'mL/h', 1],
  ...MICRO.map((m): [string, string, number] => [`${m}F`, 'F', 1e-6]), ['nF', 'F', 1e-9], ['pF', 'F', 1e-12],
];
const UNIT_BY_NAME = new Map(UNITS.map((u) => [u[0], u]));
// Longest spellings first, so "mV" is not read as "m" + "V" and "kohm" not as "k".
const UNIT_RE = UNITS.map((u) => u[0]).sort((a, b) => b.length - a.length).map((u) => u.replace(/[/%]/g, '\\$&')).join('|');
/** A number that stands on its own: the "2" of "TP2" or the "14" of "C14" is part of a name. */
const NUM = '(?<![\\w.,])[-+−]?\\d+(?:[.,]\\d+)*';
/** The ohm sign and the Greek letter omega look the same; make them the same character. */
const canon = (s: string) => s.normalize('NFC').replace(/\s+/g, ' ').replace(/−/g, '-').trim();

interface Quantity { value: number; unit: string; family: string; base: number }

function quantity(num: string, unit: string): Quantity | null {
  const value = parseNumber(num);
  if (value === null) return null;
  const u = UNIT_BY_NAME.get(unit);
  return u ? { value, unit: u[0], family: u[1], base: value * u[2] } : { value, unit, family: unit, base: value };
}

/** The unit a technician typed after a reading, read leniently ("4.6v", "250 mv") within the kind of unit that is expected. */
function typedUnit(typed: string, expectedUnit: string): string | null {
  if (!typed) return expectedUnit;
  if (UNIT_BY_NAME.has(typed)) return typed;
  const family = UNIT_BY_NAME.get(expectedUnit)?.[1];
  const loose = UNITS.filter((u) => (!family || u[1] === family) && u[0].toLowerCase() === typed.toLowerCase());
  // "mohm" could be a thousandth or a million ohms: not ours to guess.
  return new Set(loose.map((u) => u[2])).size === 1 ? loose[0][0] : null;
}

/* ------------------------------------------------------------------ a reading against its specification */

export interface Expected {
  /** Lowest and highest acceptable value in the unit below; null when that side is open. */
  lo: number | null;
  hi: number | null;
  /** The stated target value, when the specification names one. */
  nominal: number | null;
  unit: string;
}


/**
 * Understand a specified value as manuals write it: "5,0 V ± 0,25 V", "12 V ±5%", "4,75–5,25 V",
 * "≥ 11,5 V", "en az 2 MΩ", "< 0,5 Ω", "max 300 µA". A bare "5 V" gives a target without limits.
 */
export function parseExpected(spec: string): Expected | null {
  const s = canon(spec);
  const f = fold(s);
  let m: RegExpExecArray | null;

  // target ± tolerance (absolute, or a percentage)
  m = new RegExp(`(${NUM})\\s*(${UNIT_RE})?\\s*(?:±|\\+/-|\\+-)\\s*(%)?\\s*(${NUM})\\s*(%|${UNIT_RE})?`).exec(s);
  if (m) {
    const unit = m[2] || (m[5] && m[5] !== '%' ? m[5] : '') || '';
    const nominal = parseNumber(m[1]);
    const tol = parseNumber(m[4]);
    if (nominal !== null && tol !== null) {
      const percent = !!m[3] || m[5] === '%';
      let delta = percent ? (Math.abs(nominal) * tol) / 100 : tol;
      // "5 V ± 250 mV": the tolerance may be given in a smaller unit of the same kind.
      if (!percent && m[2] && m[5] && m[5] !== m[2]) {
        const a = quantity(m[1], m[2]);
        const b = quantity(m[4], m[5]);
        if (a && b && a.family === b.family) delta = (b.base / a.base) * Math.abs(nominal);
      }
      return { lo: nominal - delta, hi: nominal + delta, nominal, unit };
    }
  }

  // a range: "4,75–5,25 V", "10 - 12 V", "10...12 V", "10 ile 12 V arası", "between 10 and 12 V"
  m = new RegExp(`(${NUM})\\s*(${UNIT_RE})?\\s*(?:–|—|\\.{2,3}|…|\\s-\\s|-(?=\\d)|\\sile\\s|\\sto\\s|\\sand\\s|\\sve\\s)\\s*(${NUM})\\s*(${UNIT_RE})?`).exec(s);
  if (m) {
    const lo = parseNumber(m[1]);
    const hi = parseNumber(m[3]);
    const unit = m[4] || m[2] || '';
    if (lo !== null && hi !== null && lo < hi && (!m[2] || !m[4] || m[2] === m[4])) return { lo, hi, nominal: null, unit };
  }

  // one-sided limits
  const one = new RegExp(`(${NUM})\\s*(${UNIT_RE})(?![\\w/])`).exec(s) ?? new RegExp(`(${NUM})()`).exec(s);
  if (!one) return null;
  const value = parseNumber(one[1]);
  if (value === null) return null;
  const unit = one[2] || '';
  const before = f.slice(0, f.indexOf(fold(one[0])) >= 0 ? f.indexOf(fold(one[0])) : 0);
  const after = f.slice(before.length + one[0].length);
  const atLeast = /(≥|>=|=>|>|en az|min\.?|minimum|at least|no less than|not less than|asgari)\s*$/.test(before)
    || /^\s*(ve uzeri|ve ustu|uzeri|ustu|uzerinde|ustunde|den buyuk|dan buyuk|den fazla|dan fazla|or more|or higher|or above|and above|minimum)/.test(after);
  const atMost = /(≤|<=|=<|<|en fazla|en cok|max\.?|maks\.?|maksimum|maximum|at most|no more than|not more than|up to|azami)\s*$/.test(before)
    || /^\s*(ve alti|alti|altinda|den kucuk|dan kucuk|den az|dan az|or less|or lower|or below|and below|maksimum|maximum)/.test(after);
  if (atLeast && !atMost) return { lo: value, hi: null, nominal: null, unit };
  if (atMost && !atLeast) return { lo: null, hi: value, nominal: null, unit };
  return { lo: null, hi: null, nominal: value, unit };
}

export type ReadingStatus = 'ok' | 'low' | 'high' | 'unknown';
export interface Reading {
  /** What the technician entered, tidied. */
  value: string;
  status: ReadingStatus;
  /** Distance from the target (or from the limit that was missed), in percent; null when it cannot be worked out. */
  deviation: number | null;
}

/**
 * Compare what was measured with what the manual specifies. "unknown" means the comparison cannot be
 * made honestly: no limits were specified, the units differ in kind, or the entry is not a number.
 */
export function judgeReading(spec: string, measured: string): Reading {
  const entered = canon(measured).slice(0, 60);
  const unknown: Reading = { value: entered, status: 'unknown', deviation: null };
  const exp = parseExpected(spec);
  const m = new RegExp(`(${NUM})\\s*([A-Za-zµμΩ°%/]+\\d?[A-Za-z]*)?`).exec(entered);
  if (!exp || !m) return unknown;
  const unit = typedUnit(m[2] ?? '', exp.unit);
  if (unit === null) return unknown;
  const got = quantity(m[1], unit);
  if (!got) return unknown;
  // Bring the measured value into the specification's unit ("4600 mV" against "5 V ± 0,25 V").
  let value = got.value;
  if (unit && exp.unit && unit !== exp.unit) {
    const want = quantity('1', exp.unit);
    if (!want || want.family !== got.family) return unknown;
    value = got.base / want.base;
  }
  const pct = (ref: number) => (ref === 0 ? null : Math.round(((value - ref) / Math.abs(ref)) * 1000) / 10);
  if (exp.lo === null && exp.hi === null) return { value: entered, status: 'unknown', deviation: exp.nominal === null ? null : pct(exp.nominal) };
  // Rounding in the manual ("4,75") must not fail a reading that sits exactly on the limit.
  const eps = 1e-9 * Math.max(1, Math.abs(value));
  if (exp.lo !== null && value < exp.lo - eps) return { value: entered, status: 'low', deviation: pct(exp.nominal ?? exp.lo) };
  if (exp.hi !== null && value > exp.hi + eps) return { value: entered, status: 'high', deviation: pct(exp.nominal ?? exp.hi) };
  return { value: entered, status: 'ok', deviation: exp.nominal === null ? null : pct(exp.nominal) };
}

/* ------------------------------------------------------------------ logs and tables */

export interface Series {
  name: string;
  unit: string;
  n: number;
  min: number;
  max: number;
  mean: number;
  first: number;
  last: number;
  /** How the second half compares with the first. */
  trend: 'up' | 'down' | 'flat';
}

export interface CodeCount {
  /** Normalised like the code tables ("E-21" → "E21"). */
  code: string;
  count: number;
  /** When it first and last appeared, as written in the file ('' when lines carry no time). */
  first: string;
  last: string;
}

export interface DataDigest {
  kind: 'log' | 'table';
  lines: number;
  /** Earliest and latest time stamps, as written. */
  from: string;
  to: string;
  errors: number;
  warnings: number;
  codes: CodeCount[];
  series: Series[];
  /** The fault messages that repeat most, with numbers blanked so that repeats group together. */
  repeated: { text: string; count: number }[];
}

const TIME = /\d{4}-\d{2}-\d{2}[T ]\d{2}:\d{2}(?::\d{2})?(?:[.,]\d+)?|\d{1,2}[./]\d{1,2}[./]\d{2,4}[ T]\d{1,2}:\d{2}(?::\d{2})?|\b\d{1,2}:\d{2}:\d{2}\b/;
const ERROR_WORD = /\b(error|err|fail|failed|failure|fatal|critical|alarm|fault|hata|hatasi|ariza|arizasi|kritik)\b/;
const WARN_WORD = /\b(warn|warning|caution|uyari|uyarisi|dikkat)\b/;
const CODE_TOKEN = /\b([A-Z]{1,4}-?\d{1,4}[A-Z]?)\b/g;
// "error 105", "hata kodu: 12" - but not the start of a time or a decimal ("error 08:14", "alarm 3.5").
const CODE_WORD = /\b(?:error|err|hata|alarm|kod|kodu|code|fault|ariza)\s*(?:no\.?\s*|[#:=]\s*)?(\d{1,4})\b(?![:.,/-]\d)/g;
const MAX_LINES = 20_000;

const round = (n: number) => (Math.abs(n) >= 100 ? Math.round(n * 10) / 10 : Math.round(n * 1000) / 1000);

function summarise(name: string, unit: string, values: number[]): Series {
  const n = values.length;
  const mean = values.reduce((a, b) => a + b, 0) / n;
  const half = Math.floor(n / 2);
  const avg = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / (xs.length || 1);
  const before = avg(values.slice(0, half || 1));
  const after = avg(values.slice(n - (half || 1)));
  const spread = Math.max(...values) - Math.min(...values);
  // A move counts as a trend when it is more than a fifth of the whole spread and more than 1% of the level.
  const moved = after - before;
  const trend = n >= 3 && Math.abs(moved) > spread * 0.2 && Math.abs(moved) > Math.abs(mean) * 0.01 ? (moved > 0 ? 'up' : 'down') : 'flat';
  return { name, unit, n, min: round(Math.min(...values)), max: round(Math.max(...values)), mean: round(mean), first: round(values[0]), last: round(values[n - 1]), trend };
}

/** Split a line of a table. Decimal commas survive when the separator is ";" or a tab. */
function cells(line: string, sep: string): string[] {
  return line.split(sep).map((c) => c.trim().replace(/^"(.*)"$/, '$1'));
}

function tableSeparator(lines: string[]): string | null {
  const sample = lines.slice(0, 30);
  for (const sep of ['\t', ';', '|', ',']) {
    const counts = sample.map((l) => l.split(sep).length - 1);
    const typical = counts[Math.floor(counts.length / 2)];
    if (typical >= 1 && counts.filter((c) => c === typical).length >= sample.length * 0.8) return sep;
  }
  return null;
}

function readTable(lines: string[], sep: string): { series: Series[]; from: string; to: string } | null {
  const rows = lines.map((l) => cells(l, sep));
  const width = rows[0].length;
  const numeric = (c: string) => parseNumber(c.replace(new RegExp(`\\s*(${UNIT_RE})$`), '')) !== null;
  const hasHeader = rows[0].filter((c) => c && !numeric(c) && !TIME.test(c)).length >= Math.max(1, width / 2);
  const body = hasHeader ? rows.slice(1) : rows;
  if (body.length < 2) return null;
  const series: Series[] = [];
  let from = '';
  let to = '';
  for (let col = 0; col < width; col++) {
    const column = body.map((r) => r[col] ?? '');
    const times = column.filter((c) => TIME.test(c));
    if (!from && times.length >= body.length * 0.8) { from = times[0]; to = times[times.length - 1]; continue; }
    const values = column.map((c) => parseNumber(c.replace(new RegExp(`\\s*(${UNIT_RE})$`), ''))).filter((v): v is number => v !== null);
    if (values.length < 2 || values.length < body.length * 0.7) continue;
    // "Voltage (V)", "Sıcaklık [°C]", "5V rail, V" → name and unit.
    const head = hasHeader ? rows[0][col] : `#${col + 1}`;
    const unit = new RegExp(`[\\[(,]\\s*(${UNIT_RE})\\s*[\\])]?\\s*$`).exec(head)?.[1]
      ?? new RegExp(`(${UNIT_RE})$`).exec(column.find((c) => c) ?? '')?.[1] ?? '';
    const name = head.replace(/\s*[\[(,][^\[(,]*$/, '').trim() || head;
    // A column that only counts rows (1, 2, 3…) is an index, not a measurement.
    if (values.every((v, i) => i === 0 || v - values[i - 1] === 1) && /^(#\d*|no\.?|nr\.?|sira|index|id)?$/i.test(fold(name))) continue;
    series.push(summarise(name.slice(0, 40), unit, values));
  }
  return series.length ? { series: series.slice(0, 8), from, to } : null;
}

/**
 * What a log or a table of readings contains. `isCode` says whether a code-like word ("E21", "TP2")
 * really is an error code of the device; without it only words on error lines count as codes.
 * Returns null for ordinary prose, which has nothing to count.
 */
export function analyzeData(text: string, isCode: (code: string) => boolean = () => false): DataDigest | null {
  const lines = text.split(/\r?\n/).map((l) => l.trim()).filter(Boolean).slice(0, MAX_LINES);
  if (lines.length < 3) return null;

  const sep = tableSeparator(lines);
  const table = sep ? readTable(lines, sep) : null;

  let from = table?.from ?? '';
  let to = table?.to ?? '';
  let errors = 0;
  let warnings = 0;
  const codes = new Map<string, CodeCount>();
  const readings = new Map<string, { name: string; unit: string; values: number[] }>();
  const messages = new Map<string, { text: string; count: number }>();
  const pair = new RegExp(`([A-Za-zÇĞİÖŞÜçğıöşü_][\\wÇĞİÖŞÜçğıöşü .%/-]{0,28}?)\\s*[=:]\\s*(${NUM})\\s*(${UNIT_RE})?(?![\\w.:])`, 'g');
  const tail = new RegExp(`(${NUM})\\s?(${UNIT_RE})(?![\\w/])`, 'g');

  for (const line of lines) {
    const time = TIME.exec(line)?.[0] ?? '';
    if (time) { from ||= time; to = time; }
    const f = fold(line);
    const isError = ERROR_WORD.test(f);
    const isWarn = !isError && WARN_WORD.test(f);
    if (isError) errors++;
    if (isWarn) warnings++;

    const seen = new Set<string>();
    const note = (raw: string) => {
      const code = normCode(raw);
      if (!code || seen.has(code)) return;
      seen.add(code);
      const c = codes.get(code);
      if (c) { c.count++; c.last = time; } else codes.set(code, { code, count: 1, first: time, last: time });
    };
    for (const m of line.matchAll(CODE_TOKEN)) {
      // A word the manual lists as a code always counts. Otherwise only on an error line, and only when it
      // looks like one ("E21", "ERR105"): "TP2", "F1" or "Q3" name a test point, a fuse, a transistor.
      if (isCode(normCode(m[1])) || ((isError || isWarn) && /^[A-Z]{1,3}-?\d{2,4}[A-Z]?$/.test(m[1]))) note(m[1]);
    }
    for (const m of f.matchAll(CODE_WORD)) if (isError || isWarn || isCode(m[1])) note(m[1]);

    if (!table) {
      // Readings: "temp=41.2C  SpO2: 97 %" pairs, or else the last value with a unit ("PSU 5V rail 4.61V").
      const rest = time ? line.replace(time, ' ') : line;
      const add = (label: string, num: string, unit: string) => {
        const name = label.replace(/^[\s\-–|:;,.\[\]()]+|[\s\-–|:;,.\[\]()=]+$/g, '').replace(/\s+/g, ' ');
        const value = parseNumber(num);
        if (value === null || name.length < 2 || name.length > 40 || !/[A-Za-zÇĞİÖŞÜçğıöşü]/.test(name)) return;
        const key = `${fold(name)}|${unit}`;
        const r = readings.get(key) ?? { name, unit, values: [] };
        r.values.push(value);
        readings.set(key, r);
      };
      const pairs = [...rest.matchAll(pair)];
      if (pairs.length) {
        for (const m of pairs) add(m[1], m[2], m[3] || '');
      } else {
        const all = [...rest.matchAll(tail)];
        const last = all[all.length - 1];
        if (last) add(rest.slice(0, last.index).replace(/\b(info|debug|trace|warn|warning|error|err|notice)\b:?/gi, ' '), last[1], last[2]);
      }
    }

    if (isError || isWarn) {
      // "E-21" and "E21", or the same message with another value, are the same message.
      const key = (time ? line.replace(time, '') : line).replace(/([A-Za-z])-(?=\d)/g, '$1').replace(/\d+(?:[.,]\d+)?/g, '#').replace(/\s+/g, ' ').trim().slice(0, 90);
      const example = (time ? line.replace(time, '') : line).replace(/\s+/g, ' ').replace(/^[\s\-–|:;,.\[\]]+/, '').trim().slice(0, 90);
      const msg = messages.get(key);
      if (msg) msg.count++; else messages.set(key, { text: example, count: 1 });
    }
  }

  const series = table?.series ?? [...readings.values()].filter((r) => r.values.length >= 3)
    .sort((a, b) => b.values.length - a.values.length).slice(0, 8).map((r) => summarise(r.name, r.unit, r.values));
  const codeList = [...codes.values()].sort((a, b) => b.count - a.count).slice(0, 12);
  const repeated = [...messages.values()].filter((m) => m.count >= 2).sort((a, b) => b.count - a.count).slice(0, 3);
  // Prose mentions an error now and then; data has structure: time stamps, readings, or errors that repeat.
  if (!table && !series.length && !codeList.length && !(from && (errors || warnings)) && !repeated.length) return null;
  return { kind: table ? 'table' : 'log', lines: lines.length, from, to, errors, warnings, codes: codeList, series, repeated };
}

/** The digest as plain text for the AI: exact counts and statistics it does not have to work out itself. */
export function digestText(d: DataDigest): string {
  const out = [`${d.kind}, ${d.lines} lines${d.from ? `, from ${d.from} to ${d.to}` : ''}`];
  if (d.errors || d.warnings) out.push(`error lines: ${d.errors}, warning lines: ${d.warnings}`);
  if (d.codes.length) out.push('codes: ' + d.codes.map((c) => `${c.code} ×${c.count}${c.first ? ` (first ${c.first}, last ${c.last})` : ''}`).join('; '));
  for (const s of d.series) {
    out.push(`reading "${s.name}"${s.unit ? ` [${s.unit}]` : ''}: n=${s.n} min=${s.min} max=${s.max} mean=${s.mean} first=${s.first} last=${s.last} trend=${s.trend}`);
  }
  for (const r of d.repeated) out.push(`repeated ×${r.count}: ${r.text}`);
  return out.join('\n');
}
