/**
 * Sign-In Sheet
 *
 * Bottom sheet prompting guest users to sign in before actions
 * that require authentication (e.g., devotional generation).
 * Reuses the same Clerk OAuth flow as the full sign-in screen.
 */

import { useState, useCallback, useEffect, useRef } from 'react';
import { View, Text, TouchableOpacity, AppState } from 'react-native';
import * as Haptics from 'expo-haptics';
import * as WebBrowser from 'expo-web-browser';
import { useOAuth } from '@clerk/clerk-expo';
import {
  ShieldCheckIcon,
  AppleLogoIcon,
  GoogleLogoIcon,
  FacebookLogoIcon,
} from 'phosphor-react-native';
import { Sheet } from '@/components/ui/Sheet';
import { useTheme } from '@/lib/theme';
import { useUnfoldStore } from '@/lib/store';
import { logger } from '@/lib/logger';
import { Analytics, AnalyticsEvents } from '@/lib/analytics';
import { FontFamily, FontSize } from '@/constants/fonts';
import { Spacing } from '@/constants/spacing';
import { Radius } from '@/constants/radius';
import { alpha } from '@/components/ui';

WebBrowser.maybeCompleteAuthSession();

interface SignInSheetProps {
  visible: boolean;
  onClose: () => void;
  /** Called after successful sign-in */
  onSignedIn: () => void;
}

