import { useState, useCallback, useRef, useEffect, useMemo } from 'react';
import { View, Text, TouchableOpacity, ScrollView, StyleSheet } from 'react-native';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import Animated, { FadeIn, FadeInDown } from 'react-native-reanimated';
import { WebView } from 'react-native-webview';
import * as Haptics from 'expo-haptics';
import {
  CaretLeftIcon,
  DotsThreeIcon,
  TrashIcon,
  StarIcon,
  TagIcon,
  FolderSimpleIcon,
  MicrophoneStageIcon,
  SunHorizonIcon,
  BookOpenIcon,
  HandsPrayingIcon,
  NoteIcon,
} from 'phosphor-react-native';
import { FontFamily } from '@/constants/fonts';
import { useTheme } from '@/lib/theme';
import { useUnfoldStore, type Note, type NoteCategory } from '@/lib/store';
import { ScriptureRefPill } from '@/components/notebook/ScriptureRefPill';
import { MoveFolderSheet } from '@/components/notebook/MoveFolderSheet';
import { isHtmlContent, stripHtml } from '@/components/notebook/NoteEditor';

const CATEGORY_CONFIG: Record<NoteCategory, { Icon: typeof NoteIcon; label: string }> = {
  sermon: { Icon: MicrophoneStageIcon, label: 'Sermon' },
  'quiet-time': { Icon: SunHorizonIcon, label: 'Quiet Time' },
  study: { Icon: BookOpenIcon, label: 'Study' },
  prayer: { Icon: HandsPrayingIcon, label: 'Prayer' },
  general: { Icon: NoteIcon, label: 'General' },
};

const CATEGORY_OPTIONS: { key: NoteCategory; label: string; Icon: typeof NoteIcon }[] = [
  { key: 'sermon', label: 'Sermon', Icon: MicrophoneStageIcon },
  { key: 'quiet-time', label: 'Quiet Time', Icon: SunHorizonIcon },
  { key: 'study', label: 'Study', Icon: BookOpenIcon },
  { key: 'prayer', label: 'Prayer', Icon: HandsPrayingIcon },
  { key: 'general', label: 'General', Icon: NoteIcon },
];

/**
 * Formats a date string into a readable display format.
 */
function formatDate(dateStr: string): string {
  const date = new Date(dateStr);
  return date.toLocaleDateString('en-US', {
    month: 'long',
    day: 'numeric',
    year: 'numeric',
  });
}

/**
 * Simple content renderer that handles basic formatting:
 * - **bold** text
 * - *italic* text
 * - Lines starting with "- " as bullet points
 * - Lines starting with "[ ] " or "[x] " as checklists
 * - #tags rendered in accent color
 */
function renderFormattedContent(
  content: string,
  colors: { text: string; textMuted: string; accent: string },
): React.ReactNode[] {
  if (!content.trim()) return [];

  const lines = content.split('\n');
  const elements: React.ReactNode[] = [];

  lines.forEach((line, lineIndex) => {
    const trimmed = line.trimStart();

    // Checklist: [ ] or [x]
    if (trimmed.startsWith('[ ] ') || trimmed.startsWith('[x] ')) {
      const isChecked = trimmed.startsWith('[x]');
      const text = trimmed.slice(4);
      elements.push(
        <View key={`line-${lineIndex}`} style={detailStyles.checklistItem}>
          <View
            style={[
              detailStyles.checkbox,
              {
                borderColor: isChecked ? colors.accent : colors.textMuted,
                backgroundColor: isChecked ? colors.accent + '20' : 'transparent',
              },
            ]}
          >
            {isChecked && (
              <Text style={[detailStyles.checkmark, { color: colors.accent }]}>
                {'\u2713'}
              </Text>
            )}
          </View>
          <Text
            style={[
              detailStyles.bodyText,
              { color: colors.text },
              isChecked && {
                textDecorationLine: 'line-through',
                color: colors.textMuted,
              },
            ]}
          >
            {text}
          </Text>
        </View>,
      );
      return;
    }

    // Bullet list: - text
    if (trimmed.startsWith('- ')) {
      const text = trimmed.slice(2);
      elements.push(
        <View key={`line-${lineIndex}`} style={detailStyles.bulletItem}>
          <Text style={[detailStyles.bulletDot, { color: colors.accent }]}>
            {'\u2022'}
          </Text>
          <Text style={[detailStyles.bodyText, { color: colors.text }]}>
            {text}
          </Text>
        </View>,
      );
      return;
    }

    // Regular paragraph (with inline formatting)
    if (trimmed.length === 0) {
      elements.push(
        <View key={`line-${lineIndex}`} style={detailStyles.emptyLine} />,
      );
      return;
    }

    elements.push(
      <Text
        key={`line-${lineIndex}`}
        style={[detailStyles.bodyText, { color: colors.text }]}
      >
        {renderInlineFormatting(line, colors)}
      </Text>,
    );
  });

  return elements;
}

