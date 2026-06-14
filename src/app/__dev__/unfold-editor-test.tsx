import { Asset } from 'expo-asset';
import { Redirect, Stack, useLocalSearchParams } from 'expo-router';
import * as React from 'react';
import { Alert, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import {
  buildNotebookRuntimeFuzzCases,
  evaluateNotebookRuntimeFuzzCase,
  summarizeNotebookRuntimeFuzzResults,
  type NotebookRuntimeFuzzCase,
  type NotebookRuntimeFuzzCommand,
  type NotebookRuntimeFuzzResult,
  type NotebookRuntimeFuzzSummary,
} from '@/lib/notebook-runtime-fuzz';
import { isQaToolsEnabled } from '@/lib/qa-tools';

import {
  UnfoldEditor,
  type UnfoldEditorBlockType,
  type UnfoldEditorListType,
  type UnfoldEditorRef,
  type UnfoldEditorSelectionState,
  type UnfoldEditorSelectionChangeEvent,
  type UnfoldEditorChangeHtmlEvent,
} from 'unfold-editor';

/**
 * Phase B Day 6 parity + command screen. Renders the same seed document the
 * spike renders (John 3:16 devotional) and exposes a test button per command
 * in §10.B.4. Each button dispatches the command through the Expo Module
 * bridge. Tap any command → tap `getHtml` to see the updated HTML.
 *
 * Route: /__dev__/unfold-editor-test  (deep: unfold://__dev__/unfold-editor-test)
 * Runtime fuzz: /__dev__/unfold-editor-test?autoFuzz=1&limit=20
 */
const SEED_HTML = `
  <h1>John 3:16</h1>
  <p>For God so loved the world, that he gave his only Son, that whoever believes in him should not perish but have eternal life.</p>
  <blockquote>This is the most quoted verse in the New Testament — the gospel in a single line.</blockquote>
  <img src="placeholder" width="320" height="180" />
  <h2>Observations</h2>
  <ul>
    <li data-level="1">God's love is the source</li>
    <li data-level="1">Belief is the response</li>
    <li data-level="2">Eternal life is the gift</li>
  </ul>
  <h2>To do</h2>
  <ul data-type="checklist">
    <li data-level="1" data-checked="false">Pray about this verse</li>
    <li data-level="1" data-checked="true">Read surrounding context</li>
    <li data-level="1" data-checked="false">Memorize by Sunday</li>
  </ul>
  <h2>Reference snippet</h2>
  <p>Quick reminder of the Greek root for <i>agape</i>:</p>
  <pre><code>func devotional(theme: String) -> String {
    let verses = lookupVerses(theme)
    return verses.joined(separator: "\\n")
  }</code></pre>
  <p>See also Romans 8:28 and 1 Corinthians 13:4-7.</p>
`;

const MANUAL_EDITOR_CASE: NotebookRuntimeFuzzCase = {
  id: 'manual-seed',
  label: 'manual command seed',
  category: 'rich-blocks',
  initialHtml: SEED_HTML,
  commands: [{ type: 'get-html' }],
  expectedNeedles: ['John 3:16'],
};

const NOTEBOOK_RUNTIME_FUZZ_CASE_PREFIX = 'NOTEBOOK_RUNTIME_FUZZ_CASE';
const NOTEBOOK_RUNTIME_FUZZ_SUMMARY = 'NOTEBOOK_RUNTIME_FUZZ_SUMMARY';
const FUZZ_CASE_REMOUNT_DELAY_MS = 160;
const FUZZ_COMMAND_DELAY_MS = 50;

type ButtonSpec = {
  label: string;
  onPress: () => void;
};

type FuzzStatus = {
  state: 'idle' | 'running' | 'passed' | 'failed';
  index: number;
  total: number;
  activeId?: string;
  summary?: NotebookRuntimeFuzzSummary;
  lastResult?: NotebookRuntimeFuzzResult;
  error?: string;
};

type EditorRefObject = React.RefObject<UnfoldEditorRef | null>;

export default function UnfoldEditorTestScreen() {
  const params = useLocalSearchParams<{
    autoFuzz?: string | string[];
    caseId?: string | string[];
    limit?: string | string[];
  }>();
  const qaToolsEnabled = isQaToolsEnabled();
  const autoFuzzEnabled = isTruthyParam(firstParam(params.autoFuzz));
  const requestedCaseId = firstParam(params.caseId);
  const requestedLimit = parsePositiveInt(firstParam(params.limit));

  const editorRef = React.useRef<UnfoldEditorRef>(null);
  const [selectionState, setSelectionState] =
    React.useState<UnfoldEditorSelectionState | null>(null);
  const [htmlChangeCount, setHtmlChangeCount] = React.useState(0);
  const [activeFuzzCase, setActiveFuzzCase] =
    React.useState<NotebookRuntimeFuzzCase>(MANUAL_EDITOR_CASE);
  const [fuzzStatus, setFuzzStatus] = React.useState<FuzzStatus>({
    state: 'idle',
    index: 0,
    total: 0,
  });
  const fuzzRunningRef = React.useRef(false);
  const autoFuzzStartedRef = React.useRef(false);

  const allFuzzCases = React.useMemo(() => buildNotebookRuntimeFuzzCases(), []);
  const selectedFuzzCases = React.useMemo(
    () => selectFuzzCases(allFuzzCases, requestedCaseId, requestedLimit),
    [allFuzzCases, requestedCaseId, requestedLimit],
  );

  const handleSelectionChange = React.useCallback(
    (event: UnfoldEditorSelectionChangeEvent) => {
      setSelectionState(event.nativeEvent);
    },
    []
  );

  const handleChangeHtml = React.useCallback(
    (_event: UnfoldEditorChangeHtmlEvent) => {
      setHtmlChangeCount((c) => c + 1);
    },
    []
  );

  const handleGetHtml = React.useCallback(async () => {
    const html = await editorRef.current?.getHtml();
    Alert.alert('getHtml()', html ?? '(empty)');
  }, []);

  const runFuzzMatrix = React.useCallback(async () => {
    if (fuzzRunningRef.current) {
      return;
    }

    fuzzRunningRef.current = true;
    const results: NotebookRuntimeFuzzResult[] = [];

    try {
      if (selectedFuzzCases.length === 0) {
        const failure = requestedCaseId
          ? `no fuzz cases selected for caseId=${requestedCaseId}`
          : 'no fuzz cases selected';
        const emptySelectionResult: NotebookRuntimeFuzzResult = {
          id: 'no-fuzz-cases-selected',
          label: 'no fuzz cases selected',
          category: 'plain-writing',
          passed: false,
          failures: [failure],
          finalHtmlLength: 0,
        };
        const summary = summarizeNotebookRuntimeFuzzResults([emptySelectionResult]);
        console.error(
          NOTEBOOK_RUNTIME_FUZZ_SUMMARY,
          JSON.stringify({
            summary,
            failedResults: [emptySelectionResult],
          }),
        );
        setFuzzStatus({
          state: 'failed',
          index: 0,
          total: 0,
          summary,
          lastResult: emptySelectionResult,
          error: failure,
        });
        return;
      }

      setFuzzStatus({
        state: 'running',
        index: 0,
        total: selectedFuzzCases.length,
      });

      for (let index = 0; index < selectedFuzzCases.length; index += 1) {
        const testCase = selectedFuzzCases[index];
        setActiveFuzzCase(testCase);
        setFuzzStatus({
          state: 'running',
          index: index + 1,
          total: selectedFuzzCases.length,
          activeId: testCase.id,
          lastResult: results[results.length - 1],
        });

        await delay(FUZZ_CASE_REMOUNT_DELAY_MS);
        const result = await runNotebookRuntimeFuzzCase(testCase, editorRef);
        results.push(result);
        console.log(NOTEBOOK_RUNTIME_FUZZ_CASE_PREFIX, JSON.stringify(result));
      }

      const summary = summarizeNotebookRuntimeFuzzResults(results);
      const failedResults = results.filter((result) => !result.passed);
      console.log(
        NOTEBOOK_RUNTIME_FUZZ_SUMMARY,
        JSON.stringify({
          summary,
          failedResults,
        }),
      );
      setFuzzStatus({
        state: summary.failed > 0 ? 'failed' : 'passed',
        index: selectedFuzzCases.length,
        total: selectedFuzzCases.length,
        activeId: selectedFuzzCases[selectedFuzzCases.length - 1]?.id,
        summary,
        lastResult: results[results.length - 1],
      });
    } catch (err) {
      const message = stringifyError(err);
      console.error(NOTEBOOK_RUNTIME_FUZZ_SUMMARY, JSON.stringify({ error: message }));
      setFuzzStatus({
        state: 'failed',
        index: results.length,
        total: selectedFuzzCases.length,
        error: message,
        lastResult: results[results.length - 1],
      });
    } finally {
      fuzzRunningRef.current = false;
    }
  }, [requestedCaseId, selectedFuzzCases]);

  React.useEffect(() => {
    if (!qaToolsEnabled || !autoFuzzEnabled || autoFuzzStartedRef.current) {
      return;
    }

    autoFuzzStartedRef.current = true;
    void runFuzzMatrix();
  }, [autoFuzzEnabled, qaToolsEnabled, runFuzzMatrix]);

  const call = React.useCallback(
    (label: string, fn: () => Promise<unknown> | undefined) => {
      return () => {
        Promise.resolve(fn()).catch((err) => {
          Alert.alert(`${label} failed`, String(err));
        });
      };
    },
    []
  );

  const handleBlockType = React.useCallback(
    (type: UnfoldEditorBlockType) =>
      call(`setBlockType(${type})`, () =>
        editorRef.current?.setBlockType(type)
      ),
    [call]
  );

  const handleListType = React.useCallback(
    (type: UnfoldEditorListType) =>
      call(`setList(${type})`, () => editorRef.current?.setList(type)),
    [call]
  );

  const handleInsertImage = React.useCallback(async () => {
    try {
      const asset = Asset.fromModule(require('../../../assets/images/icon.png'));
      await asset.downloadAsync();
      const uri = asset.localUri ?? asset.uri;
      if (!uri) {
        Alert.alert('insertImage', 'Asset has no localUri');
        return;
      }
      await editorRef.current?.insertImage(uri);
    } catch (err) {
      Alert.alert('insertImage failed', String(err));
    }
  }, []);

  const handleInsertLink = React.useMemo(
    () =>
      call('insertLink', () =>
        editorRef.current?.insertLink('https://unfold.app/john-3-16')
      ),
    [call]
  );

  const bridgeButtons: ButtonSpec[] = [
    { label: 'getHtml', onPress: handleGetHtml },
    { label: 'focus', onPress: call('focus', () => editorRef.current?.focus()) },
    { label: 'blur', onPress: call('blur', () => editorRef.current?.blur()) },
    {
      label: 'getState',
      onPress: async () => {
        const state = await editorRef.current?.getSelectionState();
        Alert.alert('getSelectionState()', JSON.stringify(state, null, 2));
      },
    },
  ];

  const fuzzButtons: ButtonSpec[] = [
    {
      label: 'run fuzz',
      onPress: () => {
        void runFuzzMatrix();
      },
    },
  ];

  const formatButtons: ButtonSpec[] = [
    {
      label: 'bold',
      onPress: call('toggleBold', () => editorRef.current?.toggleBold()),
    },
    {
      label: 'italic',
      onPress: call('toggleItalic', () => editorRef.current?.toggleItalic()),
    },
    {
      label: 'under',
      onPress: call('toggleUnderline', () =>
        editorRef.current?.toggleUnderline()
      ),
    },
    {
      label: 'strike',
      onPress: call('toggleStrikethrough', () =>
        editorRef.current?.toggleStrikethrough()
      ),
    },
    { label: 'link', onPress: handleInsertLink },
  ];

  const blockButtons: ButtonSpec[] = [
    { label: 'p', onPress: handleBlockType('p') },
    { label: 'h1', onPress: handleBlockType('h1') },
    { label: 'h2', onPress: handleBlockType('h2') },
    { label: 'h3', onPress: handleBlockType('h3') },
    { label: 'quote', onPress: handleBlockType('blockquote') },
    { label: 'pre', onPress: handleBlockType('pre') },
  ];

  const listButtons: ButtonSpec[] = [
    { label: '• list', onPress: handleListType('bullet') },
    { label: '1. list', onPress: handleListType('ordered') },
    { label: '☐ list', onPress: handleListType('checklist') },
    {
      label: 'clear',
      onPress: call('clearList', () => editorRef.current?.clearList()),
    },
    {
      label: 'check',
      onPress: call('toggleChecklist', () =>
        editorRef.current?.toggleChecklist()
      ),
    },
    {
      label: 'indent',
      onPress: call('indentList', () => editorRef.current?.indentList()),
    },
    {
      label: 'outdent',
      onPress: call('outdentList', () => editorRef.current?.outdentList()),
    },
  ];

  const historyButtons: ButtonSpec[] = [
    { label: 'undo', onPress: call('undo', () => editorRef.current?.undo()) },
    { label: 'redo', onPress: call('redo', () => editorRef.current?.redo()) },
    { label: 'image', onPress: handleInsertImage },
  ];

  if (!qaToolsEnabled) {
    return <Redirect href="/(tabs)/(you)" />;
  }

  return (
    <View style={styles.container}>
      <Stack.Screen options={{ title: 'UnfoldEditor Day 8' }} />
      <UnfoldEditor
        key={activeFuzzCase.id}
        ref={editorRef}
        style={styles.editor}
        initialHtml={activeFuzzCase.initialHtml}
        placeholder="Write a reflection…"
        editable
        keyboardAppearance="dark"
        onChangeHtml={handleChangeHtml}
        onEditorSelectionChange={handleSelectionChange}
      />
      {/* Day 8: live selection state + HTML change counter */}
      <View style={styles.stateBar}>
        <Text style={styles.stateLabel}>
          html changes: {htmlChangeCount}
        </Text>
        <Text style={styles.stateLabel}>
          runtime fuzz: {fuzzStatus.state} {fuzzStatus.index}/{fuzzStatus.total}
          {fuzzStatus.activeId ? ` · ${fuzzStatus.activeId}` : ''}
        </Text>
        {fuzzStatus.summary && (
          <Text style={styles.stateLabel}>
            passed {fuzzStatus.summary.passed}/{fuzzStatus.summary.total} · failed{' '}
            {fuzzStatus.summary.failed}
          </Text>
        )}
        {fuzzStatus.error && (
          <Text style={styles.stateLabel}>error: {fuzzStatus.error}</Text>
        )}
        {fuzzStatus.lastResult && !fuzzStatus.lastResult.passed && (
          <Text style={styles.stateLabel}>
            last failure: {fuzzStatus.lastResult.id} ·{' '}
            {fuzzStatus.lastResult.failures.slice(0, 2).join('; ')}
          </Text>
        )}
        {selectionState && (
          <View style={styles.stateRow}>
            {selectionState.bold && (
              <Text style={[styles.stateBadge, styles.stateBadgeActive]}>B</Text>
            )}
            {selectionState.italic && (
              <Text style={[styles.stateBadge, styles.stateBadgeActive]}>I</Text>
            )}
            {selectionState.underline && (
              <Text style={[styles.stateBadge, styles.stateBadgeActive]}>U</Text>
            )}
            {selectionState.strikethrough && (
              <Text style={[styles.stateBadge, styles.stateBadgeActive]}>S</Text>
            )}
            {selectionState.code && (
              <Text style={[styles.stateBadge, styles.stateBadgeActive]}>{'<>'}</Text>
            )}
            {selectionState.hasLink && (
              <Text style={[styles.stateBadge, styles.stateBadgeActive]}>link</Text>
            )}
            <Text style={styles.stateLabel}>
              {selectionState.blockType}
              {selectionState.listType ? ` · ${selectionState.listType}` : ''}
            </Text>
            <Text style={styles.stateLabel}>
              [{selectionState.start},{selectionState.end}]
            </Text>
          </View>
        )}
      </View>
      <ScrollView
        style={styles.toolbarScroll}
        contentContainerStyle={styles.toolbarContent}
        showsVerticalScrollIndicator={false}
      >
        <ButtonRow label="fuzz" buttons={fuzzButtons} />
        <ButtonRow label="bridge" buttons={bridgeButtons} />
        <ButtonRow label="format" buttons={formatButtons} />
        <ButtonRow label="block" buttons={blockButtons} />
        <ButtonRow label="list" buttons={listButtons} />
        <ButtonRow label="other" buttons={historyButtons} />
      </ScrollView>
    </View>
  );
}

function ButtonRow({
  label,
  buttons,
}: {
  label: string;
  buttons: ButtonSpec[];
}) {
  return (
    <View style={styles.row}>
      <Text style={styles.rowLabel}>{label}</Text>
      <View style={styles.rowButtons}>
        {buttons.map((btn) => (
          <Pressable
            key={btn.label}
            style={styles.button}
            onPress={btn.onPress}
            accessibilityLabel={`cmd-${btn.label}`}
          >
            <Text style={styles.buttonText}>{btn.label}</Text>
          </Pressable>
        ))}
      </View>
    </View>
  );
}

async function runNotebookRuntimeFuzzCase(
  testCase: NotebookRuntimeFuzzCase,
  editorRef: EditorRefObject,
): Promise<NotebookRuntimeFuzzResult> {
  let finalHtml = '';
  let error: string | null = null;

  try {
    const editor = await waitForEditorRef(editorRef);
    for (const command of testCase.commands) {
      await runFuzzCommand(editor, command);
      await delay(FUZZ_COMMAND_DELAY_MS);
    }
    finalHtml = await editor.getHtml();
  } catch (err) {
    error = stringifyError(err);
    finalHtml = (await editorRef.current?.getHtml().catch(() => '')) ?? '';
  }

  return evaluateNotebookRuntimeFuzzCase(testCase, { finalHtml, error });
}

async function runFuzzCommand(
  editor: UnfoldEditorRef,
  command: NotebookRuntimeFuzzCommand,
): Promise<void> {
  switch (command.type) {
    case 'get-html':
      await editor.getHtml();
      return;
    case 'focus':
      await editor.focus();
      return;
    case 'blur':
      await editor.blur();
      return;
    case 'toggle-bold':
      await editor.toggleBold();
      return;
    case 'toggle-italic':
      await editor.toggleItalic();
      return;
    case 'toggle-underline':
      await editor.toggleUnderline();
      return;
    case 'toggle-strikethrough':
      await editor.toggleStrikethrough();
      return;
    case 'set-block':
      await editor.setBlockType(command.blockType);
      return;
    case 'set-list':
      await editor.setList(command.listType);
      return;
    case 'clear-list':
      await editor.clearList();
      return;
    case 'toggle-checklist':
      await editor.toggleChecklist();
      return;
    case 'indent-list':
      await editor.indentList();
      return;
    case 'outdent-list':
      await editor.outdentList();
      return;
    case 'undo':
      await editor.undo();
      return;
    case 'redo':
      await editor.redo();
      return;
    case 'insert-link':
      await editor.insertLink(command.url);
      return;
    case 'insert-scripture':
      await editor.insertScripture(command.reference, command.text);
      return;
  }
}

async function waitForEditorRef(editorRef: EditorRefObject): Promise<UnfoldEditorRef> {
  for (let attempt = 0; attempt < 20; attempt += 1) {
    if (editorRef.current) {
      return editorRef.current;
    }
    await delay(50);
  }
  throw new Error('native editor ref did not become ready');
}

function selectFuzzCases(
  cases: readonly NotebookRuntimeFuzzCase[],
  requestedCaseId: string | undefined,
  requestedLimit: number | null,
): NotebookRuntimeFuzzCase[] {
  const filteredCases = requestedCaseId
    ? cases.filter((testCase) => testCase.id === requestedCaseId)
    : [...cases];

  if (requestedLimit === null) {
    return filteredCases;
  }

  return filteredCases.slice(0, requestedLimit);
}

function firstParam(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

function isTruthyParam(value: string | undefined): boolean {
  return value === '1' || value === 'true' || value === 'yes';
}

function parsePositiveInt(value: string | undefined): number | null {
  if (!value) {
    return null;
  }

  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
}

function stringifyError(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  editor: {
    flex: 1,
  },
  toolbarScroll: {
    maxHeight: 260,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: '#2a2a2a',
    backgroundColor: '#0d0d0d',
  },
  toolbarContent: {
    paddingVertical: 8,
    paddingHorizontal: 12,
    gap: 6,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  rowLabel: {
    width: 48,
    color: '#888',
    fontSize: 11,
  },
  rowButtons: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
    flex: 1,
  },
  button: {
    paddingVertical: 7,
    paddingHorizontal: 10,
    borderRadius: 6,
    backgroundColor: '#1f1f1f',
  },
  buttonText: {
    color: '#f5f5f5',
    fontSize: 13,
    fontWeight: '600',
  },
  stateBar: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: '#2a2a2a',
    backgroundColor: '#111',
  },
  stateRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: 4,
  },
  stateLabel: {
    color: '#888',
    fontSize: 11,
    fontVariant: ['tabular-nums'],
  },
  stateBadge: {
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
    backgroundColor: '#1f1f1f',
    color: '#555',
    fontSize: 11,
    fontWeight: '700',
    overflow: 'hidden',
  },
  stateBadgeActive: {
    backgroundColor: '#2d4a2d',
    color: '#8bef8b',
  },
});
