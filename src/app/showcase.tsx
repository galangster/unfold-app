/**
 * Component Showcase - Visual Testing for Unfold
 * Run: npx expo start --web
 * Then open: http://localhost:8081/showcase
 */
import React, { useState } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, SafeAreaView } from 'react-native';
import { StatusBar } from 'expo-status-bar';
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

  const renderSection = (title: string, children: React.ReactNode) => (
    <View style={styles.section}>
      <Text style={[styles.sectionTitle, { color: colors.text }]}>{title}</Text>
      <View style={[styles.sectionContent, { backgroundColor: isDark ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.03)' }]}>
        {children}
      </View>
    </View>
  );

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]}>
      <StatusBar style={isDark ? 'light' : 'dark'} />
      <ScrollView contentContainerStyle={styles.scrollContent}>
        <Text style={[styles.header, { color: colors.text, fontFamily: FontFamily.display }]}>
          🎨 Unfold Component Showcase
        </Text>
        
        {/* Streak Display */}
        {renderSection('Streak Counter (Animated)', (
          <View style={styles.centerContent}>
            <StreakDisplay size="large" />
          </View>
        ))}

        {/* Sparkle Burst */}
        {renderSection('Sparkle Burst Animation', (
          <View style={styles.centerContent}>
            <TouchableOpacity 
              style={[styles.triggerButton, { backgroundColor: colors.accent }]}
              onPress={() => setSparkleTrigger(Date.now())}
            >
              <Text style={[styles.triggerText, { fontFamily: FontFamily.uiSemiBold }]}>Trigger Sparkle</Text>
            </TouchableOpacity>
            <View style={styles.sparkleContainer}>
              <SparkleBurst trigger={sparkleTrigger > 0} />
            </View>
          </View>
        ))}

        {/* Audio Waveform */}
        {renderSection('Audio Waveform', (
          <View style={styles.centerContent}>
            <TouchableOpacity 
              style={[styles.triggerButton, { backgroundColor: isPlaying ? colors.error : colors.success }]}
              onPress={() => {
                setIsPlaying(!isPlaying);
                if (!isPlaying) setActiveWord(0);
              }}
            >
              <Text style={[styles.triggerText, { fontFamily: FontFamily.uiSemiBold }]}>
                {isPlaying ? 'Stop' : 'Play'} Waveform
              </Text>
            </TouchableOpacity>
            <View style={{ height: 24 }} />
            <AudioWaveform 
              isPlaying={isPlaying}
              activeWordIndex={activeWord}
              totalWords={20}
            />
          </View>
        ))}

        {/* Theme Colors */}
        {renderSection('Theme Colors', (
          <View style={styles.colorGrid}>
            {[
              ['accent', colors.accent],
              ['background', colors.background],
              ['text', colors.text],
              ['textMuted', colors.textMuted],
              ['textSubtle', colors.textSubtle],
              ['success', colors.success],
              ['error', colors.error],
            ].map(([name, color]) => (
              <View key={name} style={styles.colorItem}>
                <View style={[styles.colorSwatch, { backgroundColor: color }]} />
                <Text style={[styles.colorName, { color: colors.textMuted, fontFamily: FontFamily.ui }]}>
                  {name as string}
                </Text>
              </View>
            ))}
          </View>
        ))}

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
    padding: 20,
  },
  header: {
    fontSize: 28,
    fontWeight: '700',
    marginBottom: 24,
    textAlign: 'center',
  },
  section: {
    marginBottom: 32,
  },
  sectionTitle: {
    fontSize: 18,
    fontFamily: FontFamily.uiSemiBold,
    marginBottom: 12,
    opacity: 0.8,
  },
  sectionContent: {
    padding: 16,
    borderRadius: 12,
  },
  centerContent: {
    alignItems: 'center',
  },
  triggerButton: {
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderRadius: 20,
  },
  triggerText: {
    color: '#fff',
    fontWeight: '600',
  },
  sparkleContainer: {
    height: 100,
    alignItems: 'center',
    justifyContent: 'center',
  },
  colorGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
  },
  colorItem: {
    alignItems: 'center',
    width: 80,
  },
  colorSwatch: {
    width: 60,
    height: 60,
    borderRadius: 8,
    marginBottom: 4,
  },
  colorName: {
    fontSize: 10,
    textAlign: 'center',
  },
});
