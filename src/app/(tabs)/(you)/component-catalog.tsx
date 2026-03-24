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
} from 'phosphor-react-native';
import { useTheme } from '@/lib/theme';
import { FontFamily } from '@/constants/fonts';
import { Spacing } from '@/constants/spacing';
import { Typography } from '@/constants/typography';
import { Button } from '@/components/ui';

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

  const handleLoadingDemo = () => {
    setLoadingDemo(true);
    setTimeout(() => setLoadingDemo(false), 2000);
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
