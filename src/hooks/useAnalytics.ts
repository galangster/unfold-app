/**
 * Analytics Screen Tracking Hook
 * Automatically tracks screen views with Expo Router
 */
import { useEffect, useRef } from 'react';
import { usePathname, useSegments } from 'expo-router';
import { Analytics } from '@/lib/analytics';
import { logger } from '@/lib/logger';

// Map route paths to screen names
const getScreenName = (pathname: string, segments: string[]): string => {
  // Handle grouped routes
  const cleanPath = pathname.replace(/^\//, '');
  
  // Map specific routes
  const routeMap: Record<string, string> = {
    '': 'Entry',
    'index': 'Welcome',
    'onboarding': 'Onboarding_AboutYou',
    'style-onboarding': 'Onboarding_Style',
    'generating': 'Devotional_Generating',
    '(onboarding)/sign-in': 'SignIn',
    '(main)/home': 'Home',
    '(main)/reading': 'Reading',
    '(main)/journal': 'Journal',
    '(main)/settings': 'Settings',
    '(main)/stats': 'Stats',
    '(main)/streak-settings': 'StreakSettings',
    'paywall': 'Paywall',
  };

  // Check for exact match
  if (routeMap[cleanPath]) {
    return routeMap[cleanPath];
  }

  // Handle dynamic routes
  if (cleanPath.includes('journal')) {
    return 'Journal_Entry';
  }

  if (cleanPath.includes('reading')) {
    return 'Reading';
  }

  // Fallback: use last segment
  const lastSegment = segments[segments.length - 1];
  if (lastSegment) {
    // Remove parentheses from group names
    return lastSegment.replace(/[()]/g, '').replace(/-/g, '_');
  }

  return 'Unknown';
};

/**
 * Hook to automatically track screen views
 * Place this in your root layout or main navigator
 */
export function useAnalyticsScreenTracking() {
  const pathname = usePathname();
  const segments = useSegments();
  const previousScreen = useRef<string | null>(null);

  useEffect(() => {
    const screenName = getScreenName(pathname, segments);
    
    // Don't track if same screen
    if (previousScreen.current === screenName) {
      return;
    }

    // Log screen view
    Analytics.logScreenView(screenName, screenName);
    
    logger.log('[Analytics] Screen tracked', { 
      screen: screenName, 
      pathname,
      previous: previousScreen.current 
    });

    previousScreen.current = screenName;
  }, [pathname, segments]);
}

/**
 * Hook to track onboarding progress
 */
export function useOnboardingAnalytics(step: number, stepName: string, isQuickStart: boolean) {
  useEffect(() => {
    Analytics.trackOnboardingStep(step, stepName, isQuickStart);
  }, [step, stepName, isQuickStart]);
}

/**
 * Hook to track component engagement time
 */
export function useEngagementTimer(screenName: string) {
  const startTime = useRef(Date.now());

  useEffect(() => {
    startTime.current = Date.now();

    return () => {
      const duration = Date.now() - startTime.current;
      Analytics.logEvent('screen_engagement_time', {
        screen_name: screenName,
        duration_seconds: Math.round(duration / 1000),
      });
    };
  }, [screenName]);
}
