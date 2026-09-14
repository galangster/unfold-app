import { REVEAL_GRADIENT_VARIANTS } from '@/lib/reveal-gradient-palette';

import {
  REVEAL_SHADER_SOURCES,
  getRevealRuntimeEffect,
  resetRevealShaderCache,
} from '@/components/reveal/reveal-gradient-shader';

const mockMake = jest.fn<{ source: () => string } | null, [string]>((source) => ({ source: () => source }));

jest.mock('@shopify/react-native-skia', () => ({
  Skia: {
    RuntimeEffect: {
      Make: (source: string) => mockMake(source),
    },
  },
}));

describe('reveal-gradient-shader', () => {
  beforeEach(() => {
    resetRevealShaderCache();
    mockMake.mockClear();
    mockMake.mockImplementation((source: string) => ({ source: () => source }));
  });

  it('ships original SKSL for the seven families and omits Forms', () => {
    expect(Object.keys(REVEAL_SHADER_SOURCES)).toEqual([...REVEAL_GRADIENT_VARIANTS]);
    expect(REVEAL_SHADER_SOURCES).not.toHaveProperty('forms');

  });

  it('compiles a variant once and retains the effect', () => {
    const first = getRevealRuntimeEffect('prism');
    const second = getRevealRuntimeEffect('prism');
    expect(first).toBe(second);
    expect(mockMake).toHaveBeenCalledTimes(1);
    getRevealRuntimeEffect('sky');
    expect(mockMake).toHaveBeenCalledTimes(2);
  });

  it('returns null quietly when compilation fails', () => {
    mockMake.mockImplementationOnce(() => null);
    expect(getRevealRuntimeEffect('glow')).toBeNull();
    expect(getRevealRuntimeEffect('glow')).toBeNull();
    expect(mockMake).toHaveBeenCalledTimes(1);
  });

});
