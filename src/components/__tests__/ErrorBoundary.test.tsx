import React from 'react';
import { Text } from 'react-native';
import { act, create } from 'react-test-renderer';
import { DarkColors, LightColors } from '@/constants/colors';
import {
  ErrorBoundary,
  FAILED_RETRIES_BEFORE_HOME,
  resolveBoundaryColors,
  shouldOfferHomeEscape,
} from '../ErrorBoundary';

const mockLogBugError = jest.fn((..._args: unknown[]) => Promise.resolve());
const mockGetCount = jest.fn(() => 0);
const mockRecordCrash = jest.fn(() => 1);
const mockClearCount = jest.fn();
const mockReset = jest.fn(() => Promise.resolve());

jest.mock('@/lib/bug-logger', () => ({
  logBugError: (...args: unknown[]) => mockLogBugError(...args),
}));

jest.mock('@/lib/crash-marker', () => ({
  getConsecutiveBootCrashCount: () => mockGetCount(),
  recordCrash: () => mockRecordCrash(),
  clearBootCrashCount: () => mockClearCount(),
  isCrashLoop: (count: number) => count >= 3,
}));

jest.mock('@/lib/full-reset', () => ({
  performFullLocalReset: () => mockReset(),
}));

let explode = true;

function Bomb() {
  if (explode) throw new Error('boom');
  return <Text>recovered</Text>;
}

type Root = any;

function pressables(root: Root, testID: string) {
  return root
    .findAllByProps({ testID })
    .filter((node: Root) => typeof node.props.onPress === 'function');
}

function has(root: Root, testID: string): boolean {
  return pressables(root, testID).length > 0;
}

function press(root: Root, testID: string) {
  const [node] = pressables(root, testID);
  if (!node) throw new Error(`No pressable with testID ${testID}`);
  act(() => {
    node.props.onPress();
  });
}

function visibleText(root: Root): string {
  return root
    .findAllByType(Text)
    .map((node: Root) => node.props.children)
    .flat(Number.POSITIVE_INFINITY)
    .filter((child: unknown) => typeof child === 'string')
    .join(' ');
}

function renderBoundary(props: { onNavigateHome?: () => void } = {}, child: React.ReactNode = <Bomb />) {
  let tree: Root;
  act(() => {
    tree = create(<ErrorBoundary {...props}>{child}</ErrorBoundary>);
  });
  return tree;
}

