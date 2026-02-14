/**
 * Component Showcase - Visual Testing for Unfold
 * Run: npx expo start --web
 * Then open: http://localhost:8081/showcase
 */
import React, { useState, useCallback } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, SafeAreaView } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import Animated, { FadeIn, FadeInDown } from 'react-native-reanimated';
import { ThemeProvider, useTheme } from '../lib/theme';
import { StreakDisplay } from '../components/StreakDisplay';
import { AudioWaveform } from '../components/AudioWaveform';
import { SparkleBurst } from '../components/SparkleBurst';
import { FontFamily } from '../constants/fonts';

function ShowcaseContent() {
  const { colors, isDark } = useTheme();
  const [sparkleTrigger, setSparkleTrigger] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [activeWord, setActiveWord] = useState(0);

  // Simulate word progression
  React.useEffect(() => {
    if (!isPlaying) return;
    const interval = setInterval(() => {
      setActiveWord((prev) => (prev + 1) % 20);
    }, 200);
    return () => clearInterval(interval);
  }, [isPlaying]);

  const renderSection = (title: string, children: React.ReactNode, delay = 0) => (
    <Animated.View 
      entering={FadeInDown.duration(400).delay(delay)}
      style={styles.section}
    >
      <Text style={[styles.sectionTitle, { color: colors.text }]}>{title}</Text>
      <View style={[styles.sectionContent, { backgroundColor: isDark ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.03)' }]}>
        {children}
      </View>
    </Animated.View>
  );

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]}>
      <StatusBar style={isDark ? 'light' : 'dark'} />
      <ScrollView contentContainerStyle={styles.scrollContent}>
        <Animated.Text 
          entering={FadeIn.duration(600)}
          style={[styles.header, { color: colors.text, fontFamily: FontFamily.display }]}
        >
          ✦ Unfold
        </Animated.Text>
        <Animated.Text 
          entering={FadeIn.duration(600).delay(100)}
          style={[styles.subheader, { color: colors.textMuted }]}
        >
          Component Showcase
        </Animated.Text>
        
        {/* Streak Display */}
        {renderSection('Streak Counter', (
          <View style={styles.centerContent}>
            <StreakDisplay size="large" />
            <View style={{ height: 16 }} />
            <StreakDisplay size="medium" />
            <View style={{ height: 16 }} />
            <StreakDisplay compact />
          </View>
        ), 200)}

        {/* Sparkle Burst */}
        {renderSection('Sparkle Burst Animation', (
          <View style={styles.centerContent}>
            <TouchableOpacity 
              style={[styles.triggerButton, { backgroundColor: colors.accent }]}
              onPress={() => setSparkleTrigger(Date.now())}
              activeOpacity={0.8}
            >
              <Text style={[styles.triggerText, { fontFamily: FontFamily.uiSemiBold }]}>
                ✨ Trigger Sparkle
              </Text>
            </TouchableOpacity>
            <View style={styles.sparkleContainer}>
              <SparkleBurst trigger={sparkleTrigger > 0} />
            </View>
          </View>
        ), 300)}

        {/* Audio Waveform */}
        {renderSection('Audio Waveform', (
          <View style={styles.centerContent}>
            <TouchableOpacity 
              style={[styles.triggerButton, { 
                backgroundColor: isPlaying ? colors.error : colors.success 
              }]}
              onPress={() => {
                setIsPlaying(!isPlaying);
                if (!isPlaying) setActiveWord(0);
              }}
              activeOpacity={0.8}
            >
              <Text style={[styles.triggerText, { fontFamily: FontFamily.uiSemiBold }]}>
                {isPlaying ? '⏹ Stop' : '▶ Play'} Waveform
              </Text>
            </TouchableOpacity>
            <View style={{ height: 24 }} />
            <AudioWaveform 
              isPlaying={isPlaying}
              activeWordIndex={activeWord}
              totalWords={20}
            />
          </View>
        ), 400)}

        {/* Theme Colors */}
        {renderSection('Theme Colors', (
          <View style={styles.colorGrid}>
            {[
              ['accent', colors.accent],
              ['accentLight', colors.accentLight],
              ['accentDark', colors.accentDark],
              ['background', colors.background],
              ['text', colors.text],
              ['textMuted', colors.textMuted],
              ['textSubtle', colors.textSubtle],
              ['success', colors.success],
              ['error', colors.error],
            ].map(([name, color], index) => (
              <Animated.View 
                key={name} 
                entering={FadeIn.duration(300).delay(index * 50)}
                style={styles.colorItem}
              >
                <View style={[styles.colorSwatch, { backgroundColor: color }]} />
                <Text style={[styles.colorName, { color: colors.textMuted, fontFamily: FontFamily.ui }]}>
                  {name as string}
                </Text>
              </Animated.View>
            ))}
          </View>
        ), 500)}

      </ScrollView>
    </SafeAreaView>
  );
}

export default function Showcase() {
  return (
    <ThemeProvider>
      <ShowcaseContent />
    </ThemeProvider>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  scrollContent: {
    padding: 24,
  },
  header: {
    fontSize: 36,
    fontWeight: '400',
    marginBottom: 4,
    textAlign: 'center',
    letterSpacing: -0.5,
  },
  subheader: {
    fontFamily: FontFamily.body,
    fontSize: 16,
    textAlign: 'center',
    marginBottom: 32,
    opacity: 0.7,
  },
  section: {
    marginBottom: 28,
  },
  sectionTitle: {
    fontSize: 13,
    fontFamily: FontFamily.uiSemiBold,
    marginBottom: 12,
    opacity: 0.6,
    textTransform: 'uppercase',
    letterSpacing: 1,
  },
  sectionContent: {
    padding: 20,
    borderRadius: 16,
  },
  centerContent: {
    alignItems: 'center',
  },
  triggerButton: {
    paddingHorizontal: 24,
    paddingVertical: 14,
    borderRadius: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  triggerText: {
    color: '#fff',
    fontWeight: '600',
    fontSize: 14,
  },
  sparkleContainer: {
    height: 100,
    alignItems: 'center',
    justifyContent: 'center',
  },
  colorGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 16,
  },
  colorItem: {
    alignItems: 'center',
    width: 70,
  },
  colorSwatch: {
    width: 56,
    height: 56,
    borderRadius: 12,
    marginBottom: 8,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 2,
  },
  colorName: {
    fontSize: 10,
    textAlign: 'center',
    textTransform: 'lowercase',
  },
});
