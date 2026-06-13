import * as fs from 'fs';
import * as path from 'path';

/**
 * De-slop #24 — the first-run Today empty state must orient a user already
 * inside the app, not market the app to them. It keeps exactly one warm line
 * and one clear action.
 */
describe('first-run Today empty state copy (#24)', () => {
  const source = fs.readFileSync(path.join(__dirname, '..', 'DevotionalCard.tsx'), 'utf8');

  function firstTimeBlock(): string {
    const start = source.indexOf('function FirstTimeEmptyState');
    const end = source.indexOf('function EmptyState', start);
    expect(start).toBeGreaterThan(-1);
    expect(end).toBeGreaterThan(start);
    return source.slice(start, end);
  }

  it('drops the marketing slogan that pitched the app from inside it', () => {
    const block = firstTimeBlock();
    expect(block).not.toMatch(/most personal/i);
    expect(block).not.toMatch(/Bible studies\./);
    // No app-acquisition language on a screen the user is already inside.
    expect(block).not.toMatch(/\b(download|install|get the app|try unfold)\b/i);
  });

  it('orients with one warm second-person line', () => {
    const block = firstTimeBlock();
    expect(block).toContain('Tell us what you’re walking');
    expect(block).toContain('we’ll shape a study');
  });

  it('keeps a single clear first-run action', () => {
    const block = firstTimeBlock();
    expect(block).toContain('Start a New Series');
    expect(block).toContain('accessibilityLabel="Start a new devotional series"');
    // Exactly one primary CTA in the first-run state.
    expect(block.match(/accessibilityRole="button"/g)).toHaveLength(1);
  });
});