/**
 * Handles inline markdown-style formatting within a line of text.
 */
function renderInlineFormatting(
  text: string,
  colors: { text: string; accent: string },
): React.ReactNode[] {
  const parts: React.ReactNode[] = [];
  let remaining = text;
  let keyIndex = 0;

  while (remaining.length > 0) {
    // Bold: **text**
    const boldMatch = remaining.match(/\*\*(.+?)\*\*/);
    // Italic: *text*
    const italicMatch = remaining.match(/(?<!\*)\*(?!\*)(.+?)(?<!\*)\*(?!\*)/);
    // Tag: #word
    const tagMatch = remaining.match(/#(\w+)/);

    // Find the earliest match
    const matches = [
      boldMatch ? { type: 'bold', match: boldMatch, index: boldMatch.index ?? Infinity } : null,
      italicMatch ? { type: 'italic', match: italicMatch, index: italicMatch.index ?? Infinity } : null,
      tagMatch ? { type: 'tag', match: tagMatch, index: tagMatch.index ?? Infinity } : null,
    ].filter(Boolean) as { type: string; match: RegExpMatchArray; index: number }[];

    if (matches.length === 0) {
      parts.push(<Text key={`t-${keyIndex++}`}>{remaining}</Text>);
      break;
    }

    matches.sort((a, b) => a.index - b.index);
    const earliest = matches[0];

    // Add text before the match
    if (earliest.index > 0) {
      parts.push(
        <Text key={`t-${keyIndex++}`}>{remaining.slice(0, earliest.index)}</Text>,
      );
    }

    if (earliest.type === 'bold') {
      parts.push(
        <Text
          key={`b-${keyIndex++}`}
          style={{ fontFamily: FontFamily.bodyBold }}
        >
          {earliest.match[1]}
        </Text>,
      );
      remaining = remaining.slice(earliest.index + earliest.match[0].length);
    } else if (earliest.type === 'italic') {
      parts.push(
        <Text
          key={`i-${keyIndex++}`}
          style={{ fontFamily: FontFamily.bodyItalic }}
        >
          {earliest.match[1]}
        </Text>,
      );
      remaining = remaining.slice(earliest.index + earliest.match[0].length);
    } else if (earliest.type === 'tag') {
      parts.push(
        <Text
          key={`tag-${keyIndex++}`}
          style={{ color: colors.accent }}
        >
          #{earliest.match[1]}
        </Text>,
      );
      remaining = remaining.slice(earliest.index + earliest.match[0].length);
    }
  }

  return parts;
}

/* ─────────────────────────────────────────────────────────
 * HTML content renderer (for notes created with TipTap editor)
 * Uses a transparent WebView that auto-resizes to content height.
 * ───────────────────────────────────────────────────────── */
interface HtmlContentViewProps {
  html: string;
  textColor: string;
  accentColor: string;
  mutedColor: string;
  backgroundColor: string;
}

function HtmlContentView({ html, textColor, accentColor, mutedColor, backgroundColor }: HtmlContentViewProps) {
  const [webHeight, setWebHeight] = useState(200);
  const [isLoaded, setIsLoaded] = useState(false);
  const bg = backgroundColor;

  const styledHtml = `<!DOCTYPE html>
<html>
<head>
<meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1">
<style>
  * { box-sizing: border-box; -webkit-tap-highlight-color: transparent; }
  body {
    margin: 0; padding: 0;
    font-family: -apple-system, 'Helvetica Neue', sans-serif;
    font-size: 17px;
    line-height: 1.65;
    color: ${textColor};
    background-color: ${bg};
    overflow: hidden;
    -webkit-text-size-adjust: none;
  }
  p { margin: 0 0 6px 0; }
  h1 { font-size: 22px; font-weight: 700; margin: 14px 0 6px; }
  h2 { font-size: 19px; font-weight: 600; margin: 10px 0 4px; }
  h3 { font-size: 17px; font-weight: 600; margin: 8px 0 4px; }
  ul, ol { padding-left: 22px; margin: 4px 0; }
  li { margin: 2px 0; }
  ul[data-type="taskList"] { padding-left: 0; list-style: none; }
  ul[data-type="taskList"] li { display: flex; align-items: flex-start; gap: 8px; margin: 4px 0; }
  ul[data-type="taskList"] li label { margin-top: 4px; flex-shrink: 0; }
  ul[data-type="taskList"] li label input[type="checkbox"] {
    width: 16px; height: 16px;
    accent-color: ${accentColor};
    pointer-events: none;
  }
  ul[data-type="taskList"] li[data-checked="true"] > div {
    text-decoration: line-through; opacity: 0.45;
  }
  blockquote {
    border-left: 3px solid ${accentColor};
    padding-left: 14px; margin: 8px 0;
    color: ${mutedColor}; font-style: italic;
  }
  strong { font-weight: 700; }
  em { font-style: italic; }
</style>
</head>
<body>${html}</body>
<script>
  window.onload = function() {
    window.ReactNativeWebView.postMessage(JSON.stringify({type:'height',value:document.body.scrollHeight}));
  };
</script>
</html>`;

  return (
    <View style={{ position: 'relative' }}>
      <WebView
        source={{ html: styledHtml }}
        style={[detailHtmlStyles.webview, { height: webHeight }]}
        scrollEnabled={false}
        showsVerticalScrollIndicator={false}
        onMessage={(e) => {
          try {
            const msg = JSON.parse(e.nativeEvent.data);
            if (msg.type === 'height' && typeof msg.value === 'number') {
              setWebHeight(msg.value + 16);
              setIsLoaded(true);
            }
          } catch {}
        }}
        onLoad={() => setIsLoaded(true)}
        originWhitelist={['*']}
        backgroundColor={backgroundColor}
        javaScriptEnabled
      />
      {!isLoaded && (
        <View
          style={[
            StyleSheet.absoluteFillObject,
            { backgroundColor, minHeight: webHeight },
          ]}
          pointerEvents="none"
        />
      )}
    </View>
  );
}

const detailHtmlStyles = StyleSheet.create({
  webview: {
    width: '100%',
    opacity: 0.99, // iOS GPU compositing fix for transparent WebViews
  },
});

export default function NoteDetailScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ noteId: string }>();
  const { colors } = useTheme();

  const notes = useUnfoldStore((s) => s.notes);
  const updateNote = useUnfoldStore((s) => s.updateNote);
  const deleteNote = useUnfoldStore((s) => s.deleteNote);
  const folders = useUnfoldStore((s) => s.folders);
  const moveNoteToFolder = useUnfoldStore((s) => s.moveNoteToFolder);

  const note = useMemo(
    () => notes.find((n) => n.id === params.noteId),
    [notes, params.noteId],
  );

  const noteFolder = useMemo(
    () => (note?.folderId ? folders.find((f) => f.id === note.folderId) : undefined),
    [note?.folderId, folders],
  );

  const [showMoreMenu, setShowMoreMenu] = useState(false);
  const [showCategoryPicker, setShowCategoryPicker] = useState(false);
  const [showMoveFolderSheet, setShowMoveFolderSheet] = useState(false);
  const [deleteConfirm, setDeleteConfirm] = useState(false);
  const deleteTimeoutRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  // Clean up on unmount
  useEffect(() => {
    return () => {
      if (deleteTimeoutRef.current) clearTimeout(deleteTimeoutRef.current);
    };
  }, []);

  const handleBack = useCallback(() => {
    router.back();
  }, [router]);

  const handleEdit = useCallback(() => {
    if (!note) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    router.push({
      pathname: '/(tabs)/(journal)/note',
      params: { noteId: note.id },
    });
  }, [note, router]);

  const handleToggleFavorite = useCallback(() => {
    if (!note) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    updateNote(note.id, { isFavorite: !note.isFavorite });
    setShowMoreMenu(false);
  }, [note, updateNote]);

  const handleDelete = useCallback(() => {
    if (!note) return;

    if (!deleteConfirm) {
      setDeleteConfirm(true);
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
      deleteTimeoutRef.current = setTimeout(() => {
        setDeleteConfirm(false);
      }, 3000);
      return;
    }

    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
    deleteNote(note.id);
    setShowMoreMenu(false);
    router.back();
  }, [note, deleteConfirm, deleteNote, router]);

  const handleCategorySelect = useCallback(
    (cat: NoteCategory) => {
      if (!note) return;
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      updateNote(note.id, { category: cat });
      setShowCategoryPicker(false);
      setShowMoreMenu(false);
    },
    [note, updateNote],
  );

  const handleMoveToFolder = useCallback(() => {
    setShowMoreMenu(false);
    setShowCategoryPicker(false);
    // Small delay so the menu closes before the sheet opens
    setTimeout(() => {
      setShowMoveFolderSheet(true);
    }, 100);
  }, []);

  const handleMoveFolderSelect = useCallback(
    (folderId: string | null) => {
      if (!note) return;
      moveNoteToFolder(note.id, folderId);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    },
    [note, moveNoteToFolder],
  );

  // If the note doesn't exist (e.g., deleted), go back
  if (!note) {
    return (
      <View style={[styles.screen, { backgroundColor: colors.background }]}>
        <SafeAreaView style={styles.flex} edges={['top']}>
          <View style={styles.header}>
            <TouchableOpacity
              onPress={handleBack}
              style={styles.headerButton}
              activeOpacity={0.6}
            >
              <CaretLeftIcon size={24} color={colors.textMuted} weight="light" />
            </TouchableOpacity>
          </View>
          <View style={styles.emptyContainer}>
            <Text style={[styles.emptyText, { color: colors.textMuted }]}>
              Note not found.
            </Text>
          </View>
        </SafeAreaView>
      </View>
    );
  }

  const categoryConfig = CATEGORY_CONFIG[note.category];
  const CategoryIcon = categoryConfig.Icon;
  const displayTitle =
    note.title.trim() ||
    note.content.split('\n')[0]?.slice(0, 80) ||
    'Untitled';

  return (
    <View style={[styles.screen, { backgroundColor: colors.background }]}>
      <SafeAreaView style={styles.flex} edges={['top']}>
        {/* Header */}
        <View style={styles.header}>
          <TouchableOpacity
            onPress={handleBack}
            style={styles.headerButton}
            hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
            activeOpacity={0.6}
            accessibilityRole="button"
            accessibilityLabel="Go back"
          >
            <CaretLeftIcon size={24} color={colors.textMuted} weight="light" />
          </TouchableOpacity>

          <View style={styles.headerRight}>
            <TouchableOpacity
              onPress={handleEdit}
              style={styles.editButton}
              activeOpacity={0.6}
              accessibilityRole="button"
              accessibilityLabel="Edit note"
            >
              <Text style={[styles.editText, { color: colors.accent }]}>
                Edit
              </Text>
            </TouchableOpacity>

            <TouchableOpacity
              onPress={() => {
                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                setShowMoreMenu(!showMoreMenu);
                setShowCategoryPicker(false);
                setDeleteConfirm(false);
              }}
              style={styles.headerButton}
              hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
              activeOpacity={0.6}
              accessibilityRole="button"
              accessibilityLabel="More options"
            >
              <DotsThreeIcon size={24} color={colors.textMuted} weight="light" />
            </TouchableOpacity>
          </View>
        </View>

        {/* Backdrop for more menu — rendered before menu so menu items are tappable */}
        {showMoreMenu && (
          <TouchableOpacity
            style={styles.backdrop}
            activeOpacity={1}
            onPress={() => {
              setShowMoreMenu(false);
              setShowCategoryPicker(false);
              setDeleteConfirm(false);
            }}
          />
        )}

        {/* More menu */}
        {showMoreMenu && (
          <Animated.View
            entering={FadeIn.duration(150)}
            style={[
              styles.moreMenu,
              {
                backgroundColor: colors.backgroundElevated,
                borderColor: colors.border,
                shadowColor: '#000',
              },
            ]}
          >
            {/* Favorite toggle */}
            <TouchableOpacity
              onPress={handleToggleFavorite}
              style={styles.menuItem}
              activeOpacity={0.6}
            >
              <StarIcon
                size={16}
                color={note.isFavorite ? colors.accent : colors.textMuted}
                weight={note.isFavorite ? 'fill' : 'light'}
              />
              <Text style={[styles.menuItemText, { color: colors.text }]}>
                {note.isFavorite ? 'Remove from favorites' : 'Add to favorites'}
              </Text>
            </TouchableOpacity>

            {/* Divider */}
            <View style={[styles.menuDivider, { backgroundColor: colors.border }]} />

            {/* Category picker toggle */}
            <TouchableOpacity
              onPress={() => {
                setShowCategoryPicker(!showCategoryPicker);
                setDeleteConfirm(false);
              }}
              style={styles.menuItem}
              activeOpacity={0.6}
            >
              <TagIcon size={16} color={colors.textMuted} weight="light" />
              <Text style={[styles.menuItemText, { color: colors.text }]}>
                Category: {CATEGORY_CONFIG[note.category].label}
              </Text>
            </TouchableOpacity>

            {/* Inline category picker */}
            {showCategoryPicker && (
              <View style={styles.categoryPickerInline}>
                {CATEGORY_OPTIONS.map((cat) => {
                  const isActive = note.category === cat.key;
                  return (
                    <TouchableOpacity
                      key={cat.key}
                      onPress={() => handleCategorySelect(cat.key)}
                      style={[
                        styles.categoryOption,
                        {
                          backgroundColor: isActive
                            ? colors.accent + '15'
                            : colors.buttonBackground,
                          borderColor: isActive
                            ? colors.accent + '33'
                            : colors.border,
                        },
                      ]}
                      activeOpacity={0.7}
                    >
                      <cat.Icon
                        size={14}
                        color={isActive ? colors.accent : colors.textMuted}
                        weight={isActive ? 'fill' : 'light'}
                      />
                      <Text
                        style={[
                          styles.categoryOptionText,
                          {
                            color: isActive ? colors.accent : colors.textMuted,
                            fontFamily: isActive ? FontFamily.uiMedium : FontFamily.ui,
                          },
                        ]}
                      >
                        {cat.label}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </View>
            )}

            {/* Divider */}
            <View style={[styles.menuDivider, { backgroundColor: colors.border }]} />

            {/* Move to folder */}
            <TouchableOpacity
              onPress={handleMoveToFolder}
              style={styles.menuItem}
              activeOpacity={0.6}
            >
              <FolderSimpleIcon size={16} color={colors.textMuted} weight="light" />
              <Text style={[styles.menuItemText, { color: colors.text }]}>
                {noteFolder ? `Folder: ${noteFolder.name}` : 'Move to folder'}
              </Text>
            </TouchableOpacity>

            {/* Divider */}
            <View style={[styles.menuDivider, { backgroundColor: colors.border }]} />

            {/* Delete */}
            <TouchableOpacity
              onPress={handleDelete}
              style={styles.menuItem}
              activeOpacity={0.6}
            >
              <TrashIcon size={16} color={colors.error} weight="light" />
              <Text style={[styles.menuItemText, { color: colors.error }]}>
                {deleteConfirm ? 'Tap again to delete' : 'Delete note'}
              </Text>
            </TouchableOpacity>
          </Animated.View>
        )}

        {/* Content */}
        <ScrollView
          style={styles.flex}
          contentContainerStyle={detailStyles.scrollContent}
          showsVerticalScrollIndicator={false}
        >
          {/* Metadata row */}
          <Animated.View
            entering={FadeIn.duration(600)}
            style={detailStyles.metadataRow}
          >
            <CategoryIcon size={14} color={colors.accent} weight="light" />
            <Text style={[detailStyles.metadataText, { color: colors.textHint }]}>
              {categoryConfig.label.toUpperCase()}
            </Text>
            <Text style={[detailStyles.metadataDot, { color: colors.textHint }]}>
              {'\u00B7'}
            </Text>
            <Text style={[detailStyles.metadataText, { color: colors.textHint }]}>
              {formatDate(note.createdAt)}
            </Text>
            {noteFolder && (
              <>
                <Text style={[detailStyles.metadataDot, { color: colors.textHint }]}>
                  {'\u00B7'}
                </Text>
                {noteFolder.color && (
                  <View
                    style={{
                      width: 6,
                      height: 6,
                      borderRadius: 3,
                      backgroundColor: noteFolder.color,
                    }}
                  />
                )}
                <Text style={[detailStyles.metadataText, { color: colors.textHint }]}>
                  {noteFolder.name.toUpperCase()}
                </Text>
              </>
            )}
            {note.isFavorite && (
              <>
                <Text style={[detailStyles.metadataDot, { color: colors.textHint }]}>
                  {'\u00B7'}
                </Text>
                <StarIcon size={12} color={colors.accent} weight="fill" />
              </>
            )}
          </Animated.View>

          {/* Title */}
          <Animated.Text
            entering={FadeInDown.duration(600).delay(50)}
            style={[detailStyles.title, { color: colors.text }]}
          >
            {displayTitle}
          </Animated.Text>

          {/* Accent divider */}
          <Animated.View
            entering={FadeInDown.duration(400).delay(100)}
            style={[detailStyles.divider, { backgroundColor: colors.accent }]}
          />

          {/* Scripture references */}
          {note.scriptureRefs.length > 0 && (
            <Animated.View
              entering={FadeInDown.duration(500).delay(150)}
              style={detailStyles.scriptureSection}
            >
              {note.scriptureRefs.map((ref, idx) => (
                <View
                  key={`${ref.reference}-${idx}`}
                  style={[
                    detailStyles.scriptureCard,
                    {
                      backgroundColor: colors.accent + '08',
                      borderLeftColor: colors.accent,
                    },
                  ]}
                >
                  <ScriptureRefPill reference={ref} size="regular" />
                </View>
              ))}
            </Animated.View>
          )}

          {/* Body content — HTML (new notes) or legacy markdown */}
          <Animated.View entering={FadeInDown.duration(600).delay(200)}>
            {isHtmlContent(note.content) ? (
              <HtmlContentView
                html={note.content}
                textColor={colors.text}
                accentColor={colors.accent}
                mutedColor={colors.textMuted}
                backgroundColor={colors.background}
              />
            ) : (
              renderFormattedContent(note.content, colors)
            )}
          </Animated.View>

          {/* Tags section */}
          {note.tags.length > 0 && (
            <Animated.View
              entering={FadeInDown.duration(500).delay(250)}
              style={detailStyles.tagsSection}
            >
              <Text style={[detailStyles.sectionLabel, { color: colors.textSubtle }]}>
                TAGS
              </Text>
              <View style={detailStyles.tagsWrap}>
                {note.tags.map((tag) => (
                  <View
                    key={tag}
                    style={[
                      detailStyles.tagPill,
                      {
                        backgroundColor: colors.accent + '15',
                        borderColor: colors.accent + '33',
                      },
                    ]}
                  >
                    <Text
                      style={[
                        detailStyles.tagPillText,
                        { color: colors.accent },
                      ]}
                    >
                      #{tag}
                    </Text>
                  </View>
                ))}
              </View>
            </Animated.View>
          )}
        </ScrollView>

      </SafeAreaView>

      {/* Move to Folder sheet */}
      <MoveFolderSheet
        visible={showMoveFolderSheet}
        onClose={() => setShowMoveFolderSheet(false)}
        folders={folders}
        currentFolderId={note?.folderId}
        onSelect={handleMoveFolderSelect}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
  },
  flex: {
    flex: 1,
  },
  header: {
    height: 52,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
  },
  headerButton: {
    width: 40,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  editButton: {
    paddingHorizontal: 8,
    paddingVertical: 8,
  },
  editText: {
    fontFamily: FontFamily.uiMedium,
    fontSize: 16,
  },
  moreMenu: {
    position: 'absolute',
    top: 56,
    right: 16,
    width: 240,
    borderRadius: 12,
    borderWidth: 1,
    paddingVertical: 6,
    zIndex: 200,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.12,
    shadowRadius: 12,
    elevation: 8,
  },
  menuItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  menuItemText: {
    fontFamily: FontFamily.ui,
    fontSize: 14,
  },
  menuDivider: {
    height: StyleSheet.hairlineWidth,
    marginHorizontal: 16,
    marginVertical: 4,
  },
  categoryPickerInline: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
    paddingHorizontal: 16,
    paddingBottom: 8,
  },
  categoryOption: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 8,
    borderWidth: 1,
  },
  categoryOptionText: {
    fontSize: 12,
  },
  backdrop: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 100,
  },
  emptyContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  emptyText: {
    fontFamily: FontFamily.body,
    fontSize: 15,
  },
});

