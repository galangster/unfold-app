/**
 * Pure helpers for resolving Keychain-backed identity values.
 *
 * The device-id is the sole auth credential sent to the backend (X-Device-ID
 * header) and the seed for the RevenueCat anonymous app-user-id. It must
 * survive reinstall; storing it in the iOS Keychain / Android Keystore
 * (via expo-secure-store) achieves this because reinstall wipes MMKV but
 * not the Keychain.
 *
 * Consumers must NOT call SecureStore/MMKV directly — go through getDeviceId()
 * in mmkv-storage.ts which uses this logic.
 */

/**
 * FAP-LIB-1/FAP-X-4: prefix of the identity used for a RECOVERY session when
 * no Keychain value is readable. Such an id is in-memory only — NEVER
 * persisted — and dies with the session, so sync code must refuse to queue
 * or push work under it (server rows would be permanently orphaned). A v4
 * UUID can never start with this prefix.
 */
export const EPHEMERAL_DEVICE_ID_PREFIX = 'ephemeral-';

/** True when the id is a one-session recovery identity (see prefix above). */
export function isEphemeralDeviceId(id: string): boolean {
  return id.startsWith(EPHEMERAL_DEVICE_ID_PREFIX);
}

export interface ResolveDeviceIdArgs {
  secureValue: string | null;
  mmkvValue: string | null;
  generate: () => string;
}

export interface ResolveDeviceIdResult {
  id: string;
  /** Write the resolved id to SecureStore */
  writeSecure: boolean;
  /** Write the resolved id to MMKV (mirror/fallback) */
  writeMmkv: boolean;
}

/**
 * Decision table:
 *   secureValue=K, mmkvValue=M  → { id:K, writeSecure:false, writeMmkv:true  }  mirror keychain→MMKV
 *   secureValue=K, mmkvValue=K  → { id:K, writeSecure:false, writeMmkv:false }  already consistent
 *   secureValue=null, mmkvValue=M → { id:M, writeSecure:true,  writeMmkv:false } migrate MMKV→keychain
 *   secureValue=null, mmkvValue=null → { id:G, writeSecure:true,  writeMmkv:true  } fresh generate
 */
export function resolveDeviceId(args: ResolveDeviceIdArgs): ResolveDeviceIdResult {
  const { secureValue, mmkvValue, generate } = args;

  if (secureValue !== null) {
    // Keychain has a value — that is authoritative.
    const writeMmkv = mmkvValue !== secureValue;
    return { id: secureValue, writeSecure: false, writeMmkv };
  }

  if (mmkvValue !== null) {
    // No Keychain value but MMKV has one — existing user, migrate upward.
    return { id: mmkvValue, writeSecure: true, writeMmkv: false };
  }

  // Neither source has a value — fresh install; generate once and write both.
  const id = generate();
  return { id, writeSecure: true, writeMmkv: true };
}

// ---------------------------------------------------------------------------
// Keychain accessibility migration (locked-device boot)
// ---------------------------------------------------------------------------

/**
 * Suffix of the second key name every Keychain item this app owns is migrated
 * to.
 *
 * expo-secure-store writes items as `kSecAttrAccessibleWhenUnlocked`
 * (SecureStoreOptions.swift), and it CANNOT change that in place: on a
 * duplicate item its set path falls through to `update()`, which writes only
 * `kSecValueData` (SecureStoreModule.swift). Accessibility is therefore fixed
 * at creation, and the only migration available is a NEW key name written with
 * the accessibility we want. The original key name stays on the device — a
 * later release removes it, once every install has read it forward at least
 * once.
 */
export const KEYCHAIN_V2_SUFFIX = '-v2';

/** The migrated key name for `key`. */
export function keychainV2KeyFor(key: string): string {
  return key + KEYCHAIN_V2_SUFFIX;
}

export interface ResolveKeychainReadArgs {
  /** Value under the migrated key name, or null when it is absent. */
  v2Value: string | null;
  /** Value under the original key name, or null when it is absent. */
  v1Value: string | null;
}

export interface ResolveKeychainReadResult {
  /** The value to use, or null when the item is absent from BOTH key names. */
  value: string | null;
  /** Copy `value` to the migrated key name under the new accessibility. */
  migrate: boolean;
}

/**
 * Read order for a Keychain item that is being migrated to a second key name.
 *
 * Decision table:
 *   v2='V',  v1=*     → { value: 'V',  migrate: false }  already migrated
 *   v2=null, v1='V'   → { value: 'V',  migrate: true  }  copy v1 forward
 *   v2=null, v1=null  → { value: null, migrate: false }  genuinely absent
 *
 * A null here means PROVEN ABSENCE. The caller must never pass null for a read
 * that threw — expo-secure-store throws when the Keychain is unreadable, and
 * only a proven absence may mint a new value.
 */
export function resolveKeychainRead(args: ResolveKeychainReadArgs): ResolveKeychainReadResult {
  const { v2Value, v1Value } = args;

  if (v2Value !== null) return { value: v2Value, migrate: false };
  if (v1Value !== null) return { value: v1Value, migrate: true };
  return { value: null, migrate: false };
}
