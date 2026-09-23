import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Alert, Platform, ScrollView, Share, Text, TextInput, View } from 'react-native';
import { TouchableOpacity } from 'react-native-gesture-handler';
import * as AppleAuthentication from 'expo-apple-authentication';
import { useLocalSearchParams } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import type { PurchasesPackage } from 'react-native-purchases';
import { CaretLeftIcon } from '@/components/icons';
import { SettingsSectionHeader, getSettingsCardStyle } from '@/components/settings/SettingsSectionHeader';
import { FontFamily, FontSize } from '@/constants/fonts';
import { Spacing } from '@/constants/spacing';
import {
  cancelGiftIntent,
  claimGiftCode,
  clearPendingGiftPurchase,
  deleteGiftAccount,
  GiftApiError,
  hasGiftSession,
  loadMyGifts,
  rememberGiftIntent,
  rememberGiftPurchase,
  resumePendingGiftPurchase,
  restoreMyGift,
  signInForGifts,
  startGiftIntent,
  type GiftPurchase,
} from '@/lib/gift-api';
import { getOfferings, purchaseGiftPackage, refreshGiftEntitlement } from '@/lib/revenuecatClient';
import { useTheme } from '@/lib/theme';
import { useGuardedBack } from '@/hooks/useGuardedBack';

const GIFT_PRODUCT_ID = 'unfold_premium_gift_year';

function message(error: unknown): string {
  if (error instanceof Error && /AppleAuthentication|RequestUnknownException/.test(error.message)) {
    return 'Sign in with Apple could not finish. Check your Apple Account in Settings and try again.';
  }
  return error instanceof Error ? error.message : 'Something went wrong. Try again.';
}

function giftSessionExpired(error: unknown): boolean {
  return error instanceof GiftApiError && error.code === 'GIFT_SIGN_IN_REQUIRED';
}

