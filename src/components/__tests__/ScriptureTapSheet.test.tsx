import React from 'react';
import { AccessibilityInfo, Modal, StyleSheet, TouchableOpacity } from 'react-native';
import { CheckIcon, CopyIcon } from '@/components/icons';
import { ScriptureTapSheet } from '../ScriptureTapSheet';

const fs = require('fs');
const path = require('path');
const renderer = require('react-test-renderer');
const { act } = renderer;

const mockFetchVerseLocal = jest.fn();
const mockFetchVerse = jest.fn();
const mockFetchCommentary = jest.fn();
const mockFetchScriptureExplanation = jest.fn();
const mockAddBookmark = jest.fn();
const mockRemoveBookmark = jest.fn();
const mockRouterPush = jest.fn();

jest.mock('@/lib/bible-api', () => ({
  fetchVerse: (...args: unknown[]) => mockFetchVerse(...args),
  fetchVerseLocal: (...args: unknown[]) => mockFetchVerseLocal(...args),
  fetchCommentary: (...args: unknown[]) => mockFetchCommentary(...args),
}));

jest.mock('@/lib/scripture-explain-api', () => ({
  fetchScriptureExplanation: (...args: unknown[]) => mockFetchScriptureExplanation(...args),
}));

jest.mock('@/lib/analytics', () => ({
  AnalyticsEvents: {
    SCRIPTURE_EXPLAIN_OPENED: 'scripture_explain_opened',
    SCRIPTURE_EXPLAIN_COMPLETED: 'scripture_explain_completed',
    SCRIPTURE_EXPLAIN_ERROR: 'scripture_explain_error',
  },
  logEvent: jest.fn(),
}));

const mockStoreState = {
  user: { bibleTranslation: 'BSB' },
  bibleReaderSettings: { translation: 'KJV' },
  bookmarks: [] as Record<string, unknown>[],
  addBookmark: mockAddBookmark,
  removeBookmark: mockRemoveBookmark,
};

jest.mock('@/lib/store', () => ({
  useUnfoldStore: (selector: (state: typeof mockStoreState) => unknown) => selector(mockStoreState),
}));

jest.mock('expo-router', () => ({
  useRouter: () => ({ push: mockRouterPush }),
  useSegments: () => [],
  useNavigation: () => ({ getState: () => ({ index: 1, routes: [] }) }),
}));

jest.mock('@/lib/theme', () => ({
  useTheme: () => ({
    colors: {
      accent: '#C8A55C',
      background: '#111111',
      inputBackground: '#231F18',
      text: '#F6EFE3',
      textMuted: '#B8AA96',
      textSubtle: '#8D806D',
      textHint: '#6F6254',
      border: '#3A3328',
      borderStrong: '#514635',
    },
  }),
}));

jest.mock('@/constants/fonts', () => ({
  FontFamily: {
    body: 'Body',
    ui: 'System',
    uiMedium: 'System-Medium',
    uiSemiBold: 'System-Semibold',
  },
  FontSize: { xs: 12, sm: 14, base: 16, lg: 18, xl: 20, '2xl': 24, '4xl': 36 },
  LineHeight: { tight: 1.2, normal: 1.5 },
}));

jest.mock('@/constants/radius', () => ({
  Radius: { md: 12, lg: 16, '2xl': 28 },
}));

jest.mock('@/constants/spacing', () => ({
  Spacing: {
    '2': 8,
    '3': 12,
    '4': 16,
    '5': 20,
    '8': 32,
    '10': 40,
    '12': 48,
  },
}));

jest.mock('@/constants/animations', () => ({
  Duration: { fast: 120, normal: 220 },
  Ease: { out: jest.fn() },
}));

jest.mock('@/components/ui', () => ({
  alpha: (color: string, opacity: number) => `${color}${opacity}`,
}));

