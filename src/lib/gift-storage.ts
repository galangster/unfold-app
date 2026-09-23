import * as SecureStore from 'expo-secure-store';

export const GIFT_SESSION_KEY = 'unfold-gift-session';
export const GIFT_PENDING_PURCHASE_KEY = 'unfold-gift-pending-purchase';

export async function clearGiftSession(): Promise<void> {
  await SecureStore.deleteItemAsync(GIFT_SESSION_KEY);
}

export async function clearPendingGiftPurchase(): Promise<void> {
  await SecureStore.deleteItemAsync(GIFT_PENDING_PURCHASE_KEY);
}
