import React from 'react';
import { Text, TouchableOpacity } from 'react-native';
import { ScriptureExplainSheet } from '../ScriptureExplainSheet';
import { AnalyticsEvents } from '@/lib/analytics';

const renderer = require('react-test-renderer');
const { act } = renderer;

const mockFetchScriptureExplanation = jest.fn();
const mockLogEvent = jest.fn();

jest.mock('@/lib/scripture-explain-api', () => ({
  fetchScriptureExplanation: (...args: unknown[]) => mockFetchScriptureExplanation(...args),
  ScriptureExplainApiError: class ScriptureExplainApiError extends Error {
    code: string;

    constructor(mockCode: string, message: string) {
      super(message);
      this.name = 'ScriptureExplainApiError';
      this.code = mockCode;
    }
  },
}));

jest.mock('@/lib/analytics', () => ({
  AnalyticsEvents: {
    SCRIPTURE_EXPLAIN_OPENED: 'scripture_explain_opened',
    SCRIPTURE_EXPLAIN_COMPLETED: 'scripture_explain_completed',
    SCRIPTURE_EXPLAIN_ERROR: 'scripture_explain_error',
  },
  logEvent: (...args: unknown[]) => mockLogEvent(...args),
}));

jest.mock('@/lib/theme', () => ({
  useTheme: () => ({
    colors: {
      accent: '#C8A55C',
      background: '#111111',
      backgroundElevated: '#1A1712',
      inputBackground: '#231F18',
      text: '#F6EFE3',
      textMuted: '#B8AA96',
      textSubtle: '#8D806D',
      border: '#3A3328',
      borderStrong: '#514635',
    },
  }),
}));

jest.mock('@/constants/fonts', () => ({
  FontFamily: {
    body: 'Body',
    display: 'Display',
    ui: 'System',
    uiMedium: 'System-Medium',
    uiSemiBold: 'System-Semibold',
  },
  FontSize: {
    xs: 12,
    sm: 14,
    base: 16,
  },
}));

jest.mock('@/constants/radius', () => ({
  Radius: { md: 12, lg: 16, xl: 20, '2xl': 28 },
}));

