import * as fs from 'fs';
import * as path from 'path';

const sourceRoot = path.join(__dirname, '../..');
const src = fs.readFileSync(path.join(sourceRoot, 'app/(tabs)/(you)/index.tsx'), 'utf-8');

describe('You-tab settings rows Dynamic Type contract (RT-DYN-1/RT-DYN-2)', () => {
  it('defines the settings-row scale caps', () => {
    expect(src).toContain('const SETTINGS_LABEL_MAX_SCALE = 1.4;');
    expect(src).toContain('const SETTINGS_CHIP_MAX_SCALE = 1.2;');
  });

  it('caps both row labels and both chip groups', () => {
    expect((src.match(/maxFontSizeMultiplier=\{SETTINGS_LABEL_MAX_SCALE\}/g) ?? []).length).toBe(2);
    expect((src.match(/maxFontSizeMultiplier=\{SETTINGS_CHIP_MAX_SCALE\}/g) ?? []).length).toBe(2);
  });
});

describe('You-tab daily reminder contracts (FE-01/FE-02/FE-09)', () => {
  it('narrows the daily reminder OFF action to the daily reminder identifier only', () => {
    expect(src).toContain("cancelNotificationById(NOTIFICATION_IDS.DAILY_REMINDER)");
    expect(src).not.toContain('cancelAllReminders');
    expect(src).toContain('dailyReminderEnabled: false');
    expect(src).toContain('dailyReminderEnabled: true');
  });

  it('derives the toggle from durable intent rather than reminderTime alone', () => {
    expect(src).toContain('user?.dailyReminderEnabled ?? Boolean(user?.reminderTime)');
    expect(src).toContain('enabled && !!user?.reminderTime && dailyReminderIntentEnabled');
  });

  it('exposes reminder time rows as a radio group with selected state', () => {
    expect(src).toContain('accessibilityRole="radiogroup"');
    expect(src).toContain('accessibilityRole="radio"');
    expect(src).toContain('accessibilityLabel={formatReminderTime(time.value)}');
    expect(src).toContain('accessibilityState={{ selected: user?.reminderTime === time.value }}');
  });
});
