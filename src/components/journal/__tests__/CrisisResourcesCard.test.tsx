import React from 'react';
import { AccessibilityInfo, Linking } from 'react-native';
import { fireEvent, render } from '@testing-library/react-native';
import { CrisisResourcesCard } from '../CrisisResourcesCard';

jest.mock('expo-haptics', () => ({
  impactAsync: jest.fn(),
  ImpactFeedbackStyle: { Light: 'light' },
}));
jest.mock('@/lib/theme', () => ({
  useTheme: () => ({ colors: new Proxy({}, { get: () => '#888888' }), isDark: false }),
}));
jest.mock('react-native-reanimated', () => {
  const { View } = jest.requireActual('react-native');
  const chain = { duration: () => chain, easing: () => chain, delay: () => chain };
  const easing = () => () => 0;
  return {
    __esModule: true,
    default: { View },
    Easing: { out: easing, in: easing, inOut: easing, cubic: () => 0, bezier: easing },
    FadeIn: chain,
    useReducedMotion: () => false,
  };
});

describe('CrisisResourcesCard', () => {
  let openURL: jest.SpyInstance;

  beforeEach(() => {
    openURL = jest.spyOn(Linking, 'openURL').mockResolvedValue(true);
  });

  afterEach(() => openURL.mockRestore());

  it('calls 988 and texts HOME to 741741', () => {
    const { getByText } = render(<CrisisResourcesCard abuse={false} />);
    fireEvent.press(getByText('Call or text 988'));
    fireEvent.press(getByText('Text HOME to 741741'));
    expect(openURL.mock.calls).toEqual([['tel:988'], ['sms:741741&body=HOME']]);
  });

  it('shows the domestic violence hotline only for abuse', () => {
    expect(render(<CrisisResourcesCard abuse={false} />).queryByText('Call 1-800-799-7233')).toBeNull();
    const { getByText } = render(<CrisisResourcesCard abuse />);
    fireEvent.press(getByText('Call 1-800-799-7233'));
    expect(openURL).toHaveBeenCalledWith('tel:18007997233');
  });

  it('tells a screen reader that help is below', () => {
    const announce = jest.spyOn(AccessibilityInfo, 'announceForAccessibility');
    render(<CrisisResourcesCard abuse={false} />);
    expect(announce).toHaveBeenCalledWith(expect.stringContaining('988'));
    announce.mockRestore();
  });
});
