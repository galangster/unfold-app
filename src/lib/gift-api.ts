import * as AppleAuthentication from 'expo-apple-authentication';
import * as SecureStore from 'expo-secure-store';
import { PRIMARY_BACKEND_URL, getAuthHeaders } from '@/lib/api-config';
import { authenticatedFetch } from '@/lib/device-credential';
import { getDeviceId } from '@/lib/mmkv-storage';

const SESSION_KEY = 'unfold-gift-session';
const PENDING_PURCHASE_KEY = 'unfold-gift-pending-purchase';
const API = `${PRIMARY_BACKEND_URL}/api/gifts`;

export type GiftPurchase = {
  transactionId: string;
  code: string;
  status: 'available' | 'claimed' | 'refunded';
  claimedAt: string | null;
  expiresAt: string | null;
};

type PurchaseConfirmation = 'ready' | 'pending' | 'refunded';

export class GiftApiError extends Error {
  constructor(readonly code: string, readonly status: number, message: string) {
    super(message);
  }
}

async function sessionToken(): Promise<string | null> {
  const raw = await SecureStore.getItemAsync(SESSION_KEY);
  if (!raw) return null;
  try {
    const session = JSON.parse(raw) as { uid?: unknown; token?: unknown } | null;
    if (!session || typeof session !== 'object') return null;
    return session.uid === getDeviceId() && typeof session.token === 'string' ? session.token : null;
  } catch {
    return null;
  }
}

export async function hasGiftSession(): Promise<boolean> {
  return Boolean(await sessionToken());
}

async function callGiftApi<T>(path: string, method: 'GET' | 'POST', body?: unknown, withSession = true): Promise<T> {
  const headers = await getAuthHeaders();
  if (withSession) {
    const token = await sessionToken();
    if (!token) throw new GiftApiError('GIFT_SIGN_IN_REQUIRED', 401, 'Sign in with Apple to continue');
    headers.Authorization = `Bearer ${token}`;
  }
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 15_000);
  try {
    const response = await authenticatedFetch(`${API}${path}`, {
      method,
      headers,
      body: body === undefined ? undefined : JSON.stringify(body),
      signal: controller.signal,
    });
    const data = await response.json() as T & { error?: { code?: string; message?: string } };
    if (!response.ok) {
      if (response.status === 401 && withSession && data.error?.code === 'GIFT_SIGN_IN_REQUIRED') {
        await SecureStore.deleteItemAsync(SESSION_KEY);
      }
      throw new GiftApiError(
        data.error?.code ?? 'GIFT_REQUEST_FAILED',
        response.status,
        data.error?.message ?? 'Gift request failed. Try again.',
      );
    }
    return data;
  } finally {
    clearTimeout(timeout);
  }
}

export async function signInForGifts(): Promise<void> {
  if (!(await AppleAuthentication.isAvailableAsync())) {
    throw new GiftApiError('APPLE_SIGN_IN_UNAVAILABLE', 409, 'Sign in with Apple is unavailable on this device');
  }
  const { nonce } = await callGiftApi<{ nonce: string }>('/auth/challenge', 'POST', {}, false);
  const credential = await AppleAuthentication.signInAsync({ nonce });
  if (!credential.identityToken) {
    throw new GiftApiError('APPLE_SIGN_IN_FAILED', 401, 'Apple sign-in did not return an identity token');
  }
  const session = await callGiftApi<{ token: string }>(
    '/auth/session', 'POST', { nonce, identityToken: credential.identityToken }, false,
  );
  await SecureStore.setItemAsync(
    SESSION_KEY,
    JSON.stringify({ uid: getDeviceId(), token: session.token }),
    { keychainAccessible: SecureStore.AFTER_FIRST_UNLOCK },
  );
}

export async function startGiftIntent(): Promise<string> {
  const data = await callGiftApi<{ intentId: string }>('/purchases/intent', 'POST', {});
  return data.intentId;
}

export async function cancelGiftIntent(): Promise<void> {
  await callGiftApi('/purchases/cancel', 'POST', {});
}

export async function attachGiftPurchase(transactionId: string): Promise<PurchaseConfirmation> {
  const data = await callGiftApi<{ state: PurchaseConfirmation }>(
    '/purchases/attach', 'POST', { transactionId },
  );
  return data.state;
}

export async function rememberGiftIntent(intentId: string): Promise<void> {
  await SecureStore.setItemAsync(
    PENDING_PURCHASE_KEY,
    JSON.stringify({ uid: getDeviceId(), intentId }),
    { keychainAccessible: SecureStore.AFTER_FIRST_UNLOCK },
  );
}

export async function rememberGiftPurchase(intentId: string, transactionId: string): Promise<void> {
  await SecureStore.setItemAsync(
    PENDING_PURCHASE_KEY,
    JSON.stringify({ uid: getDeviceId(), intentId, transactionId }),
    { keychainAccessible: SecureStore.AFTER_FIRST_UNLOCK },
  );
}

export async function clearPendingGiftPurchase(): Promise<void> {
  await SecureStore.deleteItemAsync(PENDING_PURCHASE_KEY);
}

export async function resumePendingGiftPurchase(): Promise<PurchaseConfirmation | null> {
  const raw = await SecureStore.getItemAsync(PENDING_PURCHASE_KEY);
  if (!raw) return null;
  let pending: { uid?: unknown; intentId?: unknown; transactionId?: unknown } | null;
  try { pending = JSON.parse(raw); }
  catch { return null; }
  if (!pending || typeof pending !== 'object') return null;
  if (pending.uid !== getDeviceId()) return null;
  let state: PurchaseConfirmation;
  if (typeof pending.transactionId === 'string' && pending.transactionId.length > 0) {
    state = await attachGiftPurchase(pending.transactionId);
  } else if (typeof pending.intentId === 'string' && pending.intentId.length > 0) {
    const data = await callGiftApi<{ state: PurchaseConfirmation }>(
      `/purchases/intent/${encodeURIComponent(pending.intentId)}`, 'GET',
    );
    state = data.state;
  } else {
    return null;
  }
  if (state !== 'pending') await SecureStore.deleteItemAsync(PENDING_PURCHASE_KEY);
  return state;
}

export async function loadMyGifts(): Promise<GiftPurchase[]> {
  const data = await callGiftApi<{ gifts: GiftPurchase[] }>('/mine', 'GET');
  return data.gifts;
}

export async function claimGiftCode(code: string): Promise<string> {
  const data = await callGiftApi<{ expiresAt: string }>('/claim', 'POST', { code });
  return data.expiresAt;
}

export async function restoreMyGift(): Promise<string | null> {
  const data = await callGiftApi<{ expiresAt: string | null }>('/restore', 'POST', {});
  return data.expiresAt;
}
