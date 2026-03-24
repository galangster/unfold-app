/**
 * Component Catalog — Dev-only screen for previewing design system components.
 * Accessible from Settings. Shows all variants, sizes, and states.
 */

import React, { useState } from 'react';
import {
  View,
  Text,
  ScrollView,
  StyleSheet,
  SafeAreaView,
  TouchableOpacity,
} from 'react-native';
import { useRouter } from 'expo-router';
import {
  PlusIcon,
  TrashIcon,
  GearSixIcon,
  ArrowLeftIcon,
  DownloadSimpleIcon,
  ShareNetworkIcon,
  HeartIcon,
  BookmarkSimpleIcon,
  PencilSimpleIcon,
  CheckIcon,
  XIcon,
  BookOpenIcon,
  FolderSimpleIcon,
  SparkleIcon,
  FireIcon,
  HeartStraightIcon,
  CompassIcon,
  ChatCircleIcon,
} from 'phosphor-react-native';
import { useTheme } from '@/lib/theme';
import { FontFamily } from '@/constants/fonts';
import { Spacing } from '@/constants/spacing';
import { Typography } from '@/constants/typography';
import { Button, Card, Chip, Input, Sheet } from '@/components/ui';
import { MagnifyingGlassIcon } from 'phosphor-react-native';

// ---------------------------------------------------------------------------
// Section Header
// ---------------------------------------------------------------------------

function SectionTitle({ title }: { title: string }) {
  const { colors } = useTheme();
  return (
    <Text style={[Typography.label, { color: colors.textMuted, marginBottom: Spacing[3], marginTop: Spacing[8] }]}>
      {title}
    </Text>
  );
}

function SubLabel({ text }: { text: string }) {
  const { colors } = useTheme();
  return (
    <Text style={[Typography.caption, { color: colors.textHint, marginBottom: Spacing[2] }]}>
      {text}
    </Text>
  );
}

// ---------------------------------------------------------------------------
// Catalog Screen
// ---------------------------------------------------------------------------

