import React from 'react';
import { PersonalContextSection } from '../PersonalContextSection';
import { PERSONAL_CONTEXT_PENDING_SYNC_COPY } from '@/lib/support-clarity';

import renderer, { act, type ReactTestInstance } from 'react-test-renderer';

const mockUpdateUser = jest.fn();
const mockSetCompanionName = jest.fn();
const mockSync = jest.fn();

const profile = {
  aboutMe: 'I want to grow in patience.',
  companionName: 'Grace',
  name: 'Sam',
};

jest.mock('expo-haptics', () => ({
  impactAsync: jest.fn(),
  ImpactFeedbackStyle: { Light: 'light' },
}));

jest.mock('react-native-gesture-handler', () => ({
  TouchableOpacity: require('react-native').TouchableOpacity,
}));

jest.mock('@/components/icons', () =>
  new Proxy({}, { get: (_target, prop) => (typeof prop === 'string' ? prop : undefined) }),
);

jest.mock('@/lib/theme', () => ({
  useTheme: () => ({
    colors: {
      text: '#F5F0EB',
      textMuted: 'rgba(245,240,235,0.6)',
      textSubtle: 'rgba(245,240,235,0.4)',
      background: '#0B0A09',
      buttonBackground: 'rgba(245,240,235,0.08)',
      border: 'rgba(245,240,235,0.08)',
      inputBackground: '#141210',
      accent: '#C8A55C',
      error: '#E05A4F',
    },
    isDark: true,
  }),
}));

jest.mock('@/lib/store', () => ({
  useUnfoldStore: (selector: (state: Record<string, unknown>) => unknown) =>
    selector({
      user: profile,
      companionName: profile.companionName,
      updateUser: (...args: unknown[]) => mockUpdateUser(...args),
      setCompanionName: (...args: unknown[]) => mockSetCompanionName(...args),
    }),
}));

jest.mock('@/lib/user-profile-sync', () => ({
  syncUserProfileToBackend: (...args: unknown[]) => mockSync(...args),
}));

function findByTestId(node: ReactTestInstance, testID: string) {
  return node.findAll((item) => item.props.testID === testID)[0];
}

describe('PersonalContextSection', () => {
  beforeEach(() => {
    profile.aboutMe = 'I want to grow in patience.';
    profile.companionName = 'Grace';
    mockUpdateUser.mockReset();
    mockSetCompanionName.mockReset();
    mockSync.mockReset();
    mockSync.mockResolvedValue(undefined);
    mockUpdateUser.mockImplementation((updates: Partial<typeof profile>) => {
      Object.assign(profile, updates);
    });
    mockSetCompanionName.mockImplementation((name: string | null) => {
      profile.companionName = name ?? 'Grace';
    });
  });

  it('keeps Cancel a no-op, commits Save locally first, and shows pending-sync after a network miss', async () => {
    let tree!: ReturnType<typeof renderer.create>;
    await act(async () => {
      tree = renderer.create(<PersonalContextSection />);
    });

    await act(async () => {
      findByTestId(tree.root, 'personal-context-toggle').props.onPress();
    });

    await act(async () => {
      findByTestId(tree.root, 'personal-context-about-me').props.onChangeText(
        `${profile.aboutMe} Also parenting.`,
      );
    });
    expect(mockUpdateUser).not.toHaveBeenCalled();

    await act(async () => {
      findByTestId(tree.root, 'personal-context-cancel').props.onPress();
    });
    expect(mockUpdateUser).not.toHaveBeenCalled();
    expect(findByTestId(tree.root, 'personal-context-about-me')).toBeUndefined();

    await act(async () => {
      findByTestId(tree.root, 'personal-context-toggle').props.onPress();
    });
    expect(findByTestId(tree.root, 'personal-context-about-me').props.value).toBe(profile.aboutMe);

    const nextAboutMe = `${profile.aboutMe} Also parenting.`;
    await act(async () => {
      findByTestId(tree.root, 'personal-context-about-me').props.onChangeText(nextAboutMe);
    });

    mockSync.mockRejectedValueOnce(new Error('offline'));
    await act(async () => {
      await findByTestId(tree.root, 'personal-context-save').props.onPress();
    });
    expect(mockUpdateUser).toHaveBeenCalledWith({
      companionName: 'Grace',
      aboutMe: nextAboutMe,
    });
    expect(findByTestId(tree.root, 'personal-context-about-me')).toBeUndefined();
    expect(findByTestId(tree.root, 'personal-context-pending-sync').props.children).toBe(
      PERSONAL_CONTEXT_PENDING_SYNC_COPY,
    );
  });

  it('disables the accordion and inputs while Save is pending', async () => {
    let release!: (value?: unknown) => void;
    mockSync.mockImplementation(() => new Promise((resolve) => {
      release = resolve;
    }));

    let tree!: ReturnType<typeof renderer.create>;
    await act(async () => {
      tree = renderer.create(<PersonalContextSection />);
    });

    await act(async () => {
      findByTestId(tree.root, 'personal-context-toggle').props.onPress();
    });
    await act(async () => {
      findByTestId(tree.root, 'personal-context-about-me').props.onChangeText(
        `${profile.aboutMe} Also parenting.`,
      );
    });

    let savePromise: Promise<void> = Promise.resolve();
    await act(async () => {
      savePromise = findByTestId(tree.root, 'personal-context-save').props.onPress();
    });

    expect(mockUpdateUser).toHaveBeenCalled();
    expect(findByTestId(tree.root, 'personal-context-toggle').props.disabled).toBe(true);
    expect(findByTestId(tree.root, 'personal-context-about-me').props.editable).toBe(false);
    expect(findByTestId(tree.root, 'personal-context-companion-name').props.editable).toBe(false);
    expect(findByTestId(tree.root, 'personal-context-cancel').props.disabled).toBe(true);

    await act(async () => {
      release();
      await savePromise;
    });
  });
});
