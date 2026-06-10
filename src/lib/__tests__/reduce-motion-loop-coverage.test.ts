import * as fs from 'fs';
import * as path from 'path';

const sourceRoot = path.join(__dirname, '../..');
const readSource = (relativePath: string) =>
  fs.readFileSync(path.join(sourceRoot, relativePath), 'utf-8');

// Recursively collect .ts/.tsx files under src/
function walk(dir: string, out: string[] = []): string[] {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === '__tests__' || entry.name === 'node_modules') continue;
      walk(full, out);
    } else if (/\.tsx?$/.test(entry.name)) {
      out.push(full);
    }
  }
  return out;
}

describe('reduce-motion loop coverage', () => {
  it('every src file that starts a withRepeat loop references reduce motion', () => {
    const offenders = walk(sourceRoot)
      .filter((f) => {
        const src = fs.readFileSync(f, 'utf-8');
        return src.includes('withRepeat(') && !/useReducedMotion|useAccessibleAnimation/.test(src);
      })
      .map((f) => path.relative(sourceRoot, f));
    expect(offenders).toEqual([]);
  });

  it('gates the welcome/how-it-works card animations at the CardAnimation dispatcher', () => {
    const src = readSource('app/how-it-works.tsx');
    const fnStart = src.indexOf('export function CardAnimation');
    expect(fnStart).toBeGreaterThan(-1);
    const gate = src.indexOf('if (reducedMotion) return null;', fnStart);
    const firstCase = src.indexOf("case 'dots'", fnStart);
    expect(gate).toBeGreaterThan(fnStart);
    expect(gate).toBeLessThan(firstCase);
  });

  it('gates the StreakDisplay flame pulse and cancels it when the streak resets', () => {
    const src = readSource('components/StreakDisplay.tsx');
    expect(src).toContain('if (streak > 0 && !reducedMotion) {');
    expect(src).toContain('cancelAnimation(flamePulse);');
    expect(src).toContain('flamePulse.value = 1;');
  });

  it('renders no onboarding ember particles under reduce motion', () => {
    const src = readSource('components/EmberParticles.tsx');
    const fnStart = src.indexOf('export function EmberParticles');
    const gate = src.indexOf('if (reducedMotion) return null;', fnStart);
    expect(gate).toBeGreaterThan(fnStart);
  });

  it('keeps the paywall Lottie bell and CTA glow static under reduce motion', () => {
    const src = readSource('components/onboarding/ThreeStepPaywall.tsx');
    expect(src).toContain('autoPlay={!reducedMotion}');
    expect(src).toContain('loop={!reducedMotion}');
    const ctaStart = src.indexOf('function GlowingCTA');
    const ctaGate = src.indexOf('if (reducedMotion) return;', ctaStart);
    const ctaLoop = src.indexOf('phase.value = withRepeat(', ctaStart);
    expect(ctaGate).toBeGreaterThan(ctaStart);
    expect(ctaGate).toBeLessThan(ctaLoop);
  });

  it('keeps the unfolded finale burst and ember field out of the reduce-motion tree', () => {
    const src = readSource('app/unfolded.tsx');
    expect(src).toContain('{showBurst && !reducedMotion && <SparkleBurst count={40} />}');
  });
});
