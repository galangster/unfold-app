import React, { useEffect, useState } from 'react';
import { View, Text, Pressable, StyleSheet } from 'react-native';
import { useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useTheme } from '@/lib/theme';
import { FontFamily } from '@/constants/fonts';

interface Slide {
  id: number;
  title: string;
  subtitle: string;
}

const slides: Slide[] = [
  {
    id: 0,
    title: 'A spiritual experience crafted just for you',
    subtitle: "The world's most personalized devotional. Every word reflects your story, your struggles, your season.",
  },
  {
    id: 1,
    title: 'Theology meets artistry',
    subtitle: 'Trained on profound theology and beautiful writing. Every devotional is uniquely composed with care, precision, and spiritual depth.',
  },
  {
    id: 2,
    title: 'A rhythm of life that transforms',
    subtitle: 'Fresh bread every morning, perfectly tuned to where you are. Build a habit of encountering God that lasts a lifetime.',
  },
];

// Magical text reveal - characters fade in with stagger
function MagicalText({ 
  text, 
  textStyle, 
  delay = 0,
  speed = 20,
  onComplete 
}: { 
  text: string; 
  textStyle?: any; 
  delay?: number;
  speed?: number;
  onComplete?: () => void;
}) {
  const [visibleChars, setVisibleChars] = useState(0);
  
  useEffect(() => {
    const startTimeout = setTimeout(() => {
      let current = 0;
      const total = text.length;
      
      const interval = setInterval(() => {
        if (current < total) {
          setVisibleChars(current + 1);
          current++;
        } else {
          clearInterval(interval);
          onComplete?.();
        }
      }, speed);
      
      return () => clearInterval(interval);
    }, delay);
    
    return () => clearTimeout(startTimeout);
  }, [text, delay, speed, onComplete]);
  
  useEffect(() => {
    setVisibleChars(0);
  }, [text]);
  
  return (
    <View style={textStyle}>
      {text.split('').map((char, index) => (
        <Text
          key={index}
          style={{
            opacity: index < visibleChars ? 1 : 0,
            color: textStyle?.color || '#000',
            fontFamily: textStyle?.fontFamily,
            fontSize: textStyle?.fontSize,
            lineHeight: textStyle?.lineHeight,
            letterSpacing: textStyle?.letterSpacing,
          }}
        >
          {char === ' ' ? '\u00A0' : char}
        </Text>
      ))}
    </View>
  );
}

// Word-by-word shimmer reveal
function WordReveal({ 
  text, 
  textStyle, 
  delay = 0,
  staggerDelay = 40 
}: { 
  text: string; 
  textStyle?: any; 
  delay?: number;
  staggerDelay?: number;
}) {
  const [visibleWords, setVisibleWords] = useState(0);
  const words = text.split(' ');
  
  useEffect(() => {
    const startTimeout = setTimeout(() => {
      let current = 0;
      
      const interval = setInterval(() => {
        if (current < words.length) {
          setVisibleWords(current + 1);
          current++;
        } else {
          clearInterval(interval);
        }
      }, staggerDelay);
      
      return () => clearInterval(interval);
    }, delay);
    
    return () => clearTimeout(startTimeout);
  }, [text, delay, staggerDelay]);
  
  useEffect(() => {
    setVisibleWords(0);
  }, [text]);
  
  return (
    <View style={textStyle}>
      {words.map((word, index) => (
        <Text
          key={index}
          style={{
            opacity: index < visibleWords ? 1 : 0.2,
            color: textStyle?.color || '#000',
            fontFamily: textStyle?.fontFamily,
            fontSize: textStyle?.fontSize,
            lineHeight: textStyle?.lineHeight,
          }}
        >
          {word}{index < words.length - 1 ? '\u00A0' : ''}
        </Text>
      ))}
    </View>
  );
}

