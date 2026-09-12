/**
 * Manual mock for `jest.mock('@/lib/device-credential')`.
 *
 * `authenticatedFetch` forwards to the global fetch the test controls, so a
 * request-path test can assert the transport without touching the Keychain.
 * The other exports are inert stand-ins.
 */
export const DEVICE_CREDENTIAL_STORE_KEY = 'unfold-device-credential';

export const getCachedDeviceCredential = jest.fn((): string | null => null);
export const loadDeviceCredential = jest.fn(async (): Promise<void> => undefined);
export const ensureDeviceCredential = jest.fn(async (): Promise<string | null> => null);
export const clearDeviceCredential = jest.fn(async (): Promise<void> => undefined);
export const authenticatedFetch = jest.fn((url: string, init?: RequestInit) => fetch(url, init));
export const resetDeviceCredentialForTesting = jest.fn((): void => undefined);
