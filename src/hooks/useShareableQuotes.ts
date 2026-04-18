import { useCallback, useState } from 'react';
import { Dimensions, Appearance } from 'react-native';
import * as MediaLibrary from 'expo-media-library';
import * as Sharing from 'expo-sharing';
import { extractShareableQuotes } from '@/lib/devotional-service';
import { DevotionalDay } from '@/lib/store';

export interface ShareableQuote {
  text: string;
  score: number;
  dayNumber: number;
}

interface UseShareableQuotesReturn {
  quotes: ShareableQuote[];
  isExtracting: boolean;
  extractQuotes: (day: DevotionalDay) => Promise<void>;
  selectedQuote: ShareableQuote | null;
  selectQuote: (quote: ShareableQuote | null) => void;
  generateWallpaper: (quote: ShareableQuote) => Promise<string | null>;
  saveWallpaper: (uri: string) => Promise<void>;
  shareWallpaper: (uri: string) => Promise<void>;
}

export function useShareableQuotes(): UseShareableQuotesReturn {
  const [quotes, setQuotes] = useState<ShareableQuote[]>([]);
  const [isExtracting, setIsExtracting] = useState(false);
  const [selectedQuote, setSelectedQuote] = useState<ShareableQuote | null>(null);

  // Extract quotes from a devotional day
  const extractQuotes = useCallback(async (day: DevotionalDay) => {
    setIsExtracting(true);
    try {
      // Combine title and body for extraction
      const content = `${day.title}\n\n${day.bodyText}`;
      const extracted = await extractShareableQuotes(content, day.title, 3);
      
      const quotesWithDay = extracted.map(q => ({
        ...q,
        dayNumber: day.dayNumber,
      }));
      
      setQuotes(quotesWithDay);
      
      // Auto-select the highest scored quote
      if (quotesWithDay.length > 0) {
        setSelectedQuote(quotesWithDay[0]);
      }
    } catch {
      // Extraction failed — quotes will remain empty
    } finally {
      setIsExtracting(false);
    }
  }, []);
  
  // Generate wallpaper image (requires ViewShot component)
  const generateWallpaper = useCallback(async (quote: ShareableQuote): Promise<string | null> => {
    // This will be implemented by the component that renders the wallpaper
    // The component captures itself and returns the URI
    return null;
  }, []);
  
  // Save wallpaper to camera roll
  const saveWallpaper = useCallback(async (uri: string) => {
    const { status } = await MediaLibrary.requestPermissionsAsync();
    if (status !== 'granted') {
      throw new Error('Photo library permission is required to save wallpapers.');
    }
    await MediaLibrary.saveToLibraryAsync(uri);
  }, []);
  
  // Share wallpaper
  const shareWallpaper = useCallback(async (uri: string) => {
    try {
      await Sharing.shareAsync(uri, {
        mimeType: 'image/png',
        dialogTitle: 'Share Quote',
      });
    } catch (err) {
      throw err;
    }
  }, []);
  
  const selectQuote = useCallback((quote: ShareableQuote | null) => {
    setSelectedQuote(quote);
  }, []);
  
  return {
    quotes,
    isExtracting,
    extractQuotes,
    selectedQuote,
    selectQuote,
    generateWallpaper,
    saveWallpaper,
    shareWallpaper,
  };
}

// Get device-appropriate wallpaper dimensions
export function getWallpaperDimensions() {
  const { width, height } = Dimensions.get('window');
  return {
    width,
    height,
    isPortrait: height > width,
  };
}

// Get wallpaper background color based on theme
export function getWallpaperBackgroundColor() {
  const colorScheme = Appearance.getColorScheme();
  return colorScheme === 'dark' ? '#000000' : '#FAFAFA';
}
