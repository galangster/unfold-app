import React, { useRef, useState, useCallback } from 'react';
import {
  View,
  Text,
  Modal,
  TouchableOpacity,
  Dimensions,
  ActivityIndicator,
  Alert,
  ScrollView,
  StyleSheet,
} from 'react-native';
import { useTheme } from '@/lib/theme';
import { FontFamily } from '@/constants/fonts';
import { XIcon, DownloadSimpleIcon, ShareNetworkIcon, QuotesIcon, CaretLeftIcon, CaretRightIcon } from 'phosphor-react-native';
import ViewShot from 'react-native-view-shot';
import * as MediaLibrary from 'expo-media-library';
import * as Sharing from 'expo-sharing';
import { ShareableQuote } from '@/hooks/useShareableQuotes';

interface QuotePickerModalProps {
  visible: boolean;
  onClose: () => void;
  quotes: ShareableQuote[];
  dayTitle?: string;
  isLoading?: boolean;
}

export function QuotePickerModal({ visible, onClose, quotes, dayTitle, isLoading }: QuotePickerModalProps) {
  const { colors } = useTheme();
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [showWallpaper, setShowWallpaper] = useState(false);
  
  const selectedQuote = quotes[selectedIndex] || null;
  
  // Reset to first quote when modal opens
  React.useEffect(() => {
    if (visible) {
      setSelectedIndex(0);
      setShowWallpaper(false);
    }
  }, [visible]);
  
  const handleNext = () => {
    if (selectedIndex < quotes.length - 1) {
      setSelectedIndex(prev => prev + 1);
    }
  };
  
  const handlePrev = () => {
    if (selectedIndex > 0) {
      setSelectedIndex(prev => prev - 1);
    }
  };
  
  const handleSelect = () => {
    setShowWallpaper(true);
  };
  
  const handleBack = () => {
    setShowWallpaper(false);
  };
  
  if (showWallpaper && selectedQuote) {
    return (
      <QuoteWallpaperModal
        visible={visible}
        onClose={onClose}
        onBack={handleBack}
        quote={selectedQuote}
        dayTitle={dayTitle}
      />
    );
  }
  
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <View style={qpStyles.backdrop}>
        {/* Header */}
        <View style={qpStyles.modalHeader}>
          <Text style={qpStyles.modalHeaderTitle}>
            Choose a Quote
          </Text>
          <TouchableOpacity activeOpacity={0.7} onPress={onClose} accessibilityLabel="Close quote picker" accessibilityRole="button">
            <XIcon size={24} color="#FFFFFF" weight="light" />
          </TouchableOpacity>
        </View>

        {isLoading ? (
          <View style={qpStyles.centerContent}>
            <ActivityIndicator size="large" color={colors.accent} />
            <Text style={qpStyles.loadingText}>
              Finding the best lines...
            </Text>
          </View>
        ) : quotes.length === 0 ? (
          <View style={qpStyles.emptyContent}>
            <Text style={qpStyles.emptyText}>
              No quotable lines found in this devotional.
            </Text>
          </View>
        ) : (
          <>
            {/* Quote Card */}
            <View style={qpStyles.cardContainer}>
              <View style={[qpStyles.card, { backgroundColor: colors.background }]}>
                <View style={qpStyles.quoteIconRow}>
                  <QuotesIcon size={32} color={colors.accent} weight="light" />
                </View>

                {selectedQuote && (
                  <>
                    <Text style={[qpStyles.quoteText, { color: colors.text }]}>
                      "{selectedQuote.text}"
                    </Text>

                    {dayTitle && (
                      <Text style={[qpStyles.quoteDayTitle, { color: colors.textMuted }]}>
                        {dayTitle}
                      </Text>
                    )}
                  </>
                )}
              </View>

              {/* Pagination */}
              <View style={qpStyles.pagination}>
                <TouchableOpacity activeOpacity={0.7}
                  onPress={handlePrev}
                  disabled={selectedIndex === 0}
                  style={{ opacity: selectedIndex === 0 ? 0.3 : 1 }}
                  accessibilityLabel="Previous quote"
                  accessibilityRole="button"
                  accessibilityState={{ disabled: selectedIndex === 0 }}
                >
                  <CaretLeftIcon size={24} color="#FFFFFF" weight="light" />
                </TouchableOpacity>

                <Text style={qpStyles.paginationText}>
                  {selectedIndex + 1} of {quotes.length}
                </Text>

                <TouchableOpacity activeOpacity={0.7}
                  onPress={handleNext}
                  disabled={selectedIndex === quotes.length - 1}
                  style={{ opacity: selectedIndex === quotes.length - 1 ? 0.3 : 1 }}
                  accessibilityLabel="Next quote"
                  accessibilityRole="button"
                  accessibilityState={{ disabled: selectedIndex === quotes.length - 1 }}
                >
                  <CaretRightIcon size={24} color="#FFFFFF" weight="light" />
                </TouchableOpacity>
              </View>
            </View>

            {/* Select Button */}
            <View style={qpStyles.selectButtonContainer}>
              <TouchableOpacity activeOpacity={0.7}
                onPress={handleSelect}
                style={[qpStyles.selectButton, { backgroundColor: colors.accent }]}
              >
                <Text style={qpStyles.selectButtonText}>
                  Use This Quote
                </Text>
              </TouchableOpacity>
            </View>
          </>
        )}
      </View>
    </Modal>
  );
}

