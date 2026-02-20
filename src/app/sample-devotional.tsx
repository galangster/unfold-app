import React, { useEffect, useState } from 'react';
import { View, Text, ScrollView, Pressable, Dimensions } from 'react-native';
import { useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withTiming,
  withDelay,
  withSequence,
  Easing,
  interpolate,
} from 'react-native-reanimated';
import * as Haptics from 'expo-haptics';
import { useTheme } from '@/lib/theme';
import { FontFamily } from '@/constants/fonts';
import { GoldEmberField } from '@/components/GoldEmberField';
import { useUnfoldStore } from '@/lib/store';
import { ChevronLeft, Sparkles, BookOpen, Heart, ArrowRight } from 'lucide-react-native';

const { width: SCREEN_WIDTH } = Dimensions.get('window');

interface SampleDevotionalProps {
  name: string;
  aboutMe: string;
  onContinue: () => void;
  onBack: () => void;
}

// Generate a personalized sample based on user input
function generateSampleDevotional(name: string, aboutMe: string) {
  // Extract themes from aboutMe (simple keyword detection)
  const themes = [];
  const lowerAbout = aboutMe.toLowerCase();
  
  if (lowerAbout.includes('stress') || lowerAbout.includes('anxious') || lowerAbout.includes('worry')) {
    themes.push('peace');
  }
  if (lowerAbout.includes('tired') || lowerAbout.includes('exhausted') || lowerAbout.includes('burnout')) {
    themes.push('rest');
  }
  if (lowerAbout.includes('lost') || lowerAbout.includes('direction') || lowerAbout.includes('purpose')) {
    themes.push('guidance');
  }
  if (lowerAbout.includes('alone') || lowerAbout.includes('lonely') || lowerAbout.includes('isolated')) {
    themes.push('presence');
  }
  if (lowerAbout.includes('parent') || lowerAbout.includes('dad') || lowerAbout.includes('mom') || lowerAbout.includes('kids')) {
    themes.push('family');
  }
  if (lowerAbout.includes('work') || lowerAbout.includes('job') || lowerAbout.includes('career') || lowerAbout.includes('business')) {
    themes.push('calling');
  }
  
  // Default theme if none detected
  if (themes.length === 0) {
    themes.push('trust');
  }
  
  const primaryTheme = themes[0];
  
  const devotionals: Record<string, { title: string; scripture: string; passage: string; reflection: string; prayer: string }> = {
    peace: {
      title: 'An Anchor for Anxious Thoughts',
      scripture: 'Philippians 4:6-7',
      passage: 'Do not be anxious about anything, but in every situation, by prayer and petition, with thanksgiving, present your requests to God. And the peace of God, which transcends all understanding, will guard your hearts and your minds in Christ Jesus.',
      reflection: `${name}, I can hear the weight in your words—the way the mind races when everything feels uncertain. But what if peace isn't the absence of chaos, but a presence that meets you right in the middle of it?\n\nThe peace of God doesn't make sense to the watching world. It doesn't add up on paper. But it guards you—like a sentry standing watch over your heart and mind—when everything else feels unsteady.`,
      prayer: `Lord, ${name} is carrying more than they were meant to hold alone. Teach them to trade their anxious thoughts for Your peace—not as a feeling, but as a Person who never leaves.`,
    },
    rest: {
      title: 'The Invitation You Didn't Know You Needed',
      scripture: 'Matthew 11:28-30',
      passage: 'Come to me, all you who are weary and burdened, and I will give you rest. Take my yoke upon you and learn from me, for I am gentle and humble in heart, and you will find rest for your souls.',
      reflection: `${name}, exhaustion isn't a badge of honor—it's a signal that something is out of rhythm. Jesus doesn't offer rest as a reward for productivity; He offers it as a starting point.\n\nThe rest He promises isn't just physical sleep. It's soul-rest—the deep assurance that you don't have to earn your place, prove your worth, or hold everything together.`,
      prayer: `Jesus, ${name} is weary. Give them the courage to stop, to come, to receive rest not as a luxury but as a gift You died to give.`,
    },
    guidance: {
      title: 'When the Path Feels Unclear',
      scripture: 'Proverbs 3:5-6',
      passage: 'Trust in the Lord with all your heart and lean not on your own understanding; in all your ways submit to him, and he will make your paths straight.',
      reflection: `${name}, the desire for clarity is good—but it can become a prison when we demand it before we'll move. Trust is the currency of the kingdom.\n\nYou don't need to see the whole staircase. You just need to know the One who built it. And He promises that as you submit your ways—your plans, your timing, your methods—He will make the path straight.`,
      prayer: `Father, ${name} is standing at a crossroads. Give them the grace to trust before they understand, and the peace to know You are already there, in every possible future.`,
    },
    presence: {
      title: 'You Are Not Alone in This',
      scripture: 'Isaiah 41:10',
      passage: 'So do not fear, for I am with you; do not be dismayed, for I am your God. I will strengthen you and help you; I will uphold you with my righteous right hand.',
      reflection: `${name}, loneliness has a way of whispering that everyone else has someone, and somehow you got skipped. But the truth is more beautiful than that.\n\nThe God who spoke galaxies into existence is with you. Not as a distant observer, but as a present help—a strength when yours runs out, an upholding hand when you feel like you're falling.`,
      prayer: `Lord, let ${name} feel the weight of Your presence today. Where they feel alone, reveal Yourself as the Companion who never leaves, never forgets, never grows tired of them.`,
    },
    family: {
      title: 'Holy in the Ordinary',
      scripture: 'Deuteronomy 6:6-7',
      passage: 'These commandments that I give you today are to be on your hearts. Impress them on your children. Talk about them when you sit at home and when you walk along the road...',
      reflection: `${name}, the sacred and the mundane aren't separate categories in God's economy. The kitchen table, the carpool line, the bedtime routine—these are altars when love is present.\n\nYour role as a parent isn't a distraction from your spiritual life; it *is* your spiritual life. Every act of patience, every prayer whispered in chaos, every "I love you" is a spiritual discipline.`,
      prayer: `God, bless ${name} with eyes to see the holy moments hidden in the everyday chaos of family life. Multiply their love, stretch their patience, and fill their home with Your peace.`,
    },
    calling: {
      title: 'Work as Worship',
      scripture: 'Colossians 3:23-24',
      passage: 'Whatever you do, work at it with all your heart, as working for the Lord, not for human masters, since you know that you will receive an inheritance from the Lord as a reward.',
      reflection: `${name}, your work matters—not because of the title or the paycheck, but because it's a space where God wants to meet you. Every email, every meeting, every decision is an opportunity for worship.\n\nThe kingdom advances not just through sermons, but through spreadsheets, designs, patient care, and business deals done with integrity and excellence. Your calling is holy ground.`,
      prayer: `Lord, redeem ${name}'s work from the tyranny of mere productivity. Show them how to labor with You, for You, and in Your strength—not their own.`,
    },
    trust: {
      title: 'Learning to Trust Again',
      scripture: 'Psalm 56:3-4',
      passage: 'When I am afraid, I put my trust in you. In God, whose word I praise—in God I trust and am not afraid. What can mere mortals do to me?',
      reflection: `${name}, trust is a choice we make before we feel it. It's saying, "I don't know what You're doing, God, but I know who You are."\n\nEvery devotional you receive will be an invitation to trust a little more deeply—to believe that God sees what you see, and so much more. The story isn't over. In fact, it might be just beginning.`,
      prayer: `Lord, ${name} is learning to trust again. Give them small mercies today—tiny confirmations that You see, You know, and You are working even when they can't see it yet.`,
    },
  };
  
  return devotionals[primaryTheme] || devotionals.trust;
}