jest.mock('react-native-reanimated', () => ({
  __esModule: true,
  default: { View: 'Animated.View' },
  FadeIn: { duration: () => ({ easing: () => undefined }) },
  FadeInDown: { duration: () => ({ easing: () => undefined }) },
  FadeOut: { duration: () => ({ easing: () => undefined }) },
  runOnJS: (fn: (...args: unknown[]) => unknown) => fn,
  useAnimatedStyle: (factory: () => unknown) => factory(),
  useReducedMotion: () => true,
  useSharedValue: (value: unknown) => ({ value }),
  withTiming: (value: unknown, _config?: unknown, callback?: (finished: boolean) => void) => {
    callback?.(true);
    return value;
  },
}));

jest.mock('react-native-gesture-handler', () => {
  const React = require('react');
  const { View } = require('react-native');
  const makePan = () => {
    const gesture: Record<string, jest.Mock> = {};
    ['activeOffsetY', 'failOffsetX', 'onUpdate', 'onEnd'].forEach((name) => {
      gesture[name] = jest.fn(() => gesture);
    });
    return gesture;
  };

  return {
    Gesture: { Pan: jest.fn(makePan) },
    GestureDetector: ({ children }: any) => <View testID="scripture-sheet-gesture-detector">{children}</View>,
    GestureHandlerRootView: ({ children, style }: any) => <View style={style}>{children}</View>,
  };
});

jest.mock('phosphor-react-native', () => ({
  XIcon: () => null,
  BookmarkSimpleIcon: () => null,
  CopyIcon: () => null,
  CheckIcon: () => null,
  SparkleIcon: () => null,
  BookOpenIcon: () => null,
  ArrowRightIcon: () => null,
  WarningCircleIcon: () => null,
}));

jest.mock('expo-haptics', () => ({
  impactAsync: jest.fn(),
  ImpactFeedbackStyle: { Light: 'light', Medium: 'medium' },
}));

jest.mock('expo-clipboard', () => ({
  setStringAsync: jest.fn(),
}));

jest.mock('@/lib/bible-constants', () => ({
  BIBLE_BOOKS: [{ id: 43, name: 'John' }],
  referenceToRoute: (reference: string) => {
    const match = reference.match(/^John\s+(\d+)(?::(\d+))?/);
    if (!match) return null;
    return { bookId: 43, chapter: parseInt(match[1], 10), verse: match[2] ? parseInt(match[2], 10) : undefined };
  },
}));

const verseResult = {
  reference: 'John 3:16',
  text: 'For God so loved the world that He gave His one and only Son.',
  translation: 'KJV',
};

function collectText(node: any): string[] {
  if (typeof node === 'string') return [node];
  if (Array.isArray(node)) return node.flatMap(collectText);
  if (!node || typeof node !== 'object') return [];
  return collectText(node.children ?? []);
}

function textContent(tree: any): string {
  return collectText(tree.toJSON()).join(' ');
}

function findSaveButton(tree: any, label: string) {
  return tree.root
    .findAllByType(TouchableOpacity)
    .find((node: any) => node.props.accessibilityLabel === label);
}

