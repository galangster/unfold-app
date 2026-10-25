import * as fs from 'fs';
import * as path from 'path';
import { seriesLengthOptions } from '../series-length-options';

const onboarding = fs.readFileSync(path.join(__dirname, '../../app/onboarding.tsx'), 'utf8');

describe('APP-5 series length options', () => {
  it('keeps today\'s four cards when chapters are off or unreadable', () => {
    expect(seriesLengthOptions(false).map(({ value, label, description }) => [value, label, description])).toEqual([
      [3, '3 days', 'Just a taste'],
      [7, '7 days', 'Enough to build a rhythm'],
      [14, '14 days', 'Room to go deep'],
      [30, '30 days', 'A real transformation'],
    ]);
    expect(seriesLengthOptions(false).every((option) => option.accessibilityLabel === option.label)).toBe(true);
  });

  it('replaces the 30-day card with the ruled "4 weeks" card, which submits 28', () => {
    const options = seriesLengthOptions(true);
    expect(options.map((option) => option.value)).toEqual([3, 7, 14, 28]);
    expect(options[3]).toEqual({
      value: 28,
      label: '4 weeks',
      description: 'Four weekly chapters. Each week is prepared as you go.',
      accessibilityLabel: '4 weeks. Four weekly chapters. Each week is prepared as you go.',
    });
    expect(options.slice(0, 3)).toEqual(seriesLengthOptions(false).slice(0, 3));
  });

  it('wires the onboarding length step to the switch, the label and the selected state', () => {
    expect(onboarding).toContain("step.id === 'devotionalLength'\n          ? seriesLengthOptions(chapteredSeriesEnabled)");
    expect(onboarding).toContain('const chapteredSeriesEnabled = useChapteredSeriesEnabled();');
    expect(onboarding).toContain("accessibilityLabel={isLockedOption ? `${option.label}, premium only` : 'accessibilityLabel' in option ? String(option.accessibilityLabel) : option.label}");
    expect(onboarding).toContain('accessibilityState={{ selected: isSelected, disabled: isLockedOption }}');
    // The press stores the option value, so the 4-week card submits length 28.
    expect(onboarding).toContain('setData((prev) => ({ ...prev, [step.id]: option.value }));');
  });
});
