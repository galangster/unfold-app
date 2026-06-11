import {
  resolveDeviceId,
  isEphemeralDeviceId,
  EPHEMERAL_DEVICE_ID_PREFIX,
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
