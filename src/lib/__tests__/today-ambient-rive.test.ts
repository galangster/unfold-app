import {
  getTodayAmbientMode,
  getTodayAmbientRiveInputs,
  getTodayLightRayInputs,
  hexToRiveRgb,
} from '../today-ambient-rive';

describe('today ambient Rive mapping', () => {
  it('keeps Today ambient quiet until the day is complete', () => {
    expect(getTodayAmbientMode({ stateType: 'unread', hasReadToday: false })).toBe('none');
    expect(getTodayAmbientMode({ stateType: 'reveal-ready', hasReadToday: false })).toBe('none');
  });

  it('uses rain particles for completed/tomorrow rest states', () => {
    expect(getTodayAmbientMode({ stateType: 'complete-today', hasReadToday: true })).toBe('rain-particles');
    expect(getTodayAmbientMode({ stateType: 'tomorrow-locked', hasReadToday: true })).toBe('rain-particles');
  });

  it('does not animate empty, preparing, premium-paused, or journey-complete states', () => {
    expect(getTodayAmbientMode({ stateType: 'empty', hasReadToday: false })).toBe('none');
    expect(getTodayAmbientMode({ stateType: 'preparing', hasReadToday: false })).toBe('none');
    expect(getTodayAmbientMode({ stateType: 'premium-paused', hasReadToday: false })).toBe('none');
    expect(getTodayAmbientMode({ stateType: 'journey-complete', hasReadToday: true })).toBe('none');
  });

  it('maps hex accent colors to normalized 0-1 Rive RGB inputs', () => {
    expect(hexToRiveRgb('#ff8000')).toEqual({ r: 1, g: 128 / 255, b: 0 });
    expect(hexToRiveRgb('#abc')).toEqual({ r: 170 / 255, g: 187 / 255, b: 204 / 255 });
  });

  it('passes dimensions and accent color into the light-ray particle inputs', () => {
    expect(getTodayAmbientRiveInputs({
      mode: 'light-rays',
      stateType: 'reveal-ready',
      accent: '#d6a84f',
      width: 390.4,
      height: 843.6,
    })).toMatchObject({
      width: 390,
      height: 844,
      accentR: 214 / 255,
      accentG: 168 / 255,
      accentB: 79 / 255,
    });
  });

  it('plays rain as an asset-authored loop without light-ray-only inputs', () => {
    expect(getTodayAmbientRiveInputs({
      mode: 'rain-particles',
      stateType: 'complete-today',
      accent: '#d6a84f',
      width: 390,
      height: 844,
    })).toEqual({});

    expect(getTodayAmbientRiveInputs({
      mode: 'rain-particles',
      stateType: 'complete-today',
      accent: '#d6a84f',
      width: 390,
      height: 844,
    })).toEqual({});
  });

  it('keeps light rays subtle and center-masked for reveal-ready', () => {
    const lightRays = getTodayAmbientRiveInputs({
      mode: 'light-rays',
      stateType: 'reveal-ready',
      accent: '#d6a84f',
      width: 390,
      height: 844,
    });

    expect(lightRays).toMatchObject({
      particleCount: 34,
      spawnRate: 0.5,
      lineThickness: 1.3,
      opacity: 0.27,
      centerMaskRadius: 0.12,
      centerMaskSoftness: 0.2,
    });
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
