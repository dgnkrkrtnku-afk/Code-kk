// Small JSON-file store. Good enough for a pilot; swap for Postgres/SQLite behind the same functions later.
import fs from 'node:fs';
import path from 'node:path';
import { createCipheriv, createDecipheriv, randomBytes, randomUUID } from 'node:crypto';
import { MAX_SESSIONS_PER_USER, SESSION_TTL_MS } from './auth.js';
import { welcomePoints } from './config.js';
import { chunkText, KnowledgeIndex } from './kb.js';
import { DAILY_REWARDS, PT } from './plans.js';
import { SEED_COURSES, SEED_DOCS, SEED_LISTINGS, SEED_REVIEWS, SEED_SOLUTIONS } from './seed.js';
import type { Db, User } from './types.js';

export const uid = () => randomUUID().replace(/-/g, '').slice(0, 16);
export const todayKey = () => new Date().toISOString().slice(0, 10);

function seedDb(): Db {
  return {
    version: 2,
    fee: 20,
    docs: SEED_DOCS.map((d) => ({
      id: uid(), title: d.title, brand: d.brand, model: d.model, kind: 'sample', chunks: chunkText(d.text), createdAt: todayKey(),
    })),
    sols: SEED_SOLUTIONS.map((s, i) => ({
      ...s, id: uid(), userId: null, photo: '', photoNote: '', votes: {}, rewarded: false, date: `2026-0${4 + i}-12`,
    })),
    reviews: SEED_REVIEWS.map((r) => ({ ...r, id: uid(), userId: null })),
    courses: SEED_COURSES.map((c) => ({ ...c, id: uid(), ownerId: null })),
    listings: SEED_LISTINGS.map((l) => ({ ...l, ownerId: null })),
    sales: [],
    users: {},
    sessions: {},
    resetCodes: {},
    purchases: {},
    reports: [],
  };
}

/* ------------------------------------------------------------------ encryption at rest */

// File layout when encrypted: "BFX1" | 12-byte nonce | 16-byte auth tag | AES-256-GCM ciphertext.
const MAGIC = Buffer.from('BFX1');

/** Parse DATA_ENCRYPTION_KEY: 32 random bytes as base64 (openssl rand -base64 32) or 64 hex characters. */
export function parseDataKey(raw: string | undefined): Buffer | null {
  if (!raw) return null;
  const v = raw.trim();
  const key = /^[0-9a-fA-F]{64}$/.test(v) ? Buffer.from(v, 'hex') : Buffer.from(v, 'base64');
  if (key.length !== 32) throw new Error('DATA_ENCRYPTION_KEY must be 32 bytes: generate one with "openssl rand -base64 32".');
  return key;
}

function encrypt(plain: Buffer, key: Buffer): Buffer {
  const nonce = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', key, nonce);
  const body = Buffer.concat([cipher.update(plain), cipher.final()]);
  return Buffer.concat([MAGIC, nonce, cipher.getAuthTag(), body]);
}

function decrypt(file: Buffer, key: Buffer): Buffer {
  const nonce = file.subarray(4, 16);
  const tag = file.subarray(16, 32);
  const decipher = createDecipheriv('aes-256-gcm', key, nonce);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(file.subarray(32)), decipher.final()]);
}

/* ------------------------------------------------------------------ store */

export class Store {
  db: Db;
  readonly index = new KnowledgeIndex();
  private timer: NodeJS.Timeout | null = null;

  /** @param key 32-byte key; when given, the file is encrypted with AES-256-GCM. */
  constructor(private file: string | null, private key: Buffer | null = null) {
    this.db = this.load();
    this.purge();
    this.reindex();
  }

  get encrypted() { return !!this.key; }

  private load(): Db {
    if (!this.file || !fs.existsSync(this.file)) return seedDb();
    const raw = fs.readFileSync(this.file);
    let json: Buffer;
    if (raw.subarray(0, 4).equals(MAGIC)) {
      if (!this.key) throw new Error(`${this.file} is encrypted; set DATA_ENCRYPTION_KEY to the key it was written with.`);
      try {
        json = decrypt(raw, this.key);
      } catch {
        throw new Error(`${this.file} could not be decrypted: DATA_ENCRYPTION_KEY is wrong or the file is damaged.`);
      }
    } else {
      json = raw; // plain file from before encryption was switched on; it is encrypted on the next save
    }
    const db = JSON.parse(json.toString('utf8')) as Db;
    // v1 files predate accounts: add the new tables. Device-only users have no e-mail and can't sign in.
    db.sessions ??= {};
    db.resetCodes ??= {};
    db.purchases ??= {};
    db.version = 2;
    return db;
  }

