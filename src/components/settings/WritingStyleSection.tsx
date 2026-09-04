import { useState } from 'react';
import { View, Text } from 'react-native';
import { TouchableOpacity } from 'react-native-gesture-handler';
import Animated, { FadeIn, useReducedMotion } from 'react-native-reanimated';
import * as Haptics from 'expo-haptics';
import {
  ChatDotsIcon,
  StackIcon,
  CompassIcon,
  HourglassIcon,
  CaretDownIcon,
} from '@/components/icons';
import { Duration, Ease } from '@/constants/animations';
import { FontFamily, FontSize } from '@/constants/fonts';
import { Radius } from '@/constants/radius';
import { Spacing } from '@/constants/spacing';
import { useTheme } from '@/lib/theme';
import {
  useUnfoldStore,
  WritingTone,
  ContentDepth,
  FaithBackground,
  LifeStage,
} from '@/lib/store';
import { SettingsSectionHeader, getSettingsCardStyle } from './SettingsSectionHeader';

const TONE_OPTIONS: { value: WritingTone; label: string; description: string }[] = [
  { value: 'warm', label: 'Like a friend', description: 'Gentle, encouraging, and personal' },
  { value: 'direct', label: 'Straight to the point', description: 'Clear, practical, and actionable' },
  { value: 'poetic', label: 'With beauty', description: 'Lyrical, contemplative, and evocative' },
];

const DEPTH_OPTIONS: { value: ContentDepth; label: string; description: string }[] = [
  { value: 'simple', label: 'Keep it simple', description: 'Clear truth without complexity' },
  { value: 'balanced', label: 'A good balance', description: 'Substance with accessibility' },
  { value: 'theological', label: 'Take me deeper', description: 'Rich study with historical context' },
];

const FAITH_OPTIONS: { value: FaithBackground; label: string; description: string }[] = [
  { value: 'new', label: "I'm exploring", description: 'New to faith or rediscovering it' },
  { value: 'growing', label: "I'm growing", description: 'Familiar with faith, deepening understanding' },
  { value: 'mature', label: "I'm grounded", description: 'Well-versed and seeking deeper study' },
];

const LIFE_STAGE_OPTIONS: { value: LifeStage; label: string; description: string }[] = [
  { value: 'student', label: "I'm a student", description: 'Figuring things out and finding my footing' },
  { value: 'building', label: "I'm building my life", description: 'Career, relationships, and big decisions' },
  { value: 'midlife', label: "I'm in the thick of it", description: 'Family, work, and a thousand responsibilities' },
  { value: 'reflective', label: "I'm in a reflective season", description: 'Looking back, looking forward, finding meaning' },
];

