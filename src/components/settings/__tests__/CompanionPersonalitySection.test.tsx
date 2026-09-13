import React from 'react';
import renderer, { act } from 'react-test-renderer';
import { CompanionPersonalitySection } from '../CompanionPersonalitySection';

const mockUpdateUser = jest.fn();
const mockProfile = { companionPersonality: undefined as string | undefined, writingStyle: { tone: 'poetic' } };
jest.mock('expo-haptics', () => ({ selectionAsync: jest.fn() }));
jest.mock('react-native-gesture-handler', () => ({ TouchableOpacity: require('react-native').TouchableOpacity }));
jest.mock('@/lib/theme', () => ({ useTheme: () => ({ colors: { text: '#fff', textMuted: '#aaa', accent: '#c8a55c', border: '#333', inputBackground: '#111' } }) }));
jest.mock('@/lib/store', () => ({
  useUnfoldStore: (selector: (state: Record<string, unknown>) => unknown) => selector({ user: mockProfile, updateUser: mockUpdateUser }),
}));

it('changes the selected personality without writing devotional preferences', () => {
  let tree!: renderer.ReactTestRenderer;
  act(() => { tree = renderer.create(<CompanionPersonalitySection />); });
  const option = (label: string) => tree.root.findAll((node) => node.props.accessibilityRole === 'radio' && node.props.accessibilityLabel === label)[0];
  expect(option('Gentle').props.accessibilityState.checked).toBe(true);
  act(() => { option('Thoughtful').props.onPress(); });
  expect(mockUpdateUser).toHaveBeenCalledWith({ companionPersonality: 'thoughtful' });
  mockProfile.companionPersonality = 'thoughtful';
  act(() => { tree.update(<CompanionPersonalitySection />); });
  expect(option('Thoughtful').props.accessibilityState.checked).toBe(true);
  expect(option('Gentle').props.accessibilityState.checked).toBe(false);
  expect(mockProfile.writingStyle).toEqual({ tone: 'poetic' });
  act(() => { tree.unmount(); });
});

it('repairs an invalid saved personality when Gentle is selected', () => {
  mockProfile.companionPersonality = 'unknown';
  mockUpdateUser.mockClear();
  let tree!: renderer.ReactTestRenderer;
  act(() => { tree = renderer.create(<CompanionPersonalitySection />); });
  const gentle = tree.root.findAll((node) => node.props.accessibilityRole === 'radio' && node.props.accessibilityLabel === 'Gentle')[0];
  expect(gentle.props.accessibilityState.checked).toBe(true);
  act(() => { gentle.props.onPress(); });
  expect(mockUpdateUser).toHaveBeenCalledWith({ companionPersonality: 'gentle' });
  act(() => { tree.unmount(); });
});
