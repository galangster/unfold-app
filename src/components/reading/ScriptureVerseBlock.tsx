/**
 * Devotional scripture rendered verse by verse, highlightable per verse.
 *
 * Reuses the Bible reader's verse model: a tap selects a verse, a colour
 * row writes `BibleHighlight` records through the same overlap planner the
 * reader uses, so a highlight made here appears in the Bible reader and the
 * Library, and vice versa. Colour gating mirrors the reader today (see
 * item 9 of the Phase B handoff for the pending decision).
 */
import { useCallback, useMemo, useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import * as Haptics from 'expo-haptics';
import { LockSimpleIcon, XIcon } from '@/components/icons';
import { PremiumFeatureSheet } from '@/components/PremiumFeatureSheet';
import { usePremiumAccessPolicy } from '@/hooks/usePremiumAccessPolicy';
import { HIGHLIGHT_BG, HIGHLIGHT_COLORS, HIGHLIGHT_TEXT_DARK, SELECTED_VERSE_TEXT } from '@/constants/bible-highlight-colors';
import { Spacing } from '@/constants/spacing';
import type { VersePassage } from '@/lib/bible-api';
import { toSuperscript } from '@/lib/superscript';
import { planHighlightApplication, planHighlightRemoval } from '@/lib/bible-highlight-overlap';
import { BIBLE_SELECTED_OVERLAY_BG } from '@/lib/bible-reader-visuals';
import { buildVerseColorMap } from '@/lib/bible-verse-highlight-map';
import { isHighlightColorFree } from '@/lib/premium-gating';
import { useUnfoldStore, type BibleHighlightColor } from '@/lib/store';

interface ScriptureTextStyle {
  fontFamily: string;
  fontSize: number;
  lineHeight: number;
  color: string;
}

interface ScriptureVerseBlockProps {
  passage: VersePassage;
  textStyle: ScriptureTextStyle;
  mutedColor: string;
  isDark: boolean;
}

export function ScriptureVerseBlock({ passage, textStyle, mutedColor, isDark }: ScriptureVerseBlockProps) {
  const textColor = textStyle.color;
  const bibleHighlights = useUnfoldStore((s) => s.bibleHighlights);
  const addBibleHighlight = useUnfoldStore((s) => s.addBibleHighlight);
  const removeBibleHighlight = useUnfoldStore((s) => s.removeBibleHighlight);
  const isPremium = usePremiumAccessPolicy() === 'granted';

  const [selected, setSelected] = useState<Set<number>>(() => new Set());
  const [showPremiumSheet, setShowPremiumSheet] = useState(false);

  const chapterHighlights = useMemo(
    () => bibleHighlights.filter((h) => h.bookId === passage.bookId && h.chapter === passage.chapter),
    [bibleHighlights, passage.bookId, passage.chapter],
  );
  const colorMap = useMemo(() => buildVerseColorMap(chapterHighlights), [chapterHighlights]);

  const selectionHasHighlight = useMemo(
    () => Array.from(selected).some((v) => colorMap[v] !== undefined),
    [selected, colorMap],
  );

  const clearSelection = useCallback(() => setSelected(new Set()), []);

  const toggleVerse = useCallback((verse: number) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(verse)) next.delete(verse);
      else next.add(verse);
      return next;
    });
  }, []);

  const applyColor = useCallback((color: BibleHighlightColor) => {
    if (selected.size === 0) return;
    if (!isPremium && !isHighlightColorFree(color)) {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
      setShowPremiumSheet(true);
      return;
    }
    const plan = planHighlightApplication({
      chapterHighlights,
      selectedVerses: Array.from(selected),
      color,
      translation: passage.translation,
      bookId: passage.bookId,
      bookName: passage.bookName,
      chapter: passage.chapter,
      verseText: (v) => passage.verses.find((pv) => pv.verse === v)?.text ?? '',
    });
    for (const id of plan.toRemove) removeBibleHighlight(id);
    for (const h of plan.toAdd) addBibleHighlight(h);
    clearSelection();
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
  }, [selected, isPremium, chapterHighlights, passage, addBibleHighlight, removeBibleHighlight, clearSelection]);

  const removeSelected = useCallback(() => {
    const plan = planHighlightRemoval({
      chapterHighlights,
      selectedVerses: Array.from(selected),
      translation: passage.translation,
    });
    for (const id of plan.toRemove) removeBibleHighlight(id);
    clearSelection();
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
  }, [chapterHighlights, selected, passage.translation, removeBibleHighlight, clearSelection]);

  const selectionBg = isDark ? BIBLE_SELECTED_OVERLAY_BG.dark : BIBLE_SELECTED_OVERLAY_BG.light;
  const selectedText = isDark ? SELECTED_VERSE_TEXT.dark : SELECTED_VERSE_TEXT.light;

  return (
    <View>
      <Text style={[textStyle, { textAlign: 'left' }]} accessibilityHint="Tap a verse to highlight it">
        {'“'}
        {passage.verses.map((v, i) => {
          const isSelected = selected.has(v.verse);
          const hl = colorMap[v.verse];
          const backgroundColor = isSelected
            ? selectionBg
            : hl
              ? (isDark ? HIGHLIGHT_BG[hl].dark : HIGHLIGHT_BG[hl].light)
              : undefined;
          const color = isSelected ? selectedText : hl && isDark ? HIGHLIGHT_TEXT_DARK[hl] : textColor;
          const last = i === passage.verses.length - 1;
          return (
            <Text
              key={v.verse}
              onPress={() => toggleVerse(v.verse)}
              suppressHighlighting
              testID={`scripture-verse-${v.verse}`}
              accessibilityLabel={`Verse ${v.verse}${hl ? `, highlighted ${hl}` : ''}${isSelected ? ', selected' : ''}`}
              style={{ backgroundColor, color }}
            >
              {`${toSuperscript(v.verse)} ${v.text}${last ? '' : ' '}`}
            </Text>
          );
        })}
        {'”'}
      </Text>

      {selected.size > 0 && (
        <View style={styles.actionRow} testID="scripture-verse-actions">
          {selectionHasHighlight && (
            <TouchableOpacity
              onPress={removeSelected}
              style={styles.colorButton}
              hitSlop={8}
              testID="scripture-highlight-remove"
              accessibilityLabel="Remove highlight"
              accessibilityRole="button"
            >
              <View style={[styles.colorDot, { backgroundColor: mutedColor }]}>
                <XIcon size={9} color="#FFF" weight="bold" />
              </View>
            </TouchableOpacity>
          )}
          {HIGHLIGHT_COLORS.map((c) => {
            const locked = !isPremium && !isHighlightColorFree(c.key);
            return (
              <TouchableOpacity
                key={c.key}
                onPress={() => applyColor(c.key)}
                style={styles.colorButton}
                activeOpacity={0.7}
                hitSlop={8}
                testID={`scripture-highlight-color-${c.key}`}
                accessibilityLabel={locked ? `${c.key} highlight color, premium only` : `${c.key} highlight color`}
                accessibilityRole="button"
              >
                <View style={[styles.colorDot, { backgroundColor: c.color, opacity: locked ? 0.4 : 1 }]}>
                  {locked && <LockSimpleIcon size={10} color="#FFF" weight="fill" />}
                </View>
              </TouchableOpacity>
            );
          })}
          <TouchableOpacity
            onPress={clearSelection}
            style={styles.dismissButton}
            hitSlop={8}
            testID="scripture-selection-clear"
            accessibilityLabel="Clear verse selection"
            accessibilityRole="button"
          >
            <XIcon size={14} color={mutedColor} weight="bold" />
          </TouchableOpacity>
        </View>
      )}

      <PremiumFeatureSheet
        visible={showPremiumSheet}
        onClose={() => setShowPremiumSheet(false)}
        feature="highlight"
      />
    </View>
  );
}

const styles = StyleSheet.create({
  actionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: Spacing['3'],
    gap: Spacing['1'],
  },
  colorButton: {
    width: 36,
    height: 36,
    alignItems: 'center',
    justifyContent: 'center',
  },
  colorDot: {
    width: 22,
    height: 22,
    borderRadius: 11,
    alignItems: 'center',
    justifyContent: 'center',
  },
  dismissButton: {
    marginLeft: 'auto',
    width: 36,
    height: 36,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
