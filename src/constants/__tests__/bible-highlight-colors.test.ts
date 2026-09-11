import {
  HIGHLIGHT_INK,
  highlightInk,
  highlighterFlatBand,
  highlighterStroke,
  highlighterStrokeGradient,
  strokeFitFor,
} from '@/constants/bible-highlight-colors';

describe('highlighter ink', () => {
  it('paints the same felt-tip profile as CSS and as a native gradient', () => {
    const ink = highlightInk('yellow', false);
    expect(highlighterStroke(ink)).toBe(
      'linear-gradient(100deg, rgba(255, 236, 80, 0.34), rgba(255, 236, 80, 0.72) 12%, rgba(255, 236, 80, 0.63) 88%, rgba(255, 236, 80, 0.30))',
    );
    expect(highlighterStrokeGradient(ink)).toEqual({
      colors: ['rgba(255, 236, 80, 0.34)', 'rgba(255, 236, 80, 0.72)', 'rgba(255, 236, 80, 0.63)', 'rgba(255, 236, 80, 0.30)'],
      locations: [0, 0.12, 0.88, 1],
    });
  });

  it('strokes in dark mode too, at a lower peak, instead of colouring the text', () => {
    for (const color of Object.keys(HIGHLIGHT_INK) as (keyof typeof HIGHLIGHT_INK)[]) {
      expect(HIGHLIGHT_INK[color].dark.peak).toBeLessThan(HIGHLIGHT_INK[color].light.peak);
      expect(HIGHLIGHT_INK[color].dark.peak).toBeGreaterThan(0);
    }
    expect(highlighterFlatBand(highlightInk('green', true))).toBe('rgba(92, 255, 99, 0.24)');
  });

  it('fits the stroke to the reading face and falls back to Georgia', () => {
    expect(strokeFitFor('Lora_400Regular')).toEqual({ top: 0.2, height: 1.13 });
    expect(strokeFitFor('SomethingElse')).toEqual({ top: 0.2, height: 1.1 });
  });
});
