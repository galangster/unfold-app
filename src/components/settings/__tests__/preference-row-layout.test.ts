import {
  SETTINGS_PAGE_HORIZONTAL_GUTTER,
  SETTINGS_PREFERENCE_CHIP_MAX_SCALE,
  SETTINGS_PREFERENCE_LABEL_MAX_SCALE,
  SETTINGS_PREFERENCE_ROW_PADDING,
  settingsPreferenceChipGroupReserve,
  settingsPreferenceContentWidth,
  settingsPreferenceLabelReserve,
  shouldStackSettingsPreferenceRow,
} from '../preference-row-layout';

const WIDTHS = [402, 375, 320] as const;
const SCALES = [1, 1.12, 1.18, 1.4, 1.64, 2, 2.5, 3] as const;

describe('settings preference-row layout budget', () => {
  it('uses the settings page gutter and row padding, not a smaller text box', () => {
    expect(SETTINGS_PAGE_HORIZONTAL_GUTTER).toBe(48);
    expect(SETTINGS_PREFERENCE_ROW_PADDING).toBe(32);
    expect(settingsPreferenceContentWidth(402)).toBe(322);
    expect(settingsPreferenceContentWidth(375)).toBe(295);
    expect(settingsPreferenceContentWidth(320)).toBe(240);
  });

  it('keeps the existing 1.4 / 1.2 scale caps and does not lower them at fontScale 3', () => {
    expect(SETTINGS_PREFERENCE_LABEL_MAX_SCALE).toBe(1.4);
    expect(SETTINGS_PREFERENCE_CHIP_MAX_SCALE).toBe(1.2);
    expect(settingsPreferenceLabelReserve(3)).toBe(settingsPreferenceLabelReserve(1.4));
    expect(settingsPreferenceChipGroupReserve(3)).toBe(settingsPreferenceChipGroupReserve(1.2));
    expect(settingsPreferenceLabelReserve(3)).toBeGreaterThan(settingsPreferenceLabelReserve(1));
    expect(settingsPreferenceChipGroupReserve(3)).toBeGreaterThan(settingsPreferenceChipGroupReserve(1));
  });

  it('preserves a single row at 402pt and default text', () => {
    expect(shouldStackSettingsPreferenceRow(402, 1)).toBe(false);
  });

  it('stacks on narrow 320/375pt windows and on enlarged text through 3.0', () => {
    expect(shouldStackSettingsPreferenceRow(375, 1)).toBe(true);
    expect(shouldStackSettingsPreferenceRow(320, 1)).toBe(true);
    expect(shouldStackSettingsPreferenceRow(402, 1.18)).toBe(true);

    for (const width of WIDTHS) {
      for (const fontScale of SCALES) {
        if (width === 402 && fontScale === 1) continue;
        expect(shouldStackSettingsPreferenceRow(width, fontScale)).toBe(true);
      }
    }
  });

  it('treats non-finite window metrics as a stack, not a squeezed row', () => {
    expect(shouldStackSettingsPreferenceRow(0, 1)).toBe(true);
    expect(shouldStackSettingsPreferenceRow(402, Number.NaN)).toBe(true);
  });
});
