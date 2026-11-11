// Entitlements: Google Play subscriptions, point packs, and plan expiry.
import { sha256 } from './auth.js';
import { bad, HttpError } from './errors.js';
import type { PlayClient, PlaySubscription } from './play.js';
import { todayKey, type Store } from './store.js';
import type { PlanId, User } from './types.js';

/** Product IDs to create in Play Console (Monetize → Subscriptions). One subscription per plan. */
export const PLAY_SUBSCRIPTIONS: Record<Exclude<PlanId, 'free'>, string> = {
  pro: 'biofix_pro',
  trainer: 'biofix_trainer',
  biz: 'biofix_biz',
  org: 'biofix_org',
};
/** Base plan IDs inside each subscription. */
export const PLAY_BASE_PLANS = { month: 'monthly', year: 'yearly' } as const;

/** Consumable in-app products (Monetize → In-app products). Points pay for courses and plans. */
export const POINT_PACKS = [
  { productId: 'biofix_points_500', points: 500 },
  { productId: 'biofix_points_1500', points: 1500 },
  { productId: 'biofix_points_3000', points: 3000 },
  { productId: 'biofix_points_6000', points: 6000 },
] as const;

const planOfProduct = (productId: string) =>
  (Object.keys(PLAY_SUBSCRIPTIONS) as Exclude<PlanId, 'free'>[]).find((k) => PLAY_SUBSCRIPTIONS[k] === productId);

const DAY = 24 * 60 * 60 * 1000;
const RETRY_AFTER = 10 * 60 * 1000;

/** Does this subscription state give access right now? */
function entitled(s: PlaySubscription, now: number): boolean {
  if (s.state === 'SUBSCRIPTION_STATE_ACTIVE' || s.state === 'SUBSCRIPTION_STATE_IN_GRACE_PERIOD') return true;
  // Cancelled by the user but paid until the end of the period.
  return s.state === 'SUBSCRIPTION_STATE_CANCELED' && Date.parse(s.expiresAt) > now;
}

export interface PlayNotification {
  subscriptionNotification?: { purchaseToken?: string };
  voidedPurchaseNotification?: { purchaseToken?: string };
  testNotification?: unknown;
}

export class Billing {
  private lastAttempt = new Map<string, number>();

  constructor(private store: Store, private play: PlayClient | null) {}

  get enabled() { return !!this.play; }
  get packageName() { return this.play?.packageName ?? ''; }

  private setFree(u: User) {
    u.plan = 'free';
    u.planUntil = null;
    u.sub = null;
  }

  private applySub(u: User, s: PlaySubscription, token: string, plan: PlanId, now: number) {
    u.sub = {
      source: 'google', productId: s.productId, basePlanId: s.basePlanId, token, expiresAt: s.expiresAt,
      autoRenew: s.autoRenew, state: s.state, checkedAt: new Date(now).toISOString(),
    };
    u.plan = plan;
    // In a grace period the expiry is already past; keep access and look again tomorrow.
    u.planUntil = new Date(Math.max(Date.parse(s.expiresAt), now + DAY)).toISOString();
    if (s.basePlanId === PLAY_BASE_PLANS.year) u.billing = 'year';
    else if (s.basePlanId === PLAY_BASE_PLANS.month) u.billing = 'month';
  }

  /** Drop plans that ran out. Cheap and synchronous; called on every request. */
  lapse(u: User, now = Date.now()) {
    if (u.plan === 'free') return;
    const expired = !u.planUntil || Date.parse(u.planUntil) <= now;
    // With a live Play subscription, refresh() decides — it may have renewed.
    if (expired && !(u.sub && this.play)) {
      this.setFree(u);
      this.store.save();
    }
  }

  /** Re-check a Play subscription with Google when it is due (expired, or not checked for a day). */
  async refresh(u: User, force = false, now = Date.now()) {
    const sub = u.sub;
    if (!sub || !this.play) return;
    const due = force || Date.parse(sub.expiresAt) <= now || now - Date.parse(sub.checkedAt) > DAY;
    if (!due) return;
    if (!force && now - (this.lastAttempt.get(u.id) ?? 0) < RETRY_AFTER) return;
    this.lastAttempt.set(u.id, now);
    let s: PlaySubscription | null;
    try {
      s = await this.play.getSubscription(sub.token);
    } catch (e) {
      // Google unreachable: keep the current state and try again later rather than cutting access.
      console.warn('Play subscription check failed:', e instanceof Error ? e.message : e);
      return;
    }
    const plan = s ? planOfProduct(s.productId) : undefined;
    if (s && plan && entitled(s, now)) this.applySub(u, s, sub.token, plan, now);
    else this.setFree(u);
    this.store.save();
  }

