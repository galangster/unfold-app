import React, { useRef, useState, useCallback, forwardRef, useImperativeHandle } from 'react';
import { View, Text, Dimensions, Appearance } from 'react-native';
import { useTheme } from '@/lib/theme';
import { FontFamily } from '@/constants/fonts';
import ViewShot from 'react-native-view-shot';
import * as MediaLibrary from 'expo-media-library';
import * as Sharing from 'expo-sharing';

interface WallpaperQuote {
  text: string;
  attribution?: string;
}

interface QuoteWallpaperProps {
  quote: WallpaperQuote;
}

export interface QuoteWallpaperRef {
  capture: () => Promise<string | null>;
  save: () => Promise<void>;
  share: () => Promise<void>;
}

export const QuoteWallpaper = forwardRef<QuoteWallpaperRef, QuoteWallpaperProps>(
  ({ quote }, ref) => {
    const viewShotRef = useRef<ViewShot>(null);
    const { colors } = useTheme();
    const [isCapturing, setIsCapturing] = useState(false);
    
    // Get device dimensions
    const { width: screenWidth, height: screenHeight } = Dimensions.get('window');
    
    // Detect current color scheme
    const colorScheme = Appearance.getColorScheme();
    const isDarkMode = colorScheme === 'dark';
    
    // Wallpaper dimensions (full device screen)
    const wallpaperWidth = screenWidth;
    const wallpaperHeight = screenHeight;
    
    // Background colors based on theme
    const bgColor = isDarkMode ? '#000000' : '#FAFAFA';
    const textColor = isDarkMode ? '#FFFFFF' : '#1A1A1A';
    const accentColor = colors.accent;
    
    const captureWallpaper = useCallback(async (): Promise<string | null> => {
      if (!viewShotRef.current || isCapturing) return null;
      
      setIsCapturing(true);
      try {
        const uri = await viewShotRef.current.capture?.();
        return uri || null;
      } catch (err) {
        console.error('[QuoteWallpaper] Capture failed:', err);
        return null;
      } finally {
        setIsCapturing(false);
      }
    }, [isCapturing]);
    
    const saveToCameraRoll = useCallback(async () => {
      const uri = await captureWallpaper();
      if (!uri) return;
      
      try {
        const { status } = await MediaLibrary.requestPermissionsAsync();
        if (status === 'granted') {
          await MediaLibrary.saveToLibraryAsync(uri);
        }
      } catch (err) {
        console.error('[QuoteWallpaper] Save failed:', err);
      }
    }, [captureWallpaper]);
    
    const shareWallpaper = useCallback(async () => {
      const uri = await captureWallpaper();
      if (!uri) return;
      
      try {
        await Sharing.shareAsync(uri, {
          mimeType: 'image/png',
          dialogTitle: 'Share Quote',
        });
      } catch (err) {
        console.error('[QuoteWallpaper] Share failed:', err);
      }
    }, [captureWallpaper]);
    
    // Expose methods via ref
    useImperativeHandle(ref, () => ({
      capture: captureWallpaper,
      save: saveToCameraRoll,
      share: shareWallpaper,
    }));
    
    return (
      <ViewShot
        ref={viewShotRef}
        options={{
          format: 'png',
          quality: 1,
          result: 'tmpfile',
          width: wallpaperWidth,
          height: wallpaperHeight,
        }}
        style={{
          width: wallpaperWidth,
          height: wallpaperHeight,
          backgroundColor: bgColor,
          justifyContent: 'center',
          alignItems: 'center',
          padding: 40,
        }}
      >
        {/* Main Quote */}
        <View style={{ maxWidth: wallpaperWidth - 80 }}>
          <Text
            style={{
              fontFamily: FontFamily.display,
              fontSize: 32,
              lineHeight: 44,
              color: textColor,
              textAlign: 'center',
              marginBottom: 24,
            }}
          >
            "{quote.text}"
          </Text>
          
          {/* Attribution if provided */}
          {quote.attribution && (
            <Text
              style={{
                fontFamily: FontFamily.body,
                fontSize: 16,
                color: isDarkMode ? '#999999' : '#666666',
                textAlign: 'center',
                marginTop: 16,
              }}
            >
              — {quote.attribution}
            </Text>
          )}
        </View>
        
        {/* Branding */}
        <View
          style={{
            position: 'absolute',
            bottom: 60,
            alignItems: 'center',
          }}
        >
          <Text
            style={{
              fontFamily: FontFamily.uiMedium,
              fontSize: 14,
              color: accentColor,
              letterSpacing: 2,
            }}
          >
            U N F O L D
          </Text>
        </View>
      </ViewShot>
    );
  }
);

QuoteWallpaper.displayName = 'QuoteWallpaper';
