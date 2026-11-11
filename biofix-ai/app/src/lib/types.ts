// Shapes returned by the BioFix AI server (see server/src/routes.ts).
export type PlanId = 'free' | 'pro' | 'trainer' | 'biz' | 'org';
export type Level = 'high' | 'medium' | 'low';
export type SolStatus = 'ver' | 'pen' | 'rej';

export interface PlanInfo { usd: number; quota: number; sell: number; teach: boolean; photo: boolean } // -1 = unlimited

export interface Me {
  user: {
    id: string; email: string;
    /** False until the user has typed the code e-mailed to this address. */
    emailVerified: boolean;
    name: string; plan: PlanId; planUntil: string | null; billing: 'month' | 'year';
    /** Present while a Google Play subscription is bound to the account. */
    sub: { productId: string; expiresAt: string; autoRenew: boolean } | null;
    points: number;
    ledger: { n: number; why: string; date: string }[]; usedToday: number;
    quotes: { id: string; title: string; seller: string; usd: number; qty: number; msg: string; date: string }[];
    owned: string[];
  };
  plan: PlanInfo;
  plans: Record<PlanId, PlanInfo>;
  pt: { teach: number; verified: number; vote: number; review: number };
  ptPerUsd: number;
  needOk: number;
  fee: number;
  ai: boolean;
  isAdmin: boolean;
  demoPayments: boolean;
  billing: {
    /** True when the server can verify Google Play purchases. */
    google: boolean;
    packageName: string;
    subs: Record<Exclude<PlanId, 'free'>, string>;
    basePlans: { month: string; year: string };
    packs: { productId: string; points: number }[];
  };
}

export interface AuthResult { token: string; me: Me }

export interface SolutionView {
  id: string; by: string; brand: string; model: string; symptom: string; code: string; steps: string; part: string;
  photo: string; photoNote: string; ok: number; fail: number; date: string;
  ai: { v: 'consistent' | 'conflict' | 'not_covered'; note: string; safe: boolean } | null;
  status: SolStatus; mine: boolean; myVote: 'ok' | 'fail' | null; canDelete: boolean; checking: boolean;
  /** The AI pre-check flagged a safety risk; it stays unverified until a developer clears it. */
  flagged: boolean; canReview: boolean;
}

export interface Diagnosis {
  summary: string;
  /** The single thing to check or do first (absent in records made by older versions). */
  firstAction?: string;
  /** What the technician could tell the assistant to narrow the diagnosis down. */
  questions?: string[];
  confidence: Level; grounded: boolean;
  causes: { title: string; why: string; likelihood: Level }[];
  steps: { title: string; detail: string; measure: string | null; source: number | null }[];
  parts: { name: string; action: 'check' | 'replace'; code: string | null; note: string; source: number | null }[];
  warnings: string[]; community: number[];
}

export interface Source { title: string; h: string; t: string }

/** A manual's explanation of an error code. */
export interface CodeHit { code: string; text: string; device: string; title: string }

/** What the knowledge base says about a fault before any AI is involved; arrives within milliseconds. */
export interface Quick { codes: CodeHit[]; sols: SolutionView[]; docs: Source[] }

/** Shortcuts for a device: faults others already solved on it, and the codes its manuals define. */
export interface QuickList {
  faults: { id: string; symptom: string; code: string; status: SolStatus }[];
  codes: { code: string; text: string }[];
}

/** One line of a streamed answer. */
export type StreamEvent =
  | { type: 'quick'; quick: Quick }
  | { type: 'partial'; res: Diagnosis }
  | { type: 'delta'; text: string }
  | { type: 'done'; item: HistoryItem | null }
  | { type: 'error'; error: string }
  | { type: 'ping' };

/** A PDF or text file attached to a fault report. */
export interface FilePayload { name: string; mediaType: 'application/pdf' | 'text/plain'; data: string }

export interface DeviceLabel { brand: string; model: string; serial: string; device: string; label: string }

export interface HistoryItem {
  id: string; q: string; dev: string; date: string; res: Diagnosis; done: Record<string, boolean>;
  follow: { q: string; a: string }[]; solIds: string[]; srcs: Source[]; sols: SolutionView[];
  codes?: CodeHit[];
  attached?: { photos: number; file: string };
}

export interface CourseView {
  id: string; title: string; by: string; cat: 'svc' | 'use'; level: 'b' | 'i' | 'a'; hours: number; usd: number;
  rating: number; n: number; desc: string; lessonCount: number; mine: boolean; owned: boolean; canDelete: boolean;
  lessons?: { t: string; c: string | null }[]; sales?: number;
}

export interface ListingView {
  id: string; cat: 'device' | 'part' | 'cons' | 'acc'; tr: string; en: string; brand: string; model: string; year: number;
  cond: 'new' | 'used' | 'refurb'; usd: number; seller: string; ok: number; c: string; stock: number; reg: string;
  dtr: string; den: string; mine: boolean; rating: { stars: number; n: number } | null;
}

export interface ReviewView {
  id: string; key: string; by: string; stars: number; rel: number; svc: number; use: number; val: number;
  again: boolean; months: 'rv_m1' | 'rv_m2' | 'rv_m3'; buyer: boolean; text: string; mine: boolean;
}

export interface ListingDetail {
  item: ListingView;
  agg: { n: number; stars: number; rel: number; svc: number; use: number; val: number; again: number } | null;
  reviews: ReviewView[];
  knownFixes: number;
}

export interface AdminOverview {
  fee: number;
  sales: { courseId: string; title: string; usd: number; fee: number; date: string }[];
  totalSales: number; totalFee: number;
  docs: {
    id: string; title: string; brand: string; model: string; kind: 'sample' | 'manual'; chunks: number;
    /** Error codes found in this manual. */
    codes: number;
    /** Progress of the AI pass that adds search words and error codes; null when it never ran. */
    ai: { status: 'running' | 'done' | 'failed'; done: number; total: number } | null;
  }[];
  /** Whether the server has an AI key. */
  ai: boolean;
  chunkCount: number; solCount: number; reports: number;
  /** User listings waiting for the seller to be verified. */
  pendingListings: { id: string; title: string; seller: string; brand: string; model: string }[];
}

export interface ImagePayload { data: string; mediaType: 'image/jpeg'; uri: string }
