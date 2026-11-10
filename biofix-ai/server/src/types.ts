export type Lang = 'tr' | 'en';
export type PlanId = 'free' | 'pro' | 'trainer' | 'biz' | 'org';
export type SolStatus = 'ver' | 'pen' | 'rej';
export type Level = 'high' | 'medium' | 'low';

export interface Chunk { h: string; t: string }

export interface SeedDoc { title: string; brand: string; model: string; text: string }

export interface Doc {
  id: string;
  title: string;
  brand: string;
  model: string;
  kind: 'sample' | 'manual';
  chunks: Chunk[];
  createdAt: string;
}

export interface AiCheck { v: 'consistent' | 'conflict' | 'not_covered'; note: string; safe: boolean }

export interface SeedSolution {
  by: string; brand: string; model: string; symptom: string; code: string;
  ok: number; fail: number; ai: AiCheck | null; steps: string; part: string;
}

export interface Solution extends SeedSolution {
  id: string;
  userId: string | null;
  photo: string;          // data URI (small JPEG) or ''
  photoNote: string;
  votes: Record<string, 'ok' | 'fail'>;
  rewarded: boolean;
  date: string;
}

export interface Review {
  id: string; key: string; userId: string | null; by: string;
  stars: number; rel: number; svc: number; use: number; val: number;
  again: boolean; months: 'rv_m1' | 'rv_m2' | 'rv_m3'; buyer: boolean; text: string;
}

export interface Lesson { t: string; c: string }
export interface Course {
  id: string; ownerId: string | null; title: string; by: string;
  cat: 'svc' | 'use'; level: 'b' | 'i' | 'a'; hours: number; usd: number;
  rating: number; n: number; desc: string; lessons: Lesson[];
}

export type ListingCat = 'device' | 'part' | 'cons' | 'acc';
export type Cond = 'new' | 'used' | 'refurb';
export interface Listing {
  id: string; ownerId: string | null; cat: ListingCat; tr: string; en: string;
  brand: string; model: string; year: number; cond: Cond; usd: number;
  seller: string; ok: number; c: string; stock: number; reg: string; dtr: string; den: string;
}

export interface Diagnosis {
  summary: string;
  confidence: Level;
  grounded: boolean;
  causes: { title: string; why: string; likelihood: Level }[];
  steps: { title: string; detail: string; measure: string | null; source: number | null }[];
  parts: { name: string; action: 'check' | 'replace'; code: string | null; note: string; source: number | null }[];
  warnings: string[];
  community: number[];
}

export interface HistoryItem {
  id: string; q: string; dev: string; date: string; res: Diagnosis;
  done: Record<string, boolean>; follow: { q: string; a: string }[];
  solIds: string[]; srcs: { title: string; h: string; t: string }[];
}

export interface LedgerEntry { n: number; why: string; date: string }
export interface Quote { id: string; title: string; seller: string; usd: number; qty: number; msg: string; date: string }
export interface Sale { courseId: string; title: string; usd: number; fee: number; sellerId: string | null; date: string }

export interface User {
  id: string;
  name: string;
  plan: PlanId;
  billing: 'month' | 'year';
  points: number;
  ledger: LedgerEntry[];
  usage: { d: string; n: number };
  history: HistoryItem[];
  owned: string[];
  quotes: Quote[];
}

export interface Db {
  version: number;
  fee: number;
  docs: Doc[];
  sols: Solution[];
  reviews: Review[];
  courses: Course[];
  listings: Listing[];
  sales: Sale[];
  users: Record<string, User>;
  reports: { listingId: string; userId: string; date: string }[];
}
