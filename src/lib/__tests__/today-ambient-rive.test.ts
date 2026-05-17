import {
  getTodayAmbientMode,
  getTodayAmbientRiveInputs,
  getTodayLightRayInputs,
  hexToRiveRgb,
  shouldShowCompletedBottomGlow,
} from '../today-ambient-rive';

describe('today ambient Rive mapping', () => {
  it('keeps Today ambient quiet until the day is complete', () => {
    expect(getTodayAmbientMode({ stateType: 'unread', hasReadToday: false })).toBe('none');
    expect(getTodayAmbientMode({ stateType: 'reveal-ready', hasReadToday: false })).toBe('none');
  });

  it('uses rain particles for completed/tomorrow rest states', () => {
    expect(getTodayAmbientMode({ stateType: 'complete-today', hasReadToday: true })).toBe('rain-particles');
    expect(getTodayAmbientMode({ stateType: 'tomorrow-locked', hasReadToday: true })).toBe('rain-particles');
    expect(getTodayAmbientMode({ stateType: 'journey-complete', hasReadToday: true })).toBe('rain-particles');
  });

  it('does not animate empty, preparing, premium-paused, or unread journey-complete states', () => {
    expect(getTodayAmbientMode({ stateType: 'empty', hasReadToday: false })).toBe('none');
    expect(getTodayAmbientMode({ stateType: 'preparing', hasReadToday: false })).toBe('none');
    expect(getTodayAmbientMode({ stateType: 'premium-paused', hasReadToday: false })).toBe('none');
    expect(getTodayAmbientMode({ stateType: 'journey-complete', hasReadToday: false })).toBe('none');
  });

  it('shows the completed-day bottom glow whenever today has been read', () => {
    expect(shouldShowCompletedBottomGlow({ stateType: 'complete-today', hasReadToday: true })).toBe(true);
    expect(shouldShowCompletedBottomGlow({ stateType: 'tomorrow-locked', hasReadToday: true })).toBe(true);
    expect(shouldShowCompletedBottomGlow({ stateType: 'journey-complete', hasReadToday: true })).toBe(true);
    expect(shouldShowCompletedBottomGlow({ stateType: 'unread', hasReadToday: false })).toBe(false);
  });

  it('maps hex accent colors to normalized 0-1 Rive RGB inputs', () => {
    expect(hexToRiveRgb('#ff8000')).toEqual({ r: 1, g: 128 / 255, b: 0 });
    expect(hexToRiveRgb('#abc')).toEqual({ r: 170 / 255, g: 187 / 255, b: 204 / 255 });
  });

  it('keeps bundled Rive loops self-contained until runtime color inputs exist', () => {
    expect(getTodayAmbientRiveInputs({
      mode: 'light-rays',
      stateType: 'reveal-ready',
      accent: '#d6a84f',
      width: 390.4,
      height: 843.6,
    })).toEqual({});

    expect(getTodayAmbientRiveInputs({
      mode: 'rain-particles',
      stateType: 'complete-today',
      accent: '#d6a84f',
      width: 390,
      height: 844,
    })).toEqual({});
  });

  it('returns no light-ray inputs for non-light-ray states', () => {
    expect(getTodayLightRayInputs({
      stateType: 'complete-today',
      accent: '#d6a84f',
      width: 390,
      height: 844,
    })).toBeNull();
  });
});
