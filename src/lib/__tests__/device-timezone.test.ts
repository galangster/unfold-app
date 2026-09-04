import { getDeviceTimezone } from '../device-timezone';

describe('getDeviceTimezone', () => {
  it('reports the runtime IANA zone', () => {
    const zone = getDeviceTimezone();
    expect(typeof zone).toBe('string');
    expect(zone?.length).toBeGreaterThan(0);
    expect(() => new Intl.DateTimeFormat('en-US', { timeZone: zone ?? undefined })).not.toThrow();
  });
});
