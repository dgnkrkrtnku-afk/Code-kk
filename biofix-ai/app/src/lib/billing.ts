// Google Play Billing on the device. The phone only starts purchases and hands the resulting
// purchase token to our server; the server verifies it with Google and decides what the user gets.
// Nothing here grants access on its own.
import Constants, { ExecutionEnvironment } from 'expo-constants';
import { Platform } from 'react-native';
import type { ProductSubscriptionAndroid, Purchase } from 'expo-iap';
import { ApiError, type Api } from './api';
import type { Me } from './types';

type Iap = typeof import('expo-iap');

/**
 * Play Billing needs the native module, which exists only in a real Android build
 * (not in Expo Go, on the web, or on iOS).
 */
export const playBillingSupported =
  Platform.OS === 'android' && Constants.executionEnvironment !== ExecutionEnvironment.StoreClient;

let mod: Iap | null | undefined;
function iap(): Iap | null {
  if (!playBillingSupported) return null;
  if (mod === undefined) {
    try {
      // Loaded lazily: importing it where the native module is missing would crash the app at start.
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      mod = require('expo-iap') as Iap;
    } catch {
      mod = null;
    }
  }
  return mod;
}

export interface PlayPrices {
  /** productId → basePlanId → price text formatted by Google Play in the buyer's currency. */
  subs: Record<string, Record<string, string>>;
  /** productId → price text. */
  packs: Record<string, string>;
}

interface Session { api: Api; userId: string; catalog: Me['billing']; onMe: (me: Me) => void }
type Waiter = { resolve: () => void; reject: (e: unknown) => void };

let session: Session | null = null;
let connected = false;
let listeners: { remove(): void }[] = [];
const waiters = new Map<string, Waiter>();

const isOurs = (productId: string) =>
  !!session && (Object.values(session.catalog.subs).includes(productId) || session.catalog.packs.some((p) => p.productId === productId));
const isPack = (productId: string) => !!session?.catalog.packs.some((p) => p.productId === productId);

function settleWaiter(productId: string, error?: unknown) {
  const w = waiters.get(productId);
  if (!w) return;
  waiters.delete(productId);
  if (error === undefined) w.resolve();
  else w.reject(error);
}

/**
 * Report a purchase to the server, then finish it with Play.
 * Finishing acknowledges a subscription and consumes a point pack (so it can be bought again).
 * Safe to call repeatedly: the server credits each purchase token only once.
 */
async function deliver(purchase: Purchase): Promise<void> {
  const m = iap();
  const s = session;
  if (!m || !s || !isOurs(purchase.productId)) return;
  const token = purchase.purchaseToken;
  if (!token) return;
  if (purchase.purchaseState !== 'purchased') {
    // Pending (e.g. cash or slow card): Play notifies again when it completes.
    settleWaiter(purchase.productId, new ApiError('purchase_pending'));
    return;
  }
  const pack = isPack(purchase.productId);
  try {
    const r = await s.api.post<{ me: Me }>(pack ? '/billing/google/points' : '/billing/google/subscription', {
      productId: purchase.productId, purchaseToken: token,
    });
    s.onMe(r.me);
    await m.finishTransaction({ purchase, isConsumable: pack }).catch(() => { /* already finished */ });
    settleWaiter(purchase.productId);
  } catch (e) {
    settleWaiter(purchase.productId, e);
  }
}

function onError(e: { productId?: string | null }) {
  const m = iap();
  const cancelled = !!m && m.isUserCancelledError(e);
  const err = new ApiError(cancelled ? 'cancelled' : 'store_error');
  if (e.productId) settleWaiter(e.productId, err);
  else [...waiters.keys()].forEach((k) => settleWaiter(k, err));
}

/** Connect to Play and pick up purchases that were paid for but not delivered yet (app closed, no network…). */
export async function startBilling(s: Session): Promise<void> {
  stopBilling(); // one session at a time
  session = s;
  const m = iap();
  if (!m || !s.catalog.google) return;
  listeners = [m.purchaseUpdatedListener((p) => { void deliver(p); }), m.purchaseErrorListener(onError)];
  try {
    await m.initConnection();
    if (session !== s) return; // signed out or replaced while connecting
    connected = true;
    await restorePurchases();
  } catch {
    if (session === s) stopBilling();
  }
}

export function stopBilling() {
  listeners.forEach((l) => l.remove());
  listeners = [];
  if (connected) iap()?.endConnection().catch(() => {});
  connected = false;
  session = null;
  [...waiters.keys()].forEach((k) => settleWaiter(k, new ApiError('cancelled')));
}

/** Can a purchase be started right now? */
export const billingReady = () => connected && !!session;