export default function GiftsScreen() {
  const goBack = useGuardedBack();
  const { colors } = useTheme();
  const params = useLocalSearchParams<{ code?: string | string[] }>();
  const linkCode = Array.isArray(params.code) ? params.code[0] : params.code;
  const [code, setCode] = useState(linkCode ?? '');
  const [signedIn, setSignedIn] = useState(false);
  const [gifts, setGifts] = useState<GiftPurchase[]>([]);
  const [giftPackage, setGiftPackage] = useState<PurchasesPackage | null>(null);
  const [pendingPurchase, setPendingPurchase] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const refreshGifts = useCallback(async () => {
    let pending: 'ready' | 'pending' | 'refunded' | 'expired' | null;
    try { pending = await resumePendingGiftPurchase(); }
    catch (caught) {
      setPendingPurchase(true);
      throw caught;
    }
    setPendingPurchase(pending === 'pending');
    setGifts(await loadMyGifts());
    return pending;
  }, []);

  useEffect(() => {
    let active = true;
    void getOfferings().then((result) => {
      if (!active || !result.ok) return;
      const available = result.data.all.gifts?.availablePackages.find(
        (item) => item.product.identifier === GIFT_PRODUCT_ID,
      ) ?? null;
      setGiftPackage(available);
    });
    void hasGiftSession().then((present) => {
      if (!active) return;
      setSignedIn(present);
      if (present) void refreshGifts().then((pending) => {
        if (active && pending === 'pending') setNotice('Your purchase is still being confirmed. Do not buy again.');
        if (active && pending === 'expired') setNotice('Your pending purchase request expired. You can try again.');
      }).catch((caught) => {
        if (giftSessionExpired(caught)) setSignedIn(false);
        setError(message(caught));
      });
    });
    return () => { active = false; };
  }, [refreshGifts]);

  const run = async (name: string, action: () => Promise<void>) => {
    if (busy) return;
    setBusy(name);
    setError(null);
    setNotice(null);
    try { await action(); }
    catch (caught) {
      if (giftSessionExpired(caught)) setSignedIn(false);
      setError(message(caught));
    }
    finally { setBusy(null); }
  };

  const signIn = () => run('signin', async () => {
    await signInForGifts();
    setSignedIn(true);
    const pending = await refreshGifts();
    const restored = await restoreMyGift();
    if (restored) {
      if (restored.environment === 'PRODUCTION') {
        await refreshGiftEntitlement();
        setNotice(`Your gift access runs through ${new Date(restored.expiresAt).toLocaleDateString()}.`);
      } else {
        setNotice('Test gift restored. Sandbox gifts do not unlock Premium.');
      }
    } else if (pending === 'pending') {
      setNotice('Your purchase is still being confirmed. Do not buy again.');
    } else if (pending === 'expired') {
      setNotice('Your pending purchase request expired. You can try again.');
    }
  });

  const buy = () => run('buy', async () => {
    if (!giftPackage) return;
    const intentId = await startGiftIntent();
    await rememberGiftIntent(intentId);
    setPendingPurchase(true);
    const purchase = await purchaseGiftPackage(giftPackage);
    if (!purchase.ok) {
      if (purchase.reason === 'user_cancelled') {
        try { await cancelGiftIntent(); }
        finally {
          await clearPendingGiftPurchase();
          setPendingPurchase(false);
        }
        return;
      }
      setNotice('We could not confirm this purchase. Refresh your gifts before you buy again.');
      return;
    }
    try {
      if (purchase.data.transactionId) {
        await rememberGiftPurchase(intentId, purchase.data.transactionId);
      }
      const pending = await refreshGifts();
      if (pending === null) setPendingPurchase(true);
      setNotice(pending === 'ready'
        ? 'Purchase received. Your code is ready. Sandbox codes are for testing and do not unlock Premium.'
        : pending === 'refunded'
          ? 'This purchase was refunded. Check your App Store purchase history before buying again.'
          : pending === 'expired'
            ? 'The pending purchase request expired. Check your App Store purchase history before trying again.'
        : 'Purchase received. Refresh your gifts after confirmation. Do not buy again.');
    } catch (caught) {
      setPendingPurchase(true);
      if (giftSessionExpired(caught)) setSignedIn(false);
      setNotice('App Store purchase received. Sign in and refresh your gifts before you buy again.');
    }
  });

  const claim = () => run('claim', async () => {
    const claimed = await claimGiftCode(code);
    if (claimed.environment === 'PRODUCTION') await refreshGiftEntitlement();
    setCode('');
    setNotice(claimed.environment === 'PRODUCTION'
      ? `Gift claimed. Your access runs through ${new Date(claimed.expiresAt).toLocaleDateString()}.`
      : 'Test gift claimed. Sandbox gifts do not unlock Premium.');
  });

  const restore = () => run('restore', async () => {
    const restored = await restoreMyGift();
    if (!restored) {
      setNotice('No active claimed gift was found for this Apple account.');
      return;
    }
    if (restored.environment === 'PRODUCTION') await refreshGiftEntitlement();
    setNotice(restored.environment === 'PRODUCTION'
      ? `Gift restored through ${new Date(restored.expiresAt).toLocaleDateString()}.`
      : 'Test gift restored. Sandbox gifts do not unlock Premium.');
  });

  const refresh = () => run('refresh', async () => {
    const pending = await refreshGifts();
    setNotice(pending === 'pending'
      ? 'Your purchase is still being confirmed. Do not buy again.'
      : pending === 'refunded' ? 'This purchase was refunded.'
        : pending === 'expired' ? 'Your pending purchase request expired. You can try again.'
          : 'Your gifts are up to date.');
  });

  const share = (gift: GiftPurchase) => {
    void Share.share({
      message: gift.environment === 'SANDBOX'
        ? `Test gift code ${gift.code}. Open Unfold to try claiming it. Sandbox gifts do not unlock Premium.`
        : `A year of Unfold is yours. Open Unfold and enter gift code ${gift.code}. Your year begins when you claim it.`,
    }).catch(() => Alert.alert('Could not share gift', 'Please try again.'));
  };

  const confirmDeleteAccount = () => {
    Alert.alert(
      'Delete gift account?',
      'You will lose gift purchase history, any unshared codes, and any claimed gift access. Codes you shared remain usable, and gifts already claimed by others stay active. This cannot be undone.',
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Delete gift account', style: 'destructive', onPress: () => {
          void run('delete-account', async () => {
            await deleteGiftAccount();
            setSignedIn(false);
            setGifts([]);
            setPendingPurchase(false);
            setCode('');
            setNotice('Gift account deleted. To remove Apple authorization, open Settings > your name > Sign in with Apple > Unfold > Delete.');
          });
        } },
      ],
    );
  };

  const button = (label: string, onPress: () => void, disabled = false) => (
    <TouchableOpacity
      accessibilityRole="button"
      accessibilityState={{ disabled: disabled || Boolean(busy) }}
      disabled={disabled || Boolean(busy)}
      onPress={onPress}
      style={{ backgroundColor: colors.accent, borderRadius: 12, minHeight: 48,
        alignItems: 'center', justifyContent: 'center', opacity: disabled || busy ? 0.5 : 1 }}
    >
      <Text style={{ color: colors.background, fontFamily: FontFamily.uiMedium, fontSize: FontSize.base }}>{label}</Text>
    </TouchableOpacity>
  );

  return (
    <View style={{ flex: 1, backgroundColor: colors.background }} testID="gifts-screen">
      <SafeAreaView style={{ flex: 1 }} edges={['top', 'left', 'right']}>
        <View style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: Spacing['4'], paddingVertical: Spacing['3'] }}>
          <TouchableOpacity accessibilityRole="button" accessibilityLabel="Go back" onPress={goBack}
            style={{ minWidth: 44, minHeight: 44, justifyContent: 'center' }}>
            <CaretLeftIcon size={24} color={colors.text} weight="light" />
          </TouchableOpacity>
          <Text style={{ color: colors.text, fontFamily: FontFamily.uiMedium, fontSize: FontSize.base }}>Gift Unfold</Text>
        </View>
        <ScrollView contentContainerStyle={{ paddingHorizontal: Spacing['6'], paddingBottom: 100 }}>
          <Text style={{ color: colors.text, fontFamily: FontFamily.display, fontSize: 30, marginTop: Spacing['5'] }}>
            Give them a year to unfold.
          </Text>
          <Text style={{ color: colors.textMuted, fontFamily: FontFamily.ui, fontSize: 15, lineHeight: 23, marginTop: Spacing['3'], marginBottom: Spacing['8'] }}>
            One purchase. Twelve months of Premium from the day they claim it. No renewal and no payment details for them.
          </Text>

          {!signedIn && (
            <View style={getSettingsCardStyle(colors)}>
              <View style={{ padding: Spacing['4'], gap: Spacing['3'] }}>
                <Text style={{ color: colors.text, fontFamily: FontFamily.ui, fontSize: 15 }}>
                  Sign in with Apple to keep your gift on a new device.
                </Text>
                {Platform.OS === 'ios' ? (
                  <AppleAuthentication.AppleAuthenticationButton
                    buttonType={AppleAuthentication.AppleAuthenticationButtonType.SIGN_IN}
                    buttonStyle={AppleAuthentication.AppleAuthenticationButtonStyle.BLACK}
                    cornerRadius={10}
                    style={{ width: '100%', height: 48 }}
                    onPress={signIn}
                  />
                ) : (
                  <Text style={{ color: colors.textMuted, fontFamily: FontFamily.ui }}>
                    Annual gifts are available on iPhone.
                  </Text>
                )}
              </View>
            </View>
          )}

          {error && <Text accessibilityRole="alert" style={{ color: colors.error, marginBottom: Spacing['4'] }}>{error}</Text>}
          {notice && <Text accessibilityRole="text" style={{ color: colors.text, marginBottom: Spacing['4'] }}>{notice}</Text>}
          {busy && <ActivityIndicator color={colors.accent} style={{ marginBottom: Spacing['4'] }} />}

          <SettingsSectionHeader label="Buy a gift" />
          <View style={getSettingsCardStyle(colors)}>
            <View style={{ padding: Spacing['4'], gap: Spacing['3'] }}>
              <Text style={{ color: colors.text, fontFamily: FontFamily.uiMedium, fontSize: 17 }}>One year of Premium</Text>
              <Text style={{ color: colors.textMuted, fontFamily: FontFamily.ui, fontSize: 14, lineHeight: 21 }}>
                You receive a code to share after the App Store confirms your purchase.
              </Text>
              {button(giftPackage ? `Buy gift · ${giftPackage.product.priceString}` : 'Gift purchase unavailable', buy, !signedIn || !giftPackage || pendingPurchase)}
            </View>
          </View>

          {signedIn && (
            <>
              <SettingsSectionHeader label="Your gifts" />
              <View style={getSettingsCardStyle(colors)}>
                <View style={{ padding: Spacing['4'], gap: Spacing['3'] }}>
                  {gifts.length === 0 && <Text style={{ color: colors.textMuted, fontFamily: FontFamily.ui }}>No confirmed gifts yet.</Text>}
                  {gifts.map((gift) => (
                    <View key={gift.transactionId} style={{ gap: Spacing['2'], paddingBottom: Spacing['3'], borderBottomWidth: 1, borderBottomColor: colors.border }}>
                      <Text style={{ color: colors.text, fontFamily: FontFamily.uiMedium }}>
                        {gift.status === 'available'
                          ? `${gift.environment === 'SANDBOX' ? 'Test code · ' : ''}${gift.code}`
                          : gift.status === 'claimed'
                            ? gift.environment === 'SANDBOX' ? 'Test gift claimed' : 'Gift claimed'
                            : 'Gift refunded'}
                      </Text>
                      {gift.expiresAt && gift.environment === 'PRODUCTION' && <Text style={{ color: colors.textMuted, fontFamily: FontFamily.ui }}>Access ends {new Date(gift.expiresAt).toLocaleDateString()}</Text>}
                      {gift.status === 'available' && button('Share gift code', () => share(gift))}
                    </View>
                  ))}
                  {button('Refresh gifts', refresh)}
                  <TouchableOpacity
                    accessibilityRole="button"
                    accessibilityLabel="Delete gift account"
                    disabled={Boolean(busy)}
                    onPress={confirmDeleteAccount}
                    style={{ minHeight: 48, justifyContent: 'center' }}
                  >
                    <Text style={{ color: colors.error, fontFamily: FontFamily.uiMedium, textAlign: 'center' }}>
                      Delete gift account
                    </Text>
                  </TouchableOpacity>
                </View>
              </View>
            </>
          )}

          <SettingsSectionHeader label="Claim a gift" />
          <View style={getSettingsCardStyle(colors)}>
            <View style={{ padding: Spacing['4'], gap: Spacing['3'] }}>
              <Text style={{ color: colors.textMuted, fontFamily: FontFamily.ui, lineHeight: 21 }}>
                Enter the code you received. If you have Premium access, claim it after that access ends.
              </Text>
              <TextInput
                accessibilityLabel="Gift code"
                autoCapitalize="characters"
                autoCorrect={false}
                value={code}
                onChangeText={setCode}
                placeholder="UNFOLD-…"
                placeholderTextColor={colors.textMuted}
                style={{ minHeight: 48, borderRadius: 10, borderWidth: 1, borderColor: colors.border,
                  color: colors.text, fontFamily: FontFamily.ui, fontSize: 16, paddingHorizontal: Spacing['3'] }}
              />
              {button('Claim gift', claim, !signedIn || !code.trim())}
              {signedIn && button('Restore a claimed gift', restore)}
            </View>
          </View>
        </ScrollView>
      </SafeAreaView>
    </View>
  );
}