// Wallpaper preview + save/share modal
interface QuoteWallpaperModalProps {
  visible: boolean;
  onClose: () => void;
  onBack: () => void;
  quote: ShareableQuote;
  dayTitle?: string;
}

function QuoteWallpaperModal({ visible, onClose, onBack, quote, dayTitle }: QuoteWallpaperModalProps) {
  const { colors } = useTheme();
  const viewShotRef = useRef<ViewShot>(null);
  const [isGenerating, setIsGenerating] = useState(false);
  const [capturedUri, setCapturedUri] = useState<string | null>(null);

  const { width: screenWidth, height: screenHeight } = Dimensions.get('window');
  const isDarkMode = colors.background === '#000000' || colors.background === '#0A0A0A';
  const bgColor = isDarkMode ? '#000000' : '#FAFAFA';
  const textColor = isDarkMode ? '#FFFFFF' : '#1A1A1A';

  const captureWallpaper = useCallback(async () => {
    if (!viewShotRef.current) return null;
    try {
      const uri = await viewShotRef.current.capture?.();
      if (uri) setCapturedUri(uri);
      return uri || null;
    } catch (err) {
      console.error('[QuoteWallpaper] Capture failed:', err);
      return null;
    }
  }, []);

  const handleSave = useCallback(async () => {
    setIsGenerating(true);
    try {
      const uri = capturedUri || await captureWallpaper();
      if (!uri) {
        Alert.alert('Error', 'Failed to generate wallpaper');
        return;
      }
      const { status } = await MediaLibrary.requestPermissionsAsync();
      if (status === 'granted') {
        await MediaLibrary.saveToLibraryAsync(uri);
        Alert.alert('Saved!', 'Wallpaper saved to your photos');
      }
    } catch (err) {
      Alert.alert('Error', 'Failed to save wallpaper');
    } finally {
      setIsGenerating(false);
    }
  }, [capturedUri, captureWallpaper]);

  const handleShare = useCallback(async () => {
    setIsGenerating(true);
    try {
      const uri = capturedUri || await captureWallpaper();
      if (!uri) {
        Alert.alert('Error', 'Failed to generate wallpaper');
        return;
      }
      await Sharing.shareAsync(uri, { mimeType: 'image/png', dialogTitle: 'Share Quote' });
    } catch (err) {
      Alert.alert('Error', 'Failed to share wallpaper');
    } finally {
      setIsGenerating(false);
    }
  }, [capturedUri, captureWallpaper]);

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <View style={qpStyles.wallpaperBackdrop}>
        {/* Header */}
        <View style={qpStyles.modalHeader}>
          <TouchableOpacity activeOpacity={0.7} onPress={onBack} style={qpStyles.backButton} accessibilityLabel="Go back" accessibilityRole="button">
            <CaretLeftIcon size={20} color="#FFFFFF" weight="light" />
            <Text style={qpStyles.backButtonText}>Back</Text>
          </TouchableOpacity>
          <TouchableOpacity activeOpacity={0.7} onPress={onClose} accessibilityLabel="Close" accessibilityRole="button">
            <XIcon size={24} color="#FFFFFF" weight="light" />
          </TouchableOpacity>
        </View>

        {/* Wallpaper Preview — ViewShot needs inline style for computed dimensions */}
        <ViewShot
          ref={viewShotRef}
          options={{ format: 'png', quality: 1, result: 'tmpfile' }}
          style={{
            width: screenWidth * 0.85,
            height: screenHeight * 0.65,
            backgroundColor: bgColor,
            borderRadius: 20,
            justifyContent: 'center',
            alignItems: 'center',
            padding: 32,
          }}
        >
          <View style={qpStyles.quoteIconRow}>
            <QuotesIcon size={40} color={colors.accent} weight="light" />
          </View>

          <Text style={[qpStyles.wallpaperQuoteText, { color: textColor }]}>
            "{quote.text}"
          </Text>

          {dayTitle && (
            <Text
              style={[
                qpStyles.wallpaperDayTitle,
                { color: isDarkMode ? '#999999' : '#666666' },
              ]}
            >
              {dayTitle}
            </Text>
          )}

          <View style={qpStyles.brandWatermark}>
            <Text style={[qpStyles.brandText, { color: colors.accent }]}>
              U N F O L D
            </Text>
          </View>
        </ViewShot>

        {/* Action Buttons */}
        <View style={qpStyles.wallpaperActions}>
          <TouchableOpacity activeOpacity={0.7}
            onPress={handleSave}
            disabled={isGenerating}
            style={[qpStyles.saveButton, { backgroundColor: colors.accent, opacity: isGenerating ? 0.7 : 1 }]}
          >
            {isGenerating ? (
              <ActivityIndicator size="small" color="#FFFFFF" />
            ) : (
              <>
                <DownloadSimpleIcon size={18} color="#FFFFFF" weight="light" style={qpStyles.actionIcon} />
                <Text style={qpStyles.actionButtonLabel}>Save</Text>
              </>
            )}
          </TouchableOpacity>

          <TouchableOpacity activeOpacity={0.7}
            onPress={handleShare}
            disabled={isGenerating}
            style={qpStyles.shareButton}
          >
            <>
              <ShareNetworkIcon size={18} color="#FFFFFF" weight="light" style={qpStyles.actionIcon} />
              <Text style={qpStyles.actionButtonLabel}>Share</Text>
            </>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
}