export function WritingStyleSection() {
  const { colors } = useTheme();
  const reducedMotion = useReducedMotion();
  const user = useUnfoldStore((s) => s.user);
  const updateUser = useUnfoldStore((s) => s.updateUser);

  const [expandedPreference, setExpandedPreference] = useState<'tone' | 'depth' | 'faith' | 'lifeStage' | null>(null);

  return (
    <>
      <SettingsSectionHeader label="Writing Style" />

      <Text
        style={{
          fontFamily: FontFamily.ui,
          fontSize: FontSize.xs,
          color: colors.textMuted,
          marginBottom: Spacing['3'],
        }}
      >
        Applies to readings written from now on. Today's reading stays as it is.
      </Text>

      <View style={getSettingsCardStyle(colors)}>
        {/* Tone */}
        <TouchableOpacity activeOpacity={0.7}
          onPress={() => {
            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
            setExpandedPreference(expandedPreference === 'tone' ? null : 'tone');
          }}
          accessibilityRole="button"
          accessibilityLabel="Tone"
          accessibilityState={{ expanded: expandedPreference === 'tone' }}
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            padding: Spacing['4'],
            borderBottomWidth: 1,
            borderBottomColor: colors.border,
          }}
        >
          <View
            style={{
              width: 36,
              height: 36,
              borderRadius: Radius.chip,
              backgroundColor: colors.buttonBackground,
              justifyContent: 'center',
              alignItems: 'center',
            }}
          >
            <ChatDotsIcon size={18} color={colors.text} weight="light" />
          </View>
          <View style={{ marginLeft: Spacing['3.5'], flex: 1 }}>
            <Text style={{ fontFamily: FontFamily.ui, fontSize: 15, color: colors.text }}>
              Tone
            </Text>
            <Text style={{ fontFamily: FontFamily.ui, fontSize: FontSize.xs, color: colors.textMuted, marginTop: Spacing['0.5'] }}>
              {TONE_OPTIONS.find((o) => o.value === user?.writingStyle?.tone)?.label ?? 'Like a friend'}
            </Text>
          </View>
          <CaretDownIcon
            size={20}
            color={colors.textMuted}
            weight="light"
            style={{ transform: [{ rotate: expandedPreference === 'tone' ? '180deg' : '0deg' }] }}
          />
        </TouchableOpacity>

        {expandedPreference === 'tone' && (
          <Animated.View entering={reducedMotion ? undefined : FadeIn.duration(Duration.normal).easing(Ease.out)} style={{ padding: Spacing['2'] }}>
            {TONE_OPTIONS.map((option) => {
              const isSelected = user?.writingStyle?.tone === option.value;
              return (
                <TouchableOpacity activeOpacity={0.7}
                  key={option.value}
                  accessibilityRole="button"
                  accessibilityLabel={option.label}
                  accessibilityState={{ selected: isSelected }}
                  onPress={() => {
                    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                    updateUser({
                      writingStyle: {
                        ...user?.writingStyle,
                        tone: option.value,
                        depth: user?.writingStyle?.depth ?? 'balanced',
                        faithBackground: user?.writingStyle?.faithBackground ?? 'growing',
                      },
                    });
                  }}
                  style={{
                    backgroundColor: isSelected ? colors.buttonBackgroundPressed : 'transparent',
                    paddingVertical: Spacing['3'],
                    paddingHorizontal: Spacing['3'],
                    borderRadius: 10,
                    flexDirection: 'row',
                    alignItems: 'center',
                    marginBottom: Spacing['1'],
                  }}
                >
                  <View style={{ flex: 1 }}>
                    <Text style={{ fontFamily: FontFamily.uiMedium, fontSize: 15, color: colors.text }}>
                      {option.label}
                    </Text>
                    <Text style={{ fontFamily: FontFamily.ui, fontSize: FontSize.xs, color: colors.textMuted, marginTop: Spacing['0.5'] }}>
                      {option.description}
                    </Text>
                  </View>
                  <View
                    style={{
                      width: 20, height: 20, borderRadius: 10,
                      borderWidth: 2,
                      borderColor: isSelected ? colors.text : colors.border,
                      backgroundColor: isSelected ? colors.text : 'transparent',
                      justifyContent: 'center', alignItems: 'center',
                    }}
                  >
                    {isSelected && (
                      <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: colors.background }} />
                    )}
                  </View>
                </TouchableOpacity>
              );
            })}
          </Animated.View>
        )}

        {/* Depth */}
        <TouchableOpacity activeOpacity={0.7}
          onPress={() => {
            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
            setExpandedPreference(expandedPreference === 'depth' ? null : 'depth');
          }}
          accessibilityRole="button"
          accessibilityLabel="Depth"
          accessibilityState={{ expanded: expandedPreference === 'depth' }}
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            padding: Spacing['4'],
            borderBottomWidth: 1,
            borderBottomColor: colors.border,
          }}
        >
          <View
            style={{
              width: 36, height: 36, borderRadius: Radius.chip,
              backgroundColor: colors.buttonBackground,
              justifyContent: 'center', alignItems: 'center',
            }}
          >
            <StackIcon size={18} color={colors.text} weight="light" />
          </View>
          <View style={{ marginLeft: Spacing['3.5'], flex: 1 }}>
            <Text style={{ fontFamily: FontFamily.ui, fontSize: 15, color: colors.text }}>
              Depth
            </Text>
            <Text style={{ fontFamily: FontFamily.ui, fontSize: FontSize.xs, color: colors.textMuted, marginTop: Spacing['0.5'] }}>
              {DEPTH_OPTIONS.find((o) => o.value === user?.writingStyle?.depth)?.label ?? 'A good balance'}
            </Text>
          </View>
          <CaretDownIcon
            size={20}
            color={colors.textMuted}
            weight="light"
            style={{ transform: [{ rotate: expandedPreference === 'depth' ? '180deg' : '0deg' }] }}
          />
        </TouchableOpacity>

        {expandedPreference === 'depth' && (
          <Animated.View entering={reducedMotion ? undefined : FadeIn.duration(Duration.normal).easing(Ease.out)} style={{ padding: Spacing['2'] }}>
            {DEPTH_OPTIONS.map((option) => {
              const isSelected = user?.writingStyle?.depth === option.value;
              return (
                <TouchableOpacity activeOpacity={0.7}
                  key={option.value}
                  accessibilityRole="button"
                  accessibilityLabel={option.label}
                  accessibilityState={{ selected: isSelected }}
                  onPress={() => {
                    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                    updateUser({
                      writingStyle: {
                        ...user?.writingStyle,
                        tone: user?.writingStyle?.tone ?? 'warm',
                        depth: option.value,
                        faithBackground: user?.writingStyle?.faithBackground ?? 'growing',
                      },
                    });
                  }}
                  style={{
                    backgroundColor: isSelected ? colors.buttonBackgroundPressed : 'transparent',
                    paddingVertical: Spacing['3'],
                    paddingHorizontal: Spacing['3'],
                    borderRadius: 10,
                    flexDirection: 'row',
                    alignItems: 'center',
                    marginBottom: Spacing['1'],
                  }}
                >
                  <View style={{ flex: 1 }}>
                    <Text style={{ fontFamily: FontFamily.uiMedium, fontSize: 15, color: colors.text }}>
                      {option.label}
                    </Text>
                    <Text style={{ fontFamily: FontFamily.ui, fontSize: FontSize.xs, color: colors.textMuted, marginTop: Spacing['0.5'] }}>
                      {option.description}
                    </Text>
                  </View>
                  <View
                    style={{
                      width: 20, height: 20, borderRadius: 10,
                      borderWidth: 2,
                      borderColor: isSelected ? colors.text : colors.border,
                      backgroundColor: isSelected ? colors.text : 'transparent',
                      justifyContent: 'center', alignItems: 'center',
                    }}
                  >
                    {isSelected && (
                      <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: colors.background }} />
                    )}
                  </View>
                </TouchableOpacity>
              );
            })}
          </Animated.View>
        )}

        {/* Faith Background */}
        <TouchableOpacity activeOpacity={0.7}
          onPress={() => {
            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
            setExpandedPreference(expandedPreference === 'faith' ? null : 'faith');
          }}
          accessibilityRole="button"
          accessibilityLabel="Faith Background"
          accessibilityState={{ expanded: expandedPreference === 'faith' }}
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            padding: Spacing['4'],
            borderBottomWidth: 1,
            borderBottomColor: colors.border,
          }}
        >
          <View
            style={{
              width: 36, height: 36, borderRadius: Radius.chip,
              backgroundColor: colors.buttonBackground,
              justifyContent: 'center', alignItems: 'center',
            }}
          >
            <CompassIcon size={18} color={colors.text} weight="light" />
          </View>
          <View style={{ marginLeft: Spacing['3.5'], flex: 1 }}>
            <Text style={{ fontFamily: FontFamily.ui, fontSize: 15, color: colors.text }}>
              Faith Background
            </Text>
            <Text style={{ fontFamily: FontFamily.ui, fontSize: FontSize.xs, color: colors.textMuted, marginTop: Spacing['0.5'] }}>
              {FAITH_OPTIONS.find((o) => o.value === user?.writingStyle?.faithBackground)?.label ?? "I'm growing"}
            </Text>
          </View>
          <CaretDownIcon
            size={20}
            color={colors.textMuted}
            weight="light"
            style={{ transform: [{ rotate: expandedPreference === 'faith' ? '180deg' : '0deg' }] }}
          />
        </TouchableOpacity>

        {expandedPreference === 'faith' && (
          <Animated.View entering={reducedMotion ? undefined : FadeIn.duration(Duration.normal).easing(Ease.out)} style={{ padding: Spacing['2'] }}>
            {FAITH_OPTIONS.map((option) => {
              const isSelected = user?.writingStyle?.faithBackground === option.value;
              return (
                <TouchableOpacity activeOpacity={0.7}
                  key={option.value}
                  accessibilityRole="button"
                  accessibilityLabel={option.label}
                  accessibilityState={{ selected: isSelected }}
                  onPress={() => {
                    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                    updateUser({
                      writingStyle: {
                        ...user?.writingStyle,
                        tone: user?.writingStyle?.tone ?? 'warm',
                        depth: user?.writingStyle?.depth ?? 'balanced',
                        faithBackground: option.value,
                      },
                    });
                  }}
                  style={{
                    backgroundColor: isSelected ? colors.buttonBackgroundPressed : 'transparent',
                    paddingVertical: Spacing['3'],
                    paddingHorizontal: Spacing['3'],
                    borderRadius: 10,
                    flexDirection: 'row',
                    alignItems: 'center',
                    marginBottom: Spacing['1'],
                  }}
                >
                  <View style={{ flex: 1 }}>
                    <Text style={{ fontFamily: FontFamily.uiMedium, fontSize: 15, color: colors.text }}>
                      {option.label}
                    </Text>
                    <Text style={{ fontFamily: FontFamily.ui, fontSize: FontSize.xs, color: colors.textMuted, marginTop: Spacing['0.5'] }}>
                      {option.description}
                    </Text>
                  </View>
                  <View
                    style={{
                      width: 20, height: 20, borderRadius: 10,
                      borderWidth: 2,
                      borderColor: isSelected ? colors.text : colors.border,
                      backgroundColor: isSelected ? colors.text : 'transparent',
                      justifyContent: 'center', alignItems: 'center',
                    }}
                  >
                    {isSelected && (
                      <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: colors.background }} />
                    )}
                  </View>
                </TouchableOpacity>
              );
            })}
          </Animated.View>
        )}

        {/* Life Stage */}
        <TouchableOpacity activeOpacity={0.7}
          onPress={() => {
            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
            setExpandedPreference(expandedPreference === 'lifeStage' ? null : 'lifeStage');
          }}
          accessibilityRole="button"
          accessibilityLabel="Life Stage"
          accessibilityState={{ expanded: expandedPreference === 'lifeStage' }}
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            padding: Spacing['4'],
          }}
        >
          <View
            style={{
              width: 36, height: 36, borderRadius: Radius.chip,
              backgroundColor: colors.buttonBackground,
              justifyContent: 'center', alignItems: 'center',
            }}
          >
            <HourglassIcon size={18} color={colors.text} weight="light" />
          </View>
          <View style={{ marginLeft: Spacing['3.5'], flex: 1 }}>
            <Text style={{ fontFamily: FontFamily.ui, fontSize: 15, color: colors.text }}>
              Life Stage
            </Text>
            <Text style={{ fontFamily: FontFamily.ui, fontSize: FontSize.xs, color: colors.textMuted, marginTop: Spacing['0.5'] }}>
              {LIFE_STAGE_OPTIONS.find((o) => o.value === user?.writingStyle?.lifeStage)?.label ?? "I'm building my life"}
            </Text>
          </View>
          <CaretDownIcon
            size={20}
            color={colors.textMuted}
            weight="light"
            style={{ transform: [{ rotate: expandedPreference === 'lifeStage' ? '180deg' : '0deg' }] }}
          />
        </TouchableOpacity>

        {expandedPreference === 'lifeStage' && (
          <Animated.View entering={reducedMotion ? undefined : FadeIn.duration(Duration.normal).easing(Ease.out)} style={{ padding: Spacing['2'] }}>
            {LIFE_STAGE_OPTIONS.map((option) => {
              const isSelected = (user?.writingStyle?.lifeStage ?? 'building') === option.value;
              return (
                <TouchableOpacity activeOpacity={0.7}
                  key={option.value}
                  accessibilityRole="button"
                  accessibilityLabel={option.label}
                  accessibilityState={{ selected: isSelected }}
                  onPress={() => {
                    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                    updateUser({
                      writingStyle: {
                        ...user?.writingStyle,
                        tone: user?.writingStyle?.tone ?? 'warm',
                        depth: user?.writingStyle?.depth ?? 'balanced',
                        faithBackground: user?.writingStyle?.faithBackground ?? 'growing',
                        lifeStage: option.value,
                      },
                    });
                  }}
                  style={{
                    backgroundColor: isSelected ? colors.buttonBackgroundPressed : 'transparent',
                    paddingVertical: Spacing['3'],
                    paddingHorizontal: Spacing['3'],
                    borderRadius: 10,
                    flexDirection: 'row',
                    alignItems: 'center',
                    marginBottom: Spacing['1'],
                  }}
                >
                  <View style={{ flex: 1 }}>
                    <Text style={{ fontFamily: FontFamily.uiMedium, fontSize: 15, color: colors.text }}>
                      {option.label}
                    </Text>
                    <Text style={{ fontFamily: FontFamily.ui, fontSize: FontSize.xs, color: colors.textMuted, marginTop: Spacing['0.5'] }}>
                      {option.description}
                    </Text>
                  </View>
                  <View
                    style={{
                      width: 20, height: 20, borderRadius: 10,
                      borderWidth: 2,
                      borderColor: isSelected ? colors.text : colors.border,
                      backgroundColor: isSelected ? colors.text : 'transparent',
                      justifyContent: 'center', alignItems: 'center',
                    }}
                  >
                    {isSelected && (
                      <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: colors.background }} />
                    )}
                  </View>
                </TouchableOpacity>
              );
            })}
          </Animated.View>
        )}
      </View>
    </>
  );
}