/** Re-send every purchase Play still holds for this Google account. Returns how many were sent. */
export async function restorePurchases(): Promise<number> {
  const m = iap();
  if (!m || !connected) return 0;
  const owned = (await m.getAvailablePurchases()).filter((p) => isOurs(p.productId));
  for (const p of owned) await deliver(p);
  return owned.length;
}

/** Prices as Google Play will charge them, for display. Empty when Play is unavailable. */
export async function loadPrices(): Promise<PlayPrices> {
  const out: PlayPrices = { subs: {}, packs: {} };
  const m = iap();
  const s = session;
  if (!m || !s || !connected) return out;
  try {
    const subs = (await m.fetchProducts({ skus: Object.values(s.catalog.subs), type: 'subs' })) ?? [];
    for (const p of subs as ProductSubscriptionAndroid[]) {
      out.subs[p.id] = {};
      for (const o of p.subscriptionOffers ?? []) {
        const base = o.basePlanIdAndroid;
        // Keep the plain base-plan price; skip introductory offers with several pricing phases.
        if (base && (out.subs[p.id][base] === undefined || (o.pricingPhasesAndroid?.pricingPhaseList.length ?? 1) === 1)) {
          out.subs[p.id][base] = o.displayPrice;
        }
      }
    }
    const packs = (await m.fetchProducts({ skus: s.catalog.packs.map((p) => p.productId), type: 'in-app' })) ?? [];
    for (const p of packs) out.packs[p.id] = p.displayPrice;
  } catch { /* show our own prices instead */ }
  return out;
}

function waitFor(productId: string): Promise<void> {
  settleWaiter(productId, new ApiError('cancelled')); // replace an abandoned attempt
  return new Promise<void>((resolve, reject) => waiters.set(productId, { resolve, reject }));
}

/**
 * Buy (or switch to) a subscription. Resolves once the server has verified the purchase and the
 * plan is active. Rejects with ApiError: 'cancelled' when the user backs out, 'purchase_pending'
 * when payment is still processing, or a server/store code.
 */
export async function buySubscription(productId: string, basePlanId: string): Promise<void> {
  const m = iap();
  const s = session;
  if (!m || !s || !connected) throw new ApiError('store_error');

  const products = ((await m.fetchProducts({ skus: [productId], type: 'subs' })) ?? []) as ProductSubscriptionAndroid[];
  const product = products.find((p) => p.id === productId);
  const offers = (product?.subscriptionOffers ?? []).filter((o) => o.basePlanIdAndroid === basePlanId && o.offerTokenAndroid);
  const offer = offers.find((o) => (o.pricingPhasesAndroid?.pricingPhaseList.length ?? 1) === 1) ?? offers[0];
  if (!offer?.offerTokenAndroid) throw new ApiError('no_product');

  // An existing BioFix subscription on this Google account is replaced, never stacked.
  const subIds = Object.values(s.catalog.subs);
  const current = (await m.getAvailablePurchases()).find((p) => subIds.includes(p.productId) && p.purchaseToken);
  if (current && current.productId === productId && current.currentPlanId === basePlanId) {
    // Already subscribed to exactly this: just make sure the server knows.
    const done = waitFor(productId);
    void deliver(current);
    return done;
  }

  const done = waitFor(productId);
  try {
    await m.requestPurchase({
      type: 'subs',
      request: {
        google: {
          skus: [productId],
          subscriptionOffers: [{ sku: productId, offerToken: offer.offerTokenAndroid }],
          // Ties the purchase to this BioFix account; the server refuses it for any other account.
          obfuscatedAccountId: s.userId,
          ...(current?.purchaseToken
            ? {
              purchaseToken: current.purchaseToken,
              subscriptionProductReplacementParams: { oldProductId: current.productId, replacementMode: 'with-time-proration' as const },
            }
            : {}),
        },
      },
    });
  } catch (e) {
    settleWaiter(productId, new ApiError(m.isUserCancelledError(e) ? 'cancelled' : 'store_error'));
  }
  return done;
}

/** Buy a point pack. Resolves once the server has verified the purchase and credited the points. */
export async function buyPack(productId: string): Promise<void> {
  const m = iap();
  const s = session;
  if (!m || !s || !connected) throw new ApiError('store_error');
  const done = waitFor(productId);
  try {
    await m.requestPurchase({
      type: 'in-app',
      request: { google: { skus: [productId], obfuscatedAccountId: s.userId } },
    });
  } catch (e) {
    settleWaiter(productId, new ApiError(m.isUserCancelledError(e) ? 'cancelled' : 'store_error'));
  }
  return done;
}

/** Link to this subscription in the Play Store, where the user can cancel or change payment. */
export const manageSubscriptionUrl = (productId: string, packageName: string) =>
  `https://play.google.com/store/account/subscriptions?sku=${encodeURIComponent(productId)}&package=${encodeURIComponent(packageName)}`;
