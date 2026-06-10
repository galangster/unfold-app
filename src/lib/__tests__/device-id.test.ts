import { resolveDeviceId } from '../device-id';

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
