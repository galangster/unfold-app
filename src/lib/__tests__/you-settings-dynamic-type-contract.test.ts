import * as fs from 'fs';
import * as path from 'path';

// The settings sections were extracted from (you)/index.tsx into
// section-per-file components under src/components/settings/ — the
// contracts below now read those files.
const sourceRoot = path.join(__dirname, '../..');
const appearanceSrc = fs.readFileSync(
  path.join(sourceRoot, 'components/settings/AppearanceSection.tsx'),
  'utf-8',
);
const remindersSrc = fs.readFileSync(
  path.join(sourceRoot, 'components/settings/RemindersSection.tsx'),
  'utf-8',
);

describe('Settings appearance rows Dynamic Type contract (RT-DYN-1/RT-DYN-2)', () => {
  it('defines the settings-row scale caps', () => {
    expect(appearanceSrc).toContain('const SETTINGS_LABEL_MAX_SCALE = 1.4;');
    expect(appearanceSrc).toContain('const SETTINGS_CHIP_MAX_SCALE = 1.2;');
  });

  it('caps both row labels and both chip groups', () => {
    expect((appearanceSrc.match(/maxFontSizeMultiplier=\{SETTINGS_LABEL_MAX_SCALE\}/g) ?? []).length).toBe(2);
    expect((appearanceSrc.match(/maxFontSizeMultiplier=\{SETTINGS_CHIP_MAX_SCALE\}/g) ?? []).length).toBe(2);
  });
});

describe('Settings daily reminder contracts (FE-01/FE-02/FE-09)', () => {
  it('narrows the daily reminder OFF action to the daily reminder identifier only', () => {
    expect(remindersSrc).toContain("cancelNotificationById(NOTIFICATION_IDS.DAILY_REMINDER)");
    expect(remindersSrc).not.toContain('cancelAllReminders');
    expect(remindersSrc).toContain('dailyReminderEnabled: false');
    expect(remindersSrc).toContain('dailyReminderEnabled: true');
  });

  it('derives the toggle from durable intent rather than reminderTime alone', () => {
    expect(remindersSrc).toContain('user?.dailyReminderEnabled ?? Boolean(user?.reminderTime)');
    expect(remindersSrc).toContain('enabled && !!user?.reminderTime && dailyReminderIntentEnabled');
  });

  it('exposes reminder time rows as a radio group with selected state', () => {
    expect(remindersSrc).toContain('accessibilityRole="radiogroup"');
    expect(remindersSrc).toContain('accessibilityRole="radio"');
    expect(remindersSrc).toContain('accessibilityLabel={formatReminderTime(time.value)}');
    expect(remindersSrc).toContain('accessibilityState={{ selected: user?.reminderTime === time.value }}');
  });
});