const detailStyles = StyleSheet.create({
  scrollContent: {
    paddingHorizontal: 24,
    paddingTop: 24,
    paddingBottom: 120,
  },
  metadataRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 12,
  },
  metadataText: {
    fontFamily: FontFamily.mono,
    fontSize: 11,
    letterSpacing: 1,
    textTransform: 'uppercase',
  },
  metadataDot: {
    fontFamily: FontFamily.mono,
    fontSize: 11,
  },
  title: {
    fontFamily: FontFamily.display,
    fontSize: 24,
    letterSpacing: -0.3,
    marginBottom: 16,
  },
  divider: {
    width: 40,
    height: 1.5,
    borderRadius: 1,
    marginBottom: 24,
  },
  scriptureSection: {
    marginBottom: 16,
    gap: 8,
  },
  scriptureCard: {
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 10,
    borderLeftWidth: 2.5,
  },
  bodyText: {
    fontFamily: FontFamily.body,
    fontSize: 17,
    lineHeight: 28,
  },
  bulletItem: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 8,
    paddingLeft: 4,
  },
  bulletDot: {
    fontFamily: FontFamily.body,
    fontSize: 17,
    lineHeight: 28,
  },
  checklistItem: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
    paddingLeft: 4,
    marginVertical: 2,
  },
  checkbox: {
    width: 18,
    height: 18,
    borderRadius: 4,
    borderWidth: 1.5,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 5,
  },
  checkmark: {
    fontSize: 12,
    fontWeight: '700',
  },
  emptyLine: {
    height: 14,
  },
  tagsSection: {
    marginTop: 32,
  },
  sectionLabel: {
    fontFamily: FontFamily.mono,
    fontSize: 10,
    letterSpacing: 1,
    textTransform: 'uppercase',
    marginBottom: 12,
  },
  tagsWrap: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  tagPill: {
    paddingHorizontal: 12,
    paddingVertical: 5,
    borderRadius: 12,
    borderWidth: 1,
  },
  tagPillText: {
    fontFamily: FontFamily.uiMedium,
    fontSize: 12,
  },
});
