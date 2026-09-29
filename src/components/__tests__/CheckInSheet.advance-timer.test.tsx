/**
 * Greptile A10 regression: the 300ms auto-advance timers were never retained,
 * so a close/reopen inside that window advanced the freshly reset sheet.
 * Also: an answer the caller could not save plays no success haptic and shows
 * no celebration. The sheet stays open with the words the reader wrote, and
 * offers to copy them.
 */
import React from 'react';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { AccessibilityInfo, TextInput, TouchableOpacity } from 'react-native';
import renderer, { act } from 'react-test-renderer';
import * as Clipboard from 'expo-clipboard';
import * as Haptics from 'expo-haptics';
import { CheckInSheet } from '../CheckInSheet';

jest.mock('expo-clipboard', () => ({ setStringAsync: jest.fn(() => Promise.resolve(true)) }));
jest.mock('expo-haptics', () => ({
  impactAsync: jest.fn(),
  notificationAsync: jest.fn(),
  ImpactFeedbackStyle: { Light: 'light', Medium: 'medium' },
  NotificationFeedbackType: { Success: 'success', Warning: 'warning', Error: 'error' },
}));
jest.mock('@/components/icons', () => new Proxy({}, {
  get: (_target, name) => (name === '__esModule' ? true : () => null),
}));
jest.mock('@/components/VoiceInputBar', () => ({ VoiceInputBar: () => null }));
jest.mock('@/components/ui', () => ({ alpha: (c: string) => c }));
jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 0, right: 0, bottom: 0, left: 0 }),
}));
jest.mock('@/lib/theme', () => ({
  useTheme: () => ({ isDark: true, colors: new Proxy({}, { get: () => '#888888' }) }),
}));
jest.mock('react-native-reanimated', () => {
  const { View } = require('react-native');
  const chainable = () => {
    const anim: Record<string, unknown> = {};
    for (const method of ['duration', 'delay', 'easing', 'springify', 'damping', 'build']) anim[method] = () => anim;
    return anim;
  };
  return {
    __esModule: true,
    default: { View },
    FadeIn: chainable(),
    SlideInDown: chainable(),
    SlideOutDown: chainable(),
    Easing: { out: () => 'out', in: () => 'in', inOut: () => 'inOut', cubic: 'cubic' },
    useAnimatedStyle: (factory: () => unknown) => factory(),
    useReducedMotion: () => true,
    useSharedValue: (value: unknown) => ({ value }),
    withTiming: (v: unknown) => v,
    withDelay: (_d: number, a: unknown) => a,
    interpolate: (v: number) => v,
  };
});

function collectText(node: any): string[] {
  if (typeof node === 'string') return [node];
  if (Array.isArray(node)) return node.flatMap(collectText);
  if (!node || typeof node !== 'object') return [];
  return collectText(node.children ?? []);
}

const props = {
  onClose: jest.fn(),
  onComplete: jest.fn(),
  question: 'What are you carrying today?',
};

function buttons(tree: renderer.ReactTestRenderer, label: string) {
  return tree.root.findAll((node) => node.type === TouchableOpacity && node.props.accessibilityLabel === label);
}

// Presses a button, then lets the sheet advance. A chip waits 300ms before
// the step's own 300ms advance; step each timer separately.
async function press(tree: renderer.ReactTestRenderer, label: string) {
  await act(async () => {
    buttons(tree, label)[0].props.onPress();
  });
  for (let tick = 0; tick < 2; tick += 1) {
    await act(async () => {
      jest.advanceTimersByTime(400);
    });
  }
}

async function open(sheetProps: Partial<React.ComponentProps<typeof CheckInSheet>> = {}) {
  let tree: renderer.ReactTestRenderer;
  await act(async () => {
    tree = renderer.create(<CheckInSheet {...props} {...sheetProps} visible />);
  });
  return tree!;
}

// Picks a mood and a suggestion, then skips the note, which completes the check-in.
async function tapThroughCheckIn(tree: renderer.ReactTestRenderer) {
  for (const label of ['Struggling', 'Work stress', 'Skip this step']) {
    await press(tree, label);
  }
}

const shownText = (tree: renderer.ReactTestRenderer) => collectText(tree.toJSON()).join(' ');

describe('CheckInSheet auto-advance timer (Greptile A10)', () => {
  beforeEach(() => {
    jest.useFakeTimers();
  });
  afterEach(() => {
    jest.useRealTimers();
  });

  it('stays on the mood step when the sheet is closed and reopened inside the advance window', async () => {
    const tree = await open();
    await act(async () => {
      buttons(tree, 'Struggling')[0].props.onPress();
    });
    await act(async () => {
      tree.update(<CheckInSheet {...props} visible={false} />);
    });
    await act(async () => {
      tree.update(<CheckInSheet {...props} visible />);
    });
    await act(async () => {
      jest.advanceTimersByTime(400);
    });

    const text = shownText(tree);
    expect(text).toContain('How are you today?');
    expect(text).not.toContain(props.question);
  });

});

