import {
  COMPANION_EXPRESSIONS,
  COMPANION_EYES,
  COMPANION_IDENTITY_IN_DELAY_MS,
  COMPANION_IDENTITY_IN_MS,
  COMPANION_IDENTITY_OUT_MS,
  COMPANION_REUNION_CENTER_DELAY_MS,
  COMPANION_IDLE_CYCLES,
  COMPANION_IDLE_NEUTRAL,
  COMPANION_MORPH_MS,
  COMPANION_SPHERE_SCALE,
  COMPANION_SPLIT_X,
  HALO,
  HEAD,
  PEARL,
  VIEWBOX,
  companionInvitingTurnPose,
  companionLayout,
} from '@/lib/companion-avatar-model';

describe('companion avatar model', () => {
  it('keeps the approved warm-pearl colors and gold halo', () => {
    expect(PEARL).toEqual({
      lit: '#FFF9F0',
      mid: '#E6D7C2',
      dark: '#9C866D',
      eye: '#493D32',
      eyeDeep: '#211B17',
      halo: '#D0AA5F',
    });
    expect(HALO.transform).toContain('translate');
    expect(HALO.cx).toBe(HEAD.cx);
  });

  it('exposes one pair of visible eyes for every expression', () => {
    expect(COMPANION_EXPRESSIONS).toEqual(['gentle', 'thoughtful', 'encouraging', 'welcome']);

    for (const expression of COMPANION_EXPRESSIONS) {
      const eyes = COMPANION_EYES[expression];
      expect(eyes.left.visible).toBe(true);
      expect(eyes.right.visible).toBe(true);
      expect(eyes.left.d.startsWith('M')).toBe(true);
      expect(eyes.right.d.startsWith('M')).toBe(true);
      expect(eyes.left.matrix).not.toBe(eyes.right.matrix);
    }
  });

  it('gives each expression a distinct eye pose', () => {
    const signatures = COMPANION_EXPRESSIONS.map((expression) => {
      const eyes = COMPANION_EYES[expression];
      return `${eyes.left.d}|${eyes.left.matrix}|${eyes.right.d}|${eyes.right.matrix}`;
    });
    expect(new Set(signatures).size).toBe(COMPANION_EXPRESSIONS.length);
  });

  it('returns eyes with the reuniting center sphere, not after it', () => {
    expect(COMPANION_MORPH_MS).toBe(520);
    expect(COMPANION_IDENTITY_OUT_MS).toBe(140);
    expect(COMPANION_IDENTITY_IN_DELAY_MS).toBe(COMPANION_REUNION_CENTER_DELAY_MS);
    expect(COMPANION_IDENTITY_IN_MS).toBe(COMPANION_MORPH_MS);
    expect(COMPANION_IDENTITY_IN_DELAY_MS + COMPANION_IDENTITY_IN_MS).toBe(
      COMPANION_REUNION_CENTER_DELAY_MS + COMPANION_MORPH_MS,
    );
    expect(COMPANION_SPHERE_SCALE).toBe(0.27);
    expect(COMPANION_SPLIT_X).toBe(17.5);
  });

  it('keeps every idle gesture isolated between exact neutral frames', () => {
    for (const cycle of Object.values(COMPANION_IDLE_CYCLES)) {
      const times = cycle.frames.map((frame) => frame.timeMs);
      expect(times).toEqual([...times].sort((a, b) => a - b));
      expect(times[0]).toBe(0);
      expect(times.at(-1)).toBe(cycle.durationMs);

      cycle.gestures.forEach((gesture, index) => {
        if (index > 0) {
          expect(gesture.startMs).toBeGreaterThan(cycle.gestures[index - 1].endMs);
        }
        for (const boundary of [gesture.startMs, gesture.endMs]) {
          const { timeMs: _, ...pose } = cycle.frames.find((frame) => frame.timeMs === boundary)!;
          expect(pose).toEqual(COMPANION_IDLE_NEUTRAL);
        }
      });
    }
  });

  it('authors the three new gestures with the intended lead and follow timing', () => {
    for (const cycle of [COMPANION_IDLE_CYCLES.calm, COMPANION_IDLE_CYCLES.joyful]) {
      const framesFor = (name: (typeof cycle.gestures)[number]['name']) => {
        const gesture = cycle.gestures.find((candidate) => candidate.name === name)!;
        return cycle.frames.filter(
          (frame) => frame.timeMs >= gesture.startMs && frame.timeMs <= gesture.endMs,
        );
      };

      const peek = framesFor('curiousPeek');
      expect(peek.find((frame) => frame.faceX !== 0)!.timeMs).toBeLessThan(
        peek.find((frame) => frame.bodyX !== 0)!.timeMs,
      );
      expect(peek.some((frame) => frame.faceX < 0)).toBe(true);
      expect(peek.some((frame) => frame.faceX > 0)).toBe(true);

      const hop = framesFor('softDoubleHop');
      const hopPeaks = hop.filter((frame) => frame.bodyY < 0);
      expect(hop.some((frame) => frame.bodyY > 0 && frame.bodyScaleY < 1)).toBe(true);
      expect(Math.abs(hopPeaks[0].bodyY)).toBeGreaterThan(Math.abs(hopPeaks[1].bodyY));
      expect(hopPeaks[0].haloY).toBeGreaterThan(0);

      const haloGlance = framesFor('haloGlance');
      expect(haloGlance.find((frame) => frame.faceY < 0)!.timeMs).toBeLessThan(
        haloGlance.find((frame) => frame.haloY < 0)!.timeMs,
      );
    }
  });

  it('starts moving immediately and keeps rests short so the tab never sits still', () => {
    for (const cycle of [COMPANION_IDLE_CYCLES.calm, COMPANION_IDLE_CYCLES.joyful]) {
      expect(cycle.gestures[0].startMs).toBe(0);
      cycle.gestures.forEach((gesture, index) => {
        if (index === 0) return;
        expect(gesture.startMs - cycle.gestures[index - 1].endMs).toBeLessThanOrEqual(600);
      });
      expect(cycle.durationMs - cycle.gestures.at(-1)!.endMs).toBeLessThanOrEqual(600);
    }
  });

  it('gives calm mode longer quiet spans and smaller motion', () => {
    const calm = COMPANION_IDLE_CYCLES.calm;
    const joyful = COMPANION_IDLE_CYCLES.joyful;
    const amplitude = (cycle: typeof calm | typeof joyful, key: 'bodyX' | 'bodyY' | 'haloY') =>
      Math.max(...cycle.frames.map((frame) => Math.abs(frame[key])));

    expect(calm.durationMs).toBeGreaterThan(joyful.durationMs);
    expect(amplitude(calm, 'bodyX')).toBeLessThan(amplitude(joyful, 'bodyX'));
    expect(amplitude(calm, 'bodyY')).toBeLessThan(amplitude(joyful, 'bodyY'));
    expect(amplitude(calm, 'haloY')).toBeLessThan(amplitude(joyful, 'haloY'));
  });

  it('keeps the listener face visible and grounded throughout its cycle', () => {
    for (const frame of COMPANION_IDLE_CYCLES.listening.frames) {
      expect(frame.faceOpacity).toBe(1);
      expect(frame.faceScaleX).toBe(1);
      expect(Math.abs(frame.bodyY)).toBeLessThan(1);
    }
    expect(companionInvitingTurnPose(2_900)?.bodyY).toBe(-6);
  });

  it('projects one continuous inviting turn between matching boundary poses', () => {
    const boundary = {
      ...COMPANION_IDLE_NEUTRAL,
      bodyY: 0.8,
      bodyScaleX: 1.02,
      bodyScaleY: 0.98,
    };
    expect(companionInvitingTurnPose(2_279.999)).toBeNull();
    expect(companionInvitingTurnPose(2_280)).toEqual(boundary);
    expect(companionInvitingTurnPose(3_521)).toBeNull();

    const afterStart = companionInvitingTurnPose(2_280.001)!;
    const beforeEnd = companionInvitingTurnPose(3_519.999)!;
    for (const key of Object.keys(boundary) as (keyof typeof boundary)[]) {
      expect(afterStart[key]).toBeCloseTo(boundary[key], 3);
      expect(beforeEnd[key]).toBeCloseTo(boundary[key], 3);
    }

    expect(companionInvitingTurnPose(2_700)?.faceOpacity).toBeCloseTo(0, 10);
    expect(companionInvitingTurnPose(2_900)?.faceOpacity).toBeCloseTo(0, 10);
    expect(companionInvitingTurnPose(3_100)?.faceOpacity).toBeCloseTo(0, 10);
  });

  it('eases angular velocity to zero at both inviting-turn boundaries', () => {
    const faceStep = (fromMs: number, toMs: number) => Math.abs(
      companionInvitingTurnPose(toMs)!.faceX - companionInvitingTurnPose(fromMs)!.faceX,
    );
    const middleStep = faceStep(2_900, 2_901);

    expect(faceStep(2_280, 2_281)).toBeLessThan(middleStep / 100);
    expect(faceStep(3_519, 3_520)).toBeLessThan(middleStep / 100);
  });

  it('keeps a square layout whose split fits inside the view box', () => {
    const layout = companionLayout(78);
    expect(layout.size).toBe(78);
    expect(layout.viewScale).toBe(1);
    expect(layout.stageWidth).toBe(VIEWBOX.w);
    expect(layout.splitPx).toBe(COMPANION_SPLIT_X);
    expect(layout.sphereDiameter).toBe(HEAD.r * 2);

    const leftEdge = layout.headCenterX - layout.splitPx - (HEAD.r * COMPANION_SPHERE_SCALE);
    const rightEdge = layout.headCenterX + layout.splitPx + (HEAD.r * COMPANION_SPHERE_SCALE);
    expect(leftEdge).toBeGreaterThan(0);
    expect(rightEdge).toBeLessThan(layout.stageWidth);
  });
});