describe('ScriptureTapSheet Explain CTA', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockFetchVerseLocal.mockResolvedValue(verseResult);
    mockFetchVerse.mockResolvedValue(verseResult);
    mockFetchCommentary.mockResolvedValue('Automatic commentary should not render.');
    mockFetchScriptureExplanation.mockResolvedValue({
      reference: 'John 3:16',
      translation: 'KJV',
      explanation: {
        plainMeaning: 'God gives love generously.',
        personalConnection: 'You can receive this love today.',
      },
      model: 'claude-haiku-4-5-20251001',
    });
    mockStoreState.bookmarks.length = 0;
    mockStoreState.bibleReaderSettings.translation = 'KJV';
  });

  it('drops a slow verse fetch for a previous reference after the reference changes (Greptile A5)', async () => {
    const deferred: Array<(value: unknown) => void> = [];
    mockFetchVerseLocal.mockImplementation(() => new Promise((resolve) => { deferred.push(resolve); }));

    const props = {
      visible: true,
      onClose: jest.fn(),
      devotionalId: 'devotional-1',
      dayNumber: 1,
      dayTitle: 'Loved First',
      devotionalTitle: 'The Gift',
    };
    let tree: any;
    await act(async () => {
      tree = renderer.create(<ScriptureTapSheet {...props} reference="John 3:16" />);
      await Promise.resolve();
    });
    await act(async () => {
      tree.update(<ScriptureTapSheet {...props} reference="John 1:1" />);
      await Promise.resolve();
    });
    expect(deferred).toHaveLength(2);

    await act(async () => {
      deferred[0]({ reference: 'John 3:16', text: 'STALE VERSE TEXT', translation: 'KJV' });
      await Promise.resolve();
    });
    expect(textContent(tree)).not.toContain('STALE VERSE TEXT');

    await act(async () => {
      deferred[1]({ reference: 'John 1:1', text: 'FRESH VERSE TEXT', translation: 'KJV' });
      await Promise.resolve();
    });
    expect(textContent(tree)).toContain('FRESH VERSE TEXT');
    expect(textContent(tree)).not.toContain('STALE VERSE TEXT');
  });

  it('clears the displayed passage and Save action while a new reference loads', async () => {
    let resolveSecondFetch: ((value: unknown) => void) | undefined;
    mockFetchVerseLocal
      .mockResolvedValueOnce({ ...verseResult, translation: 'KJV' })
      .mockImplementationOnce(() => new Promise((resolve) => { resolveSecondFetch = resolve; }));

    const props = {
      visible: true,
      onClose: jest.fn(),
      devotionalId: 'devotional-1',
      dayNumber: 1,
      dayTitle: 'Loved First',
      devotionalTitle: 'The Gift',
    };
    let tree: any;
    await act(async () => {
      tree = renderer.create(<ScriptureTapSheet {...props} reference="John 3:16" />);
      await Promise.resolve();
      await Promise.resolve();
    });
    expect(textContent(tree)).toContain(verseResult.text);
    expect(findSaveButton(tree, 'Save John 3:16')).toBeTruthy();

    await act(async () => {
      tree.update(<ScriptureTapSheet {...props} reference="John 1:1" />);
      await Promise.resolve();
    });

    expect(textContent(tree)).not.toContain(verseResult.text);
    expect(findSaveButton(tree, 'Save John 1:1')).toBeUndefined();
    expect(resolveSecondFetch).toBeDefined();
  });

  it('clears the displayed passage and Save action while a new translation loads', async () => {
    let resolveBsbFetch: ((value: unknown) => void) | undefined;
    mockFetchVerseLocal
      .mockResolvedValueOnce({ ...verseResult, translation: 'KJV' })
      .mockImplementationOnce(() => new Promise((resolve) => { resolveBsbFetch = resolve; }));

    const props = {
      visible: true,
      onClose: jest.fn(),
      reference: 'John 3:16',
      devotionalId: 'devotional-1',
      dayNumber: 1,
    };
    let tree: any;
    await act(async () => {
      tree = renderer.create(<ScriptureTapSheet {...props} />);
      await Promise.resolve();
      await Promise.resolve();
    });
    expect(findSaveButton(tree, 'Save John 3:16')).toBeTruthy();

    mockStoreState.bibleReaderSettings.translation = 'BSB';
    await act(async () => {
      tree.update(<ScriptureTapSheet {...props} />);
      await Promise.resolve();
    });

    expect(textContent(tree)).not.toContain(verseResult.text);
    expect(findSaveButton(tree, 'Save John 3:16')).toBeUndefined();
    expect(resolveBsbFetch).toBeDefined();
  });

  // CI-load flake: this async render+fetch assertion is clean in isolation but can exceed Jest's default timeout in the full parallel suite.
  it('loads verse text without automatically generating commentary and shows an explicit Explain CTA', async () => {
    let tree: any;
    await act(async () => {
      tree = renderer.create(
        <ScriptureTapSheet
          visible
          onClose={jest.fn()}
          reference="John 3:16"
          devotionalId="devotional-1"
          dayNumber={1}
          dayTitle="Loved First"
          devotionalTitle="The Gift"
        />,
      );
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(mockFetchVerseLocal).toHaveBeenCalledWith('John 3:16', 'KJV');
    expect(mockFetchCommentary).not.toHaveBeenCalled();

    const content = textContent(tree);
    expect(content).toContain(verseResult.text);
    expect(content).toContain('Explain this passage');
    expect(content).toContain('Read in Bible');
  }, 15000);

  it('shows Save despite another bookmark on the day and saves the displayed translation', async () => {
    mockStoreState.bookmarks.push({
      id: 'quote-1',
      devotionalId: 'devotional-1',
      dayNumber: 1,
      scriptureReference: 'Quote',
      scriptureText: 'Another saved item',
      savedAt: '2026-09-28T00:00:00.000Z',
    });
    mockFetchVerseLocal.mockResolvedValue({ ...verseResult, translation: 'KJV', text: 'For God so loved the world.' });

    let tree: any;
    await act(async () => {
      tree = renderer.create(
        <ScriptureTapSheet
          visible
          onClose={jest.fn()}
          reference="John 3:16"
          devotionalId="devotional-1"
          dayNumber={1}
          dayTitle="Loved First"
          devotionalTitle="The Gift"
        />,
      );
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(textContent(tree)).toContain('Save');
    const saveButton = tree.root
      .findAllByType(TouchableOpacity)
      .find((node: any) => node.props.accessibilityLabel === 'Save John 3:16');
    expect(saveButton).toBeTruthy();
    act(() => saveButton.props.onPress());
    expect(mockAddBookmark).toHaveBeenCalledWith(expect.objectContaining({
      kind: 'scripture',
      key: 'John 3:16',
      scriptureReference: 'John 3:16',
      scriptureText: 'For God so loved the world.',
      translation: 'KJV',
    }));
  });

  it('shows Saved for its exact passage and removes only that bookmark', async () => {
    mockStoreState.bookmarks.push({
      id: 'scripture-1',
      devotionalId: 'devotional-1',
      dayNumber: 1,
      kind: 'scripture',
      key: 'John 3:16',
      scriptureReference: 'John 3:16',
      scriptureText: verseResult.text,
      savedAt: '2026-09-28T00:00:00.000Z',
    });

    let tree: any;
    await act(async () => {
      tree = renderer.create(
        <ScriptureTapSheet
          visible
          onClose={jest.fn()}
          reference="John 3:16"
          devotionalId="devotional-1"
          dayNumber={1}
        />,
      );
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(textContent(tree)).toContain('Saved');
    const removeButton = tree.root
      .findAllByType(TouchableOpacity)
      .find((node: any) => node.props.accessibilityLabel === 'Remove John 3:16 from saved');
    expect(removeButton).toBeTruthy();
    expect(removeButton.props.accessibilityState).toEqual({ selected: true });
    act(() => removeButton.props.onPress());
    expect(mockRemoveBookmark).toHaveBeenCalledWith('scripture-1');
  });

  it('shows a Saved Related Scripture passage in its saved translation after the reader translation changes', async () => {
    mockStoreState.bibleReaderSettings.translation = 'BSB';
    mockStoreState.bookmarks.push({
      id: 'related-scripture-1',
      devotionalId: 'devotional-1',
      dayNumber: 1,
      kind: 'scripture',
      key: 'Romans 8:28',
      scriptureReference: 'Romans 8:28',
      scriptureText: 'All things work together for good.',
      translation: 'KJV',
      savedAt: '2026-09-28T00:00:00.000Z',
    });

    let tree: any;
    await act(async () => {
      tree = renderer.create(
        <ScriptureTapSheet
          visible
          onClose={jest.fn()}
          reference="Romans 8:28"
          savedPassage={{ text: 'All things work together for good.', translation: 'KJV' }}
          devotionalId="devotional-1"
          dayNumber={1}
        />,
      );
      await Promise.resolve();
    });

    expect(textContent(tree)).toContain('All things work together for good.');
    expect(textContent(tree)).toContain('KJV');
    expect(mockFetchVerseLocal).not.toHaveBeenCalled();
    const removeButton = findSaveButton(tree, 'Remove Romans 8:28 from saved');
    expect(removeButton).toBeTruthy();
    act(() => removeButton.props.onPress());
    expect(mockRemoveBookmark).toHaveBeenCalledWith('related-scripture-1');
  });

  it('can save a restored Related Scripture passage again after removing it', async () => {
    const savedPassage = { text: 'All things work together for good.', translation: 'KJV' };
    mockStoreState.bookmarks.push({
      id: 'related-scripture-1',
      devotionalId: 'devotional-1',
      dayNumber: 1,
      kind: 'scripture',
      key: 'Romans 8:28',
      scriptureReference: 'Romans 8:28',
      scriptureText: savedPassage.text,
      translation: savedPassage.translation,
      savedAt: '2026-09-28T00:00:00.000Z',
    });
    const renderSheet = () => (
      <ScriptureTapSheet
        visible
        onClose={jest.fn()}
        reference="Romans 8:28"
        savedPassage={savedPassage}
        devotionalId="devotional-1"
        dayNumber={1}
      />
    );

    let tree: any;
    await act(async () => {
      tree = renderer.create(renderSheet());
      await Promise.resolve();
    });
    act(() => findSaveButton(tree, 'Remove Romans 8:28 from saved').props.onPress());

    mockStoreState.bookmarks.length = 0;
    await act(async () => {
      tree.update(renderSheet());
      await Promise.resolve();
    });
    const saveButton = findSaveButton(tree, 'Save Romans 8:28');
    act(() => saveButton.props.onPress());
    expect(mockAddBookmark).toHaveBeenCalledWith(expect.objectContaining({
      scriptureReference: 'Romans 8:28',
      scriptureText: savedPassage.text,
      translation: 'KJV',
    }));
  });

  it('saves a displayed WEB fallback with its actual translation', async () => {
    mockFetchVerseLocal.mockResolvedValue(null);
    mockFetchVerse.mockResolvedValue({
      reference: 'John 3:16',
      text: 'Fallback WEB passage.',
      translation: 'web',
    });

    let tree: any;
    await act(async () => {
      tree = renderer.create(
        <ScriptureTapSheet
          visible
          onClose={jest.fn()}
          reference="John 3:16"
          devotionalId="devotional-1"
          dayNumber={1}
        />,
      );
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(textContent(tree)).toContain('Fallback WEB passage.');
    const saveButton = findSaveButton(tree, 'Save John 3:16');
    act(() => saveButton.props.onPress());
    expect(mockAddBookmark).toHaveBeenCalledWith({
      devotionalId: 'devotional-1',
      devotionalTitle: '',
      dayNumber: 1,
      dayTitle: '',
      kind: 'scripture',
      key: 'John 3:16',
      scriptureReference: 'John 3:16',
      scriptureText: 'Fallback WEB passage.',
      translation: 'WEB',
    });
  });

  it('opens the shared explanation sheet only after tapping Explain', async () => {
    let tree: any;
    await act(async () => {
      tree = renderer.create(
        <ScriptureTapSheet
          visible
          onClose={jest.fn()}
          reference="John 3:16"
          devotionalId="devotional-1"
          dayNumber={1}
          dayTitle="Loved First"
          devotionalTitle="The Gift"
        />,
      );
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(mockFetchScriptureExplanation).not.toHaveBeenCalled();

    const explainButton = tree.root
      .findAllByType(TouchableOpacity)
      .find((node: any) => node.props.accessibilityLabel === 'Explain this passage');
    expect(explainButton).toBeTruthy();

    await act(async () => {
      explainButton.props.onPress();
      await Promise.resolve();
    });

    const modalVisibility = tree.root.findAllByType(Modal).map((node: any) => node.props.visible);
    expect(modalVisibility).toEqual([false, true]);

    expect(mockFetchScriptureExplanation).toHaveBeenCalledWith(expect.objectContaining({
      reference: 'John 3:16',
      passageText: verseResult.text,
      translation: 'KJV',
      source: 'devotional-scripture-sheet',
      devotionalContext: expect.objectContaining({
        devotionalId: 'devotional-1',
        devotionalTitle: 'The Gift',
        dayNumber: 1,
        dayTitle: 'Loved First',
      }),
    }));
  });

  it('keeps swipe-to-dismiss scoped to the grabber and header instead of the scrollable scripture body', () => {
    const source = fs.readFileSync(
      path.join(__dirname, '../ScriptureTapSheet.tsx'),
      'utf8',
    );

    expect(source).toContain('react-native-gesture-handler');
    expect(source).toContain('GestureHandlerRootView');
    expect(source).toContain('GestureDetector');
    expect(source).toContain('Gesture.Pan()');
    expect(source).toContain('testID="scripture-sheet-swipe-dismiss-region"');
    expect(source).toMatch(/entering=\{reducedMotion \? undefined : FadeInDown[\s\S]*style=\{s\.sheetShell\}[\s\S]*<Animated\.View style=\{\[s\.sheet, sheetAnimatedStyle,/);
    expect(source).not.toMatch(/<Animated\.View[^>]*entering=\{reducedMotion \? undefined : FadeInDown[^>]*style=\{\[s\.sheet, sheetAnimatedStyle,/s);
    expect(source).toMatch(/<GestureDetector gesture=\{panGesture\}>[\s\S]*scripture-sheet-swipe-dismiss-region[\s\S]*<\/GestureDetector>[\s\S]*<ScrollView/);
    expect(source).toMatch(/translationY > SWIPE_DISMISS_THRESHOLD \|\| e\.velocityY > SWIPE_DISMISS_VELOCITY/);
  });
});

describe('ScriptureTapSheet copy action', () => {
  const clipboard: { setStringAsync: jest.Mock } = jest.requireMock('expo-clipboard');
  const haptics: { impactAsync: jest.Mock } = jest.requireMock('expo-haptics');
  const COPY_LABEL = 'Copy verse text';
  const IDLE = { checkIcons: 0, copyIcons: 1, background: 'transparent' };
  // The alpha() mock of this file joins the color and the opacity.
  const CONFIRMED = { checkIcons: 1, copyIcons: 0, background: '#C8A55C0.1' };
  let announce: jest.SpyInstance;

  function sheet(overrides: Partial<React.ComponentProps<typeof ScriptureTapSheet>> = {}) {
    return (
      <ScriptureTapSheet
        visible
        onClose={jest.fn()}
        reference="John 3:16"
        devotionalId="devotional-1"
        dayNumber={1}
        dayTitle="Loved First"
        devotionalTitle="The Gift"
        {...overrides}
      />
    );
  }

  async function open() {
    let tree: any;
    await act(async () => {
      tree = renderer.create(sheet());
      await Promise.resolve();
      await Promise.resolve();
    });
    return tree;
  }

  async function show(tree: any, overrides: Partial<React.ComponentProps<typeof ScriptureTapSheet>>) {
    await act(async () => {
      tree.update(sheet(overrides));
      await Promise.resolve();
      await Promise.resolve();
    });
  }

  // The button keeps its label. The check mark and the tint are the confirmation.
  function copyButton(tree: any) {
    return tree.root
      .findAllByType(TouchableOpacity)
      .find((node: any) => node.props.accessibilityLabel === COPY_LABEL);
  }

  async function pressCopy(tree: any) {
    await act(async () => {
      copyButton(tree).props.onPress();
      await Promise.resolve();
    });
  }

  function copyButtonLook(tree: any) {
    const button = copyButton(tree);
    return {
      checkIcons: button.findAllByType(CheckIcon).length,
      copyIcons: button.findAllByType(CopyIcon).length,
      background: StyleSheet.flatten(button.props.style).backgroundColor,
    };
  }

  beforeEach(() => {
    // act() queues a microtask of its own. Microtasks stay real, so the
    // timer count holds timers only.
    jest.useFakeTimers({ doNotFake: ['queueMicrotask', 'setImmediate'] });
    jest.clearAllMocks();
    mockFetchVerseLocal.mockImplementation(async (reference: string) => ({ ...verseResult, reference }));
    clipboard.setStringAsync.mockResolvedValue(true);
    mockStoreState.bookmarks.length = 0;
    mockStoreState.bibleReaderSettings.translation = 'KJV';
    announce = jest
      .spyOn(AccessibilityInfo, 'announceForAccessibility')
      .mockImplementation(() => undefined);
  });

  afterEach(() => {
    announce.mockRestore();
    jest.useRealTimers();
  });

  it('copies the verse with its reference and translation, and shows the check mark', async () => {
    const tree = await open();
    expect(copyButtonLook(tree)).toEqual(IDLE);

    await pressCopy(tree);

    expect(haptics.impactAsync).toHaveBeenCalledTimes(1);
    expect(haptics.impactAsync).toHaveBeenCalledWith('light');
    expect(clipboard.setStringAsync).toHaveBeenCalledTimes(1);
    expect(clipboard.setStringAsync).toHaveBeenCalledWith(`${verseResult.text}\n— John 3:16 (KJV)`);
    expect(copyButtonLook(tree)).toEqual(CONFIRMED);
  });

  it('shows the copy icon again 2 seconds after the copy', async () => {
    const tree = await open();
    await pressCopy(tree);

    act(() => {
      jest.advanceTimersByTime(1999);
    });
    expect(copyButtonLook(tree)).toEqual(CONFIRMED);

    act(() => {
      jest.advanceTimersByTime(1);
    });
    expect(copyButtonLook(tree)).toEqual(IDLE);
  });

  it('counts the 2 seconds from the last copy', async () => {
    const tree = await open();
    await pressCopy(tree);
    act(() => {
      jest.advanceTimersByTime(1000);
    });
    await pressCopy(tree);

    act(() => {
      jest.advanceTimersByTime(1999);
    });
    expect(copyButtonLook(tree)).toEqual(CONFIRMED);

    act(() => {
      jest.advanceTimersByTime(1);
    });
    expect(copyButtonLook(tree)).toEqual(IDLE);
  });

  it('drops the confirmation when the sheet opens again', async () => {
    const tree = await open();
    await pressCopy(tree);
    expect(copyButtonLook(tree)).toEqual(CONFIRMED);

    await show(tree, { visible: false });
    await show(tree, { visible: true });

    expect(copyButtonLook(tree)).toEqual(IDLE);
  });

  it('drops the confirmation when the reference changes', async () => {
    const tree = await open();
    await pressCopy(tree);
    expect(copyButtonLook(tree)).toEqual(CONFIRMED);

    await show(tree, { reference: 'John 1:1' });

    expect(copyButtonLook(tree)).toEqual(IDLE);
  });

  it('ends the confirmation and its timer when the sheet hides', async () => {
    const tree = await open();
    await pressCopy(tree);
    expect(jest.getTimerCount()).toBe(1);

    await show(tree, { visible: false });

    expect(jest.getTimerCount()).toBe(0);
  });

  it('confirms and announces nothing when the write lands after the sheet hides', async () => {
    let land!: (didCopy: boolean) => void;
    clipboard.setStringAsync.mockReturnValueOnce(
      new Promise<boolean>((resolve) => {
        land = resolve;
      }),
    );
    const tree = await open();
    await pressCopy(tree);

    await show(tree, { visible: false });
    await act(async () => {
      land(true);
      await Promise.resolve();
    });

    expect(announce).not.toHaveBeenCalled();
    expect(jest.getTimerCount()).toBe(0);
    await show(tree, { visible: true });
    expect(copyButtonLook(tree)).toEqual(IDLE);
  });

  it('announces the copy', async () => {
    const tree = await open();

    await pressCopy(tree);

    expect(announce).toHaveBeenCalledTimes(1);
    expect(announce).toHaveBeenCalledWith('Copied');
  });

  it.each([
    ['refuses', () => clipboard.setStringAsync.mockResolvedValue(false)],
    ['rejects', () => clipboard.setStringAsync.mockRejectedValue(new Error('clipboard unavailable'))],
  ])('does not confirm or announce a copy that the clipboard %s', async (_case, arrange) => {
    arrange();
    const tree = await open();

    await pressCopy(tree);
    // One real macrotask. Node reports a rejection that nothing handled
    // before it ends, and Jest fails the test that was running.
    await new Promise<void>((resolve) => setImmediate(resolve));

    expect(clipboard.setStringAsync).toHaveBeenCalledTimes(1);
    expect(copyButtonLook(tree)).toEqual(IDLE);
    expect(announce).not.toHaveBeenCalled();
    expect(jest.getTimerCount()).toBe(0);
  });
});
