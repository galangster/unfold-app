import { readFileSync } from 'fs';
import { join } from 'path';

function readSource(relativePath: string): string {
  return readFileSync(join(process.cwd(), relativePath), 'utf8');
}

const THEME_KEYBOARD_APPEARANCE = "keyboardAppearance={isDark ? 'dark' : 'light'}";

function countOccurrences(source: string, needle: string): number {
  return source.split(needle).length - 1;
}

// WR-14: every writing surface must drive the iOS keyboard appearance from the
// app theme (not the system theme) so dark-mode users don't get a light keyboard.
describe('writing surfaces keyboard appearance source contract', () => {
  it.each([
    ['src/components/ui/Input.tsx', 1],
    ['src/components/companion/CompanionInput.tsx', 1],
    ['src/components/bible/BibleNoteSheet.tsx', 1],
    ['src/components/AdaptiveQuestionFlow.tsx', 1],
    ['src/components/reading/InlineReflectionJournal.tsx', 1],
    ['src/components/CheckInSheet.tsx', 2],
    ['src/app/(tabs)/(today)/journal.tsx', 4],
    ['src/app/(tabs)/(journal)/note-detail.tsx', 2],
  ])('%s sets theme-driven keyboardAppearance on %i input(s)', (file, expectedCount) => {
    const source = readSource(file);
    expect(countOccurrences(source, THEME_KEYBOARD_APPEARANCE)).toBe(expectedCount);
  });

  it('the shared Input applies keyboardAppearance before rest-prop spread so callers can override', () => {
    const source = readSource('src/components/ui/Input.tsx');
    const appearanceIndex = source.indexOf(THEME_KEYBOARD_APPEARANCE);
    const restSpreadIndex = source.indexOf('{...rest}');
    expect(appearanceIndex).toBeGreaterThan(-1);
    expect(restSpreadIndex).toBeGreaterThan(-1);
    expect(appearanceIndex).toBeLessThan(restSpreadIndex);
  });
});
