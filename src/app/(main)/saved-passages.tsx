import { View, Text, Pressable, ScrollView } from 'react-native';
import { useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import Animated, { FadeIn, FadeInDown } from 'react-native-reanimated';
import * as Haptics from 'expo-haptics';
import { ChevronLeft, Bookmark, Trash2 } from 'lucide-react-native';
import { FontFamily } from '@/constants/fonts';
import { useTheme } from '@/lib/theme';
import { useUnfoldStore } from '@/lib/store';

export default function SavedPassagesScreen() {
  const router = useRouter();
  const { colors } = useTheme();
  const bookmarks = useUnfoldStore((s) => s.bookmarks);
  const removeBookmark = useUnfoldStore((s) => s.removeBookmark);

  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      <SafeAreaView style={{ flex: 1 }} edges={['top']}>
        {/* Header */}
        <View style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 12 }}>
          <Pressable
            onPress={() => {
              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
              router.back();
            }}
            hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
            style={{ padding: 8 }}
          >
            <ChevronLeft size={24} color={colors.textMuted} />
          </Pressable>
          <Text
            style={{
              fontFamily: FontFamily.uiMedium,
              fontSize: 16,
              color: colors.text,
              marginLeft: 8,
            }}
          >
            Saved Passages
          </Text>
        </View>

        {bookmarks.length === 0 ? (
          <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', paddingHorizontal: 48 }}>
            <Bookmark size={32} color={colors.textHint} strokeWidth={1.2} />
            <Text
              style={{
                fontFamily: FontFamily.body,
                fontSize: 16,
                color: colors.textMuted,
                textAlign: 'center',
                marginTop: 16,
                lineHeight: 24,
              }}
            >
              Passages you bookmark while reading will appear here.
            </Text>
          </View>
        ) : (
          <ScrollView
            contentContainerStyle={{ paddingHorizontal: 24, paddingTop: 8, paddingBottom: 48 }}
            showsVerticalScrollIndicator={false}
          >
            {bookmarks.map((bookmark, index) => (
              <Animated.View
                key={bookmark.id}
                entering={FadeInDown.duration(400).delay(index * 60)}
              >
                <View
                  style={{
                    backgroundColor: colors.inputBackground,
                    borderRadius: 16,
                    borderWidth: 1,
                    borderColor: colors.border,
                    padding: 20,
                    marginBottom: 12,
                  }}
                >
                  {/* Header row */}
                  <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
                    <View style={{ flex: 1 }}>
                      <Text
                        style={{
                          fontFamily: FontFamily.mono,
                          fontSize: 11,
                          color: colors.accent,
                          letterSpacing: 0.8,
                          opacity: 0.8,
                        }}
                      >
                        {bookmark.scriptureReference}
                      </Text>
                    </View>
                    <Pressable
                      onPress={() => {
                        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                        removeBookmark(bookmark.id);
                      }}
                      hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                      style={{ padding: 4 }}
                    >
                      <Trash2 size={16} color={colors.textHint} strokeWidth={1.5} />
                    </Pressable>
                  </View>

                  {/* Scripture text */}
                  <Text
                    style={{
                      fontFamily: FontFamily.bodyItalic,
                      fontSize: 15,
                      color: colors.text,
                      lineHeight: 24,
                      marginBottom: 14,
                    }}
                  >
                    "{bookmark.scriptureText}"
                  </Text>

                  {/* Context */}
                  <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                    <View
                      style={{
                        width: 12,
                        height: 1,
                        backgroundColor: colors.accent,
                        marginRight: 10,
                        opacity: 0.5,
                      }}
                    />
                    <Text
                      style={{
                        fontFamily: FontFamily.ui,
                        fontSize: 12,
                        color: colors.textSubtle,
                      }}
                      numberOfLines={1}
                    >
                      {bookmark.dayTitle} · {bookmark.devotionalTitle}
                    </Text>
                  </View>
                </View>
              </Animated.View>
            ))}
          </ScrollView>
        )}
      </SafeAreaView>
    </View>
  );
}
