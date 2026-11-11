// Knowledge base: manual chunking, error-code index and BM25 search over developer manuals and
// community solutions. Everything here is plain computation: it answers in milliseconds, before any AI call.
import type { Chunk, Doc, Solution, SolStatus } from './types.js';

/** Split manual text into sections by markdown, numbered or ALL-CAPS headings. */
export function chunkText(text: string): Chunk[] {
  const out: Chunk[] = [];
  let h = '';
  let buf = '';
  const flush = () => {
    const s = buf.trim();
    if (s) out.push({ h, t: s });
    buf = '';
  };
  for (const raw of String(text).replace(/\r/g, '').split('\n')) {
    const l = raw.trim();
    const md = /^#{1,4}\s+\S/.test(l);
    const num = /^\d+(\.\d+)+\.?\s+\S.{2,70}$/.test(l) && !/[.:;,]$/.test(l);
    const caps = l.length > 3 && l.length < 64 && /[A-ZÇĞİÖŞÜ]{3}/.test(l) && l === l.toLocaleUpperCase('tr') && !/^\d/.test(l);
    if (md || num || caps) {
      flush();
      h = l.replace(/^#+\s*/, '').slice(0, 90);
      continue;
    }
    if (!l) {
      if (buf.length > 650) flush();
      else if (buf) buf += '\n';
      continue;
    }
    buf += l + '\n';
    if (buf.length > 1100) flush();
  }
  flush();
  return out;
}

export const NEED_OK = 3;
export function solStatus(s: Pick<Solution, 'ok' | 'fail'> & { ai?: Solution['ai'] }): SolStatus {
  const n = s.ok + s.fail;
  if (s.fail >= NEED_OK && s.fail > s.ok) return 'rej';
  // A fix the AI pre-check flagged as dangerous is never "verified" by votes alone; a developer must clear it.
  if (s.ok >= NEED_OK && s.ok / n >= 0.75) return s.ai?.safe ? 'pen' : 'ver';
  return 'pen';
}

/* ------------------------------------------------------------------ text normalisation */

/**
 * Lowercase and drop diacritics, so "şarj süresi", "sarj suresi" and "ŞARJ SÜRESİ" are the same text.
 * Technicians type on phones, often without Turkish letters; English manuals must not trip on I/ı either.
 */
export function fold(s: string): string {
  return String(s).toLocaleLowerCase('tr').replace(/ı/g, 'i').normalize('NFD').replace(/[̀-ͯ]/g, '');
}

const STOP = new Set(
  've ile bir bu da de icin mi mu ise ya en cok daha gibi olan olarak the a an of to and is in on for it not with'.split(' '),
);

/** Search tokens: folded words, hyphenated codes joined ("E-21" → "e21", "PM-12" → "pm12"), long words cut to a stem. */
export function toks(s: string): string[] {
  return (fold(s).replace(/\b([a-z]{1,4})-(\d{1,4})\b/g, '$1$2').match(/[a-z0-9]+/g) || [])
    .filter((w) => w.length > 1 && !STOP.has(w))
    .map((w) => (/\d/.test(w) ? w : w.length > 6 ? w.slice(0, 6) : w));
}

/**
 * Turkish ↔ English service vocabulary. Manuals are often English while the fault is typed in Turkish
 * (or the other way round); a query word also searches for the other words on its line.
 */
const GLOSSARY = `
ariza hata fault error failure
alarm uyari warning alert
acilmiyor acilmadi calismiyor power boot start startup
kapaniyor kapandi shutdown shuts
guc besleme power supply psu
sarj charge charging charger
batarya aku pil battery
sigorta fuse
gerilim voltaj voltage volt
akim current amper
direnc resistance resistor ohm
kisa short
devre circuit
toprak topraklama ground earth
kacak sizinti leak leakage
kablo cable wire harness
konnektor soket connector socket plug
kart board pcb
ekran display screen lcd
dokunmatik touch touchscreen
tus tuslar klavye key button keypad
sensor algilayici sensor transducer
akis debi flow
basinc pressure
sicaklik isi temperature thermal
isinma isiniyor overheat overheating hot
kalibrasyon calibration calibrate
olcum olcme measurement measure reading
test testi self-test selftest
pompa pump
valf vana valve
filtre filter
fan sogutma cooling
motor motor drive
turbin turbine blower
kondansator kapasitor capacitor
role relay
trafo transformator transformer
yazilim firmware software
guncelleme guncelle update upgrade
sifirlama sifirla reset
kurulum montaj installation install setup
bakim maintenance service servis
periyodik koruyucu preventive periodic
parca yedek spare part
degistir degisim replace replacement
temizle temizlik clean cleaning
yazici printer recorder
kagit paper
ses hoparlor speaker audio sound buzzer
prob probe transducer
elektrot electrode lead
kasik ped paddle pad
enerji energy joule
desarj bosaltma discharge
hasta patient
hortum tubing hose
anakart mainboard motherboard
kirli kirlenme dirty contaminated contamination
gevsek loose
kirik catlak broken cracked
yanik yanmis burnt burned
oksit oksitlenme korozyon corrosion oxidation oxidized
tikali tikanmis blocked clogged
dusuk low
yuksek high
kapasite capacity
seviye level
oksijen o2 oxygen
hava air
gaz gas
nem nemlendirici humidity humidifier
tarti terazi scale weight
infuzyon infusion
oklüzyon tikaniklik occlusion blockage
goruntu image imaging
gurultu parazit noise artifact artefact
haberlesme iletisim communication comm
baglanti connection link
ag network ethernet wifi
saat tarih clock date time rtc
kapak kapi cover door lid
tekerlek wheel caster
yanip sonuyor blink blinking flashing
`.trim().split('\n').map((line) => [...new Set(toks(line))]);

const SYNONYMS = new Map<string, Set<string>>();
for (const group of GLOSSARY) {
  for (const w of group) {
    const set = SYNONYMS.get(w) ?? new Set<string>();
    group.forEach((x) => { if (x !== w) set.add(x); });
    SYNONYMS.set(w, set);
  }
}

export const devOf = (d: { brand: string; model: string }) => `${d.brand} ${d.model}`.trim();

/**
 * Do two device names mean the same device? Same words in any spelling ("Örnek Hasta Monitörü PM-12" vs
 * "ornek hasta monitoru pm12"), or one name contained in the other when it carries a model number
 * ("Philips MX450" vs "Philips IntelliVue MX450", as read from a device label).
 */
export function sameDevice(a: string, b: string): boolean {
  if (!a || !b) return false;
  const [short, long] = [toks(a), toks(b)].sort((x, y) => x.length - y.length);
  if (!short.length) return false;
  const set = new Set(long);
  if (!short.every((w) => set.has(w))) return false;
  return short.length === set.size || short.some((w) => /\d/.test(w));
}

/* ------------------------------------------------------------------ error codes */

export interface CodeEntry {
  /** Normalised: upper case, no spaces or hyphens ("E-21" → "E21"). */
  code: string;
  text: string;
  device: string;
  docId: string;
  title: string;
  ci: number;
}

export const normCode = (s: string) => fold(s).replace(/[^a-z0-9]/g, '').toUpperCase();

/** Sections that list codes: "Hata kodları", "Error codes", "Alarm messages"… */
const CODE_HEADING = /hata|error|alarm|fault|kod|code|ariza|mesaj|message|uyari|warning/;
// "E21: text", "E-21 – text", "D03 | text"; numbers on their own only after a keyword ("Hata 105: …").
const CODE_AT = /(?:^|[\s.;|(])(?:([A-Za-z]{1,4}-?\d{1,4}[A-Za-z]?)|(?:error|err|hata|alarm|kod|code|fault|ariza)\s*(?:no\.?\s*|#\s*)?(\d{1,4}))\s*[:–|]\s+|(?:^|[\s.;|(])([A-Za-z]{1,4}-?\d{1,4}[A-Za-z]?)\s+-\s+/gi;

/** Pull "code → meaning" pairs out of a manual's code tables. */
export function extractCodes(doc: Doc): CodeEntry[] {
  const out: CodeEntry[] = [];
  doc.chunks.forEach((c, ci) => {
    // Codes found by the AI while indexing the manual.
    for (const x of c.codes ?? []) {
      const code = normCode(x.code);
      if (code && x.text && !out.some((o) => o.code === code)) {
        out.push({ code, text: x.text.slice(0, 400), device: devOf(doc), docId: doc.id, title: doc.title, ci });
      }
    }
    if (!CODE_HEADING.test(fold(c.h))) return;
    const marks: { code: string; start: number; end: number }[] = [];
    CODE_AT.lastIndex = 0;
    for (let m = CODE_AT.exec(c.t); m; m = CODE_AT.exec(c.t)) {
      const raw = m[1] || m[2] || m[3];
      marks.push({ code: normCode(raw), start: m.index, end: m.index + m[0].length });
    }
    marks.forEach((mk, i) => {
      const text = c.t.slice(mk.end, i + 1 < marks.length ? marks[i + 1].start : undefined).replace(/\s+/g, ' ').trim();
      if (mk.code && text.length > 2 && !out.some((o) => o.code === mk.code)) {
        out.push({ code: mk.code, text: text.slice(0, 400), device: devOf(doc), docId: doc.id, title: doc.title, ci });
      }
    });
  });
  return out;
}

/** Codes a technician typed in a fault report: "E21", "e-21", "D 03", "hata 105". */
export function codesInQuery(q: string): string[] {
  const out = new Set<string>();
  const f = fold(q);
  for (const m of f.matchAll(/\b([a-z]{1,4})[- ]?(\d{1,4})([a-z]?)\b/g)) out.add((m[1] + m[2] + m[3]).toUpperCase());
  for (const m of f.matchAll(/\b(?:error|err|hata|alarm|kod|kodu|code|fault|ariza)\s*(?:no\.?\s*|#\s*)?(\d{1,4})\b/g)) out.add(m[1]);
  return [...out];
}

/* ------------------------------------------------------------------ search */

export type DocHit = { type: 'doc'; doc: Doc; ci: number };
export type SolHit = { type: 'sol'; sol: Solution };
type Entry = (DocHit | SolHit) & { tf: Map<string, number>; len: number; dev: string };

const IS_CODE = /^[a-z]{1,4}\d{1,4}[a-z]?$/;

export class KnowledgeIndex {
  private entries: Entry[] = [];
  private df = new Map<string, number>();
  private avg = 1;
  private codes = new Map<string, CodeEntry[]>();
  private devicesWithDocs: string[] = [];

  rebuild(docs: Doc[], sols: Solution[]) {
    this.entries = [];
    this.df = new Map();
    this.codes = new Map();
    let total = 0;
    const add = (ref: DocHit | SolHit, dev: string, text: string, heading = '') => {
      const tf = new Map<string, number>();
      const ws = toks(text);
      ws.forEach((w) => tf.set(w, (tf.get(w) || 0) + 1));
      // Words in a section's heading say what it is about: they count three times.
      toks(heading).forEach((w) => tf.set(w, (tf.get(w) || 0) + 2));
      tf.forEach((_, w) => this.df.set(w, (this.df.get(w) || 0) + 1));
      total += ws.length;
      this.entries.push({ ...ref, tf, len: ws.length || 1, dev });
    };
    docs.forEach((d) => {
      d.chunks.forEach((c, i) => add({ type: 'doc', doc: d, ci: i }, devOf(d), `${d.title} ${devOf(d)} ${c.h} ${c.t} ${c.k ?? ''}`, c.h));
      for (const e of extractCodes(d)) this.codes.set(e.code, [...(this.codes.get(e.code) ?? []), e]);
    });
    sols.forEach((s) => add({ type: 'sol', sol: s }, devOf(s), `${devOf(s)} ${s.symptom} ${s.code} ${s.steps} ${s.part} ${s.photoNote || ''}`, s.symptom));
    this.avg = this.entries.length ? total / this.entries.length : 1;
    this.devicesWithDocs = [...new Set(docs.map(devOf).filter(Boolean))];
  }

  /** Manual entries for the error codes mentioned in a fault report; the selected device's entries first. */
  lookupCodes(query: string, devKey: string, limit = 5): CodeEntry[] {
    const found = codesInQuery(query).flatMap((c) => this.codes.get(c) ?? []);
    // With a device selected, another device's "E21" would be a wrong answer: only that device's codes count.
    return (devKey ? found.filter((e) => sameDevice(e.device, devKey)) : found).slice(0, limit);
  }

  /** Every code a device's manuals define (for the quick list under the device selector). */
  codesOf(devKey: string, limit = 40): CodeEntry[] {
    return [...this.codes.values()].flat().filter((e) => sameDevice(e.device, devKey)).slice(0, limit);
  }

  private rank(query: string, devKey: string, type?: 'doc' | 'sol'): { e: Entry; s: number }[] {
    const q = toks(query);
    const N = this.entries.length;
    if (!q.length || !N) return [];
    // Each query word also looks for its translations/synonyms, at reduced weight.
    const terms = new Map<string, number>();
    for (const w of q) {
      terms.set(w, Math.max(terms.get(w) ?? 0, IS_CODE.test(w) ? 2.5 : 1));
      SYNONYMS.get(w)?.forEach((x) => { if (!terms.has(x)) terms.set(x, 0.55); });
    }
    const deviceHasDocs = !!devKey && this.devicesWithDocs.some((d) => sameDevice(d, devKey));
    const res: { e: Entry; s: number }[] = [];
    for (const e of this.entries) {
      if (type && e.type !== type) continue;
      let s = 0;
      for (const [w, weight] of terms) {
        const f = e.tf.get(w);
        if (!f) continue;
        const df = this.df.get(w) || 0;
        const idf = Math.log(1 + (N - df + 0.5) / (df + 0.5));
        s += (weight * idf * (f * 2.2)) / (f + 1.2 * (0.25 + (0.75 * e.len) / this.avg));
      }
      if (s <= 0) continue;
      if (devKey) {
        if (sameDevice(e.dev, devKey)) s *= 2.2;
        // When we hold this device's own manual, another device's procedure is more likely to mislead than help.
        else if (e.dev && (e.type === 'sol' || deviceHasDocs)) s *= 0.5;
      }
      if (e.type === 'sol' && solStatus(e.sol) === 'ver') s *= 1.6;
      res.push({ e, s });
    }
    return res.sort((a, b) => b.s - a.s);
  }

  search(query: string, devKey: string, k: number, type: 'doc'): DocHit[];
  search(query: string, devKey: string, k: number, type: 'sol'): SolHit[];
  search(query: string, devKey: string, k: number, type?: undefined): (DocHit | SolHit)[];
  search(query: string, devKey: string, k: number, type?: 'doc' | 'sol'): (DocHit | SolHit)[] {
    return this.rank(query, devKey, type).slice(0, k)
      .map(({ e }) => (e.type === 'doc' ? { type: 'doc', doc: e.doc, ci: e.ci } : { type: 'sol', sol: e.sol }));
  }
}

/** Loose prefix match used by list filters (solutions, market). */
export function prefixMatchCount(query: string, haystack: string): number {
  const f = toks(query);
  const ws = toks(haystack);
  return f.filter((w) => ws.some((x) => x.indexOf(w) === 0 || w.indexOf(x) === 0)).length;
}
