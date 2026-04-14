import { useCallback } from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import {
  StarIcon,
  MicrophoneStageIcon,
  SunHorizonIcon,
  BookOpenIcon,
  HandsPrayingIcon,
  NoteIcon,
} from 'phosphor-react-native';
import Animated, { FadeIn, useReducedMotion } from 'react-native-reanimated';
import { Duration, Ease } from '@/constants/animations';
import * as Haptics from 'expo-haptics';
import { FontFamily, FontSize } from '@/constants/fonts';
import { useTheme } from '@/lib/theme';
import { Radius } from '@/constants/radius';
import { Shadow } from '@/constants/shadows';
import { Spacing } from '@/constants/spacing';
import { ScriptureRefPill } from './ScriptureRefPill';
import { stripHtml, isHtmlContent } from './html-utils';

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
  index?: number;
}

/**
 * Card component for the notebook list view.
 * Variable height (~92-120px) depending on whether a scripture reference is present.
 */
export function NoteCard({ note, onPress, onLongPress, index = 0 }: NoteCardProps) {
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
    <Animated.View entering={reducedMotion ? undefined : FadeIn.duration(Duration.normal).easing(Ease.out)}>
      <TouchableOpacity
        onPress={handlePress}
        onLongPress={handleLongPress}
        activeOpacity={0.7}
        accessibilityRole="button"
        accessibilityLabel={`${displayTitle}, ${categoryConfig.label}, ${relativeDate}${note.tags.length > 0 ? `, tags: ${note.tags.join(', ')}` : ''}`}
      >
        <View
          style={[
            styles.card,
            {
              backgroundColor: colors.backgroundElevated,
              borderColor: colors.border,
            },
            // Favorite left accent bar
            note.isFavorite && {
              borderLeftWidth: 2.5,
              borderLeftColor: colors.accent,
            },
          ]}
        >
          {/* Row 1: Category icon + title + star */}
          <View style={styles.titleRow}>
            <View style={styles.titleContent}>
              <Text
                style={[styles.title, { color: colors.text }]}
                numberOfLines={1}
              >
                {displayTitle}
              </Text>
            </View>

            <View style={styles.titleRight}>
              {note.isFavorite && (
                <StarIcon size={13} color={colors.accent} weight="fill" />
              )}
              <CategoryIcon size={14} color={colors.textSubtle} weight="light" />
            </View>
          </View>

          {/* Row 2: Scripture reference pill (optional) */}
          {note.scriptureRefs.length > 0 && (
            <View style={styles.scriptureRow}>
              <ScriptureRefPill reference={note.scriptureRefs[0]} />
            </View>
          )}

          {/* Row 3: Preview text (2 lines max) */}
          {previewText ? (
            <Text
              style={[styles.preview, { color: colors.textMuted }]}
              numberOfLines={2}
            >
              {previewText}
            </Text>
          ) : null}

          {/* Row 4: Metadata — relative date + inline tags */}
          <View style={styles.metadataRow}>
            <Text style={[styles.metadataText, { color: colors.textSubtle }]}>
              {relativeDate}
            </Text>

            {visibleTags.map((tag) => (
              <Text
                key={tag}
                style={[styles.tagText, { color: colors.accent, opacity: 0.7 }]}
              >
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
      </TouchableOpacity>
    </Animated.View>
  );
}

function formatRelativeDate(dateStr: string): string {
  const date = new Date(dateStr);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

  if (diffDays === 0) return 'Today';
  if (diffDays === 1) return 'Yesterday';
  if (diffDays < 7) return `${diffDays} days ago`;
  if (diffDays < 30) {
    const weeks = Math.floor(diffDays / 7);
    return `${weeks} week${weeks > 1 ? 's' : ''} ago`;
  }
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

const styles = StyleSheet.create({
  card: {
    borderRadius: Radius.card,
    padding: Spacing['4'],
    marginBottom: 10,
    borderWidth: 1,
    // Card shadow (matches existing journal entry cards)
    ...Shadow.sm,
  },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 6,
  },
  titleContent: {
    flex: 1,
    marginRight: Spacing['2'],
  },
  title: {
    fontFamily: FontFamily.uiMedium,
    fontSize: FontSize.sm,
    lineHeight: 20,
  },
  titleRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing['2'],
  },
  scriptureRow: {
    marginBottom: 6,
  },
  preview: {
    fontFamily: FontFamily.body,
    fontSize: 13,
    lineHeight: 19,
    marginBottom: Spacing['2'],
  },
  metadataRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing['2'],
    flexWrap: 'wrap',
  },
  metadataText: {
    fontFamily: FontFamily.ui,
    fontSize: 11,
  },
  tagText: {
    fontFamily: FontFamily.ui,
    fontSize: 11,
  },
});
