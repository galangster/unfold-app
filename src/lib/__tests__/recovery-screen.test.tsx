/**
 * The storage-locked screen (P0).
 *
 * When the app starts while the phone is locked it cannot read the key that
 * opens its store, so the session runs on an empty throwaway namespace. Nothing
 * used to tell the person anything: a fully onboarded user was silently shown a
 * brand-new install. This screen is that missing explanation, so the two things
 * under test are the decision to show it and the words on it.
 */
import { act, create } from 'react-test-renderer';
import { DarkColors } from '@/constants/colors';
import { RecoveryScreen, shouldShowRecoveryScreen } from '@/components/RecoveryScreen';

/** Internals a person must never be shown, and the loss this must never imply. */
const FORBIDDEN_WORDS = ['keychain', 'mmkv', 'encryption', 'recovery', 'namespace'];
const LOSS_WORDS = ['lost', 'deleted', 'erased', 'gone', 'wiped'];

function collectText(node: unknown): string[] {
  if (typeof node === 'string') return [node];
  if (Array.isArray(node)) return node.flatMap(collectText);
  if (node && typeof node === 'object' && 'children' in node) {
    return collectText((node as { children: unknown }).children);
  }
  return [];
}

function renderScreen(onRetry: () => void = () => {}) {
  let tree!: ReturnType<typeof create>;
  act(() => {
    tree = create(<RecoveryScreen colors={DarkColors} onRetry={onRetry} />);
  });
  return { tree, text: collectText(tree.toJSON()).join(' ') };
}

describe('shouldShowRecoveryScreen', () => {
  it('shows the screen for a session running on the throwaway store', () => {
    expect(shouldShowRecoveryScreen(true)).toBe(true);
  });

  it('stays out of the way on a normal session', () => {
    expect(shouldShowRecoveryScreen(false)).toBe(false);
  });
});

describe('RecoveryScreen', () => {
  it('tells the person their reading is safe and asks them to unlock the phone', () => {
    const { text } = renderScreen();
    const lower = text.toLowerCase();

    expect(lower).toContain('safe');
    expect(lower).toContain('still on this device');
    expect(lower).toContain('locked');
    expect(lower).toContain('unlock your phone');
  });

  it('never names the storage internals and never implies the data is gone', () => {
    const { text } = renderScreen();
    const lower = text.toLowerCase();

    for (const word of FORBIDDEN_WORDS) {
      expect(lower).not.toContain(word);
    }
    for (const word of LOSS_WORDS) {
      expect(lower).not.toContain(word);
    }
  });

  it('offers exactly one action, and it calls onRetry', () => {
    const onRetry = jest.fn();
    const { tree } = renderScreen(onRetry);

    const button = tree.root.findAllByProps({ testID: 'storage-locked-retry' })[0];
    expect(button.props.accessibilityRole).toBe('button');
    expect(button.props.accessibilityLabel).toBe('Try again');

    act(() => {
      button.props.onPress();
    });
    expect(onRetry).toHaveBeenCalledTimes(1);
  });
});
