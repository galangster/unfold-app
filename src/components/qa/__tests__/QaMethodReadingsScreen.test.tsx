import React from 'react';
import renderer, { act } from 'react-test-renderer';
import { TextInput } from 'react-native';
import { QaMethodReadingsScreen } from '../QaMethodReadingsScreen';
import type { QaMethodReadingExample, QaMethodReadingsCatalog } from '@/lib/qa-method-readings';
import { clearQaMethodReadingNotes } from '@/lib/qa-method-reading-notes';

const johnPassage = {
  reference: 'John 1:1-2',
  translation: 'BSB' as const,
  bookId: 43,
  chapter: 1,
  verseStart: 1,
  verseEnd: 2,
  verses: [
    { verse: 1, text: '[SYNTHETIC] In the beginning was the Word.' },
    { verse: 2, text: '[SYNTHETIC] He was with God in the beginning.' },
  ],
};

const supportingPassage = {
  reference: 'John 1:3',
  translation: 'BSB' as const,
  bookId: 43,
  chapter: 1,
  verseStart: 3,
  verseEnd: 3,
  verses: [{ verse: 3, text: '[SYNTHETIC] Through Him all things were made.' }],
};

const lectioExample: QaMethodReadingExample = {
  id: 'lectio_divina',
  methodId: 'lectio_divina',
  methodName: 'Lectio Divina',
  title: '[SYNTHETIC FIXTURE] Stay with the first word',
  introduction: 'SYNTHETIC FIXTURE.',
  passage: johnPassage,
  supportingPassages: [],
  sections: [
    { id: 'lectio', label: 'Lectio', kind: 'reading', text: 'Read slowly.', prompt: '' },
    { id: 'notice', label: 'Notice', kind: 'notice', text: 'Stay with one word.', prompt: 'Which word stayed?' },
    { id: 'oratio', label: 'Oratio', kind: 'prayer', text: 'Pray the word.', prompt: '' },
    { id: 'rest', label: 'Rest', kind: 'pause', text: 'Remain here.', prompt: '' },
  ],
  provenance: { model: 'synthetic-fixture', generatedAt: '2026-09-12T00:00:00.000Z' },
};

const inductiveExample: QaMethodReadingExample = {
  id: 'inductive_oia',
  methodId: 'inductive_oia',
  methodName: 'Inductive Study',
  title: '[SYNTHETIC FIXTURE] Observe before you explain',
  introduction: 'SYNTHETIC FIXTURE.',
  passage: johnPassage,
  supportingPassages: [supportingPassage],
  sections: [
    { id: 'notice', label: 'Notice', kind: 'notice', text: 'Name what you see.', prompt: 'What do you see?' },
  ],
  provenance: { model: 'synthetic-fixture', generatedAt: '2026-09-12T00:00:00.000Z' },
};

const mockCatalog: QaMethodReadingsCatalog = {
  enabled: true,
  error: null,
  examples: [lectioExample, inductiveExample],
};

jest.mock('@/lib/scripture-practice-feature', () => ({
  isScripturePracticeEnabled: () => true,
}));

jest.mock('@/lib/qa-method-readings', () => {
  const actual = jest.requireActual('@/lib/qa-method-readings') as typeof import('@/lib/qa-method-readings');
  return {
    ...actual,
    loadQaMethodReadings: () => mockCatalog,
  };
});

jest.mock('@/lib/theme', () => ({
  useTheme: () => ({
    colors: {
      background: '#000',
      text: '#fff',
      textMuted: '#aaa',
      textSubtle: '#888',
      textHint: '#666',
      accent: '#C8A55C',
      border: '#333',
      inputBackground: '#111',
    },
  }),
}));

jest.mock('@/components/icons', () => new Proxy({}, {
  get: (_target, name) => (name === '__esModule' ? true : () => null),
}));

jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 0, bottom: 12, left: 0, right: 0 }),
}));

function collectText(node: unknown): string[] {
  if (typeof node === 'string') return [node];
  if (Array.isArray(node)) return node.flatMap(collectText);
  if (!node || typeof node !== 'object') return [];
  return collectText((node as { children?: unknown }).children ?? []);
}

function renderScreen(
  selectedMethodId: string | null,
  handlers: {
    onSelectMethod?: (methodId: string) => void;
    onOpenBible?: (example: QaMethodReadingExample, passage: QaMethodReadingExample['passage']) => void;
    onBackToLibrary?: () => void;
    onClose?: () => void;
  } = {},
) {
  return renderer.create(
    <QaMethodReadingsScreen
      selectedMethodId={selectedMethodId}
      onSelectMethod={handlers.onSelectMethod ?? jest.fn()}
      onBackToLibrary={handlers.onBackToLibrary ?? jest.fn()}
      onClose={handlers.onClose ?? jest.fn()}
      onOpenBible={handlers.onOpenBible ?? jest.fn()}
    />,
  );
}

