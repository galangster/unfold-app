import { useCallback } from 'react';
import { View, Text, ScrollView, TouchableOpacity, StyleSheet } from 'react-native';
import * as Haptics from 'expo-haptics';
import { FontFamily } from '@/constants/fonts';
import { useTheme } from '@/lib/theme';

import { NoteCategory } from '@/lib/store';

export type { NoteCategory };

type CategoryFilter = NoteCategory | 'all';

interface CategoryPillsProps {
  selectedCategory: CategoryFilter;
  onSelectCategory: (category: CategoryFilter) => void;
  /** Remove left padding when used inline alongside other elements */
  compact?: boolean;
}

const CATEGORIES: { key: CategoryFilter; label: string }[] = [
  { key: 'all', label: 'All' },
  { key: 'sermon', label: 'Sermon' },
  { key: 'quiet-time', label: 'Quiet Time' },
  { key: 'study', label: 'Study' },
  { key: 'prayer', label: 'Prayer' },
  { key: 'general', label: 'General' },
];

/**
 * Horizontal scrollable filter pills for notebook categories.
 * "All" pill uses an inverted style when active (solid text color bg).
 * Other pills use accent-tinted background when active.
 */
export function CategoryPills({ selectedCategory, onSelectCategory, compact = false }: CategoryPillsProps) {
  const { colors } = useTheme();

  return (
    <View>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={[
          styles.scrollContent,
          compact && { paddingHorizontal: 0, paddingRight: 24 },
        ]}
        style={styles.scrollContainer}
      >
        {CATEGORIES.map((cat) => (
          <CategoryPill
            key={cat.key}
            categoryKey={cat.key}
            label={cat.label}
            isActive={selectedCategory === cat.key}
            onPress={onSelectCategory}
            colors={colors}
          />
        ))}
      </ScrollView>
    </View>
  );
}

interface CategoryPillProps {
  categoryKey: CategoryFilter;
  label: string;
  isActive: boolean;
  onPress: (category: CategoryFilter) => void;
  colors: ReturnType<typeof useTheme>['colors'];
}

function CategoryPill({ categoryKey, label, isActive, onPress, colors }: CategoryPillProps) {
  const handlePress = useCallback(() => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    onPress(categoryKey);
  }, [categoryKey, onPress]);

  const pillBg = isActive
    ? colors.accent + '18'
    : colors.buttonBackground;

  const pillBorder = isActive
    ? colors.accent + '40'
    : colors.border;

  const pillTextColor = isActive ? colors.accent : colors.textMuted;

  const pillFontFamily = isActive ? FontFamily.uiMedium : FontFamily.ui;

  return (
    <TouchableOpacity
      onPress={handlePress}
      activeOpacity={0.7}
      accessibilityRole="button"
      accessibilityLabel={`Filter by ${label}`}
      accessibilityState={{ selected: isActive }}
    >
      <View
        style={[
          styles.pill,
          {
            backgroundColor: pillBg,
            borderColor: pillBorder,
          },
        ]}
      >
        <Text
          style={[
            styles.pillText,
            {
              fontFamily: pillFontFamily,
              color: pillTextColor,
            },
          ]}
        >
          {label}
        </Text>
      </View>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  scrollContainer: {
    flexGrow: 0,
  },
  scrollContent: {
    paddingHorizontal: 24,
    gap: 8,
    flexDirection: 'row',
    alignItems: 'center',
  },
  pill: {
    height: 32,
    paddingHorizontal: 14,
    paddingVertical: 6,
    borderRadius: 16,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  pillText: {
    fontSize: 13,
    lineHeight: 18,
  },
});
