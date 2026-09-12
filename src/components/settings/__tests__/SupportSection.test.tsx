import React from 'react';
import { Alert } from 'react-native';
import { SupportSection } from '../SupportSection';
import { exportBugReportBundleToFile } from '@/lib/bug-logger';
import { getAuthHeaders } from '@/lib/api-config';
import { authenticatedFetch } from '@/lib/device-credential';
import { pressableAncestor } from '@/lib/__tests__/fixtures/pressable-ancestor';

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

jest.mock('@/lib/device-credential');

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

describe('SupportSection bug report request', () => {
  const spies: jest.SpyInstance[] = [];

  beforeEach(() => {
    jest.clearAllMocks();
  });

  afterEach(() => {
    spies.splice(0).forEach((spy) => spy.mockRestore());
  });

  function sendWithoutNote() {
    const cancelPrompt: typeof Alert.prompt = (_title, _message, callbackOrButtons) => {
      if (Array.isArray(callbackOrButtons)) {
        callbackOrButtons.find((button) => button.text === 'Send')?.onPress?.();
      }
    };
    spies.push(
      jest.spyOn(Alert, 'prompt').mockImplementation(cancelPrompt),
      jest.spyOn(Alert, 'alert').mockImplementation((title, _message, buttons) => {
        if (title === 'Report a bug?' && Array.isArray(buttons)) {
          buttons.find((button) => button.text === 'Continue')?.onPress?.();
        }
      }),
    );
  }

  it('does not create or send diagnostics when the note prompt is cancelled', async () => {
    spies.push(
      jest.spyOn(Alert, 'prompt').mockImplementation((_title, _message, buttons) => {
        if (Array.isArray(buttons)) {
          buttons.find((button) => button.style === 'cancel')?.onPress?.();
        }
      }),
    );

    const tree = createSection();
    const row = pressableAncestor(tree.root.findByProps({ children: 'Report a bug' }));
    await act(async () => {
      await row.props.onPress();
    });

    expect(exportBugReportBundleToFile).not.toHaveBeenCalled();
    expect(authenticatedFetch).not.toHaveBeenCalled();
  });

  it('sends the bug-report email through authenticatedFetch with an abort signal', async () => {
    (getAuthHeaders as jest.Mock).mockResolvedValue({ 'Content-Type': 'application/json' });
    (exportBugReportBundleToFile as jest.Mock).mockResolvedValue({
      path: '/tmp/bug.json',
      bundle: { events: [] },
      triageSummary: { headline: 'ok' },
    });
    global.fetch = jest.fn().mockResolvedValue({ ok: true }) as unknown as typeof fetch;
    sendWithoutNote();

    const tree = createSection();
    const row = pressableAncestor(tree.root.findByProps({ children: 'Report a bug' }));
    await act(async () => {
      await row.props.onPress();
    });

    expect(authenticatedFetch).toHaveBeenCalledWith(
      'https://api.example.test/api/bug-report/email',
      expect.objectContaining({
        method: 'POST',
        signal: expect.any(AbortSignal),
      }),
    );
  });
});