describe('ErrorBoundary', () => {
  let consoleError: jest.SpyInstance;

  beforeEach(() => {
    jest.clearAllMocks();
    explode = true;
    mockGetCount.mockReturnValue(0);
    mockRecordCrash.mockReturnValue(1);
    // React reports the caught render error on console.error; keep the run quiet.
    consoleError = jest.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    consoleError.mockRestore();
  });

  it('shows the fallback, logs the error, and a press on Try Again remounts the subtree', () => {
    const tree = renderBoundary();

    expect(has(tree.root, 'error-boundary-retry')).toBe(true);
    expect(mockLogBugError).toHaveBeenCalledWith(
      'error-boundary',
      expect.any(Error),
      expect.objectContaining({ timestamp: expect.any(String) }),
    );
    expect(mockRecordCrash).toHaveBeenCalledTimes(1);

    explode = false;
    press(tree.root, 'error-boundary-retry');

    expect(visibleText(tree.root)).toContain('recovered');
    expect(has(tree.root, 'error-boundary-retry')).toBe(false);
  });

  it('offers Go to Today only after two resets ended in another catch, and calls onNavigateHome', () => {
    const onNavigateHome = jest.fn();
    const tree = renderBoundary({ onNavigateHome });

    expect(has(tree.root, 'error-boundary-home')).toBe(false);
    press(tree.root, 'error-boundary-retry');
    expect(has(tree.root, 'error-boundary-home')).toBe(false);
    press(tree.root, 'error-boundary-retry');
    expect(has(tree.root, 'error-boundary-home')).toBe(true);
    expect(onNavigateHome).not.toHaveBeenCalled();

    explode = false;
    press(tree.root, 'error-boundary-home');

    expect(onNavigateHome).toHaveBeenCalledTimes(1);
    expect(visibleText(tree.root)).toContain('recovered');
  });

  it('counts boundary resets, not render attempts', () => {
    expect(shouldOfferHomeEscape(0)).toBe(false);
    expect(shouldOfferHomeEscape(FAILED_RETRIES_BEFORE_HOME - 1)).toBe(false);
    expect(shouldOfferHomeEscape(FAILED_RETRIES_BEFORE_HOME)).toBe(true);

    // Throws on its first two render calls. React replays a failed render
    // before a boundary sees it (how many times is an implementation detail),
    // so this child needs at most two resets and possibly none — while a
    // per-render count would reach the threshold at the first fallback.
    let throwsLeft = 2;
    function Flaky() {
      if (throwsLeft > 0) {
        throwsLeft -= 1;
        throw new Error('flaky');
      }
      return <Text>steady</Text>;
    }
    const tree = renderBoundary({}, <Flaky />);

    let resets = 0;
    while (!visibleText(tree.root).includes('steady') && resets < 3) {
      expect(has(tree.root, 'error-boundary-home')).toBe(false);
      press(tree.root, 'error-boundary-retry');
      resets += 1;
    }
    expect(visibleText(tree.root)).toContain('steady');
    expect(resets).toBeLessThanOrEqual(FAILED_RETRIES_BEFORE_HOME);
    expect(has(tree.root, 'error-boundary-home')).toBe(false);
  });

  it('keeps the raw message behind a Details disclosure', () => {
    const tree = renderBoundary();

    expect(tree.root.findAllByProps({ testID: 'error-boundary-details' })).toHaveLength(0);
    expect(visibleText(tree.root)).not.toContain('boom');

    press(tree.root, 'error-boundary-details-toggle');

    expect(visibleText(tree.root)).toContain('Error: boom');
  });

  it('switches to the recovery screen when the crash marker reports a loop and resets behind a confirmation', async () => {
    mockRecordCrash.mockReturnValue(3);
    const tree = renderBoundary();

    expect(has(tree.root, 'error-boundary-reset')).toBe(true);
    expect(has(tree.root, 'error-boundary-retry')).toBe(false);

    press(tree.root, 'error-boundary-reset');
    expect(mockReset).not.toHaveBeenCalled();
    expect(has(tree.root, 'error-boundary-reset-confirm')).toBe(true);

    press(tree.root, 'error-boundary-reset-cancel');
    expect(has(tree.root, 'error-boundary-reset-confirm')).toBe(false);
    expect(mockReset).not.toHaveBeenCalled();

    press(tree.root, 'error-boundary-reset');
    explode = false;
    const [confirm] = pressables(tree.root, 'error-boundary-reset-confirm');
    await act(async () => {
      confirm.props.onPress();
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(mockReset).toHaveBeenCalledTimes(1);
    expect(mockClearCount).toHaveBeenCalledTimes(1);
    expect(visibleText(tree.root)).toContain('recovered');
  });

  it('reports a failed reset instead of remounting', async () => {
    mockRecordCrash.mockReturnValue(3);
    mockReset.mockRejectedValueOnce(new Error('disk'));
    const tree = renderBoundary();

    press(tree.root, 'error-boundary-reset');
    const [confirm] = pressables(tree.root, 'error-boundary-reset-confirm');
    await act(async () => {
      confirm.props.onPress();
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(mockClearCount).not.toHaveBeenCalled();
    expect(tree.root.findAllByProps({ testID: 'error-boundary-reset-failed' }).length).toBeGreaterThan(0);
    expect(has(tree.root, 'error-boundary-reset-confirm')).toBe(true);
  });

  it('shows the recovery screen at launch when earlier launches already reached the threshold', () => {
    mockGetCount.mockReturnValue(3);
    explode = false;
    const tree = renderBoundary();

    expect(visibleText(tree.root)).not.toContain('recovered');
    expect(has(tree.root, 'error-boundary-reset')).toBe(true);

    press(tree.root, 'error-boundary-recovery-retry');

    expect(visibleText(tree.root)).toContain('recovered');
  });

  it('follows the system colour scheme instead of the (unmounted) theme provider', () => {
    expect(resolveBoundaryColors('light')).toBe(LightColors);
    expect(resolveBoundaryColors('dark')).toBe(DarkColors);
    expect(resolveBoundaryColors(null)).toBe(DarkColors);
    expect(resolveBoundaryColors(undefined)).toBe(DarkColors);
  });
});