describe('QaMethodReadingsScreen', () => {
  beforeEach(() => {
    mockCatalog.enabled = true;
    mockCatalog.error = null;
    mockCatalog.examples = [lectioExample, inductiveExample];
    clearQaMethodReadingNotes();
  });

  it('lists methods and opens a reading without requiring input', async () => {
    const onSelectMethod = jest.fn();
    const onOpenBible = jest.fn();
    let tree: renderer.ReactTestRenderer;
    await act(async () => {
      tree = renderScreen(null, { onSelectMethod, onOpenBible });
    });
    const libraryText = collectText(tree!.toJSON()).join(' ');
    expect(libraryText).toContain('Sample readings');
    expect(libraryText).not.toContain('QA sample library');
    expect(libraryText).not.toContain('Generated method readings');
    const item = tree!.root.findByProps({ testID: 'qa-method-readings-item-lectio_divina' });
    await act(async () => {
      item.props.onPress();
    });
    expect(onSelectMethod).toHaveBeenCalledWith('lectio_divina');

    await act(async () => {
      tree.update(
        <QaMethodReadingsScreen
          selectedMethodId="lectio_divina"
          onSelectMethod={onSelectMethod}
          onBackToLibrary={jest.fn()}
          onClose={jest.fn()}
          onOpenBible={onOpenBible}
        />,
      );
    });
    const text = collectText(tree!.toJSON()).join(' ');
    expect(text).toContain('Lectio Divina');
    expect(text).toContain('[SYNTHETIC FIXTURE] Stay with the first word');
    expect(text).toContain('John 1:1-2');
    expect(text).toContain('[SYNTHETIC] In the beginning was the Word.');
    expect(text).toContain('physical Bible');
    expect(text).toContain('lasts until the app restarts');
    expect(text).toContain('not a journal note');
    expect(text).not.toContain('synthetic-fixture');
    expect(tree!.root.findByProps({ testID: 'qa-method-readings-scroll-lectio_divina' })).toBeTruthy();
    expect(tree!.root.findAllByType(TextInput)).toHaveLength(1);
    expect(tree!.root.findAll((node) => typeof node.type === 'string' && node.props.testID === 'qa-method-readings-section-lectio')).toHaveLength(1);
    const bible = tree!.root.findByProps({ testID: 'qa-method-readings-bible' });
    await act(async () => {
      bible.props.onPress();
    });
    expect(onOpenBible).toHaveBeenCalledWith(
      expect.objectContaining({ methodId: 'lectio_divina' }),
      lectioExample.passage,
    );
  });

  it('renders supporting passages and their Bible actions', async () => {
    const onOpenBible = jest.fn();
    let tree: renderer.ReactTestRenderer;
    await act(async () => {
      tree = renderScreen('inductive_oia', { onOpenBible });
    });
    const text = collectText(tree!.toJSON()).join(' ');
    expect(text).toContain('John 1:3');
    expect(text).toContain('[SYNTHETIC] Through Him all things were made.');
    await act(async () => {
      tree!.root.findByProps({ testID: 'qa-method-readings-supporting-0-bible' }).props.onPress();
    });
    expect(onOpenBible).toHaveBeenCalledWith(
      expect.objectContaining({ methodId: 'inductive_oia' }),
      supportingPassage,
    );
  });

  it('keeps sample notes isolated by method across selection and remount', async () => {
    let tree: renderer.ReactTestRenderer;
    await act(async () => {
      tree = renderScreen('lectio_divina');
    });
    await act(async () => {
      tree!.root.findByProps({ testID: 'qa-method-readings-note-notice' }).props.onChangeText('lectio draft');
    });
    expect(tree!.root.findByType(TextInput).props.value).toBe('lectio draft');

    await act(async () => {
      tree.update(
        <QaMethodReadingsScreen
          selectedMethodId="inductive_oia"
          onSelectMethod={jest.fn()}
          onBackToLibrary={jest.fn()}
          onClose={jest.fn()}
          onOpenBible={jest.fn()}
        />,
      );
    });
    expect(tree!.root.findByProps({ testID: 'qa-method-readings-scroll-inductive_oia' })).toBeTruthy();
    expect(tree!.root.findByType(TextInput).props.value).toBe('');

    await act(async () => {
      tree!.root.findByProps({ testID: 'qa-method-readings-note-notice' }).props.onChangeText('inductive draft');
    });

    await act(async () => {
      tree.update(
        <QaMethodReadingsScreen
          selectedMethodId="lectio_divina"
          onSelectMethod={jest.fn()}
          onBackToLibrary={jest.fn()}
          onClose={jest.fn()}
          onOpenBible={jest.fn()}
        />,
      );
    });
    expect(tree!.root.findByType(TextInput).props.value).toBe('lectio draft');

    await act(async () => {
      tree.unmount();
    });
    await act(async () => {
      tree = renderScreen('lectio_divina');
    });
    expect(tree!.root.findByType(TextInput).props.value).toBe('lectio draft');
  });

  it('shows an empty library when the catalog has no examples', async () => {
    mockCatalog.examples = [];
    mockCatalog.error = 'This sample library could not be read.';
    let tree: renderer.ReactTestRenderer;
    await act(async () => {
      tree = renderScreen('lectio_divina');
    });
    expect(tree!.root.findByProps({ testID: 'qa-method-readings-empty' })).toBeTruthy();
    expect(collectText(tree!.toJSON()).join(' ')).toContain('could not be read');
    mockCatalog.examples = [lectioExample, inductiveExample];
    mockCatalog.error = null;
  });
});
