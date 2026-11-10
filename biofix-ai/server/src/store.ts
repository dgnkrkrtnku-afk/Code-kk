// Small JSON-file store. Good enough for a pilot; swap for Postgres/SQLite behind the same functions later.
import fs from 'node:fs';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { chunkText, KnowledgeIndex } from './kb.js';
import { SEED_COURSES, SEED_DOCS, SEED_LISTINGS, SEED_REVIEWS, SEED_SOLUTIONS } from './seed.js';
import type { Db, User } from './types.js';

export const uid = () => randomUUID().replace(/-/g, '').slice(0, 16);
export const todayKey = () => new Date().toISOString().slice(0, 10);

const WELCOME_POINTS = 500;

function seedDb(): Db {
  return {
    version: 1,
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
    reports: [],
  };
}

export class Store {
  db: Db;
  readonly index = new KnowledgeIndex();
  private timer: NodeJS.Timeout | null = null;

  constructor(private file: string | null) {
    this.db = this.load();
    this.reindex();
  }

  private load(): Db {
    if (this.file && fs.existsSync(this.file)) {
      return JSON.parse(fs.readFileSync(this.file, 'utf8')) as Db;
    }
    const db = seedDb();
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
    fs.mkdirSync(path.dirname(this.file), { recursive: true });
    const tmp = this.file + '.tmp';
    fs.writeFileSync(tmp, JSON.stringify(this.db));
    fs.renameSync(tmp, this.file);
  }

  user(id: string): User {
    let u = this.db.users[id];
    if (!u) {
      u = {
        id, name: '', plan: 'free', billing: 'month', points: WELCOME_POINTS,
        ledger: [{ n: WELCOME_POINTS, why: 'pt_welcome', date: todayKey() }],
        usage: { d: todayKey(), n: 0 }, history: [], owned: [], quotes: [],
      };
      this.db.users[id] = u;
      this.save();
    }
    return u;
  }

  usedToday(u: User): number {
    if (u.usage.d !== todayKey()) u.usage = { d: todayKey(), n: 0 };
    return u.usage.n;
  }

  award(u: User, n: number, why: string) {
    u.points += n;
    u.ledger.unshift({ n, why, date: todayKey() });
    u.ledger = u.ledger.slice(0, 40);
  }
}
