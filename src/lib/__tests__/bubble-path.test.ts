import { buildBubblePath } from '../bubble-path';

describe('buildBubblePath', () => {
  it('integrates a tooltip arrow into the top edge without a separate triangle base', () => {
    const path = buildBubblePath({
      width: 220,
      height: 96,
      radius: 20,
      tail: { edge: 'top', centerX: 110, width: 28, height: 12 },
    });

    expect(path).toContain('L 96 12.5 L 110 0.5 L 124 12.5');
    expect(path).toMatch(/^M /);
    expect(path).toMatch(/ Z$/);
  });

  it('integrates a tooltip arrow into the bottom edge on the same outline', () => {
    const path = buildBubblePath({
      width: 220,
      height: 96,
      radius: 20,
      tail: { edge: 'bottom', centerX: 110, width: 28, height: 12 },
    });

    expect(path).toContain('L 124 95.5 L 110 107.5 L 96 95.5');
    expect(path).toMatch(/^M /);
    expect(path).toMatch(/ Z$/);
  });

  it('uses one curved bottom-right tail for Companion user bubbles', () => {
    const path = buildBubblePath({
      width: 180,
      height: 70,
      radius: { topLeft: 20, topRight: 20, bottomRight: 8, bottomLeft: 20 },
      tail: { edge: 'bottomRight', width: 10, height: 20 },
      strokeWidth: 0,
    });

    expect(path).toContain('L 180 50');
    expect(path).toContain('C 180 58.4 184.8 60.8 190 63.2');
    expect(path).toContain('C 184.8 66.4 181.4 70 172 70');
    expect(path).not.toContain(' 0.5 ');
    expect(path).toMatch(/^M /);
    expect(path).toMatch(/ Z$/);
  });

  it('uses one curved left tail for the Today bridge text bubble', () => {
    const path = buildBubblePath({
      width: 220,
      height: 56,
      radius: 8,
      tail: { edge: 'left', centerY: 22, width: 11, height: 14 },
    });

    expect(path).toContain('M 19.5 0.5');
    expect(path).toContain('L 11.5 29');
    expect(path).toContain('C 6.88 27.18 0.5');
    expect(path).toContain('0.5 22');
    expect(path).toContain('C 0.5');
    expect(path).toContain('11.5 15');
    expect(path).toMatch(/^M /);
    expect(path).toMatch(/ Z$/);
  });

  it('does not clamp the Today bridge tail below the orb centerline', () => {
    const path = buildBubblePath({
      width: 220,
      height: 56,
      radius: { topLeft: 8, topRight: 16, bottomRight: 16, bottomLeft: 16 },
      tail: { edge: 'left', centerY: 18, width: 6, height: 14 },
    });

    expect(path).toContain('0.5 18');
    expect(path).not.toContain('0.5 25.5');
  });
});
