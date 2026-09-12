import React from 'react';
import renderer, { act } from 'react-test-renderer';
import { TextInput } from 'react-native';
import {
  ScripturePracticeSheet,
  hidePracticeWords,
} from '../ScripturePracticeSheet';
import type { DevotionalDay } from '@/lib/store';
import type { ScripturePracticeSheetProps } from '../ScripturePracticeSheet';

const mockFetchVerseLocal = jest.fn();
let mockBibleDbStatus = 'ready';
jest.mock('@/lib/bible-db', () => ({ getBibleDbStatus: () => ({ status: mockBibleDbStatus }) }));
const mockUpdateScripturePractice = Object.assign(jest.fn(), {
  sessions: {} as Record<string, {
    step: number;
    answers: Record<string, string>;
    completed: boolean;
    readingMode: 'app' | 'physical' | null;
  }>,
});
const mockGetPracticePassage = jest.fn();
const mockPracticeSessionKey = jest.fn(
  (target: { devotionalId: string; dayNumber: number; methodId: string }) =>
    `${target.devotionalId}:${target.dayNumber}:${target.methodId}`,
);

jest.mock('@/lib/bible-api', () => ({
  fetchVerseLocal: (...args: unknown[]) => mockFetchVerseLocal(...args),
}));

jest.mock('@/lib/scripture-practice', () => ({
  PRACTICE_ANSWER_MAX_CHARS: 2000,
  practiceSessionKey: (target: { devotionalId: string; dayNumber: number; methodId: string }) =>
    mockPracticeSessionKey(target),
  getPracticePassage: (reference: string) => mockGetPracticePassage(reference),
}));

jest.mock('@/lib/qa-tools', () => ({
  isQaToolsEnabled: () => true,
}));

jest.mock('@/lib/store', () => ({
  useUnfoldStore: (selector: (state: unknown) => unknown) =>
    selector({
      bibleReaderSettings: { translation: 'BSB' },
      get scripturePracticeSessions() {
        return mockUpdateScripturePractice.sessions;
      },
      updateScripturePractice: (...args: unknown[]) => mockUpdateScripturePractice(...args),
    }),
}));

jest.mock('@/lib/theme', () => ({
  useTheme: () => ({
    isDark: true,
    colors: {
      background: '#000',
      text: '#fff',
      textMuted: '#aaa',
      textSubtle: '#888',
      textHint: '#666',
      accent: '#C8A55C',
      border: '#333',
      borderStrong: '#555',
      inputBackground: '#111',
      inputBackgroundFocused: '#222',
    },
  }),
}));

jest.mock('@/components/icons', () => new Proxy({}, {
  get: (_target, name) => (name === '__esModule' ? true : () => null),
}));

jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}));

function collectText(node: any): string[] {
  if (typeof node === 'string') return [node];
  if (Array.isArray(node)) return node.flatMap(collectText);
  if (!node || typeof node !== 'object') return [];
  return collectText(node.children ?? []);
}

function day(overrides: Partial<DevotionalDay> = {}): DevotionalDay {
  return {
    dayNumber: 2,
    title: 'The Word',
    scriptureReference: 'John 3:16',
    scriptureText: 'AI_FALLBACK_TEXT',
    bodyText: 'Reflection body stays readable.',
    quotableLine: '',
    isRead: false,
    studyMethod: 'inductive_oia',
    crossReferences: [{ reference: 'Romans 5:8', text: 'AI_CROSS_REF_TEXT' }],
    ...overrides,
  } as DevotionalDay;
}

const identity = {
  devotionalId: 'devo-1',
  dayNumber: 2,
  hostTab: '(today)' as const,
};

function renderSheet(props: Partial<ScripturePracticeSheetProps> = {}) {
  return renderer.create(
    <ScripturePracticeSheet
      targetIdentity={identity}
      methodId="inductive_oia"
      assignedMethodId="inductive_oia"
      day={day()}
      onChangeMethod={jest.fn()}
      onClose={jest.fn()}
      onSkipPractice={jest.fn()}
      onOpenBible={jest.fn()}
      {...props}
    />,
  );
}

