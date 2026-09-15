/* eslint-disable @typescript-eslint/no-require-imports -- Reload the font registry for each native build scenario. */
const mockPlatform = { OS: 'ios' };
const mockGetLoadedFonts = jest.fn<string[], []>();

jest.mock('react-native', () => ({ Platform: mockPlatform }));
jest.mock('expo-font', () => ({ getLoadedFonts: mockGetLoadedFonts }));

const iosFonts = [
  'PPEditorialNew-Light',
  'Inter-Regular', 'Inter-Italic', 'Inter-Medium', 'Inter-SemiBold', 'Inter-Bold',
  'SourceSerifPro-Regular', 'SourceSerifPro-It', 'SourceSerifPro-SemiBold', 'SourceSerifPro-Bold',
];
const androidFonts = [
  'PPEditorialNew-Light',
  'Inter_400Regular', 'Inter_400Regular_Italic', 'Inter_500Medium', 'Inter_600SemiBold', 'Inter_700Bold',
  'SourceSerifPro_400Regular', 'SourceSerifPro_400Regular_Italic', 'SourceSerifPro_600SemiBold', 'SourceSerifPro_700Bold',
];

function resolveFonts() {
  let result: typeof import('../fonts') | undefined;
  jest.isolateModules(() => { result = require('../fonts'); });
  return result!;
}

describe('embedded startup font compatibility', () => {
  const originalEnvironment = process.env.NODE_ENV;

  beforeEach(() => {
    process.env.NODE_ENV = 'production';
    mockPlatform.OS = 'ios';
    mockGetLoadedFonts.mockReset().mockReturnValue(iosFonts);
  });

  afterEach(() => { process.env.NODE_ENV = originalEnvironment; });

  it('uses registered iOS names without requesting runtime font loading', () => {
    const fonts = resolveFonts();
    expect(fonts.shouldLoadBundledFontsAtRuntime).toBe(false);
    expect(fonts.FontFamily.ui).toBe('Inter-Regular');
    expect(fonts.FontFamily.uiSemiBold).toBe('Inter-SemiBold');
    expect(fonts.SourceSerifFontFamily.italic).toBe('SourceSerifPro-It');
    expect(fonts.FontFamily.bodyItalic).toBe(fonts.FontFamily.body);
  });

  it.each([[[] as string[]], [iosFonts.slice(0, -1)]])('loads every runtime alias when the native build has missing fonts: %j', (loaded: string[]) => {
    mockGetLoadedFonts.mockReturnValue(loaded);
    const fonts = resolveFonts();
    expect(fonts.shouldLoadBundledFontsAtRuntime).toBe(true);
    expect(fonts.FontFamily.ui).toBe('Inter_400Regular');
    expect(fonts.SourceSerifFontFamily.italic).toBe('SourceSerifPro_400Regular_Italic');
  });

  it('keeps the configured aliases for an embedded Android build', () => {
    mockPlatform.OS = 'android';
    mockGetLoadedFonts.mockReturnValue(androidFonts);
    const fonts = resolveFonts();
    expect(fonts.shouldLoadBundledFontsAtRuntime).toBe(false);
    expect(fonts.FontFamily.ui).toBe('Inter_400Regular');
  });

  it('loads web fonts through the runtime without reading a native registry', () => {
    mockPlatform.OS = 'web';
    expect(resolveFonts().shouldLoadBundledFontsAtRuntime).toBe(true);
    expect(mockGetLoadedFonts).not.toHaveBeenCalled();
  });

  it('falls back to runtime loading when the native registry is unavailable', () => {
    mockGetLoadedFonts.mockImplementation(() => { throw new Error('Registry unavailable'); });
    expect(resolveFonts().shouldLoadBundledFontsAtRuntime).toBe(true);
  });
});
