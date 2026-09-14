import { act, renderHook } from '@testing-library/react-native';
import { Keyboard } from 'react-native';
import { useAmbientSoundVisibility } from '../useAmbientSoundVisibility';

let mockSegments = ['(tabs)', '(today)'];
let mockPathname = '/';
let mockEnabled = true;
let mockNarrationTier = 'hidden';
let mockStatus = 'off';
const mockKeyboardListeners: Record<string, () => void> = {};
const addKeyboardListener = Keyboard.addListener.bind(Keyboard);

jest.mock('expo-router', () => ({
  useSegments: () => mockSegments,
  usePathname: () => mockPathname,
}));
jest.mock('@/lib/ambient-audio-feature', () => ({
  isAmbientAudioEnabled: () => mockEnabled,
}));
jest.mock('@/lib/audio-player-state', () => ({
  useAudioPlayerState: (select: (state: { playerTier: string }) => unknown) =>
    select({ playerTier: mockNarrationTier }),
}));
jest.mock('@/lib/ambient-audio-state', () => ({
  isAmbientPlayerPresent: (status: string) =>
    status === 'loading' || status === 'playing' || status === 'paused' || status === 'error',
  useAmbientAudioState: (select: (state: { status: string }) => unknown) =>
    select({ status: mockStatus }),
}));

beforeEach(() => {
  mockSegments = ['(tabs)', '(today)'];
  mockPathname = '/';
  mockEnabled = true;
  mockNarrationTier = 'hidden';
  mockStatus = 'off';
  jest.spyOn(Keyboard, 'isVisible').mockImplementation(function (this: typeof Keyboard) {
    expect(this).toBe(Keyboard);
    return false;
  });
  jest.spyOn(Keyboard, 'addListener').mockImplementation((event, callback) => {
    mockKeyboardListeners[event] = () =>
      callback({
        duration: 0,
        easing: 'keyboard',
        endCoordinates: { screenX: 0, screenY: 500, width: 402, height: 374 },
      });
    return addKeyboardListener(event, callback);
  });
});
afterEach(() => jest.restoreAllMocks());

it('leaves real tab headers to their route without an idle player', () => {
  const { result, rerender } = renderHook(useAmbientSoundVisibility);
  expect(result.current.headerVisible).toBe(false);
  expect(result.current.playerVisible).toBe(false);
  expect(result.current.todayHome).toBe(true);
  mockStatus = 'playing';
  rerender({});
  expect(result.current.playerVisible).toBe(true);
});

it('hides the overlay header on reading and keeps the player after pause', () => {
  mockPathname = '/reading';
  mockStatus = 'paused';
  const { result } = renderHook(useAmbientSoundVisibility);
  expect(result.current.headerVisible).toBe(false);
  expect(result.current.playerVisible).toBe(true);
  expect(result.current.todayHome).toBe(false);
});

it('hides the player during narration and the ask tab header', () => {
  mockStatus = 'playing';
  mockNarrationTier = 'pill';
  const { result, rerender } = renderHook(useAmbientSoundVisibility);
  expect(result.current.playerVisible).toBe(false);
  mockNarrationTier = 'hidden';
  mockSegments = ['(tabs)', '(ask)'];
  rerender({});
  expect(result.current.headerVisible).toBe(false);
});

it('hides the floating player while the keyboard is visible', () => {
  mockStatus = 'playing';
  const { result } = renderHook(useAmbientSoundVisibility);
  act(() => (mockKeyboardListeners.keyboardWillShow ?? mockKeyboardListeners.keyboardDidShow)());
  expect(result.current.keyboardVisible).toBe(true);
  expect(result.current.playerVisible).toBe(false);
});

it('limits QA access and keeps disabled builds clear', () => {
  mockSegments = [];
  mockPathname = '/onboarding';
  const { result, rerender } = renderHook(useAmbientSoundVisibility);
  expect(result.current.headerVisible).toBe(false);
  mockPathname = '/qa-ambient-sound';
  rerender({});
  expect(result.current.headerVisible).toBe(true);
  mockEnabled = false;
  rerender({});
  expect(result.current.headerVisible).toBe(false);
});