describe('ScripturePracticeSheet', () => {
  beforeEach(() => {
    mockBibleDbStatus = 'ready';
    mockUpdateScripturePractice.sessions = {};
    mockUpdateScripturePractice.mockReset().mockImplementation((target, patch) => {
      const key = mockPracticeSessionKey(target);
      const current = mockUpdateScripturePractice.sessions[key];
      mockUpdateScripturePractice.sessions[key] = {
        ...(current ?? { step: 0, answers: {}, completed: false, readingMode: null }),
        ...patch,
        answers: { ...(current?.answers ?? {}), ...(patch.answers ?? {}) },
      };
    });
    mockGetPracticePassage.mockReset().mockImplementation((reference: string) => (
      reference
        ? {
            reference,
            chapterReference: 'John 3',
            bookId: 43,
            chapter: 3,
            verse: 16,
          }
        : null
    ));
    mockFetchVerseLocal.mockReset().mockResolvedValue(null);
  });

  it('hides letters for memory practice without inventing words', () => {
    const hidden = hidePracticeWords('For God so loved');
    expect(hidden.startsWith('F')).toBe(true);
    expect(hidden).toContain('·');
    expect(hidden).not.toContain('loved');
    expect(hidden).not.toContain('God');
  });

  it('persists typed notes onto the method-specific session', async () => {
    mockUpdateScripturePractice.sessions['devo-1:2:inductive_oia'] = {
      step: 0,
      answers: {},
      completed: false,
      readingMode: 'physical',
    };
    let tree: renderer.ReactTestRenderer;
    await act(async () => {
      tree = renderSheet();
    });
    const input = tree!.root.findByType(TextInput);
    await act(async () => {
      input.props.onChangeText('The verse names love first.');
    });
    expect(mockUpdateScripturePractice).toHaveBeenCalledWith(
      { ...identity, methodId: 'inductive_oia' },
      expect.objectContaining({
        answers: { observe: 'The verse names love first.' },
      }),
    );
    const logged = JSON.stringify(mockUpdateScripturePractice.mock.calls);
    expect(logged).not.toContain('logger');
  });

  it('lets skip leave the intro without an answer', async () => {
    const onSkipPractice = jest.fn();
    let tree: renderer.ReactTestRenderer;
    await act(async () => {
      tree = renderSheet({ onSkipPractice });
    });
    const skip = tree!.root.findByProps({ testID: 'scripture-practice-skip' });
    await act(async () => {
      skip.props.onPress();
    });
    expect(onSkipPractice).toHaveBeenCalled();
    expect(mockUpdateScripturePractice).not.toHaveBeenCalled();
  });

  it('advances a later step on skip without requiring text', async () => {
    mockUpdateScripturePractice.sessions['devo-1:2:inductive_oia'] = {
      step: 0,
      answers: {},
      completed: false,
      readingMode: 'physical',
    };
    let tree: renderer.ReactTestRenderer;
    await act(async () => {
      tree = renderSheet();
    });
    const skip = tree!.root.findByProps({ testID: 'scripture-practice-skip' });
    await act(async () => {
      skip.props.onPress();
    });
    expect(mockUpdateScripturePractice).toHaveBeenCalledWith(
      { ...identity, methodId: 'inductive_oia' },
      { step: 1 },
    );
  });

  it('shows an explicit unavailable state for memory when local Scripture is missing', async () => {
    mockFetchVerseLocal.mockResolvedValue(null);
    mockUpdateScripturePractice.sessions['devo-1:2:scripture_meditation'] = {
      step: 0,
      answers: {},
      completed: false,
      readingMode: 'physical',
    };
    let tree: renderer.ReactTestRenderer;
    await act(async () => {
      tree = renderSheet({ methodId: 'scripture_meditation', assignedMethodId: 'scripture_meditation' });
    });
    const text = collectText(tree!.toJSON()).join(' ');
    expect(text).toContain("This passage isn't available in the app Bible");
    expect(text).toContain('physical Bible');
    expect(text).not.toContain('AI_FALLBACK_TEXT');
    expect(text).not.toContain('AI_CROSS_REF_TEXT');
    expect(mockFetchVerseLocal).toHaveBeenCalled();
  });

  it('labels compare columns as BSB and KJV and does not use generated verse text when both fetches fail', async () => {
    mockFetchVerseLocal.mockResolvedValue(null);
    mockUpdateScripturePractice.sessions[mockPracticeSessionKey({ ...identity, methodId: 'comparative_translation' })] = {
      step: 0,
      answers: {},
      completed: false,
      readingMode: 'physical',
    };
    let tree: renderer.ReactTestRenderer;
    await act(async () => {
      tree = renderSheet({
        methodId: 'comparative_translation',
        assignedMethodId: 'comparative_translation',
      });
    });
    const text = collectText(tree!.toJSON()).join(' ');
    expect(text).toContain('Berean Standard Bible');
    expect(text).toContain('King James Version');
    expect(text).not.toContain('ESV');
    expect(text).not.toContain('NLT');
    expect(text).not.toContain('AI_FALLBACK_TEXT');
    expect(mockFetchVerseLocal).toHaveBeenCalledWith('John 3:16', 'BSB');
    expect(mockFetchVerseLocal).toHaveBeenCalledWith('John 3:16', 'KJV');
  });

  it('keeps one available translation when the other local fetch fails', async () => {
    mockUpdateScripturePractice.sessions[mockPracticeSessionKey({ ...identity, methodId: 'comparative_translation' })] = {
      step: 0, answers: {}, readingMode: 'physical', completed: false,
    };
    mockFetchVerseLocal.mockImplementation((_reference, translation) => translation === 'KJV'
      ? Promise.reject(new Error('Unavailable'))
      : Promise.resolve({ text: 'Canonical BSB wording', translation: 'BSB' }));
    let tree: renderer.ReactTestRenderer;
    await act(async () => { tree = renderSheet({ methodId: 'comparative_translation' }); });
    const text = collectText(tree!.toJSON()).join(' ');
    expect(mockFetchVerseLocal).toHaveBeenCalledWith('John 3:16', 'KJV');
    expect(text).toContain('Canonical BSB wording');
    expect(text).not.toContain('AI_FALLBACK_TEXT');
  });

  it('does not link a related verse that the local Bible cannot load', async () => {
    mockUpdateScripturePractice.sessions[mockPracticeSessionKey({ ...identity, methodId: 'cross_reference' })] = {
      step: 0, answers: {}, readingMode: 'physical', completed: false,
    };
    mockFetchVerseLocal.mockResolvedValue(null);
    let tree: renderer.ReactTestRenderer;
    await act(async () => { tree = renderSheet({ methodId: 'cross_reference' }); });
    expect(mockFetchVerseLocal).toHaveBeenCalledWith('Romans 5:8', 'BSB');
    expect(tree!.root.findAllByProps({ testID: 'scripture-practice-trace-Romans 5:8' })).toHaveLength(0);
    expect(collectText(tree!.toJSON()).join(' ')).not.toContain('AI_CROSS_REF_TEXT');
  });

  it('disables passage links when the installed Bible cannot load the reference', async () => {
    mockFetchVerseLocal.mockResolvedValue(null);
    let tree: renderer.ReactTestRenderer;
    await act(async () => { tree = renderSheet(); });
    expect(tree!.root.findByProps({ testID: 'scripture-practice-read-in-bible' }).props.disabled).toBe(true);
    expect(tree!.root.findByProps({ testID: 'scripture-practice-reference' }).props.disabled).toBe(true);
  });

  it('keeps the Bible download path available before a Bible is installed', async () => {
    mockBibleDbStatus = 'not_downloaded';
    mockFetchVerseLocal.mockResolvedValue(null);
    let tree: renderer.ReactTestRenderer;
    await act(async () => { tree = renderSheet(); });
    expect(tree!.root.findByProps({ testID: 'scripture-practice-read-in-bible' }).props.disabled).toBe(false);
  });

  it('ignores a stale local fetch after the passage changes', async () => {
    const resolvers: Array<(value: unknown) => void> = [];
    mockFetchVerseLocal.mockImplementation(() => new Promise((resolve) => {
      resolvers.push(resolve);
    }));
    let tree: renderer.ReactTestRenderer;
    await act(async () => {
      tree = renderSheet({ methodId: 'scripture_meditation' });
    });
    await act(async () => {
      tree.update(
        <ScripturePracticeSheet
          targetIdentity={identity}
          methodId="scripture_meditation"
          assignedMethodId="scripture_meditation"
          day={day({ scriptureReference: 'Psalm 23:1' })}
          onChangeMethod={jest.fn()}
          onClose={jest.fn()}
          onSkipPractice={jest.fn()}
          onOpenBible={jest.fn()}
        />,
      );
    });
    await act(async () => {
      resolvers[0]?.({ text: 'STALE_JOHN_TEXT', reference: 'John 3:16', translation: 'BSB' });
    });
    expect(collectText(tree!.toJSON()).join(' ')).not.toContain('STALE_JOHN_TEXT');
    await act(async () => {
      resolvers[1]?.({ text: 'The LORD is my shepherd', reference: 'Psalm 23:1', translation: 'BSB' });
    });
    const text = collectText(tree!.toJSON()).join(' ');
    expect(text).toContain('The LORD is my shepherd');
    expect(text).not.toContain('STALE_JOHN_TEXT');
    expect(text).not.toContain('AI_FALLBACK_TEXT');
  });

  it('keeps separate drafts when the QA picker selects another method', async () => {
    mockUpdateScripturePractice.sessions['devo-1:2:inductive_oia'] = {
      step: 0,
      answers: { observe: 'Assigned draft' },
      completed: false,
      readingMode: 'physical',
    };
    mockUpdateScripturePractice.sessions['devo-1:2:scripture_meditation'] = {
      step: 0,
      answers: { choose: 'Preview draft' },
      completed: false,
      readingMode: 'physical',
    };
    let tree: renderer.ReactTestRenderer;
    await act(async () => {
      tree = renderSheet({ methodId: 'inductive_oia' });
    });
    expect(tree!.root.findByType(TextInput).props.value).toBe('Assigned draft');
    await act(async () => {
      tree.update(
        <ScripturePracticeSheet
          targetIdentity={identity}
          methodId="scripture_meditation"
          assignedMethodId="inductive_oia"
          day={day()}
          onChangeMethod={jest.fn()}
          onClose={jest.fn()}
          onSkipPractice={jest.fn()}
          onOpenBible={jest.fn()}
        />,
      );
    });
    expect(tree!.root.findByType(TextInput).props.value).toBe('Preview draft');
    const picker = tree!.root.findByProps({ testID: 'scripture-practice-qa-picker' });
    expect(picker.props.accessibilityLabel).toContain('Does not change the assigned day method');
  });
});
