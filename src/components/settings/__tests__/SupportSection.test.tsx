import React from 'react';
import { Alert } from 'react-native';
import { SupportSection } from '../SupportSection';

const renderer = jest.requireActual('react-test-renderer');
const { act } = renderer;

const mockSupport = {
  id: 'anon_11111111-1111-4111-8111-111111111111' as string | null,
  copy: jest.fn(async (_value: string) => undefined),
};

jest.mock('react-native-gesture-handler', () => {
  const { TouchableOpacity } = jest.requireActual('react-native');
  return { TouchableOpacity };
});

jest.mock('expo-haptics', () => ({
  impactAsync: jest.fn(async () => undefined),
  notificationAsync: jest.fn(async () => undefined),
  ImpactFeedbackStyle: { Medium: 'medium' },
  NotificationFeedbackType: { Success: 'success', Error: 'error' },
}));

jest.mock('expo-sharing', () => ({
  isAvailableAsync: jest.fn(async () => false),
  shareAsync: jest.fn(async () => undefined),
}));

jest.mock('expo-clipboard', () => ({
  setStringAsync: (value: string) => mockSupport.copy(value),
}));

jest.mock('expo-constants', () => ({
  __esModule: true,
  default: { expoConfig: { android: { package: 'com.unfold.app' } } },
}));

jest.mock('@/components/icons', () =>
  new Proxy({}, { get: (_target, prop) => (typeof prop === 'string' ? prop : undefined) }),
);

jest.mock('@/lib/push-notification-helpers', () => ({
  LEGAL_LINKS: { privacy: 'https://unfoldapp.co/privacy', terms: 'https://unfoldapp.co/terms' },
}));

jest.mock('@/lib/theme', () => ({
  useTheme: () => ({
    colors: {
      text: '#F5F0EB',
      textMuted: 'rgba(245,240,235,0.6)',
      buttonBackground: 'rgba(245,240,235,0.08)',
      border: 'rgba(245,240,235,0.08)',
    },
  }),
}));

jest.mock('@/hooks/usePremiumAccessPolicy', () => ({
  usePremiumAccessPolicy: () => 'denied',
}));

jest.mock('@/lib/bug-logger', () => ({
  exportBugReportBundleToFile: jest.fn(),
  logBugEvent: jest.fn(),
}));

jest.mock('@/lib/network-error-handler', () => ({
  analyzeNetworkError: () => ({ type: 'unknown', userFriendlyMessage: '' }),
}));

jest.mock('@/lib/api-config', () => ({
  PRIMARY_BACKEND_URL: 'https://api.example.test',
  getAuthHeaders: jest.fn(),
}));

jest.mock('@/lib/revenuecatClient', () => ({
  getRevenueCatSupportId: () => mockSupport.id,
}));

jest.mock('../SettingsSectionHeader', () => ({
  SettingsSectionHeader: () => null,
  getSettingsCardStyle: () => ({}),
}));

function createSection() {
  let tree: { root: any; unmount: () => void };
  act(() => {
    tree = renderer.create(<SupportSection />);
  });
  return tree!;
}

describe('SupportSection Support ID', () => {
  let alertSpy: jest.SpyInstance;

  beforeEach(() => {
    jest.clearAllMocks();
    mockSupport.id = 'anon_11111111-1111-4111-8111-111111111111';
    mockSupport.copy.mockResolvedValue(undefined);
    alertSpy = jest.spyOn(Alert, 'alert').mockImplementation(() => undefined);
  });

  afterEach(() => {
    alertSpy.mockRestore();
  });

  it('copies the exact trusted ID only after an explicit accessible tap', async () => {
    const tree = createSection();
    const row = tree.root.findByProps({ accessibilityLabel: 'Copy Support ID' });

    expect(row.props.accessibilityRole).toBe('button');
    expect(row.props.accessibilityHint).toBe('Copies the identifier used to find your subscription account.');
    expect(mockSupport.copy).not.toHaveBeenCalled();

    await act(async () => {
      await row.props.onPress();
    });

    expect(mockSupport.copy).toHaveBeenCalledWith('anon_11111111-1111-4111-8111-111111111111');
    expect(alertSpy).toHaveBeenCalledWith('Support ID copied', 'You can now paste it into your support conversation.');
  });

  it('explains when a trusted Support ID is unavailable without touching the clipboard', async () => {
    mockSupport.id = null;
    const tree = createSection();

    await act(async () => {
      await tree.root.findByProps({ accessibilityLabel: 'Copy Support ID' }).props.onPress();
    });

    expect(mockSupport.copy).not.toHaveBeenCalled();
    expect(alertSpy).toHaveBeenCalledWith(
      'Support ID unavailable',
      'Unlock your device, restart Unfold, and try again.',
    );
  });

  it('reports clipboard failure without claiming the ID was copied', async () => {
    mockSupport.copy.mockRejectedValueOnce(new Error('clipboard unavailable'));
    const tree = createSection();

    await act(async () => {
      await tree.root.findByProps({ accessibilityLabel: 'Copy Support ID' }).props.onPress();
    });

    expect(alertSpy).toHaveBeenCalledWith("Couldn't copy Support ID", 'Please try again.');
    expect(alertSpy).not.toHaveBeenCalledWith('Support ID copied', expect.any(String));
  });
});
