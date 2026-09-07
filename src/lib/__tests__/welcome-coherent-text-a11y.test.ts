import * as fs from 'fs';
import * as path from 'path';

const src = fs.readFileSync(path.join(__dirname, '../../app/index.tsx'), 'utf8');
const howItWorks = fs.readFileSync(path.join(__dirname, '../../app/how-it-works.tsx'), 'utf8');

const revealChar = src.slice(src.indexOf('const RevealChar'), src.indexOf('function shuffleOrder'));
const revealWord = src.slice(src.indexOf('const RevealWord'), src.indexOf('export default function WelcomeScreen'));
const welcomeText = src.slice(
  src.indexOf('{/* Welcome text'),
  src.indexOf('{/* Cutscene text'),
);
const cutsceneText = src.slice(
  src.indexOf('{/* Cutscene text'),
  src.indexOf('{/* Features carousel'),
);

describe('VA-4 Welcome title and tagline accessibility', () => {
  it('exposes the complete title and tagline as coherent accessible units', () => {
    expect(welcomeText).toContain('accessibilityLabel="Unfold"');
    expect(welcomeText).toContain('accessibilityLabel="The world’s most personal Bible experience"');
    expect(welcomeText).toContain('accessible');
  });

  it('hides animated letters and words without hiding those parent labels', () => {
    expect(revealChar).toContain('accessible={false}');
    expect(revealWord).toContain('accessible={false}');
    expect(welcomeText).not.toContain('accessibilityElementsHidden={true}');
    expect(welcomeText).toContain("accessibilityElementsHidden={phase !== 'welcome'}");
    expect(welcomeText).toContain("importantForAccessibility={phase === 'welcome' ? 'yes' : 'no-hide-descendants'}");
  });

  it('does not leave faded welcome fragments accessible during the cutscene', () => {
    expect(welcomeText).toContain("pointerEvents={phase === 'welcome' ? 'auto' : 'none'}");
    expect(cutsceneText).not.toContain('accessibilityElementsHidden');
    expect(cutsceneText).toContain('Every spiritual journey');
  });

  it('does not alter unrelated animated text components', () => {
    expect(howItWorks).toContain('export const AnimatedHeadline');
    expect(howItWorks).toContain('export function AnimatedBody');
    expect(howItWorks).not.toContain('accessibilityLabel="Unfold"');
  });
});
