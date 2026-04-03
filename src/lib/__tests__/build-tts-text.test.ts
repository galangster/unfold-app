// Mock native modules that tts-service.ts imports
jest.mock('expo-file-system', () => ({ File: jest.fn(), Paths: { cache: '' }, Directory: jest.fn() }));
jest.mock('expo-file-system/legacy', () => ({ downloadAsync: jest.fn(), getInfoAsync: jest.fn() }));
jest.mock('@/lib/logger', () => ({ logger: { log: jest.fn(), warn: jest.fn(), error: jest.fn() } }));
jest.mock('@/lib/report-error', () => ({ reportError: jest.fn() }));
jest.mock('@/lib/api-config', () => ({ getAuthHeaders: jest.fn(), PRIMARY_BACKEND_URL: 'http://test' }));
jest.mock('@/lib/rate-limit', () => ({ checkRateLimit: jest.fn(), incrementRateLimit: jest.fn() }));

import { buildTtsText, humanizeReference } from '../tts-service';

describe('humanizeReference', () => {
  it('converts chapter:verse format', () => {
    expect(humanizeReference('Romans 8:28')).toBe('Romans chapter 8, verse 28');
  });

  it('converts chapter:verse-verse range', () => {
    expect(humanizeReference('Psalm 139:1-4')).toBe('Psalm chapter 139, verses 1 through 4');
  });

  it('leaves text without colons unchanged', () => {
    expect(humanizeReference('Genesis')).toBe('Genesis');
  });

  it('handles multiple references', () => {
    expect(humanizeReference('John 3:16; Romans 8:28')).toBe(
      'John chapter 3, verse 16; Romans chapter 8, verse 28'
    );
  });
});

describe('buildTtsText', () => {
  const mockDay = {
    scriptureReference: 'Psalm 23:1-3',
    scriptureText: 'The Lord is my shepherd, I shall not want.',
    bodyText: 'Today we explore what it means to rest in God.',
  };

  it('produces the exact format used by reading.tsx inline construction', () => {
    const expected =
      'Psalm chapter 23, verses 1 through 3.\n\n' +
      'The Lord is my shepherd, I shall not want.\n\n' +
      '...\n\n' +
      'Today we explore what it means to rest in God.';

    expect(buildTtsText(mockDay)).toBe(expected);
  });

  it('handles empty scriptureReference', () => {
    const day = { ...mockDay, scriptureReference: '' };
    const result = buildTtsText(day);
    expect(result).toContain('.\n\n');
    expect(result).toContain(mockDay.scriptureText);
  });
});