export default function ComponentCatalogScreen() {
  const { colors, isDark } = useTheme();
  const router = useRouter();
  const [loadingDemo, setLoadingDemo] = useState(false);
  const [selectedFilters, setSelectedFilters] = useState<Set<string>>(new Set(['All Notes']));
  const [selectedThemes, setSelectedThemes] = useState<string[]>([]);
  const [inputBasic, setInputBasic] = useState('');
  const [inputSearch, setInputSearch] = useState('');
  const [inputLabeled, setInputLabeled] = useState('');
  const [inputError, setInputError] = useState('too short');
  const [inputMultiline, setInputMultiline] = useState('');
  const [sheetBasic, setSheetBasic] = useState(false);
  const [sheetForm, setSheetForm] = useState(false);

  const handleLoadingDemo = () => {
    setLoadingDemo(true);
    setTimeout(() => setLoadingDemo(false), 2000);
  };

  const toggleFilter = (name: string) => {
    setSelectedFilters((prev) => {
      const next = new Set(prev);
      if (next.has(name)) next.delete(name);
      else next.add(name);
      return next;
    });
  };

  const toggleTheme = (name: string) => {
    setSelectedThemes((prev) => {
      if (prev.includes(name)) return prev.filter((t) => t !== name);
      if (prev.length >= 5) return prev;
      return [...prev, name];
    });
  };

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} hitSlop={8}>
          <ArrowLeftIcon size={22} weight="light" color={colors.text} />
        </TouchableOpacity>
        <Text style={[Typography.displaySm, { color: colors.text, marginLeft: Spacing[3] }]}>
          Component Catalog
        </Text>
      </View>

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        {/* ============================================================= */}
        {/* BUTTON — VARIANTS                                             */}
        {/* ============================================================= */}

        <SectionTitle title="BUTTON — VARIANTS" />

        <SubLabel text="Primary (main CTAs)" />
        <View style={styles.row}>
          <Button variant="primary" label="Create Folder" onPress={() => {}} />
        </View>

        <SubLabel text="Secondary (settings, filters)" />
        <View style={styles.row}>
          <Button variant="secondary" label="Medium" onPress={() => {}} />
          <Button variant="secondary" label="Large" onPress={() => {}} />
        </View>

        <SubLabel text="Ghost (cancel, edit, done)" />
        <View style={styles.row}>
          <Button variant="ghost" label="Cancel" onPress={() => {}} />
          <Button variant="ghost" label="Edit" onPress={() => {}} />
          <Button variant="ghost" label="Done" onPress={() => {}} />
        </View>

        <SubLabel text="Destructive (filled)" />
        <View style={styles.row}>
          <Button variant="destructive" label="Delete Account" onPress={() => {}} />
        </View>

        <SubLabel text="Destructive (ghost)" />
        <View style={styles.row}>
          <Button variant="destructive" destructiveStyle="ghost" label="Remove" onPress={() => {}} />
        </View>

        <SubLabel text="Icon-only" />
        <View style={styles.row}>
          <Button variant="icon" icon={<PlusIcon />} size="sm" accessibilityLabel="Add" onPress={() => {}} />
          <Button variant="icon" icon={<PlusIcon />} size="md" accessibilityLabel="Add" onPress={() => {}} />
          <Button variant="icon" icon={<GearSixIcon />} size="md" accessibilityLabel="Settings" onPress={() => {}} />
          <Button variant="icon" icon={<TrashIcon />} size="md" accessibilityLabel="Delete" onPress={() => {}} />
        </View>

        {/* ============================================================= */}
        {/* BUTTON — SIZES                                                */}
        {/* ============================================================= */}

        <SectionTitle title="BUTTON — SIZES" />

        <SubLabel text="Large (full-width CTAs)" />
        <Button variant="primary" size="lg" label="Continue" fullWidth onPress={() => {}} />
        <View style={{ height: Spacing[3] }} />

        <SubLabel text="Medium (default)" />
        <View style={styles.row}>
          <Button variant="primary" size="md" label="Save" onPress={() => {}} />
          <Button variant="secondary" size="md" label="Cancel" onPress={() => {}} />
        </View>

        <SubLabel text="Small (compact)" />
        <View style={styles.row}>
          <Button variant="primary" size="sm" label="Add" onPress={() => {}} />
          <Button variant="secondary" size="sm" label="Filter" onPress={() => {}} />
          <Button variant="ghost" size="sm" label="More" onPress={() => {}} />
        </View>

        {/* ============================================================= */}
        {/* BUTTON — STATES                                               */}
        {/* ============================================================= */}

        <SectionTitle title="BUTTON — STATES" />

        <SubLabel text="Disabled" />
        <View style={styles.row}>
          <Button variant="primary" label="Disabled Primary" disabled onPress={() => {}} />
          <Button variant="ghost" label="Disabled Ghost" disabled onPress={() => {}} />
        </View>

        <SubLabel text="Loading (tap to demo — 2s)" />
        <View style={styles.row}>
          <Button variant="primary" label="Submit" loading={loadingDemo} onPress={handleLoadingDemo} />
          <Button variant="secondary" label="Sync" loading={loadingDemo} onPress={handleLoadingDemo} />
        </View>

        {/* ============================================================= */}
        {/* BUTTON — WITH ICONS                                           */}
        {/* ============================================================= */}

        <SectionTitle title="BUTTON — WITH ICONS" />

        <SubLabel text="Icon left (default)" />
        <View style={styles.row}>
          <Button variant="primary" label="Download" icon={<DownloadSimpleIcon />} onPress={() => {}} />
          <Button variant="secondary" label="Share" icon={<ShareNetworkIcon />} onPress={() => {}} />
        </View>

        <SubLabel text="Icon right" />
        <View style={styles.row}>
          <Button variant="ghost" label="Favorite" icon={<HeartIcon />} iconPosition="right" onPress={() => {}} />
          <Button variant="ghost" label="Bookmark" icon={<BookmarkSimpleIcon />} iconPosition="right" onPress={() => {}} />
        </View>

        {/* ============================================================= */}
        {/* BUTTON — REAL-WORLD EXAMPLES                                  */}
        {/* ============================================================= */}

        <SectionTitle title="REAL-WORLD EXAMPLES" />

        <SubLabel text="Create Folder dialog" />
        <View style={[styles.exampleCard, { backgroundColor: colors.backgroundElevated, borderColor: colors.border }]}>
          <Button variant="primary" size="lg" label="Create Folder" fullWidth onPress={() => {}} />
          <View style={{ height: Spacing[3] }} />
          <Button variant="ghost" size="md" label="Cancel" onPress={() => {}} />
        </View>

        <SubLabel text="Note editor toolbar" />
        <View style={[styles.exampleCard, { backgroundColor: colors.backgroundElevated, borderColor: colors.border }]}>
          <View style={[styles.row, { justifyContent: 'space-between' }]}>
            <Button variant="ghost" label="Cancel" size="sm" onPress={() => {}} />
            <Button variant="ghost" label="Done" size="sm" onPress={() => {}} />
          </View>
        </View>

        <SubLabel text="Destructive confirmation" />
        <View style={[styles.exampleCard, { backgroundColor: colors.backgroundElevated, borderColor: colors.border }]}>
          <Button variant="destructive" size="lg" label="Delete Account" icon={<TrashIcon />} fullWidth onPress={() => {}} />
          <View style={{ height: Spacing[3] }} />
          <Button variant="ghost" label="Never mind" onPress={() => {}} />
        </View>

        <SubLabel text="Settings action row" />
        <View style={[styles.exampleCard, { backgroundColor: colors.backgroundElevated, borderColor: colors.border }]}>
          <View style={styles.row}>
            <Button variant="icon" icon={<PencilSimpleIcon />} size="sm" accessibilityLabel="Edit" onPress={() => {}} />
            <Button variant="icon" icon={<ShareNetworkIcon />} size="sm" accessibilityLabel="Share" onPress={() => {}} />
            <Button variant="icon" icon={<BookmarkSimpleIcon />} size="sm" accessibilityLabel="Bookmark" onPress={() => {}} />
            <Button variant="icon" icon={<TrashIcon />} size="sm" accessibilityLabel="Delete" onPress={() => {}} />
          </View>
        </View>

        {/* ============================================================= */}
        {/* CHIP — VARIANTS                                               */}
        {/* ============================================================= */}

        <SectionTitle title="CHIP — FILTER VARIANT" />

        <SubLabel text="Folder filter pills (tap to toggle)" />
        <View style={styles.row}>
          <Chip variant="filter" label="All Notes" selected={selectedFilters.has('All Notes')} onPress={() => toggleFilter('All Notes')} />
          <Chip variant="filter" label="Prayers" selected={selectedFilters.has('Prayers')} colorDot="#6DAF7B" onPress={() => toggleFilter('Prayers')} />
          <Chip variant="filter" label="Reflections" selected={selectedFilters.has('Reflections')} colorDot="#D4828F" onPress={() => toggleFilter('Reflections')} />
          <Chip variant="filter" label="Sermons" selected={selectedFilters.has('Sermons')} colorDot="#5B9BD5" onPress={() => toggleFilter('Sermons')} />
        </View>

        <SubLabel text="Theme selection with badges (tap to select, max 5)" />
        <View style={styles.row}>
          {[
            { name: 'Identity', icon: <SparkleIcon /> },
            { name: 'Purpose', icon: <CompassIcon /> },
            { name: 'Anxiety', icon: <FireIcon /> },
            { name: 'Relationships', icon: <HeartStraightIcon /> },
          ].map((theme) => {
            const idx = selectedThemes.indexOf(theme.name);
            return (
              <Chip
                key={theme.name}
                variant="filter"
                label={theme.name}
                icon={theme.icon}
                selected={idx >= 0}
                badge={idx >= 0 ? idx + 1 : undefined}
                onPress={() => toggleTheme(theme.name)}
              />
            );
          })}
        </View>

        <SectionTitle title="CHIP — SUGGESTION VARIANT" />

        <SubLabel text="Companion follow-up prompts" />
        <View style={styles.row}>
          <Chip variant="suggestion" label="Tell me more about grace" onPress={() => {}} />
          <Chip variant="suggestion" label="How do I pray about this?" onPress={() => {}} />
          <Chip variant="suggestion" label="What does Scripture say?" onPress={() => {}} />
        </View>

        <SectionTitle title="CHIP — REFERENCE VARIANT" />

        <SubLabel text="Scripture reference pills (md)" />
        <View style={styles.row}>
          <Chip variant="reference" label="Romans 8:28" icon={<BookOpenIcon />} onPress={() => {}} />
          <Chip variant="reference" label="Psalm 23:1-4" icon={<BookOpenIcon />} onPress={() => {}} />
          <Chip variant="reference" label="John 3:16" icon={<BookOpenIcon />} onPress={() => {}} />
        </View>

        <SubLabel text="Scripture reference pills (sm — compact inline)" />
        <View style={styles.row}>
          <Chip variant="reference" size="sm" label="Gen 1:1" icon={<BookOpenIcon />} onPress={() => {}} />
          <Chip variant="reference" size="sm" label="Rev 22:21" icon={<BookOpenIcon />} onPress={() => {}} />
        </View>

        <SectionTitle title="CHIP — STATES" />

        <SubLabel text="Disabled" />
        <View style={styles.row}>
          <Chip variant="filter" label="Disabled Filter" disabled onPress={() => {}} />
          <Chip variant="suggestion" label="Disabled Suggestion" disabled onPress={() => {}} />
          <Chip variant="reference" label="Disabled Ref" disabled icon={<BookOpenIcon />} onPress={() => {}} />
        </View>

        <SectionTitle title="CHIP — REAL-WORLD EXAMPLES" />

        <SubLabel text="Notebook folder bar" />
        <View style={[styles.exampleCard, { backgroundColor: colors.backgroundElevated, borderColor: colors.border }]}>
          <View style={styles.row}>
            <Chip variant="filter" label="All" selected onPress={() => {}} />
            <Chip variant="filter" label="Morning" colorDot="#C8A55C" onPress={() => {}} />
            <Chip variant="filter" label="Evening" colorDot="#9B8EC4" onPress={() => {}} />
            <Chip variant="filter" label="Study" colorDot="#5B9BD5" onPress={() => {}} />
          </View>
        </View>

        <SubLabel text="Companion chat suggestions" />
        <View style={[styles.exampleCard, { backgroundColor: colors.backgroundElevated, borderColor: colors.border }]}>
          <View style={[styles.row, { marginBottom: 0 }]}>
            <Chip variant="suggestion" label="Pray with me" icon={<ChatCircleIcon />} onPress={() => {}} />
            <Chip variant="suggestion" label="Explain this verse" icon={<BookOpenIcon />} onPress={() => {}} />
          </View>
        </View>

        <SubLabel text="Inline scripture references" />
        <View style={[styles.exampleCard, { backgroundColor: colors.backgroundElevated, borderColor: colors.border }]}>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: Spacing[2] }}>
            <Text style={[Typography.bodySm, { color: colors.text }]}>Referenced in</Text>
            <Chip variant="reference" size="sm" label="Matt 5:4" icon={<BookOpenIcon />} onPress={() => {}} />
            <Text style={[Typography.bodySm, { color: colors.text }]}>and</Text>
            <Chip variant="reference" size="sm" label="Ps 34:18" icon={<BookOpenIcon />} onPress={() => {}} />
          </View>
        </View>

        {/* ============================================================= */}
        {/* CARD — VARIANTS                                               */}
        {/* ============================================================= */}

        <SectionTitle title="CARD — VARIANTS" />

        <SubLabel text="Default (elevated surface, shadow)" />
        <Card variant="default" style={{ marginBottom: Spacing[4] }}>
          <Text style={[Typography.uiMd, { color: colors.text, marginBottom: Spacing[1] }]}>
            Morning Reflections
          </Text>
          <Text style={[Typography.bodySm, { color: colors.textMuted }]} numberOfLines={2}>
            Today I'm grateful for the quiet moments before the day begins...
          </Text>
        </Card>

        <SubLabel text="Subtle (muted background, no shadow)" />
        <Card variant="subtle" style={{ marginBottom: Spacing[4] }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: Spacing[2] }}>
            <FireIcon size={18} weight="light" color={colors.accent} />
            <Text style={[Typography.uiMd, { color: colors.text }]}>3 Day Streak</Text>
          </View>
          <Text style={[Typography.caption, { color: colors.textMuted, marginTop: Spacing[1] }]}>
            Keep showing up — consistency beats intensity.
          </Text>
        </Card>

        <SubLabel text="Accent (tinted background + border)" />
        <Card variant="accent" style={{ marginBottom: Spacing[4] }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: Spacing[2] }}>
            <SparkleIcon size={16} weight="light" color={colors.accent} />
            <Text style={[Typography.uiSm, { color: colors.accent }]}>PREMIUM</Text>
          </View>
          <Text style={[Typography.bodySm, { color: colors.text, marginTop: Spacing[1] }]}>
            Unlock unlimited series, themes, and more.
          </Text>
        </Card>

        <SubLabel text="Elevated (strong shadow, no border)" />
        <Card variant="elevated" style={{ marginBottom: Spacing[4] }}>
          <Text style={[Typography.uiMd, { color: colors.text, marginBottom: Spacing[1] }]}>
            Floating Card
          </Text>
          <Text style={[Typography.bodySm, { color: colors.textMuted }]}>
            For toasts, overlays, and floating UI elements.
          </Text>
        </Card>

        <SectionTitle title="CARD — PRESSABLE" />

        <SubLabel text="Tap to interact (haptic feedback)" />
        <Card variant="default" onPress={() => {}} style={{ marginBottom: Spacing[4] }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
            <View style={{ flex: 1 }}>
              <Text style={[Typography.uiMd, { color: colors.text }]}>Identity in Christ</Text>
              <Text style={[Typography.caption, { color: colors.textMuted, marginTop: 2 }]}>Day 3 of 14</Text>
            </View>
            <Text style={[Typography.caption, { color: colors.accent }]}>Continue</Text>
          </View>
        </Card>

        <SectionTitle title="CARD — REAL-WORLD EXAMPLES" />

        <SubLabel text="Note card" />
        <Card variant="default" onPress={() => {}} style={{ marginBottom: Spacing[4] }}>
          <Text style={[Typography.uiMd, { color: colors.text, marginBottom: Spacing['0.5'] }]}>
            Prayer for patience
          </Text>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: Spacing[1], marginBottom: Spacing[1] }}>
            <Chip variant="reference" size="sm" label="James 1:2-4" icon={<BookOpenIcon />} onPress={() => {}} />
          </View>
          <Text style={[Typography.bodySm, { color: colors.textMuted }]} numberOfLines={2}>
            Lord, help me find joy in trials knowing that testing produces perseverance...
          </Text>
        </Card>

        <SubLabel text="Premium nudge" />
        <Card variant="accent" style={{ marginBottom: Spacing[4] }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: Spacing[3] }}>
            <View style={{ width: 34, height: 34, borderRadius: 10, backgroundColor: colors.accent + '14', alignItems: 'center', justifyContent: 'center' }}>
              <SparkleIcon size={18} weight="light" color={colors.accent} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={[Typography.uiSm, { color: colors.text }]}>Go deeper with Premium</Text>
              <Text style={[Typography.caption, { color: colors.textMuted }]}>Unlock all study methods</Text>
            </View>
          </View>
        </Card>

        <SubLabel text="Reflection prompt" />
        <Card variant="accent" padding={14} style={{ marginBottom: Spacing[4] }}>
          <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: Spacing[2] }}>
            <PencilSimpleIcon size={16} weight="light" color={colors.accent} style={{ marginTop: 2 }} />
            <Text style={[Typography.bodySm, { color: colors.text, flex: 1 }]}>
              What does it mean to you that God's mercies are new every morning?
            </Text>
          </View>
        </Card>

        {/* ============================================================= */}
        {/* INPUT — VARIANTS                                              */}
        {/* ============================================================= */}

        <SectionTitle title="INPUT — BASIC" />

        <SubLabel text="Default single-line" />
        <Input
          placeholder="Folder name"
          value={inputBasic}
          onChangeText={setInputBasic}
          maxLength={40}
          showCount
          wrapperStyle={{ marginBottom: Spacing[4] }}
        />

        <SubLabel text="With search icon + clearable" />
        <Input
          placeholder="Search lessons..."
          icon={<MagnifyingGlassIcon />}
          clearable
          value={inputSearch}
          onChangeText={setInputSearch}
          wrapperStyle={{ marginBottom: Spacing[4] }}
        />

        <SubLabel text="With label" />
        <Input
          label="DISPLAY NAME"
          placeholder="Your name"
          value={inputLabeled}
          onChangeText={setInputLabeled}
          autoCapitalize="words"
          wrapperStyle={{ marginBottom: Spacing[4] }}
        />

        <SubLabel text="Error state" />
        <Input
          label="PASSWORD"
          placeholder="Enter password"
          value={inputError}
          onChangeText={setInputError}
          error="Must be at least 8 characters"
          secureTextEntry
          wrapperStyle={{ marginBottom: Spacing[4] }}
        />

        <SectionTitle title="INPUT — MULTILINE" />

        <SubLabel text="Auto-growing textarea with character count" />
        <Input
          placeholder="Write your reflection..."
          multiline
          value={inputMultiline}
          onChangeText={setInputMultiline}
          maxLength={500}
          showCount
          wrapperStyle={{ marginBottom: Spacing[4] }}
        />

        <SectionTitle title="INPUT — REAL-WORLD EXAMPLES" />

        <SubLabel text="Create folder dialog" />
        <Card variant="default" style={{ marginBottom: Spacing[4] }}>
          <Input
            placeholder="Folder name"
            value=""
            onChangeText={() => {}}
            maxLength={40}
            autoCapitalize="sentences"
            wrapperStyle={{ marginBottom: Spacing[3] }}
          />
          <Button variant="primary" size="lg" label="Create" fullWidth onPress={() => {}} />
        </Card>

        <SubLabel text="Search with results" />
        <Card variant="default" style={{ marginBottom: Spacing[4] }}>
          <Input
            icon={<MagnifyingGlassIcon />}
            clearable
            placeholder="Search scripture..."
            value="Romans 8"
            onChangeText={() => {}}
            wrapperStyle={{ marginBottom: Spacing[3] }}
          />
          <Chip variant="reference" label="Romans 8:28" icon={<BookOpenIcon />} onPress={() => {}} />
        </Card>

        {/* ============================================================= */}
        {/* SHEET — BOTTOM SHEET                                          */}
        {/* ============================================================= */}

        <SectionTitle title="SHEET — BOTTOM SHEET" />

        <SubLabel text="Basic sheet (tap to open)" />
        <View style={styles.row}>
          <Button variant="secondary" label="Open Sheet" onPress={() => setSheetBasic(true)} />
        </View>

        <SubLabel text="Form sheet (tap to open)" />
        <View style={styles.row}>
          <Button variant="secondary" label="Open Form Sheet" onPress={() => setSheetForm(true)} />
        </View>

        {/* Basic Sheet */}
        <Sheet visible={sheetBasic} onClose={() => setSheetBasic(false)}>
          <Text style={[Typography.displaySm, { color: colors.text, marginBottom: Spacing[3] }]}>
            Basic Sheet
          </Text>
          <Text style={[Typography.bodyMd, { color: colors.textMuted, marginBottom: Spacing[6] }]}>
            Swipe down or tap the backdrop to dismiss. The sheet slides up with a 340ms ease-out cubic animation and dismisses in 180ms.
          </Text>
          <Button variant="primary" label="Got it" fullWidth onPress={() => setSheetBasic(false)} />
        </Sheet>

        {/* Form Sheet */}
        <Sheet visible={sheetForm} onClose={() => setSheetForm(false)}>
          <Text style={[Typography.displaySm, { color: colors.text, marginBottom: Spacing[3] }]}>
            Create Folder
          </Text>
          <Input
            label="FOLDER NAME"
            placeholder="e.g. Morning Prayers"
            value=""
            onChangeText={() => {}}
            maxLength={40}
            wrapperStyle={{ marginBottom: Spacing[4] }}
          />
          <View style={{ flexDirection: 'row', gap: Spacing[3] }}>
            <View style={{ flex: 1 }}>
              <Button variant="ghost" label="Cancel" fullWidth onPress={() => setSheetForm(false)} />
            </View>
            <View style={{ flex: 1 }}>
              <Button variant="primary" label="Create" fullWidth onPress={() => setSheetForm(false)} />
            </View>
          </View>
        </Sheet>

        {/* ============================================================= */}
        {/* TYPOGRAPHY PRESETS                                             */}
        {/* ============================================================= */}

        <SectionTitle title="TYPOGRAPHY PRESETS" />

        <Text style={[Typography.displayLg, { color: colors.text, marginBottom: Spacing[2] }]}>
          Display Large (36)
        </Text>
        <Text style={[Typography.displayMd, { color: colors.text, marginBottom: Spacing[2] }]}>
          Display Medium (24)
        </Text>
        <Text style={[Typography.displaySm, { color: colors.text, marginBottom: Spacing[4] }]}>
          Display Small (20)
        </Text>

        <Text style={[Typography.bodyLg, { color: colors.text, marginBottom: Spacing[2] }]}>
          Body Large — For emphasized reading content (18px)
        </Text>
        <Text style={[Typography.bodyMd, { color: colors.text, marginBottom: Spacing[2] }]}>
          Body Medium — Default paragraph text throughout the app (16px)
        </Text>
        <Text style={[Typography.bodySm, { color: colors.text, marginBottom: Spacing[4] }]}>
          Body Small — Secondary descriptions and metadata (14px)
        </Text>

        <Text style={[Typography.uiLg, { color: colors.text, marginBottom: Spacing[2] }]}>
          UI Large — Button labels, SemiBold (16px)
        </Text>
        <Text style={[Typography.uiMd, { color: colors.text, marginBottom: Spacing[2] }]}>
          UI Medium — Controls, tabs, Medium weight (14px)
        </Text>
        <Text style={[Typography.uiSm, { color: colors.text, marginBottom: Spacing[2] }]}>
          UI Small — Compact labels, Regular weight (12px)
        </Text>
        <Text style={[Typography.caption, { color: colors.textMuted, marginBottom: Spacing[2] }]}>
          Caption — Hints, timestamps, secondary info (11px)
        </Text>
        <Text style={[Typography.label, { color: colors.textMuted, marginBottom: Spacing[2] }]}>
          LABEL — SECTION HEADERS, UPPERCASE (11px)
        </Text>

        {/* Bottom padding */}
        <View style={{ height: Spacing[16] }} />
      </ScrollView>
    </SafeAreaView>
  );
}

// ---------------------------------------------------------------------------
// Styles
// ---------------------------------------------------------------------------

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: Spacing[6],
    paddingVertical: Spacing[4],
  },
  scroll: {
    flex: 1,
  },
  scrollContent: {
    paddingHorizontal: Spacing[6],
    paddingBottom: Spacing[12],
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing[3],
    marginBottom: Spacing[4],
    flexWrap: 'wrap',
  },
  exampleCard: {
    padding: Spacing[5],
    borderRadius: 16,
    borderWidth: 1,
    marginBottom: Spacing[4],
    alignItems: 'center',
  },
});
