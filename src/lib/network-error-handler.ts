import { Alert } from 'react-native';
import NetInfo from '@react-native-community/netinfo';

export type NetworkErrorType = 
  | 'offline'
  | 'timeout'
  | 'server-error'
  | 'network-error'
  | 'unknown';

export interface NetworkErrorResult {
  type: NetworkErrorType;
  message: string;
  userFriendlyMessage: string;
  shouldRetry: boolean;
}

/**
 * Analyzes an error and returns a structured result with user-friendly messaging
 */
export function analyzeNetworkError(error: unknown): NetworkErrorResult {
  const errorMessage = error instanceof Error ? error.message : String(error);
  
  // Check for offline
  if (errorMessage.toLowerCase().includes('network request failed') ||
      errorMessage.toLowerCase().includes('failed to fetch') ||
      errorMessage.toLowerCase().includes('network error')) {
    return {
      type: 'offline',
      message: errorMessage,
      userFriendlyMessage: 'You appear to be offline. Please check your connection and try again.',
      shouldRetry: true,
    };
  }
  
  // Check for timeout
  if (errorMessage.toLowerCase().includes('timeout') ||
      errorMessage.toLowerCase().includes('timed out') ||
      errorMessage.toLowerCase().includes('abort')) {
    return {
      type: 'timeout',
      message: errorMessage,
      userFriendlyMessage: 'The request timed out. Please try again.',
      shouldRetry: true,
    };
  }
  
  // Check for server errors
  if (errorMessage.includes('500') ||
      errorMessage.includes('502') ||
      errorMessage.includes('503') ||
      errorMessage.includes('504') ||
      errorMessage.toLowerCase().includes('internal server error')) {
    return {
      type: 'server-error',
      message: errorMessage,
      userFriendlyMessage: 'Our servers are experiencing issues. Please try again in a moment.',
      shouldRetry: true,
    };
  }
  
  // Generic network error
  if (errorMessage.toLowerCase().includes('network') ||
      errorMessage.toLowerCase().includes('fetch') ||
      errorMessage.toLowerCase().includes('connection')) {
    return {
      type: 'network-error',
      message: errorMessage,
      userFriendlyMessage: 'Connection issue. Please check your internet and try again.',
      shouldRetry: true,
    };
  }
  
  return {
    type: 'unknown',
    message: errorMessage,
    userFriendlyMessage: 'Something went wrong. Please try again.',
    shouldRetry: false,
  };
}

/**
 * Checks if device is currently online
 */
export async function isOnline(): Promise<boolean> {
  const netInfo = await NetInfo.fetch();
  return netInfo.isConnected === true && netInfo.isInternetReachable !== false;
}

/**
 * Wraps a fetch call with proper error handling and user-friendly messages
 */
export async function fetchWithErrorHandling(
  url: string,
  options: RequestInit = {}
): Promise<Response> {
  // Check online status first
  const online = await isOnline();
  if (!online) {
    throw new Error('You appear to be offline. Please check your connection.');
  }
  
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 30000); // 30s timeout
    
    const response = await fetch(url, {
      ...options,
      signal: controller.signal,
    });
    
    clearTimeout(timeoutId);
    
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }
    
    return response;
  } catch (error) {
    const analyzed = analyzeNetworkError(error);
    throw new Error(analyzed.userFriendlyMessage);
  }
}

/**
 * Shows an alert dialog with the error message and optional retry action
 */
export function showNetworkErrorAlert(
  error: unknown,
  onRetry?: () => void
): void {
  const analyzed = analyzeNetworkError(error);
  
  Alert.alert(
    'Connection Issue',
    analyzed.userFriendlyMessage,
    [
      { text: 'OK', style: 'cancel' },
      ...(onRetry && analyzed.shouldRetry
        ? [{ text: 'Try Again', onPress: onRetry }]
        : []),
    ],
    { cancelable: true }
  );
}