describe('CheckInSheet completion', () => {
  beforeEach(() => {
    jest.useFakeTimers();
    (Haptics.notificationAsync as jest.Mock).mockClear();
  });
  afterEach(() => {
    jest.useRealTimers();
  });

  async function completeCheckIn(onComplete: () => boolean | void) {
    const tree = await open({ onComplete });
    await tapThroughCheckIn(tree);
    return shownText(tree);
  }

  it('plays no success haptic and shows no celebration when the answer is not saved', async () => {
    const onComplete = jest.fn(() => false);
    const text = await completeCheckIn(onComplete);

    expect(onComplete).toHaveBeenCalledTimes(1);
    expect(Haptics.notificationAsync).not.toHaveBeenCalled();
    expect(text).not.toContain('Tap anywhere to continue');
  });

  it('celebrates a saved answer', async () => {
    const text = await completeCheckIn(() => true);

    expect(Haptics.notificationAsync).toHaveBeenCalledWith('success');
    expect(text).toContain('Tap anywhere to continue');
  });
});

describe('CheckInSheet answer that was not saved', () => {
  const ANSWER = 'The talk with my brother';
  const NOTE = 'Lord, help me listen first.';
  const REASON = 'The reading it belongs to was removed from this device while you were answering.';
  const HINT = 'Your words are still here. Copy them to keep them.';
  let tree: renderer.ReactTestRenderer;
  let onClose: jest.Mock;
  let announce: jest.SpyInstance;

  beforeEach(() => {
    jest.useFakeTimers();
    (Haptics.notificationAsync as jest.Mock).mockClear();
    (Clipboard.setStringAsync as jest.Mock).mockClear();
    onClose = jest.fn();
    announce = jest.spyOn(AccessibilityInfo, 'announceForAccessibility').mockImplementation(() => undefined);
  });
  afterEach(() => {
    act(() => tree.unmount());
    announce.mockRestore();
    jest.useRealTimers();
  });

  async function write(words: string) {
    await act(async () => {
      tree.root.findByType(TextInput).props.onChangeText(words);
    });
  }

  // Answers in the reader's own words and writes a note.
  async function writeAnswerAndNote(answer = ANSWER) {
    await press(tree, 'Struggling');
    await press(tree, 'Type my own answer');
    await write(answer);
    await press(tree, 'Submit answer');
    await write(NOTE);
    await press(tree, 'Submit note');
  }

  // The same, submitted to a caller that refuses.
  async function submitWrittenAnswer() {
    const onComplete = jest.fn(() => false);
    tree = await open({ onClose, onComplete });
    await writeAnswerAndNote();
    return onComplete;
  }

  const backdrop = () => tree.root.findAll((node) => node.type === TouchableOpacity && node.props.testID === 'check-in-backdrop')[0];

  it('stays open with the message and the words the reader wrote', async () => {
    const onComplete = await submitWrittenAnswer();

    expect(onComplete).toHaveBeenCalledWith(expect.objectContaining({ chipAnswer: ANSWER, freeText: NOTE }));
    const text = shownText(tree);
    expect(text).toContain('Check-in not saved');
    expect(text).toContain(`${REASON} ${HINT}`);
    expect(text).toContain(ANSWER);
    expect(text).toContain(NOTE);
    // The mood is not something the reader wrote.
    expect(text).not.toContain('Struggling');
    expect(onClose).not.toHaveBeenCalled();
    expect(Haptics.notificationAsync).not.toHaveBeenCalled();
    expect(text).not.toContain('Tap anywhere to continue');
    // The steps are over: nothing can be submitted a second time.
    expect(buttons(tree, 'Submit note')).toHaveLength(0);
    expect(buttons(tree, 'Back')).toHaveLength(0);
  });

  it('copies the words the reader wrote and stays open', async () => {
    await submitWrittenAnswer();

    await press(tree, 'Copy my words');

    expect(Clipboard.setStringAsync).toHaveBeenCalledTimes(1);
    expect(Clipboard.setStringAsync).toHaveBeenCalledWith(`${ANSWER}\n\n${NOTE}`);
    expect(buttons(tree, 'Copied')).toHaveLength(1);
    expect(shownText(tree)).toContain(NOTE);
    expect(onClose).not.toHaveBeenCalled();
  });

  it('does not say Copied when the clipboard refuses the words', async () => {
    (Clipboard.setStringAsync as jest.Mock).mockResolvedValueOnce(false);
    await submitWrittenAnswer();

    await press(tree, 'Copy my words');

    expect(buttons(tree, 'Copied')).toHaveLength(0);
    expect(buttons(tree, 'Copy my words')).toHaveLength(1);
    expect(shownText(tree)).toContain(NOTE);
  });

  it('closes on Close', async () => {
    await submitWrittenAnswer();

    await press(tree, 'Close');

    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('closes on the close button of the sheet', async () => {
    await submitWrittenAnswer();

    await press(tree, 'Close check-in');

    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('ignores a tap outside the sheet while it holds words', async () => {
    await submitWrittenAnswer();

    await act(async () => {
      backdrop().props.onPress?.();
    });

    expect(onClose).not.toHaveBeenCalled();
    expect(shownText(tree)).toContain(NOTE);
  });

  it('closes on a tap outside the sheet while the reader is still answering', async () => {
    tree = await open({ onClose });
    await press(tree, 'Struggling');

    await act(async () => {
      backdrop().props.onPress();
    });

    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('offers only Close when the reader wrote no words', async () => {
    tree = await open({ onClose, onComplete: () => false });
    await tapThroughCheckIn(tree);

    const text = shownText(tree);
    expect(text).toContain('Check-in not saved');
    expect(text).toContain(REASON);
    expect(text).not.toContain(HINT);
    // A tapped suggestion is not the reader's writing.
    expect(text).not.toContain('Work stress');
    expect(buttons(tree, 'Copy my words')).toHaveLength(0);

    await press(tree, 'Close');
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('keeps a note the reader wrote after a tapped suggestion', async () => {
    tree = await open({ onClose, onComplete: () => false });
    await press(tree, 'Struggling');
    await press(tree, 'Work stress');
    await write(NOTE);
    await press(tree, 'Submit note');

    expect(shownText(tree)).not.toContain('Work stress');
    await press(tree, 'Copy my words');
    expect(Clipboard.setStringAsync).toHaveBeenCalledWith(NOTE);
  });

  it('keeps a typed answer that reads the same as a suggestion', async () => {
    tree = await open({ onClose, onComplete: () => false });
    await writeAnswerAndNote('Work stress');

    await press(tree, 'Copy my words');

    expect(Clipboard.setStringAsync).toHaveBeenCalledWith(`Work stress\n\n${NOTE}`);
  });

  it('opens empty the next time', async () => {
    const onComplete = await submitWrittenAnswer();

    await act(async () => {
      tree.update(<CheckInSheet {...props} onClose={onClose} onComplete={onComplete} visible={false} />);
    });
    await act(async () => {
      tree.update(<CheckInSheet {...props} onClose={onClose} onComplete={onComplete} visible />);
    });

    const text = shownText(tree);
    expect(text).toContain('How are you today?');
    expect(text).not.toContain('Check-in not saved');
    expect(text).not.toContain(NOTE);
  });

  it('says the message to a screen reader, and none of the words', async () => {
    await submitWrittenAnswer();

    expect(announce).toHaveBeenCalledTimes(1);
    expect(announce).toHaveBeenCalledWith(`Check-in not saved. ${REASON} ${HINT}`);
    await press(tree, 'Copy my words');
    expect(announce).toHaveBeenLastCalledWith('Copied');
    const said = JSON.stringify(announce.mock.calls);
    expect(said).not.toContain(ANSWER);
    expect(said).not.toContain(NOTE);
  });

  it('says nothing when the caller closes the sheet as it refuses', async () => {
    // Today does this for an account reset: it closes the sheet and shows an alert.
    const onComplete = jest.fn(() => {
      tree.update(<CheckInSheet {...props} onClose={onClose} onComplete={onComplete} visible={false} />);
      return false;
    });
    tree = await open({ onClose, onComplete });
    await writeAnswerAndNote();

    expect(onComplete).toHaveBeenCalledTimes(1);
    expect(announce).not.toHaveBeenCalled();
    expect(shownText(tree)).not.toContain(NOTE);
  });

  it('writes none of the words to the console or to a label', async () => {
    const consoleSpies = (['log', 'info', 'warn', 'error', 'debug'] as const).map((method) => jest.spyOn(console, method).mockImplementation(() => undefined));
    await submitWrittenAnswer();
    await press(tree, 'Copy my words');

    const logged = JSON.stringify(consoleSpies.map((spy) => spy.mock.calls));
    consoleSpies.forEach((spy) => spy.mockRestore());
    expect(logged).not.toContain(ANSWER);
    expect(logged).not.toContain(NOTE);
    const labelled = tree.root.findAll((node) => (
      [node.props.accessibilityLabel, node.props['aria-label'], node.props.accessibilityHint, node.props.testID]
        .some((value) => typeof value === 'string' && (value.includes(ANSWER) || value.includes(NOTE)))
    ));
    expect(labelled).toHaveLength(0);
  });

  it('has no logger, error reporter, or analytics to send the words to', () => {
    const source = readFileSync(join(__dirname, '../CheckInSheet.tsx'), 'utf8');

    expect(source).not.toMatch(/from '@\/lib\/(logger|bug-logger|sentry|report-error|analytics)[^']*'/);
    expect(source).not.toMatch(/console\./);
  });
});
