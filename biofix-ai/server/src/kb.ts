// Knowledge base: manual chunking + BM25 search over developer manuals and community solutions.
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
export function solStatus(s: Pick<Solution, 'ok' | 'fail'>): SolStatus {
  const n = s.ok + s.fail;
  if (s.ok >= NEED_OK && s.ok / n >= 0.75) return 'ver';
  if (s.fail >= NEED_OK && s.fail > s.ok) return 'rej';
  return 'pen';
}

const STOP = new Set('ve ile bir bu da de için mi mı mu mü ise ya en çok daha gibi olan olarak the a an of to and is in on for it not with'.split(' '));
export function toks(s: string): string[] {
  return (String(s).toLocaleLowerCase('tr').match(/[a-zçğıöşü0-9]+/g) || [])
    .filter((w) => w.length > 1 && !STOP.has(w))
    .map((w) => (/\d/.test(w) ? w : w.length > 6 ? w.slice(0, 6) : w));
}

export const devOf = (d: { brand: string; model: string }) => `${d.brand} ${d.model}`.trim();

export type DocHit = { type: 'doc'; doc: Doc; ci: number };
export type SolHit = { type: 'sol'; sol: Solution };
type Entry = (DocHit | SolHit) & { tf: Map<string, number>; len: number };

export class KnowledgeIndex {
  private entries: Entry[] = [];
  private df = new Map<string, number>();
  private avg = 1;

  rebuild(docs: Doc[], sols: Solution[]) {
    this.entries = [];
    this.df = new Map();
    let total = 0;
    const add = (ref: DocHit | SolHit, text: string) => {
      const tf = new Map<string, number>();
      const ws = toks(text);
      ws.forEach((w) => tf.set(w, (tf.get(w) || 0) + 1));
      tf.forEach((_, w) => this.df.set(w, (this.df.get(w) || 0) + 1));
      total += ws.length;
      this.entries.push({ ...ref, tf, len: ws.length || 1 });
    };
    docs.forEach((d) => d.chunks.forEach((c, i) => add({ type: 'doc', doc: d, ci: i }, `${d.title} ${devOf(d)} ${c.h} ${c.t}`)));
    sols.forEach((s) => add({ type: 'sol', sol: s }, `${devOf(s)} ${s.symptom} ${s.code} ${s.steps} ${s.part} ${s.photoNote || ''}`));
    this.avg = this.entries.length ? total / this.entries.length : 1;
  }

  search(query: string, devKey: string, k: number, type: 'doc'): DocHit[];
  search(query: string, devKey: string, k: number, type: 'sol'): SolHit[];
  search(query: string, devKey: string, k: number, type?: undefined): (DocHit | SolHit)[];
  search(query: string, devKey: string, k: number, type?: 'doc' | 'sol'): (DocHit | SolHit)[] {
    const q = toks(query);
    const N = this.entries.length;
    if (!q.length || !N) return [];
    const res: { e: Entry; s: number }[] = [];
    for (const e of this.entries) {
      if (type && e.type !== type) continue;
      let s = 0;
      for (const w of q) {
        const f = e.tf.get(w);
        if (!f) continue;
        const df = this.df.get(w) || 0;
        const idf = Math.log(1 + (N - df + 0.5) / (df + 0.5));
        s += (idf * (f * 2.2)) / (f + 1.2 * (0.25 + (0.75 * e.len) / this.avg));
      }
      if (s <= 0) continue;
      const dk = e.type === 'doc' ? devOf(e.doc) : devOf(e.sol);
      if (devKey && dk === devKey) s *= 1.5;
      if (e.type === 'sol' && solStatus(e.sol) === 'ver') s *= 1.6;
      res.push({ e, s });
    }
    return res
      .sort((a, b) => b.s - a.s)
      .slice(0, k)
      .map(({ e }) => (e.type === 'doc' ? { type: 'doc', doc: e.doc, ci: e.ci } : { type: 'sol', sol: e.sol }));
  }
}

/** Loose prefix match used by list filters (solutions, market). */
export function prefixMatchCount(query: string, haystack: string): number {
  const f = toks(query);
  const ws = toks(haystack);
  return f.filter((w) => ws.some((x) => x.indexOf(w) === 0 || w.indexOf(x) === 0)).length;
}
