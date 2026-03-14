import React, { useRef, useState, useCallback } from 'react';
import {
  View,
  Text,
  Modal,
  TouchableOpacity,
  Dimensions,
  ActivityIndicator,
  Alert,
} from 'react-native';
import { useTheme } from '@/lib/theme';
import { FontFamily } from '@/constants/fonts';
import { XIcon, DownloadSimpleIcon, ShareNetworkIcon, QuotesIcon } from 'phosphor-react-native';
import ViewShot from 'react-native-view-shot';
import * as MediaLibrary from 'expo-media-library';
import * as Sharing from 'expo-sharing';
import { useShareableQuotes, ShareableQuote } from '@/hooks/useShareableQuotes';

interface QuoteShareModalProps {
  visible: boolean;
  onClose: () => void;
  quote: ShareableQuote | null;
  dayTitle?: string;
}

export function QuoteShareModal({ visible, onClose, quote, dayTitle }: QuoteShareModalProps) {
  const { colors } = useTheme();
  const viewShotRef = useRef<ViewShot>(null);
  const [isGenerating, setIsGenerating] = useState(false);
  const [capturedUri, setCapturedUri] = useState<string | null>(null);
  
  // Get device dimensions for wallpaper
  const { width: screenWidth, height: screenHeight } = Dimensions.get('window');
  
  // Detect dark mode
  const isDarkMode = colors.background === '#000000' || colors.background === '#0A0A0A';
  const bgColor = isDarkMode ? '#000000' : '#FAFAFA';
  const textColor = isDarkMode ? '#FFFFFF' : '#1A1A1A';
  
  const captureWallpaper = useCallback(async (): Promise<string | null> => {
    if (!viewShotRef.current) return null;
    
    try {
      const uri = await viewShotRef.current.capture?.();
      if (uri) {
        setCapturedUri(uri);
        return uri;
      }
      return null;
    } catch (err) {
      console.error('[QuoteShareModal] Capture failed:', err);
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
      } else {
        Alert.alert('Permission needed', 'Please allow access to save photos');
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
      
      await Sharing.shareAsync(uri, {
        mimeType: 'image/png',
        dialogTitle: 'Share Quote',
      });
    } catch (err) {
      Alert.alert('Error', 'Failed to share wallpaper');
    } finally {
      setIsGenerating(false);
    }
  }, [capturedUri, captureWallpaper]);
  
  if (!quote) return null;
  
  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onClose}
    >
      <View
        style={{
          flex: 1,
          backgroundColor: 'rgba(0,0,0,0.9)',
          justifyContent: 'center',
          alignItems: 'center',
        }}
      >
        {/* Close button */}
        <TouchableOpacity activeOpacity={0.7}
          onPress={onClose}
          style={{
            position: 'absolute',
            top: 60,
            right: 20,
            zIndex: 10,
          }}
          accessibilityLabel="Close share modal"
          accessibilityRole="button"
        >
          <XIcon size={28} color="#FFFFFF" weight="light" />
        </TouchableOpacity>
        
        {/* Wallpaper Preview */}
        <ViewShot
          ref={viewShotRef}
          options={{
            format: 'png',
            quality: 1,
            result: 'tmpfile',
          }}
          style={{
            width: screenWidth * 0.85,
            height: screenHeight * 0.7,
            backgroundColor: bgColor,
            borderRadius: 20,
            overflow: 'hidden',
            justifyContent: 'center',
            alignItems: 'center',
            padding: 32,
          }}
        >
          {/* Quote Icon */}
          <View style={{ marginBottom: 24 }}>
            <QuotesIcon size={40} color={colors.accent} weight="light" />
          </View>
          
          {/* Quote Text */}
          <Text
            style={{
              fontFamily: FontFamily.display,
              fontSize: 28,
              lineHeight: 40,
              color: textColor,
              textAlign: 'center',
              marginBottom: 24,
            }}
          >
            {quote.text}
          </Text>
          
          {/* Day Title if provided */}
          {dayTitle && (
            <Text
              style={{
                fontFamily: FontFamily.body,
                fontSize: 14,
                color: isDarkMode ? '#999999' : '#666666',
                textAlign: 'center',
                marginTop: 8,
              }}
            >
              {dayTitle}
            </Text>
          )}
          
          {/* Branding */}
          <View
            style={{
              position: 'absolute',
              bottom: 40,
              alignItems: 'center',
            }}
          >
            <Text
              style={{
                fontFamily: FontFamily.uiMedium,
                fontSize: 12,
                color: colors.accent,
                letterSpacing: 3,
              }}
            >
              U N F O L D
            </Text>
          </View>
        </ViewShot>
        
        {/* Action Buttons */}
        <View
          style={{
            flexDirection: 'row',
            gap: 20,
            marginTop: 32,
          }}
        >
          <TouchableOpacity activeOpacity={0.7}
            onPress={handleSave}
            disabled={isGenerating}
            accessibilityLabel="Save quote image"
            accessibilityRole="button"
            accessibilityState={{ disabled: isGenerating }}
            style={{
              backgroundColor: colors.accent,
              paddingHorizontal: 24,
              paddingVertical: 16,
              borderRadius: 12,
              flexDirection: 'row',
              alignItems: 'center',
              gap: 8,
              opacity: isGenerating ? 0.7 : 1,
            }}
          >
            {isGenerating ? (
              <ActivityIndicator size="small" color={colors.background} />
            ) : (
              <>
                <DownloadSimpleIcon size={20} color={colors.background} weight="light" />
                <Text
                  style={{
                    fontFamily: FontFamily.uiMedium,
                    fontSize: 16,
                    color: colors.background,
                  }}
                >
                  Save
                </Text>
              </>
            )}
          </TouchableOpacity>
          
          <TouchableOpacity activeOpacity={0.7}
            onPress={handleShare}
            disabled={isGenerating}
            accessibilityLabel="Share quote"
            accessibilityRole="button"
            accessibilityState={{ disabled: isGenerating }}
            style={{
              backgroundColor: 'transparent',
              paddingHorizontal: 24,
              paddingVertical: 16,
              borderRadius: 12,
              flexDirection: 'row',
              alignItems: 'center',
              gap: 8,
              borderWidth: 1,
              borderColor: '#FFFFFF',
              opacity: isGenerating ? 0.7 : 1,
            }}
          >
            <ShareNetworkIcon size={20} color="#FFFFFF" weight="light" />
            <Text
              style={{
                fontFamily: FontFamily.uiMedium,
                fontSize: 16,
                color: '#FFFFFF',
              }}
            >
              Share
            </Text>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
}