const qpStyles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.9)',
    justifyContent: 'center',
  },
  wallpaperBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.9)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  modalHeader: {
    position: 'absolute',
    top: 60,
    left: 20,
    right: 20,
    flexDirection: 'row',
    justifyContent: 'space-between',
    zIndex: 10,
  },
  modalHeaderTitle: {
    fontFamily: FontFamily.uiMedium,
    fontSize: 17,
    color: '#FFFFFF',
  },
  centerContent: {
    alignItems: 'center',
  },
  loadingText: {
    fontFamily: FontFamily.body,
    fontSize: 16,
    color: '#999999',
    marginTop: 16,
  },
  emptyContent: {
    alignItems: 'center',
    paddingHorizontal: 40,
  },
  emptyText: {
    fontFamily: FontFamily.body,
    fontSize: 16,
    color: '#999999',
    textAlign: 'center',
  },
  cardContainer: {
    paddingHorizontal: 24,
    marginTop: 40,
  },
  card: {
    borderRadius: 20,
    padding: 32,
    minHeight: 300,
    justifyContent: 'center',
  },
  quoteIconRow: {
    alignItems: 'center',
    marginBottom: 24,
  },
  quoteText: {
    fontFamily: FontFamily.display,
    fontSize: 24,
    lineHeight: 36,
    textAlign: 'center',
  },
  quoteDayTitle: {
    fontFamily: FontFamily.body,
    fontSize: 14,
    textAlign: 'center',
    marginTop: 16,
  },
  pagination: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: 24,
    gap: 16,
  },
  paginationText: {
    fontFamily: FontFamily.ui,
    fontSize: 14,
    color: '#999999',
  },
  selectButtonContainer: {
    position: 'absolute',
    bottom: 60,
    left: 24,
    right: 24,
  },
  selectButton: {
    paddingVertical: 18,
    borderRadius: 28,
    alignItems: 'center',
  },
  selectButtonText: {
    fontFamily: FontFamily.uiSemiBold,
    fontSize: 17,
    color: '#FFFFFF',
  },
  backButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  backButtonText: {
    fontFamily: FontFamily.uiMedium,
    fontSize: 15,
    color: '#FFFFFF',
  },
  wallpaperQuoteText: {
    fontFamily: FontFamily.display,
    fontSize: 28,
    lineHeight: 40,
    textAlign: 'center',
  },
  wallpaperDayTitle: {
    fontFamily: FontFamily.body,
    fontSize: 14,
    textAlign: 'center',
    marginTop: 16,
  },
  brandWatermark: {
    position: 'absolute',
    bottom: 40,
    alignItems: 'center',
  },
  brandText: {
    fontFamily: FontFamily.uiMedium,
    fontSize: 12,
    letterSpacing: 3,
  },
  wallpaperActions: {
    position: 'absolute',
    bottom: 60,
    left: 24,
    right: 24,
    flexDirection: 'row',
    gap: 12,
  },
  saveButton: {
    flex: 1,
    paddingVertical: 18,
    borderRadius: 28,
    alignItems: 'center',
  },
  shareButton: {
    flex: 1,
    backgroundColor: 'transparent',
    paddingVertical: 18,
    borderRadius: 28,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#FFFFFF',
  },
  actionIcon: {
    marginBottom: 4,
  },
  actionButtonLabel: {
    fontFamily: FontFamily.uiSemiBold,
    fontSize: 16,
    color: '#FFFFFF',
  },
});
