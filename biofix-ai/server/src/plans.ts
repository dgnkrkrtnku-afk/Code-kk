import type { PlanId } from './types.js';

export interface Plan {
  usd: number;
  quota: number;     // daily AI diagnoses; Infinity = unlimited
  sell: number;      // marketplace listing limit
  teach: boolean;    // may create and sell training programs
  photo: boolean;    // photo diagnosis
}

export const PLANS: Record<PlanId, Plan> = {
  free: { usd: 0, quota: 5, sell: 0, teach: false, photo: false },
  pro: { usd: 12, quota: Infinity, sell: 0, teach: false, photo: true },
  trainer: { usd: 29, quota: Infinity, sell: 0, teach: true, photo: true },
  biz: { usd: 79, quota: Infinity, sell: 50, teach: false, photo: true },
  org: { usd: 249, quota: Infinity, sell: Infinity, teach: true, photo: true },
};

// Own keys only: `'constructor' in PLANS` is true, and treating that as a plan would skip every limit.
export const isPlan = (k: unknown): k is PlanId => typeof k === 'string' && Object.hasOwn(PLANS, k);

/** Points awarded per action, and the points ⇄ USD rate. */
export const PT = { teach: 20, verified: 100, vote: 5, review: 15 } as const;
export const PT_PER_USD = 50;
/** How many times a day each action earns points. More is allowed, it just isn't rewarded (anti-farming). */
export const DAILY_REWARDS = { teach: 5, vote: 20, verified: 3 } as const;
export const ptsFor = (usd: number) => Math.round(usd * PT_PER_USD);
export const planPrice = (k: PlanId, billing: 'month' | 'year') => PLANS[k].usd * (billing === 'year' ? 10 : 1);

/** JSON can't carry Infinity, so the API sends -1 for "unlimited". */
export const planForClient = (k: PlanId) => {
  const p = PLANS[k];
  return { ...p, quota: p.quota === Infinity ? -1 : p.quota, sell: p.sell === Infinity ? -1 : p.sell };
};