export function SignInSheet({ visible, onClose, onSignedIn }: SignInSheetProps) {
  const { colors } = useTheme();
  const updateUser = useUnfoldStore((s) => s.updateUser);

  const [isSigningIn, setIsSigningIn] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const isSigningInRef = useRef(false);

  const { startOAuthFlow: startAppleFlow } = useOAuth({ strategy: 'oauth_apple' });
  const { startOAuthFlow: startGoogleFlow } = useOAuth({ strategy: 'oauth_google' });
  const { startOAuthFlow: startFacebookFlow } = useOAuth({ strategy: 'oauth_facebook' });

  // Reset stuck signing-in state when app returns to foreground
  useEffect(() => {
    const sub = AppState.addEventListener('change', (state) => {
      if (state === 'active' && isSigningInRef.current) {
        setTimeout(() => {
          if (isSigningInRef.current) {
            isSigningInRef.current = false;
            setIsSigningIn(false);
          }
        }, 1000);
      }
    });
    return () => sub.remove();
  }, []);

  // Reset state when sheet closes
  useEffect(() => {
    if (!visible) {
      setError(null);
      setIsSigningIn(false);
      isSigningInRef.current = false;
    }
  }, [visible]);

  const handleOAuthSignIn = useCallback(
    async (
      startFlow: typeof startAppleFlow,
      providerName: string,
    ) => {
      if (isSigningIn) return;
      setIsSigningIn(true);
      isSigningInRef.current = true;
      setError(null);

      try {
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
        Analytics.logEvent(AnalyticsEvents.SIGN_IN_APPLE_TAPPED);

        const { createdSessionId, setActive } = await startFlow({
          redirectUrl: 'unfold://oauth-callback',
        });

        if (createdSessionId && setActive) {
          await setActive({ session: createdSessionId });

          Analytics.logEvent(AnalyticsEvents.SIGN_IN_SUCCESS, {
            auth_provider: providerName.toLowerCase(),
          });

          updateUser({ hasSeenSignInPrompt: true });
          Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
          onSignedIn();
        }
      } catch (err: any) {
        logger.error(`[SignInSheet] ${providerName} OAuth error:`, err);

        if (err?.errors?.[0]?.code === 'session_exists') {
          onSignedIn();
          return;
        }

        if (
          err?.errors?.[0]?.code === 'user_cancelled' ||
          err?.message?.includes('cancelled') ||
          err?.message?.includes('canceled')
        ) {
          setIsSigningIn(false);
          isSigningInRef.current = false;
          return;
        }

        setError("Couldn't connect. Please check your connection and try again.");
      } finally {
        setIsSigningIn(false);
        isSigningInRef.current = false;
      }
    },
    [isSigningIn, onSignedIn, updateUser],
  );

  return (
    <Sheet visible={visible} onClose={onClose} bottomPadding={24}>
      <View style={{ alignItems: 'center', paddingTop: Spacing['2'] }}>
        {/* Icon */}
        <View
          style={{
            width: 56,
            height: 56,
            borderRadius: Radius.xl,
            backgroundColor: alpha(colors.accent, 0.12),
            alignItems: 'center',
            justifyContent: 'center',
            marginBottom: Spacing['5'],
          }}
        >
          <ShieldCheckIcon size={28} color={colors.accent} weight="light" />
        </View>

        {/* Title */}
        <Text
          style={{
            fontFamily: FontFamily.display,
            fontSize: FontSize['2xl'],
            color: colors.text,
            textAlign: 'center',
            marginBottom: Spacing['2'],
          }}
        >
          Sign in to get started
        </Text>

        {/* Subtitle */}
        <Text
          style={{
            fontFamily: FontFamily.body,
            fontSize: FontSize.sm,
            color: colors.textMuted,
            textAlign: 'center',
            lineHeight: 20,
            paddingHorizontal: Spacing['2'],
            marginBottom: Spacing['6'],
          }}
        >
          An account lets us save your devotional series and keep it synced across your devices.
        </Text>

        {/* Error */}
        {error && (
          <View
            style={{
              backgroundColor: alpha('#EF4444', 0.15),
              borderRadius: Radius.md,
              padding: Spacing['3'],
              marginBottom: Spacing['4'],
              width: '100%',
            }}
          >
            <Text
              style={{
                color: '#EF4444',
                fontFamily: FontFamily.ui,
                fontSize: FontSize.xs,
                textAlign: 'center',
              }}
            >
              {error}
            </Text>
          </View>
        )}

        {/* OAuth buttons */}
        <View style={{ width: '100%', gap: 12 }}>
          <TouchableOpacity
            style={{
              flexDirection: 'row',
              alignItems: 'center',
              justifyContent: 'center',
              height: 52,
              borderRadius: Radius.md,
              backgroundColor: '#FFFFFF',
              gap: 10,
            }}
            onPress={() => handleOAuthSignIn(startAppleFlow, 'Apple')}
            activeOpacity={0.8}
            disabled={isSigningIn}
          >
            <AppleLogoIcon size={20} color="#1F1F1F" weight="fill" />
            <Text style={{ fontFamily: FontFamily.uiSemiBold, fontSize: FontSize.base, color: '#1F1F1F' }}>
              Sign in with Apple
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={{
              flexDirection: 'row',
              alignItems: 'center',
              justifyContent: 'center',
              height: 52,
              borderRadius: Radius.md,
              backgroundColor: '#FFFFFF',
              gap: 10,
            }}
            onPress={() => handleOAuthSignIn(startGoogleFlow, 'Google')}
            activeOpacity={0.8}
            disabled={isSigningIn}
          >
            <GoogleLogoIcon size={20} color="#1F1F1F" weight="bold" />
            <Text style={{ fontFamily: FontFamily.uiSemiBold, fontSize: FontSize.base, color: '#1F1F1F' }}>
              Sign in with Google
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={{
              flexDirection: 'row',
              alignItems: 'center',
              justifyContent: 'center',
              height: 52,
              borderRadius: Radius.md,
              backgroundColor: '#1877F2',
              gap: 10,
            }}
            onPress={() => handleOAuthSignIn(startFacebookFlow, 'Facebook')}
            activeOpacity={0.8}
            disabled={isSigningIn}
          >
            <FacebookLogoIcon size={20} color="#FFFFFF" weight="fill" />
            <Text style={{ fontFamily: FontFamily.uiSemiBold, fontSize: FontSize.base, color: '#FFFFFF' }}>
              Sign in with Facebook
            </Text>
          </TouchableOpacity>
        </View>

        {/* Dismiss link */}
        <TouchableOpacity
          onPress={onClose}
          style={{ paddingVertical: Spacing['4'] }}
          activeOpacity={0.6}
          disabled={isSigningIn}
        >
          <Text
            style={{
              fontFamily: FontFamily.ui,
              fontSize: FontSize.xs,
              color: colors.textMuted,
            }}
          >
            Not now
          </Text>
        </TouchableOpacity>
      </View>
    </Sheet>
  );
}
