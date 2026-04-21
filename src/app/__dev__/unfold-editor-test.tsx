import { Asset } from 'expo-asset';
import { Stack } from 'expo-router';
import * as React from 'react';
import { Alert, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
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

type ButtonSpec = {
  label: string;
  onPress: () => void;
};

export default function UnfoldEditorTestScreen() {
  const editorRef = React.useRef<UnfoldEditorRef>(null);
  const [selectionState, setSelectionState] =
    React.useState<UnfoldEditorSelectionState | null>(null);
  const [htmlChangeCount, setHtmlChangeCount] = React.useState(0);

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

  const handleInsertLink = React.useCallback(
    call('insertLink', () =>
      editorRef.current?.insertLink('https://unfold.app/john-3-16')
    ),
    [call]
  );

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

  return (
    <View style={styles.container}>
      <Stack.Screen options={{ title: 'UnfoldEditor Day 8' }} />
      <UnfoldEditor
        ref={editorRef}
        style={styles.editor}
        initialHtml={SEED_HTML}
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
    textTransform: 'uppercase',
    letterSpacing: 0.5,
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
