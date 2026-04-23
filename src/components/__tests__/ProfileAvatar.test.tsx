import React from 'react';
import { Image, Text } from 'react-native';
import { ProfileAvatar } from '../ProfileAvatar';

const renderer = require('react-test-renderer');
const { act } = renderer;

const mockUpdateUser = jest.fn();
const mockStoreState = {
  user: {
    name: 'Nick',
    profilePicture: 'file:///missing-avatar.jpg',
  },
  updateUser: mockUpdateUser,
};

jest.mock('@/lib/store', () => ({
  useUnfoldStore: (selector: (state: typeof mockStoreState) => unknown) => selector(mockStoreState),
}));

jest.mock('@/lib/theme', () => ({
  useTheme: () => ({
    colors: {
      accent: '#C8A55C',
      background: '#111111',
    },
  }),
}));

jest.mock('@/constants/fonts', () => ({
  FontFamily: {
    uiSemiBold: 'System',
  },
}));

jest.mock('@/components/ui', () => ({
  alpha: (_color: string, opacity: number) => `rgba(0,0,0,${opacity})`,
}));

jest.mock('expo-image-picker', () => ({
  launchImageLibraryAsync: jest.fn(),
}));

jest.mock('expo-image-manipulator', () => ({
  manipulateAsync: jest.fn(),
  SaveFormat: { JPEG: 'jpeg' },
}));

jest.mock('expo-file-system/legacy', () => ({
  documentDirectory: 'file:///documents/',
  copyAsync: jest.fn(),
  deleteAsync: jest.fn(),
}));

jest.mock('expo-haptics', () => ({
  notificationAsync: jest.fn(),
  impactAsync: jest.fn(),
  NotificationFeedbackType: { Success: 'success' },
  ImpactFeedbackStyle: { Light: 'light' },
}));

jest.mock('phosphor-react-native', () => ({
  CameraIcon: () => null,
}));

describe('ProfileAvatar', () => {
  beforeEach(() => {
    mockUpdateUser.mockClear();
    mockStoreState.user.name = 'Nick';
    mockStoreState.user.profilePicture = 'file:///missing-avatar.jpg';
  });

  it('falls back to the user initial when the stored profile image fails to load', () => {
    let tree: any;

    act(() => {
      tree = renderer.create(<ProfileAvatar size={80} editable />);
    });

    expect(() => tree.root.findByType(Text)).toThrow();

    const image = tree.root.findByType(Image);

    act(() => {
      image.props.onError?.({ nativeEvent: { error: 'missing file' } });
    });

    const fallbackText = tree.root.findByType(Text);
    expect(fallbackText.props.children).toBe('N');
    expect(mockUpdateUser).toHaveBeenCalledWith({ profilePicture: null });
  });
});
