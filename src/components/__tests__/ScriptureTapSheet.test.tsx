import React from 'react';
import { Modal, TouchableOpacity } from 'react-native';
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
const mockIsBookmarked = jest.fn();
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
  addBookmark: mockAddBookmark,
  isBookmarked: mockIsBookmarked,
};

jest.mock('@/lib/store', () => ({
  useUnfoldStore: (selector: (state: typeof mockStoreState) => unknown) => selector(mockStoreState),
}));

jest.mock('expo-router', () => ({
  useRouter: () => ({ push: mockRouterPush }),
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
  translation: 'BSB',
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

describe('ScriptureTapSheet Explain CTA', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockFetchVerseLocal.mockResolvedValue(verseResult);
    mockFetchVerse.mockResolvedValue(verseResult);
    mockFetchCommentary.mockResolvedValue('Automatic commentary should not render.');
    mockFetchScriptureExplanation.mockResolvedValue({
      reference: 'John 3:16',
      translation: 'BSB',
      explanation: {
        plainMeaning: 'God gives love generously.',
        personalConnection: 'You can receive this love today.',
      },
      model: 'claude-haiku-4-5-20251001',
    });
    mockIsBookmarked.mockReturnValue(false);
  });

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

    expect(mockFetchVerseLocal).toHaveBeenCalledWith('John 3:16', 'BSB');
    expect(mockFetchCommentary).not.toHaveBeenCalled();

    const content = textContent(tree);
    expect(content).toContain(verseResult.text);
    expect(content).toContain('Explain this passage');
    expect(content).toContain('Read in Bible');
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
      translation: 'BSB',
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
