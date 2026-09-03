import {
  resolveDeviceId,
  resolveKeychainRead,
  keychainV2KeyFor,
  isEphemeralDeviceId,
  EPHEMERAL_DEVICE_ID_PREFIX,
  KEYCHAIN_V2_SUFFIX,
} from '../device-id';

describe('resolveDeviceId', () => {
  it('prefers the keychain value', () => {
    const result = resolveDeviceId({ secureValue: 'K', mmkvValue: 'M', generate: () => 'G' });
    expect(result).toEqual({ id: 'K', writeSecure: false, writeMmkv: true });
  });

  it('migrates an existing MMKV id into the keychain', () => {
    const result = resolveDeviceId({ secureValue: null, mmkvValue: 'M', generate: () => 'G' });
    expect(result).toEqual({ id: 'M', writeSecure: true, writeMmkv: false });
  });

  it('generates once and writes both', () => {
    const result = resolveDeviceId({ secureValue: null, mmkvValue: null, generate: () => 'G' });
    expect(result).toEqual({ id: 'G', writeSecure: true, writeMmkv: true });
  });

  it('keychain and mirror already consistent', () => {
    const result = resolveDeviceId({ secureValue: 'K', mmkvValue: 'K', generate: () => 'G' });
    expect(result).toEqual({ id: 'K', writeSecure: false, writeMmkv: false });
  });
});

describe('isEphemeralDeviceId (FAP-LIB-1/FAP-X-4)', () => {
  it('detects the ephemeral recovery-session prefix', () => {
    expect(isEphemeralDeviceId(`${EPHEMERAL_DEVICE_ID_PREFIX}1b9cd2f7`)).toBe(true);
  });

  it('a normal UUID identity is not ephemeral', () => {
    expect(isEphemeralDeviceId('1b9cd2f7-86c1-4f6e-9def-0123456789ab')).toBe(false);
  });

  it('an ephemeral id can never look like a UUID', () => {
    // Sync code keys refusals on this prefix. A canonical UUID head is
    // 8 hex chars followed by '-'; 'ephemeral-' contains non-hex letters
    // (p/h/m/r/l) inside that window, so no UUID can carry the prefix and
    // no ephemeral id can pass for a UUID.
    expect(/^[0-9a-fA-F]{8}-/.test(`${EPHEMERAL_DEVICE_ID_PREFIX}1b9cd2f7`)).toBe(false);
  });
});

describe('resolveKeychainRead (locked-device key migration)', () => {
  it('prefers the migrated key and does not copy again', () => {
    const result = resolveKeychainRead({ v2Value: 'V2', v1Value: 'V1' });
    expect(result).toEqual({ value: 'V2', migrate: false });
  });

  it('falls back to the original key and asks for the copy forward', () => {
    const result = resolveKeychainRead({ v2Value: null, v1Value: 'V1' });
    expect(result).toEqual({ value: 'V1', migrate: true });
  });

  it('reports a genuinely absent item without asking for a copy', () => {
    // The ONLY outcome a caller may answer by minting a new value. A read that
    // THREW must never reach this function as a null.
    const result = resolveKeychainRead({ v2Value: null, v1Value: null });
    expect(result).toEqual({ value: null, migrate: false });
  });

  it('keeps the migrated key name in one place', () => {
    // expo-secure-store cannot change accessibility in place (its set path
    // updates only kSecValueData on an existing item), so the migration IS the
    // second key name. Both readers must derive it the same way.
    expect(keychainV2KeyFor('unfold-device-id')).toBe('unfold-device-id-v2');
    expect(keychainV2KeyFor('unfold-mmkv-encryption-key')).toBe(
      `unfold-mmkv-encryption-key${KEYCHAIN_V2_SUFFIX}`,
    );
  });
});
