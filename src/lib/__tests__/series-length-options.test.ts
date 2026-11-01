import { seriesLengthOptions } from '../series-length-options';

describe('APP-5 series length options', () => {
  it('keeps today\'s four cards when chapters are off or unreadable', () => {
    expect(seriesLengthOptions(false).map(({ value, label, description, accessibilityLabel }) => [value, label, description, accessibilityLabel])).toEqual([
      [3, '3 days', 'Just a taste', '3 days'],
      [7, '7 days', 'Enough to build a rhythm', '7 days'],
      [14, '14 days', 'Room to go deep', '14 days'],
      [30, '30 days', 'A real transformation', '30 days'],
    ]);
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
});
