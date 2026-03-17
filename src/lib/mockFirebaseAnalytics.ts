// Mock Firebase Analytics for UI debugging without native modules
// This file replaces @react-native-firebase/analytics during development

import { logger } from '@/lib/logger';

const analytics = () => {
  return {
    logEvent: async (name: string, params?: any) => {
      logger.log('[Mock Analytics]', name, params);
    },
    logScreenView: async (params: any) => {
      logger.log('[Mock Analytics] Screen:', params?.screen_name);
    },
    setUserId: async (id: string | null) => {
      logger.log('[Mock Analytics] User ID:', id);
    },
    setUserProperty: async (name: string, value: string | null) => {
      logger.log('[Mock Analytics] Property:', name, value);
    },
    getAppInstanceId: async () => {
      return 'mock-instance-id';
    },
    setAnalyticsCollectionEnabled: async (enabled: boolean) => {
      logger.log('[Mock Analytics] Collection enabled:', enabled);
    },
  };
};

export const FirebaseAnalyticsTypes = {};
export default analytics;
