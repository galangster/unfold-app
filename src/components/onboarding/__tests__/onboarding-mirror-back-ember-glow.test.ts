import fs from 'node:fs';
import path from 'node:path';

/**
 * Guard for the onboarding mirrorBack step ("We heard you." / "Crafting
 * something for you...").
 *
 * Tester report (App Store 1.1.0, build 254, 2026-09-04): a faint, hard-edged
 * band sat under the spinner, from about 57% to 74% of the screen height,
 * with nothing inside it except two drifting embers. The band was the
 * EmberSystem bottom glow — a gradient anchored to the container's bottom
 * edge — painted inside a `minHeight: 380` box that ends mid-screen, so the
 * densest gradient row was clipped flat at the box edge.
 *
 * Both mirrorBack mounts (loading and ready) are contained, non-full-screen
 * mounts and must opt out of the glow. Full-screen mounts (welcome letter,
 * paywall, home canvas, celebration) keep the default.
 */

const repoRoot = path.join(__dirname, '../../../..');

function readSource(relativePath: string): string {
  return fs.readFileSync(path.join(repoRoot, relativePath), 'utf-8');
}

function emberMounts(slice: string): string[] {
  const mounts: string[] = [];
  let from = 0;
  for (;;) {
    const start = slice.indexOf('<EmberSystem', from);
    if (start === -1) break;
    const end = slice.indexOf('/>', start);
    expect(end).toBeGreaterThan(start);
    mounts.push(slice.slice(start, end + 2));
    from = end + 2;
  }
  return mounts;
}

describe('onboarding mirrorBack ember glow (build 254 hard-edged band)', () => {
  const onboarding = readSource('src/app/onboarding.tsx');
  const mirrorBackStart = onboarding.indexOf("step.type === 'mirrorBack') {");
  const featureSummaryStart = onboarding.indexOf("step.type === 'featureSummary') {", mirrorBackStart);
  const mirrorBack = onboarding.slice(mirrorBackStart, featureSummaryStart);

  it('locates the mirrorBack render branch', () => {
    expect(mirrorBackStart).toBeGreaterThan(-1);
    expect(featureSummaryStart).toBeGreaterThan(mirrorBackStart);
  });

  it('mounts EmberSystem exactly twice: the loading state and the ready state', () => {
    expect(emberMounts(mirrorBack)).toHaveLength(2);
  });

  it('turns the bottom glow off on both contained mounts', () => {
    for (const mount of emberMounts(mirrorBack)) {
      expect(mount).toContain('glow={false}');
    }
  });

  it('keeps the loading and ready mounts inside a contained (non-full-screen) box', () => {
    // If this ever becomes a full-screen mount the glow opt-out can be revisited.
    expect(mirrorBack).toContain("minHeight: 380, position: 'relative'");
  });

  it('leaves the full-screen welcome-letter mount on the default glow', () => {
    const before = onboarding.slice(0, mirrorBackStart);
    const welcomeMounts = emberMounts(before);
    expect(welcomeMounts).toHaveLength(1);
    expect(welcomeMounts[0]).not.toContain('glow=');
  });
});

describe('EmberSystem glow prop plumbing', () => {
  const component = readSource('src/components/EmberSystem.tsx');
  const lib = readSource('src/lib/ember-system.ts');

  it('exposes an optional glow prop on EmberSystem', () => {
    expect(component).toContain('glow?: boolean;');
    expect(component).toContain('glow = true,');
  });

  it('forwards glow to resolveEmberParams', () => {
    expect(component).toContain(
      'resolveEmberParams({ variant, isDark, streakLevel, count, intensity, opacityFloor, glow })',
    );
  });

  it('resolveEmberParams accepts glow and zeroes the glow opacity on opt-out', () => {
    expect(lib).toContain('glow?: boolean;');
    expect(lib).toContain('if (input.glow === false) {');
  });

  it('both render paths gate the gradient on glowOpacity > 0', () => {
    // Animated path and the reduce-motion still poster each skip the
    // LinearGradient when the resolved opacity is 0, so no render change is
    // needed for the opt-out.
    expect(component).toContain('{params.glowOpacity > 0 && (');
    expect(component).toContain('{glowOpacity > 0 && (');
  });
});
