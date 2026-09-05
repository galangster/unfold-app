import * as fs from 'fs';
import * as path from 'path';

const src = fs.readFileSync(path.join(__dirname, '../../app/onboarding.tsx'), 'utf8');

function blockBetween(startNeedle: string, endNeedle: string): string {
  const start = src.indexOf(startNeedle);
  const end = src.indexOf(endNeedle, start + startNeedle.length);
  expect(start).toBeGreaterThan(-1);
  expect(end).toBeGreaterThan(start);
  return src.slice(start, end);
}

function expectRadioCards(block: string, includeExampleHint = false) {
  expect(block).toContain('accessibilityRole="radio"');
  expect(block).toContain('accessibilityState={{ checked: isSelected }}');
  expect(block).toContain('accessibilityLabel={`${opt.label}, ${opt.description}`}');
  expect(block).toContain('width: 20, height: 20, borderRadius: 10');
  expect(block).toContain('selectedAccentSurface(colors.accent)');
  if (includeExampleHint) {
    expect(block).toContain('accessibilityHint={opt.example}');
  } else {
    expect(block).not.toContain('accessibilityHint');
  }
}

describe('VA-2 onboarding preference radio semantics', () => {
  it('exposes Faith, Season of life, Voice, and Depth cards as radios with checked state', () => {
    const faith = blockBetween('{/* Faith Background */}', '{/* Life Stage */}');
    const life = blockBetween('{/* Life Stage */}', "if (step.type === 'stylePreferences2')");
    const voice = blockBetween('{/* Tone */}', '{/* Depth */}');
    const depth = blockBetween('{/* Depth */}', "if (step.type === 'threeStepPaywall')");

    expectRadioCards(faith);
    expectRadioCards(life);
    expectRadioCards(voice, true);
    expectRadioCards(depth);

    expect(src).toContain('label: "Exploring"');
    expect(src).toContain('label: "Reflective"');
    expect(voice).toContain('{opt.example}');
    expect(src).toContain('label: "Take me deeper"');
  });

  it('does not add radio semantics to unrelated multi-select chips', () => {
    const pills = fs.readFileSync(
      path.join(__dirname, '../../components/onboarding/MultiSelectPills.tsx'),
      'utf8',
    );
    expect(pills).not.toContain('accessibilityRole="radio"');
  });
});
