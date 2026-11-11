// Google Play Developer API client: server-side verification of purchases made in the app.
// Docs: https://developers.google.com/android-publisher/api-ref/rest/v3/purchases.subscriptionsv2
//       https://developers.google.com/android-publisher/api-ref/rest/v3/purchases.products
import fs from 'node:fs';
import { GoogleAuth } from 'google-auth-library';

export interface PlaySubscription {
  state: string;            // SUBSCRIPTION_STATE_*
  productId: string;
  basePlanId: string;
  expiresAt: string;        // RFC 3339
  autoRenew: boolean;
  acknowledged: boolean;
  /** The app account the purchase was started for (obfuscatedAccountId), when Play reports it. */
  accountId: string | null;
  orderId: string;
}

export interface PlayProductPurchase {
  purchased: boolean;       // false while pending or after cancellation
  orderId: string;
  accountId: string | null;
  quantity: number;
}

export interface PlayClient {
  readonly packageName: string;
  /** Returns null when Play does not know the token. Throws on network/permission problems. */
  getSubscription(token: string): Promise<PlaySubscription | null>;
  acknowledgeSubscription(productId: string, token: string): Promise<void>;
  getProduct(productId: string, token: string): Promise<PlayProductPurchase | null>;
}

interface SubscriptionPurchaseV2 {
  subscriptionState?: string;
  acknowledgementState?: string;
  latestOrderId?: string;
  externalAccountIdentifiers?: { obfuscatedExternalAccountId?: string };
  lineItems?: {
    productId?: string;
    expiryTime?: string;
    latestSuccessfulOrderId?: string;
    autoRenewingPlan?: { autoRenewEnabled?: boolean };
    offerDetails?: { basePlanId?: string };
  }[];
}

interface ProductPurchase {
  purchaseState?: number;   // 0 purchased, 1 canceled, 2 pending
  orderId?: string;
  obfuscatedExternalAccountId?: string;
  quantity?: number;
}

const statusOf = (e: unknown): number =>
  Number((e as { status?: number; response?: { status?: number } })?.status ?? (e as { response?: { status?: number } })?.response?.status ?? 0);

/** Builds the client from env, or returns null when Google Play is not configured. */
export function createPlayClient(): PlayClient | null {
  const packageName = process.env.GOOGLE_PLAY_PACKAGE;
  const inline = process.env.GOOGLE_SERVICE_ACCOUNT_JSON;
  const file = process.env.GOOGLE_SERVICE_ACCOUNT_FILE;
  if (!packageName || !(inline || file)) return null;
  const credentials = JSON.parse(inline || fs.readFileSync(file!, 'utf8'));
  const auth = new GoogleAuth({ credentials, scopes: ['https://www.googleapis.com/auth/androidpublisher'] });
  const base = `https://androidpublisher.googleapis.com/androidpublisher/v3/applications/${encodeURIComponent(packageName)}/purchases`;
  const enc = encodeURIComponent;

  async function get<T>(url: string): Promise<T | null> {
    try {
      return (await auth.request<T>({ url, method: 'GET' })).data;
    } catch (e) {
      // 400/404/410: the token is malformed, unknown, or too old — i.e. not a valid purchase.
      if ([400, 404, 410].includes(statusOf(e))) return null;
      throw e;
    }
  }

  return {
    packageName,
    async getSubscription(token) {
      const s = await get<SubscriptionPurchaseV2>(`${base}/subscriptionsv2/tokens/${enc(token)}`);
      const item = s?.lineItems?.[0];
      if (!s || !item?.productId || !item.expiryTime) return null;
      return {
        state: s.subscriptionState || 'SUBSCRIPTION_STATE_UNSPECIFIED',
        productId: item.productId,
        basePlanId: item.offerDetails?.basePlanId || '',
        expiresAt: item.expiryTime,
        autoRenew: !!item.autoRenewingPlan?.autoRenewEnabled,
        acknowledged: s.acknowledgementState === 'ACKNOWLEDGEMENT_STATE_ACKNOWLEDGED',
        accountId: s.externalAccountIdentifiers?.obfuscatedExternalAccountId || null,
        orderId: s.latestOrderId || item.latestSuccessfulOrderId || '',
      };
    },
    async acknowledgeSubscription(productId, token) {
      await auth.request({ url: `${base}/subscriptions/${enc(productId)}/tokens/${enc(token)}:acknowledge`, method: 'POST', data: {} });
    },
    async getProduct(productId, token) {
      const p = await get<ProductPurchase>(`${base}/products/${enc(productId)}/tokens/${enc(token)}`);
      if (!p) return null;
      return {
        purchased: p.purchaseState === 0 || p.purchaseState === undefined,
        orderId: p.orderId || '',
        accountId: p.obfuscatedExternalAccountId || null,
        quantity: p.quantity || 1,
      };
    },
  };
}
