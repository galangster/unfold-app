import React from 'react';
import renderer, { act } from 'react-test-renderer';

const mockConstants = { expoConfig: { extra: { buildProfile: 'qa-replay-testflight' } } };
let mockEnabled = true;
const mockCapture = jest.fn();

jest.mock('expo-constants', () => ({ __esModule: true, default: mockConstants }));
jest.mock('expo-router', () => ({
  Redirect: 'Redirect',
  useRouter: () => ({ replace: jest.fn() }),
}));
jest.mock('@/lib/sentry', () => ({
  ...jest.requireActual('@/lib/sentry'),
  isSentryEnabled: () => mockEnabled,
  captureAppError: (...args: unknown[]) => mockCapture(...args),
}));

let ReplayCheckScreen: React.ComponentType;
beforeAll(() => {
  ReplayCheckScreen = jest.requireActual('@/app/qa-replay-check').default;
});

function renderScreen() {
  let tree: renderer.ReactTestRenderer;
  act(() => { tree = renderer.create(<ReplayCheckScreen />); });
  return tree!;
}

beforeEach(() => {
  mockConstants.expoConfig.extra.buildProfile = 'qa-replay-testflight';
  mockEnabled = true;
  mockCapture.mockClear();
});

it.each(['production', 'qa-testflight', 'preview', '', 'qa-replay-testflight-extra'])(
  'does not expose the replay check in %s',
  (profile) => {
    mockConstants.expoConfig.extra.buildProfile = profile;
    const tree = renderScreen();
    expect(tree.root.findByType('Redirect' as never).props.href).toBe('/');
    expect(mockCapture).not.toHaveBeenCalled();
  },
);

it('sends one static test exception only after an explicit press', () => {
  const tree = renderScreen();
  expect(mockCapture).not.toHaveBeenCalled();
  const button = () => tree.root.findAllByProps({ accessibilityLabel: 'Send replay test' })[0];
  act(() => button().props.onPress());
  expect(mockCapture).toHaveBeenCalledWith('replay-pilot-check', expect.any(Error));
  expect(mockCapture.mock.calls[0][1].message).toBe('Sentry replay pilot verification');
  const sentButton = tree.root.findAllByProps({ accessibilityLabel: 'Test sent' })[0];
  expect(sentButton.props.disabled).toBe(true);
  expect(sentButton.props.accessibilityState).toEqual({ disabled: true });
  act(() => sentButton.props.onPress());
  expect(mockCapture).toHaveBeenCalledTimes(1);
});

it('does not report success when the SDK is disabled', () => {
  mockEnabled = false;
  const tree = renderScreen();
  const button = tree.root.findAllByProps({ accessibilityLabel: 'Sentry is disabled in this build' })[0];
  expect(button.props.disabled).toBe(true);
  act(() => button.props.onPress());
  expect(mockCapture).not.toHaveBeenCalled();
});