  reindex() {
    this.index.rebuild(this.db.docs, this.db.sols);
  }

  /** Debounced write so bursts of changes cost one disk write. */
  save() {
    if (!this.file) return;
    if (this.timer) return;
    this.timer = setTimeout(() => this.flush(), 300);
  }

  flush() {
    if (this.timer) clearTimeout(this.timer);
    this.timer = null;
    if (!this.file) return;
    fs.mkdirSync(path.dirname(this.file), { recursive: true, mode: 0o700 });
    const plain = Buffer.from(JSON.stringify(this.db), 'utf8');
    const tmp = this.file + '.tmp';
    // 0600: readable by the server's own OS user only. Write-then-rename keeps the old file intact on a crash.
    fs.writeFileSync(tmp, this.key ? encrypt(plain, this.key) : plain, { mode: 0o600 });
    fs.renameSync(tmp, this.file);
  }

  /** Remove expired sessions and reset codes. */
  purge(now = Date.now()) {
    let changed = false;
    for (const [k, v] of Object.entries(this.db.sessions)) {
      if (now - v.lastSeen > SESSION_TTL_MS || !this.db.users[v.userId]) { delete this.db.sessions[k]; changed = true; }
    }
    for (const [k, v] of Object.entries(this.db.resetCodes)) {
      if (v.expiresAt < now) { delete this.db.resetCodes[k]; changed = true; }
    }
    if (changed) this.save();
  }

  /* ---------- users and sessions */

  findByEmail(email: string): User | undefined {
    return Object.values(this.db.users).find((u) => u.email === email);
  }

  createUser(email: string, passHash: string, name: string): User {
    const points = welcomePoints();
    const u: User = {
      id: uid(), email, passHash, createdAt: new Date().toISOString(), name,
      plan: 'free', planUntil: null, sub: null, billing: 'month', points,
      ledger: points ? [{ n: points, why: 'pt_welcome', date: todayKey() }] : [],
      usage: { d: todayKey(), n: 0 }, history: [], owned: [], quotes: [],
    };
    this.db.users[u.id] = u;
    this.save();
    return u;
  }

  /** Delete an account and everything it published. Purchase records are kept so tokens can't be reused. */
  deleteUser(id: string) {
    const db = this.db;
    const email = db.users[id]?.email;
    delete db.users[id];
    if (email) delete db.resetCodes[email];
    db.sols = db.sols.filter((s) => s.userId !== id);
    db.sols.forEach((s) => { delete s.votes[id]; });
    db.reviews = db.reviews.filter((x) => x.userId !== id);
    db.courses = db.courses.filter((c) => c.ownerId !== id);
    db.listings = db.listings.filter((l) => l.ownerId !== id);
    this.dropSessions(id);
    this.reindex();
    this.save();
  }

  addSession(key: string, userId: string, now = Date.now()) {
    this.db.sessions[key] = { userId, createdAt: now, lastSeen: now };
    // Keep only the most recently used sessions so a stolen password can't pile up thousands of them.
    const mine = Object.entries(this.db.sessions).filter(([, v]) => v.userId === userId).sort((a, b) => b[1].lastSeen - a[1].lastSeen);
    for (const [k] of mine.slice(MAX_SESSIONS_PER_USER)) delete this.db.sessions[k];
    this.save();
  }

  dropSessions(userId: string, exceptKey?: string) {
    for (const [k, v] of Object.entries(this.db.sessions)) {
      if (v.userId === userId && k !== exceptKey) delete this.db.sessions[k];
    }
    this.save();
  }

  /* ---------- usage and points */

  usedToday(u: User): number {
    if (u.usage.d !== todayKey()) u.usage = { d: todayKey(), n: 0 };
    return u.usage.n;
  }

  award(u: User, n: number, why: string) {
    u.points += n;
    u.ledger.unshift({ n, why, date: todayKey() });
    u.ledger = u.ledger.slice(0, 40);
  }

  /**
   * Points for teaching, voting or having a solution verified, limited per day so they can't be farmed.
   * Returns the points given (0 once today's limit is reached).
   */
  reward(u: User, kind: keyof typeof DAILY_REWARDS): number {
    const today = todayKey();
    if (!u.earned || u.earned.d !== today) u.earned = { d: today, teach: 0, vote: 0, verified: 0 };
    const done = u.earned[kind] ?? 0;
    if (done >= DAILY_REWARDS[kind]) return 0;
    u.earned[kind] = done + 1;
    this.award(u, PT[kind], `pt_${kind}`);
    return PT[kind];
  }
}
