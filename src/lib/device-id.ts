/**
 * Pure helper for resolving the stable device identity.
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