  /** Verify a subscription purchase made in the app and switch the user's plan. */
  async activateSubscription(u: User, productId: string, token: string) {
    if (!this.play) throw new HttpError(501, 'billing_not_configured');
    const plan = planOfProduct(productId);
    if (!plan) throw bad('unknown_product');
    const hash = sha256(token);
    const db = this.store.db;
    if (db.purchases[hash] && db.purchases[hash].userId !== u.id) throw new HttpError(409, 'purchase_in_use');

    const s = await this.verify(() => this.play!.getSubscription(token));
    if (!s || s.productId !== productId) throw bad('purchase_invalid');
    if (s.accountId && s.accountId !== u.id) throw new HttpError(409, 'purchase_in_use');
    const now = Date.now();
    if (!entitled(s, now)) throw new HttpError(402, s.state === 'SUBSCRIPTION_STATE_PENDING' ? 'purchase_pending' : 'purchase_inactive');
    // Another request may have bound this token while we were waiting on Google.
    if (db.purchases[hash] && db.purchases[hash].userId !== u.id) throw new HttpError(409, 'purchase_in_use');

    if (!s.acknowledged) {
      // Unacknowledged purchases are refunded by Google after three days.
      await this.play.acknowledgeSubscription(productId, token)
        .catch((e) => console.warn('Play acknowledge failed:', e instanceof Error ? e.message : e));
    }
    db.purchases[hash] = { userId: u.id, kind: 'subscription', productId, points: 0, orderId: s.orderId, date: todayKey(), voided: false };
    this.applySub(u, s, token, plan, now);
    this.store.save();
  }

  /** Verify a point-pack purchase and credit it exactly once. */
  async creditPoints(u: User, productId: string, token: string): Promise<number> {
    if (!this.play) throw new HttpError(501, 'billing_not_configured');
    const pack = POINT_PACKS.find((p) => p.productId === productId);
    if (!pack) throw bad('unknown_product');
    const hash = sha256(token);
    const db = this.store.db;
    const seen = () => {
      const rec = db.purchases[hash];
      if (rec && rec.userId !== u.id) throw new HttpError(409, 'purchase_in_use');
      return !!rec;
    };
    if (seen()) return 0;

    const p = await this.verify(() => this.play!.getProduct(productId, token));
    if (!p) throw bad('purchase_invalid');
    if (p.accountId && p.accountId !== u.id) throw new HttpError(409, 'purchase_in_use');
    if (!p.purchased) throw new HttpError(402, 'purchase_pending');
    if (seen()) return 0; // a parallel request credited it while we were waiting on Google

    const points = pack.points * Math.max(1, p.quantity);
    db.purchases[hash] = { userId: u.id, kind: 'points', productId, points, orderId: p.orderId, date: todayKey(), voided: false };
    this.store.award(u, points, 'pt_buy');
    this.store.save();
    return points;
  }

  /** Real-time developer notification from Google Play (renewal, cancellation, refund…). */
  async handleNotification(n: PlayNotification) {
    const db = this.store.db;
    const subToken = n.subscriptionNotification?.purchaseToken;
    if (subToken) {
      const u = Object.values(db.users).find((x) => x.sub?.token === subToken);
      if (u) await this.refresh(u, true);
    }
    const voidToken = n.voidedPurchaseNotification?.purchaseToken;
    if (voidToken) {
      const rec = db.purchases[sha256(voidToken)];
      const u = rec ? db.users[rec.userId] : undefined;
      if (rec && !rec.voided) {
        rec.voided = true;
        if (u && rec.kind === 'points') this.store.award(u, -Math.min(rec.points, Math.max(0, u.points)), 'pt_refund');
        if (u && rec.kind === 'subscription' && u.sub?.token === voidToken) await this.refresh(u, true);
        this.store.save();
      }
    }
  }

  private async verify<T>(fn: () => Promise<T>): Promise<T> {
    try {
      return await fn();
    } catch (e) {
      console.error('Play verification failed:', e instanceof Error ? e.message : e);
      throw new HttpError(503, 'play_unavailable');
    }
  }
}
