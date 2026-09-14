import { isAmbientAudioEnabled } from '../ambient-audio-feature';

describe('successor music availability', () => {
  const original = process.env.EXPO_PUBLIC_ENABLE_AMBIENT_AUDIO;
  afterEach(() => {
    if (original === undefined) delete process.env.EXPO_PUBLIC_ENABLE_AMBIENT_AUDIO;
    else process.env.EXPO_PUBLIC_ENABLE_AMBIENT_AUDIO = original;
  });

  it('ships music access without requiring a QA or environment opt-in', () => {
    delete process.env.EXPO_PUBLIC_ENABLE_AMBIENT_AUDIO;
    expect(isAmbientAudioEnabled()).toBe(true);
  });

  it('honors the explicit build disable switch', () => {
    process.env.EXPO_PUBLIC_ENABLE_AMBIENT_AUDIO = '0';
    expect(isAmbientAudioEnabled()).toBe(false);
    process.env.EXPO_PUBLIC_ENABLE_AMBIENT_AUDIO = '1';
    expect(isAmbientAudioEnabled()).toBe(true);
  });
});