jest.mock('@/constants/spacing', () => ({
  Spacing: {
    '1': 4,
    '2': 8,
    '3': 12,
    '4': 16,
    '5': 20,
    '6': 24,
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
  useReducedMotion: () => true,
}));

jest.mock('phosphor-react-native', () => ({
  XIcon: () => null,
  BookOpenIcon: () => null,
  WarningCircleIcon: () => null,
}));

const baseProps = {
  visible: true,
  onClose: jest.fn(),
  reference: 'Romans 8:28-30',
  passageText: 'And we know that God works all things together for the good of those who love Him.',
  translation: 'BSB',
  source: 'bible-reader' as const,
};

const successResponse = {
  reference: 'Romans 8:28-30',
  translation: 'BSB',
  explanation: {
    plainMeaning: 'Paul says God is not absent from suffering or confusion.',
    contextNote: 'This sits in a larger passage about hope and endurance.',
    personalConnection: 'You can trust that your present confusion is not outside God’s care.',
    reflectionPrompt: 'Where do you need to trust God with what is unfinished?',
  },
  model: 'claude-haiku-4-5-20251001',
};

function textContent(tree: any): string {
  return tree.root
    .findAllByType(Text)
    .map((node: any) => node.props.children)
    .flat(Infinity)
    .filter((part: unknown) => typeof part === 'string')
    .join(' ');
}

describe('ScriptureExplainSheet', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('renders nothing and does not fetch while hidden', async () => {
    let tree: any;
    await act(async () => {
      tree = renderer.create(<ScriptureExplainSheet {...baseProps} visible={false} />);
      await Promise.resolve();
    });

    expect(tree.toJSON()).toBeNull();
    expect(mockFetchScriptureExplanation).not.toHaveBeenCalled();
    expect(mockLogEvent).not.toHaveBeenCalled();
  });

  it('fetches only after explicit open and shows the loading state', async () => {
    mockFetchScriptureExplanation.mockImplementation(() => new Promise(() => undefined));

    let tree: any;
    await act(async () => {
      tree = renderer.create(<ScriptureExplainSheet {...baseProps} visible={false} />);
      await Promise.resolve();
    });

    expect(mockFetchScriptureExplanation).not.toHaveBeenCalled();

    await act(async () => {
      tree.update(<ScriptureExplainSheet {...baseProps} visible />);
      await Promise.resolve();
    });

    expect(mockFetchScriptureExplanation).toHaveBeenCalledTimes(1);
    expect(mockFetchScriptureExplanation).toHaveBeenCalledWith(expect.objectContaining({
      reference: baseProps.reference,
      passageText: baseProps.passageText,
      translation: 'BSB',
      source: 'bible-reader',
    }));
    expect(textContent(tree)).toContain('Reading the passage...');
    expect(mockLogEvent).toHaveBeenCalledWith(AnalyticsEvents.SCRIPTURE_EXPLAIN_OPENED, expect.not.objectContaining({
      passageText: expect.any(String),
      text: expect.any(String),
      reference: expect.any(String),
    }));
  });

  it('renders the successful explanation and logs analytics without raw scripture text', async () => {
    mockFetchScriptureExplanation.mockResolvedValue(successResponse);

    let tree: any;
    await act(async () => {
      tree = renderer.create(<ScriptureExplainSheet {...baseProps} />);
      await Promise.resolve();
      await Promise.resolve();
    });

    const content = textContent(tree);
    expect(content).toContain('Romans 8:28-30');
    expect(content).toContain('BSB');
    expect(content).toContain(baseProps.passageText);
    expect(content).toContain('Meaning');
    expect(content).toContain(successResponse.explanation.plainMeaning);
    expect(content).toContain(successResponse.explanation.contextNote);
    expect(content).toContain(successResponse.explanation.personalConnection);
    expect(content).toContain('Carry this');
    expect(content).toContain(successResponse.explanation.reflectionPrompt);

    expect(mockLogEvent).toHaveBeenCalledWith(AnalyticsEvents.SCRIPTURE_EXPLAIN_COMPLETED, expect.objectContaining({
      source: 'bible-reader',
      translation: 'BSB',
      verse_count: 3,
      has_devotional_context: false,
    }));

    for (const call of mockLogEvent.mock.calls) {
      expect(JSON.stringify(call)).not.toContain(baseProps.passageText);
      expect(JSON.stringify(call)).not.toContain(successResponse.explanation.plainMeaning);
      expect(JSON.stringify(call)).not.toContain(successResponse.explanation.personalConnection);
    }
  });

  it('renders a retryable error state without logging raw scripture text', async () => {
    mockFetchScriptureExplanation.mockRejectedValue(Object.assign(new Error('Nope'), {
      code: 'SCRIPTURE_EXPLAIN_UNAVAILABLE',
    }));

    let tree: any;
    await act(async () => {
      tree = renderer.create(<ScriptureExplainSheet {...baseProps} />);
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(textContent(tree)).toContain("The study note didn't load. Try again in a moment.");
    expect(mockLogEvent).toHaveBeenCalledWith(AnalyticsEvents.SCRIPTURE_EXPLAIN_ERROR, expect.objectContaining({
      source: 'bible-reader',
      translation: 'BSB',
      verse_count: 3,
      has_devotional_context: false,
      error_code: 'SCRIPTURE_EXPLAIN_UNAVAILABLE',
    }));

    const retryButton = tree.root
      .findAllByType(TouchableOpacity)
      .find((node: any) => node.props.accessibilityLabel === 'Retry scripture explanation');
    expect(retryButton).toBeTruthy();

    for (const call of mockLogEvent.mock.calls) {
      expect(JSON.stringify(call)).not.toContain(baseProps.passageText);
    }
  });
});
