import { buildFreeWritePlaceholder } from '@/lib/journal-freewrite-placeholder';

describe('buildFreeWritePlaceholder', () => {
  it('does not reuse the first reflection question as the free-write placeholder', () => {
    const placeholder = buildFreeWritePlaceholder({
      reflectionQuestions: ['Where in your life are you being asked to bring order?'],
    });

    expect(placeholder).not.toContain('Where in your life');
    expect(placeholder).toContain("today's reading");
  });

  it('keeps the invitation broad and spacious when no day data is present', () => {
    expect(buildFreeWritePlaceholder()).toBe(
      "Write whatever stood out from today's reading — a line, a question, a prayer, or something you want to remember.",
    );
  });
});
