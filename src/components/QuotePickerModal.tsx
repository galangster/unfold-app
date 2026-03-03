import React, { useRef, useState, useCallback } from 'react';
import {
  View,
  Text,
  Modal,
  Pressable,
  Dimensions,
  ActivityIndicator,
  Alert,
  ScrollView,
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
      <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.9)', justifyContent: 'center' }}>
        {/* Header */}
        <View style={{ position: 'absolute', top: 60, left: 20, right: 20, flexDirection: 'row', justifyContent: 'space-between', zIndex: 10 }}>
          <Text style={{ fontFamily: FontFamily.uiMedium, fontSize: 17, color: '#FFFFFF' }}>
            Choose a Quote
          </Text>
          <Pressable onPress={onClose}>
            <XIcon size={24} color="#FFFFFF" weight="light" />
          </Pressable>
        </View>
        
        {isLoading ? (
          <View style={{ alignItems: 'center' }}>
            <ActivityIndicator size="large" color={colors.accent} />
            <Text style={{ fontFamily: FontFamily.body, fontSize: 16, color: '#999999', marginTop: 16 }}>
              Finding the best lines...
            </Text>
          </View>
        ) : quotes.length === 0 ? (
          <View style={{ alignItems: 'center', paddingHorizontal: 40 }}>
            <Text style={{ fontFamily: FontFamily.body, fontSize: 16, color: '#999999', textAlign: 'center' }}>
              No quotable lines found in this devotional.
            </Text>
          </View>
        ) : (
          <>
            {/* Quote Card */}
            <View style={{ paddingHorizontal: 24, marginTop: 40 }}>
              <View
                style={{
                  backgroundColor: colors.background,
                  borderRadius: 20,
                  padding: 32,
                  minHeight: 300,
                  justifyContent: 'center',
                }}
              >
                <View style={{ alignItems: 'center', marginBottom: 24 }}>
                  <QuotesIcon size={32} color={colors.accent} weight="light" />
                </View>
                
                {selectedQuote && (
                  <>
                    <Text
                      style={{
                        fontFamily: FontFamily.display,
                        fontSize: 24,
                        lineHeight: 36,
                        color: colors.text,
                        textAlign: 'center',
                      }}
                    >
                      "{selectedQuote.text}"
                    </Text>
                    
                    {dayTitle && (
                      <Text
                        style={{
                          fontFamily: FontFamily.body,
                          fontSize: 14,
                          color: colors.textMuted,
                          textAlign: 'center',
                          marginTop: 16,
                        }}
                      >
                        {dayTitle}
                      </Text>
                    )}
                  </>
                )}
              </View>
              
              {/* Pagination */}
              <View style={{ flexDirection: 'row', justifyContent: 'center', alignItems: 'center', marginTop: 24, gap: 16 }}>
                <Pressable
                  onPress={handlePrev}
                  disabled={selectedIndex === 0}
                  style={{ opacity: selectedIndex === 0 ? 0.3 : 1 }}
                >
                  <CaretLeftIcon size={24} color="#FFFFFF" weight="light" />
                </Pressable>
                
                <Text style={{ fontFamily: FontFamily.ui, fontSize: 14, color: '#999999' }}>
                  {selectedIndex + 1} of {quotes.length}
                </Text>
                
                <Pressable
                  onPress={handleNext}
                  disabled={selectedIndex === quotes.length - 1}
                  style={{ opacity: selectedIndex === quotes.length - 1 ? 0.3 : 1 }}
                >
                  <CaretRightIcon size={24} color="#FFFFFF" weight="light" />
                </Pressable>
              </View>
            </View>
            
            {/* Select Button */}
            <View style={{ position: 'absolute', bottom: 60, left: 24, right: 24 }}>
              <Pressable
                onPress={handleSelect}
                style={{
                  backgroundColor: colors.accent,
                  paddingVertical: 18,
                  borderRadius: 28,
                  alignItems: 'center',
                }}
              >
                <Text style={{ fontFamily: FontFamily.uiSemiBold, fontSize: 17, color: '#FFFFFF' }}>
                  Use This Quote
                </Text>
              </Pressable>
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
      <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.9)', justifyContent: 'center', alignItems: 'center' }}>
        {/* Header */}
        <View style={{ position: 'absolute', top: 60, left: 20, right: 20, flexDirection: 'row', justifyContent: 'space-between', zIndex: 10 }}>
          <Pressable onPress={onBack} style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
            <CaretLeftIcon size={20} color="#FFFFFF" weight="light" />
            <Text style={{ fontFamily: FontFamily.uiMedium, fontSize: 15, color: '#FFFFFF' }}>Back</Text>
          </Pressable>
          <Pressable onPress={onClose}>
            <XIcon size={24} color="#FFFFFF" weight="light" />
          </Pressable>
        </View>

        {/* Wallpaper Preview */}
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
          <View style={{ alignItems: 'center', marginBottom: 24 }}>
            <QuotesIcon size={40} color={colors.accent} weight="light" />
          </View>
          
          <Text
            style={{
              fontFamily: FontFamily.display,
              fontSize: 28,
              lineHeight: 40,
              color: textColor,
              textAlign: 'center',
            }}
          >
            "{quote.text}"
          </Text>
          
          {dayTitle && (
            <Text
              style={{
                fontFamily: FontFamily.body,
                fontSize: 14,
                color: isDarkMode ? '#999999' : '#666666',
                textAlign: 'center',
                marginTop: 16,
              }}
            >
              {dayTitle}
            </Text>
          )}
          
          <View style={{ position: 'absolute', bottom: 40, alignItems: 'center' }}>
            <Text style={{ fontFamily: FontFamily.uiMedium, fontSize: 12, color: colors.accent, letterSpacing: 3 }}>
              U N F O L D
            </Text>
          </View>
        </ViewShot>
        
        {/* Action Buttons */}
        <View style={{ position: 'absolute', bottom: 60, left: 24, right: 24, flexDirection: 'row', gap: 12 }}>
          <Pressable
            onPress={handleSave}
            disabled={isGenerating}
            style={{
              flex: 1,
              backgroundColor: colors.accent,
              paddingVertical: 18,
              borderRadius: 28,
              alignItems: 'center',
              opacity: isGenerating ? 0.7 : 1,
            }}
          >
            {isGenerating ? (
              <ActivityIndicator size="small" color="#FFFFFF" />
            ) : (
              <>
                <DownloadSimpleIcon size={18} color="#FFFFFF" weight="light" style={{ marginBottom: 4 }} />
                <Text style={{ fontFamily: FontFamily.uiSemiBold, fontSize: 16, color: '#FFFFFF' }}>Save</Text>
              </>
            )}
          </Pressable>
          
          <Pressable
            onPress={handleShare}
            disabled={isGenerating}
            style={{
              flex: 1,
              backgroundColor: 'transparent',
              paddingVertical: 18,
              borderRadius: 28,
              alignItems: 'center',
              borderWidth: 1,
              borderColor: '#FFFFFF',
            }}
          >
            <>
              <ShareNetworkIcon size={18} color="#FFFFFF" weight="light" style={{ marginBottom: 4 }} />
              <Text style={{ fontFamily: FontFamily.uiSemiBold, fontSize: 16, color: '#FFFFFF' }}>Share</Text>
            </>
          </Pressable>
        </View>
      </View>
    </Modal>
  );
}