function TypewriterReveal({ text, delay = 0, style }: { text: string; delay?: number; style?: any }) {
  const [displayedText, setDisplayedText] = useState('');
  const opacity = useSharedValue(0);
  
  useEffect(() => {
    const startTimeout = setTimeout(() => {
      opacity.value = withTiming(1, { duration: 300 });
      
      let index = 0;
      const interval = setInterval(() => {
        if (index <= text.length) {
          setDisplayedText(text.slice(0, index));
          index++;
        } else {
          clearInterval(interval);
        }
      }, 25); // Fast but readable
      
      return () => clearInterval(interval);
    }, delay);
    
    return () => clearTimeout(startTimeout);
  }, [text, delay]);
  
  const animatedStyle = useAnimatedStyle(() => ({
    opacity: opacity.value,
  }));
  
  return (
    <Animated.Text style={[style, animatedStyle]}>
      {displayedText}
    </Animated.Text>
  );
}

export default function SampleDevotionalScreen() {
  const router = useRouter();
  const { colors, isDark } = useTheme();
  const user = useUnfoldStore((s) => s.user);
  
  const [showContent, setShowContent] = useState(false);
  const [showContinue, setShowContinue] = useState(false);
  
  const cardScale = useSharedValue(0.9);
  const cardOpacity = useSharedValue(0);
  const glowOpacity = useSharedValue(0);
  
  // Get user data from store
  const name = user?.name || 'Friend';
  const aboutMe = user?.aboutMe || '';
  
  const sample = generateSampleDevotional(name, aboutMe);
  
  useEffect(() => {
    // Staggered reveal animation
    const timer1 = setTimeout(() => {
      cardOpacity.value = withTiming(1, { duration: 600, easing: Easing.out(Easing.cubic) });
      cardScale.value = withTiming(1, { duration: 600, easing: Easing.out(Easing.cubic) });
      setShowContent(true);
    }, 300);
    
    const timer2 = setTimeout(() => {
      glowOpacity.value = withTiming(0.5, { duration: 1000 });
    }, 600);
    
    const timer3 = setTimeout(() => {
      setShowContinue(true);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    }, 2500);
    
    return () => {
      clearTimeout(timer1);
      clearTimeout(timer2);
      clearTimeout(timer3);
    };
  }, []);
  
  const cardStyle = useAnimatedStyle(() => ({
    opacity: cardOpacity.value,
    transform: [{ scale: cardScale.value }],
  }));
  
  const glowStyle = useAnimatedStyle(() => ({
    opacity: glowOpacity.value,
  }));
  
  const handleContinue = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    router.push('/onboarding');
  };
  
  const handleBack = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    router.back();
  };
  
  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      <GoldEmberField density="low" active={true} style={{ opacity: 0.4 }} />
      
      <SafeAreaView style={{ flex: 1 }} edges={['top', 'bottom']}>
        {/* Header */}
        <View style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: 24, paddingTop: 16 }}>
          <Pressable onPress={handleBack} style={{ padding: 8, marginLeft: -8 }}>
            <ChevronLeft size={24} color={colors.textMuted} />
          </Pressable>
        </View>
        
        {/* Intro text */}
        {showContent && (
          <View style={{ paddingHorizontal: 32, marginTop: 8, marginBottom: 16 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 8 }}>
              <Sparkles size={18} color={colors.accent} />
              <Text style={{ fontFamily: FontFamily.uiMedium, fontSize: 13, color: colors.accent, letterSpacing: 0.5 }}>
                YOUR FIRST DEVOTIONAL
              </Text>
            </View>
            <TypewriterReveal 
              text="This is how Unfold speaks to you."
              style={{ fontFamily: FontFamily.display, fontSize: 28, color: colors.text, letterSpacing: -0.5 }}
            />
          </View>
        )}
        
        {/* Sample devotional card */}
        <View style={{ flex: 1, paddingHorizontal: 24 }}>
          <Animated.View 
            style={[
              {
                flex: 1,
                backgroundColor: colors.inputBackground,
                borderRadius: 20,
                borderWidth: 1,
                borderColor: colors.border,
                overflow: 'hidden',
              },
              cardStyle,
            ]}
          >
            {/* Warm glow behind card */}
            <Animated.View 
              style={[
                {
                  position: 'absolute',
                  top: '30%',
                  left: '50%',
                  marginLeft: -100,
                  width: 200,
                  height: 200,
                  borderRadius: 100,
                  backgroundColor: isDark 
                    ? 'rgba(200, 165, 92, 0.15)' 
                    : 'rgba(154, 123, 60, 0.1)',
                },
                glowStyle,
              ]}
            />
            
            <ScrollView 
              showsVerticalScrollIndicator={false}
              contentContainerStyle={{ padding: 24 }}
            >
              {showContent && (
                <>
                  {/* Title */}
                  <TypewriterReveal 
                    text={sample.title}
                    delay={200}
                    style={{ 
                      fontFamily: FontFamily.display, 
                      fontSize: 24, 
                      color: colors.text, 
                      marginBottom: 16,
                      letterSpacing: -0.3,
                    }}
                  />
                  
                  {/* Scripture reference */}
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 12 }}>
                    <BookOpen size={14} color={colors.accent} />
                    <TypewriterReveal 
                      text={sample.scripture}
                      delay={600}
                      style={{ 
                        fontFamily: FontFamily.uiMedium, 
                        fontSize: 13, 
                        color: colors.accent,
                        letterSpacing: 0.3,
                      }}
                    />
                  </View>
                  
                  {/* Scripture passage */}
                  <TypewriterReveal 
                    text={`"${sample.passage}"`}
                    delay={900}
                    style={{ 
                      fontFamily: FontFamily.mono, 
                      fontSize: 14, 
                      color: colors.textMuted,
                      lineHeight: 22,
                      marginBottom: 24,
                      fontStyle: 'italic',
                    }}
                  />
                  
                  {/* Divider */}
                  <View style={{ height: 1, backgroundColor: colors.border, marginBottom: 24 }} />
                  
                  {/* Reflection */}
                  <TypewriterReveal 
                    text={sample.reflection}
                    delay={1400}
                    style={{ 
                      fontFamily: FontFamily.body, 
                      fontSize: 15, 
                      color: colors.text,
                      lineHeight: 24,
                      marginBottom: 24,
                    }}
                  />
                  
                  {/* Prayer */}
                  <View style={{ 
                    backgroundColor: isDark ? 'rgba(200, 165, 92, 0.08)' : 'rgba(154, 123, 60, 0.05)',
                    borderRadius: 12,
                    padding: 16,
                    borderLeftWidth: 3,
                    borderLeftColor: colors.accent,
                  }}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 8 }}>
                      <Heart size={12} color={colors.accent} />
                      <Text style={{ fontFamily: FontFamily.uiMedium, fontSize: 11, color: colors.accent, letterSpacing: 0.5 }}>
                        PRAYER
                      </Text>
                    </View>
                    <TypewriterReveal 
                      text={sample.prayer}
                      delay={2200}
                      style={{ 
                        fontFamily: FontFamily.bodyItalic, 
                        fontSize: 14, 
                        color: colors.textMuted,
                        lineHeight: 22,
                      }}
                    />
                  </View>
                </>
              )}
              
              {/* Spacer for scroll */}
              <View style={{ height: 40 }} />
            </ScrollView>
          </Animated.View>
        </View>
        
        {/* Continue button */}
        {showContinue && (
          <Animated.View 
            entering={Animated.FadeIn.duration(400)}
            style={{ paddingHorizontal: 24, paddingBottom: 24, paddingTop: 16 }}
          >
            <Text 
              style={{ 
                fontFamily: FontFamily.body, 
                fontSize: 14, 
                color: colors.textMuted,
                textAlign: 'center',
                marginBottom: 16,
              }}
            >
              Every devotional is written just for you, based on what you share.
            </Text>
            
            <Pressable onPress={handleContinue}>
              {({ pressed }) => (
                <View
                  style={{
                    backgroundColor: colors.accent,
                    paddingVertical: 16,
                    borderRadius: 12,
                    flexDirection: 'row',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: 8,
                    opacity: pressed ? 0.9 : 1,
                    transform: [{ scale: pressed ? 0.98 : 1 }],
                  }}
                >
                  <Text style={{ fontFamily: FontFamily.uiMedium, fontSize: 16, color: colors.background }}>
                    Continue Setup
                  </Text>
                  <ArrowRight size={18} color={colors.background} />
                </View>
              )}
            </Pressable>
          </Animated.View>
        )}
      </SafeAreaView>
    </View>
  );
}
