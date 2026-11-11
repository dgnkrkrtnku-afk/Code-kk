export type Lang = 'tr' | 'en';
export type PlanId = 'free' | 'pro' | 'trainer' | 'biz' | 'org';
export type SolStatus = 'ver' | 'pen' | 'rej';
export type Level = 'high' | 'medium' | 'low';

export interface Chunk {
  h: string;
  t: string;
  /** Search words the AI added while indexing the manual (symptoms and component names in Turkish and English). */
  k?: string;
  /** Error codes the AI found in this section. */
  codes?: { code: string; text: string }[];
}

export interface SeedDoc { title: string; brand: string; model: string; text: string }

export interface Doc {
  id: string;
  title: string;
  brand: string;
  model: string;
  kind: 'sample' | 'manual';
  chunks: Chunk[];
  createdAt: string;
  /** Progress of the AI pass that adds search words and error codes to each section. */
  ai?: { status: 'running' | 'done' | 'failed'; done: number; total: number };
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
  /** The single thing to check or do first. */
  firstAction: string;
  confidence: Level;
  grounded: boolean;
  causes: { title: string; why: string; likelihood: Level }[];
  steps: { title: string; detail: string; measure: string | null; source: number | null }[];
  parts: { name: string; action: 'check' | 'replace'; code: string | null; note: string; source: number | null }[];
  warnings: string[];
  /** What the technician could tell the assistant to narrow the diagnosis down. */
  questions: string[];
  community: number[];
}

export interface HistoryItem {
  id: string; q: string; dev: string; date: string; res: Diagnosis;
  done: Record<string, boolean>; follow: { q: string; a: string }[];
  solIds: string[]; srcs: { title: string; h: string; t: string }[];
  /** Manual entries for the error codes named in the report. */
  codes?: { code: string; text: string; device: string; title: string }[];
  /** What was attached (the files themselves are not kept). */
  attached?: { photos: number; file: string };
}

export interface LedgerEntry { n: number; why: string; date: string }
export interface Quote { id: string; title: string; seller: string; usd: number; qty: number; msg: string; date: string }
export interface Sale {
  courseId: string; title: string; usd: number; fee: number; sellerId: string | null; date: string;
  /** How the buyer paid: with points, or a demo "card" payment that moved no money. */
  how?: 'pts' | 'card' | 'demo';
}

/** A verified Google Play subscription bound to a user. */
export interface Subscription {
  source: 'google';
  productId: string;
  basePlanId: string;
  token: string;
  expiresAt: string;      // ISO time
  autoRenew: boolean;
  state: string;          // Google's SUBSCRIPTION_STATE_*
  checkedAt: string;      // last time it was re-verified with Google
}

export interface User {
  id: string;
  email: string;
  /** True once the user has entered a code sent to this address (proof they can read the mailbox). */
  emailVerified?: boolean;
  passHash: string;
  createdAt: string;
  name: string;
  plan: PlanId;
  /** Paid plans are valid until this ISO time; null for the free plan. */
  planUntil: string | null;
  sub: Subscription | null;
  billing: 'month' | 'year';
  points: number;
  ledger: LedgerEntry[];
  usage: { d: string; n: number };
  /** How many rewarded actions the user did today (see DAILY_REWARDS). */
  earned?: { d: string; teach: number; vote: number; verified?: number };
  history: HistoryItem[];
  owned: string[];
  quotes: Quote[];
}

export interface Session { userId: string; createdAt: number; lastSeen: number }
export interface ResetCode { codeHash: string; expiresAt: number; attempts: number }

/** A Play purchase token that has already been used, so it can't be credited twice. */
export interface PurchaseRecord {
  userId: string;
  kind: 'points' | 'subscription';
  productId: string;
  points: number;
  orderId: string;
  date: string;
  voided: boolean;
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
  /** Keyed by SHA-256 of the session token. */
  sessions: Record<string, Session>;
  /** Keyed by e-mail. */
  resetCodes: Record<string, ResetCode>;
  /** Address verification codes, keyed by user id. */
  verifyCodes: Record<string, ResetCode>;
  /** Keyed by SHA-256 of the Play purchase token. */
  purchases: Record<string, PurchaseRecord>;
  reports: { listingId: string; userId: string; date: string }[];
}
