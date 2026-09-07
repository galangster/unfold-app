import { memo, useCallback } from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import {
  StarIcon,
  MicrophoneStageIcon,
  SunHorizonIcon,
  BookOpenIcon,
  HandsPrayingIcon,
  NoteIcon,
} from '@/components/icons';
import Animated, { FadeIn, useReducedMotion } from 'react-native-reanimated';
import { Duration, Ease } from '@/constants/animations';
import * as Haptics from 'expo-haptics';
import { FontFamily } from '@/constants/fonts';
import { useTheme } from '@/lib/theme';
import { Spacing } from '@/constants/spacing';
import { ScriptureRefPill } from './ScriptureRefPill';
import { stripHtml, isHtmlContent } from '@/lib/note-html';
import { formatRelativeDate } from '@/lib/format-relative-date';
import { formatJournalDay } from '@/lib/journal-month-groups';

import { Note, NoteCategory } from '@/lib/store';

// Re-export for convenience
export type { Note, NoteCategory };

// Map categories to their phosphor icons and display labels
const CATEGORY_CONFIG: Record<NoteCategory, { Icon: typeof NoteIcon; label: string }> = {
  sermon: { Icon: MicrophoneStageIcon, label: 'Sermon' },
  'quiet-time': { Icon: SunHorizonIcon, label: 'Quiet Time' },
  study: { Icon: BookOpenIcon, label: 'Study' },
  prayer: { Icon: HandsPrayingIcon, label: 'Prayer' },
  general: { Icon: NoteIcon, label: 'General' },
};

interface NoteCardProps {
  note: Note;
  onPress: (note: Note) => void;
  onLongPress?: (note: Note) => void;
  /** Index for staggered entry animation (delay = 50ms * index) */
  index?: number;
}

/**
 * Card component for the notebook list view.
 * Variable height (~92-120px) depending on whether a scripture reference is present.
 * Memoized (WR-24): parent screens re-render on scroll/search state changes.
 */
export const NoteCard = memo(function NoteCard({ note, onPress, onLongPress, index = 0 }: NoteCardProps) {
  const { colors } = useTheme();
  const reducedMotion = useReducedMotion();
  const categoryConfig = CATEGORY_CONFIG[note.category];
  const CategoryIcon = categoryConfig.Icon;

  // Strip HTML tags for plain-text derivation (handles both HTML and legacy markdown)
  const plainContent = isHtmlContent(note.content) ? stripHtml(note.content) : note.content;

  // Derive display title: explicit title, or first line of content, or fallback
  const displayTitle = note.title.trim()
    || plainContent.split('\n')[0]?.slice(0, 60)
    || 'Untitled';

  // Preview: skip first line if it was used as title, show up to 2 lines
  const previewText = note.title.trim()
    ? plainContent.trim()
    : plainContent.split('\n').slice(1).join('\n').trim();

  const handlePress = useCallback(() => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    onPress(note);
  }, [note, onPress]);

  const handleLongPress = useCallback(() => {
    if (onLongPress) {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
      onLongPress(note);
    }
  }, [note, onLongPress]);

  // Relative date formatting
  const relativeDate = formatRelativeDate(note.updatedAt);

  // Show max 2 tags, then "+N more"
  const visibleTags = note.tags.slice(0, 2);
  const extraTagCount = note.tags.length - visibleTags.length;

  return (
    // Stagger capped so rows mounting late (virtualized list, deep scroll)
    // don't wait out a delay proportional to their index.
    <Animated.View entering={reducedMotion ? undefined : FadeIn.duration(Duration.normal).delay(30 * Math.min(index, 10)).easing(Ease.out)}>
      <TouchableOpacity
        onPress={handlePress}
        onLongPress={handleLongPress}
        activeOpacity={0.7}
        accessibilityRole="button"
        accessibilityLabel={`${displayTitle}, ${categoryConfig.label}, ${relativeDate}${note.tags.length > 0 ? `, tags: ${note.tags.join(', ')}` : ''}`}
      >
        <View style={[styles.card, { borderBottomColor: colors.border }]}>
          <View style={styles.dateColumn}>
            <Text style={[styles.day, { color: colors.text }]}>{formatJournalDay(note.updatedAt)}</Text>
          </View>

          <View style={styles.content}>
            <View style={styles.titleRow}>
              <Text
                style={[styles.title, { color: colors.text }]}
                numberOfLines={2}
              >
                {displayTitle}
              </Text>
              {note.isFavorite && (
                <StarIcon size={13} color={colors.accent} weight="fill" />
              )}
            </View>

            {note.scriptureRefs.length > 0 && (
              <View style={styles.scriptureRow}>
                <ScriptureRefPill reference={note.scriptureRefs[0]} />
              </View>
            )}

            {previewText ? (
              <Text style={[styles.preview, { color: colors.textMuted }]} numberOfLines={2}>
                {previewText}
              </Text>
            ) : null}

            <View style={styles.metadataRow}>
              <CategoryIcon size={13} color={colors.textSubtle} weight="light" />
              <Text style={[styles.metadataText, { color: colors.textSubtle }]}>
                {`${categoryConfig.label} · ${relativeDate}`}
              </Text>

              {visibleTags.map((tag) => (
                <Text key={tag} style={[styles.tagText, { color: colors.accent }]}>
                  #{tag}
                </Text>
              ))}

              {extraTagCount > 0 && (
                <Text style={[styles.metadataText, { color: colors.textSubtle }]}>
                  +{extraTagCount} more
                </Text>
              )}
            </View>
          </View>
        </View>
      </TouchableOpacity>
    </Animated.View>
  );
});

const styles = StyleSheet.create({
  card: {
    minHeight: 112,
    paddingVertical: Spacing['4'],
    borderBottomWidth: StyleSheet.hairlineWidth,
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: Spacing['3'],
  },
  dateColumn: {
    width: 34,
    alignItems: 'center',
  },
  day: {
    fontFamily: FontFamily.display,
    fontSize: 23,
    lineHeight: 28,
  },
  content: {
    flex: 1,
    minWidth: 0,
  },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: Spacing['1'],
    gap: Spacing['2'],
  },
  title: {
    flex: 1,
    fontFamily: FontFamily.display,
    fontSize: 18,
    lineHeight: 23,
  },
  scriptureRow: {
    marginBottom: 6,
  },
  preview: {
    fontFamily: FontFamily.body,
    fontSize: 14,
    lineHeight: 20,
    marginBottom: Spacing['1.5'],
  },
  metadataRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing['2'],
    flexWrap: 'wrap',
  },
  metadataText: {
    fontFamily: FontFamily.ui,
    fontSize: 12,
    lineHeight: 18,
  },
  tagText: {
    fontFamily: FontFamily.ui,
    fontSize: 12,
    lineHeight: 18,
  },
});
