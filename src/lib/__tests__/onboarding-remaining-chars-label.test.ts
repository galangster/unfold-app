import * as fs from 'fs';
import * as path from 'path';

// onboarding.tsx pulls in native-only modules (DateTimePicker,
// KeyboardAwareScrollView, etc.) that make importing the whole screen file
// impractical in a unit test, so this extracts the pure
// `remainingCharsLabel` helper's exact source text and evaluates it in
// isolation rather than mocking the entire screen.
const src = fs.readFileSync(
  path.join(__dirname, '../../app/onboarding.tsx'),
  'utf-8',
);

// Extracts just the {...} body of `export function <fnName>(...): <type> {`
// (not the TypeScript signature) so it can be re-wrapped in a plain-JS
// function and evaluated directly — the body itself is untyped JS, so this
// avoids needing a TS transpile step to exercise the exact source text.
function extractFunctionBody(fnName: string): string {
  const start = src.indexOf(`export function ${fnName}`);
  if (start === -1) {
    throw new Error(`${fnName} not found in onboarding.tsx`);
  }
  const bodyStart = src.indexOf('{', start);
  let depth = 0;
  let end = -1;
  for (let i = bodyStart; i < src.length; i++) {
    if (src[i] === '{') depth++;
    if (src[i] === '}') {
      depth--;
      if (depth === 0) {
        end = i;
        break;
      }
    }
  }
  if (end === -1) {
    throw new Error(`Could not find end of ${fnName}`);
  }
  // Slice out the inner body, excluding the outer braces.
  return src.slice(bodyStart + 1, end);
}

function loadRemainingCharsLabel(): (length: number, max: number) => string | null {
  const body = extractFunctionBody('remainingCharsLabel');
  const factory = new Function('length', 'max', body);
  return factory as (length: number, max: number) => string | null;
}

describe('onboarding remainingCharsLabel (long-text input counter)', () => {
  const remainingCharsLabel = loadRemainingCharsLabel();

  it('stays silent while well under the 10% threshold', () => {
    expect(remainingCharsLabel(0, 2000)).toBeNull();
    expect(remainingCharsLabel(1000, 2000)).toBeNull();
    expect(remainingCharsLabel(1799, 2000)).toBeNull();
  });

  it('shows the counter once remaining budget drops to 10% of the cap', () => {
    expect(remainingCharsLabel(1800, 2000)).toBe('200 left');
    expect(remainingCharsLabel(1950, 2000)).toBe('50 left');
  });

  it('reaches zero exactly at the cap', () => {
    expect(remainingCharsLabel(2000, 2000)).toBe('0 left');
  });

  it('clamps to zero rather than going negative if length ever exceeds max', () => {
    expect(remainingCharsLabel(2500, 2000)).toBe('0 left');
  });

  it('is silent for a non-positive max', () => {
    expect(remainingCharsLabel(5, 0)).toBeNull();
  });

  it('is wired into both long-text TextInput blocks in onboarding.tsx', () => {
    const occurrences = src.match(/remainingCharsLabel\(/g) ?? [];
    // 1 definition + 2 call sites (aboutMe/discovery multiline, diagnosticRound)
    expect(occurrences.length).toBe(3);
  });
});