export default function HowItWorksScreen() {
  const router = useRouter();
  const { colors } = useTheme();
  const [currentSlide, setCurrentSlide] = useState(0);
  const [titleComplete, setTitleComplete] = useState(false);

  const goToNext = () => {
    if (currentSlide < slides.length - 1) {
      setTitleComplete(false);
      setCurrentSlide(currentSlide + 1);
    } else {
      router.replace('/onboarding');
    }
  };

  const goToPrevious = () => {
    if (currentSlide > 0) {
      setTitleComplete(false);
      setCurrentSlide(currentSlide - 1);
    }
  };

  const slide = slides[currentSlide];
  const isLastSlide = currentSlide === slides.length - 1;

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <SafeAreaView style={styles.safeArea} edges={['top', 'bottom']}>
        {/* Header */}
        <View style={styles.header}>
          <Pressable onPress={goToPrevious} disabled={currentSlide === 0}>
            <Text style={[styles.backText, { color: currentSlide === 0 ? colors.border : colors.textMuted }]}>
              Back
            </Text>
          </Pressable>

          <Pressable onPress={() => router.replace('/onboarding')}>
            <Text style={[styles.skipText, { color: colors.textMuted }]}>Skip</Text>
          </Pressable>
        </View>

        {/* Content */}
        <View style={styles.content}>
          <MagicalText
            key={`title-${currentSlide}`}
            text={slide.title}
            textStyle={[styles.title, { color: colors.text }]}
            delay={100}
            speed={18}
            onComplete={() => setTitleComplete(true)}
          />
          
          {titleComplete && (
            <WordReveal
              key={`subtitle-${currentSlide}`}
              text={slide.subtitle}
              textStyle={[styles.subtitle, { color: colors.textMuted }]}
              delay={150}
              staggerDelay={35}
            />
          )}
        </View>

        {/* Bottom */}
        <View style={styles.bottom}>
          {/* Progress dots */}
          <View style={styles.dots}>
            {slides.map((_, index) => (
              <View
                key={index}
                style={[
                  styles.dot,
                  {
                    backgroundColor: index === currentSlide ? colors.accent : colors.border,
                    width: index === currentSlide ? 24 : 8,
                  },
                ]}
              />
            ))}
          </View>

          {/* Continue button */}
          <Pressable onPress={goToNext} style={styles.continueButton}>
            {({ pressed }) => (
              <View
                style={[
                  styles.buttonInner,
                  {
                    backgroundColor: colors.accent,
                    opacity: pressed ? 0.9 : 1,
                    transform: [{ scale: pressed ? 0.98 : 1 }],
                  },
                ]}
              >
                <Text style={[styles.buttonText, { color: colors.background }]}>
                  {isLastSlide ? 'Get Started' : 'Continue'}
                </Text>
              </View>
            )}
          </Pressable>
        </View>
      </SafeAreaView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  safeArea: {
    flex: 1,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 24,
    paddingTop: 16,
    height: 60,
  },
  backText: {
    fontFamily: FontFamily.ui,
    fontSize: 15,
  },
  skipText: {
    fontFamily: FontFamily.uiMedium,
    fontSize: 15,
  },
  content: {
    flex: 1,
    justifyContent: 'center',
    paddingHorizontal: 40,
  },
  title: {
    fontFamily: FontFamily.display,
    fontSize: 32,
    letterSpacing: -0.5,
    marginBottom: 24,
  },
  subtitle: {
    fontFamily: FontFamily.body,
    fontSize: 16,
    lineHeight: 26,
  },
  bottom: {
    paddingHorizontal: 24,
    paddingBottom: 32,
    paddingTop: 16,
  },
  dots: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    gap: 8,
    marginBottom: 32,
  },
  dot: {
    height: 8,
    borderRadius: 4,
  },
  continueButton: {
    width: '100%',
  },
  buttonInner: {
    paddingVertical: 16,
    borderRadius: 12,
    alignItems: 'center',
  },
  buttonText: {
    fontFamily: FontFamily.uiMedium,
    fontSize: 16,
    letterSpacing: 0.3,
  },
});
