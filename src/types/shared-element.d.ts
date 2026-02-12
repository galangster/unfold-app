// Type augmentations for React Native Shared Element Transitions
// These features are available in React Native 0.73+ but may not be in type definitions yet

import 'react-native';

declare module 'react-native' {
  interface TextProps {
    /**
     * Shared transition tag for shared element transitions.
     * When two screens have elements with matching sharedTransitionTag values,
     * the element will animate smoothly from the source to the destination.
     * 
     * Available in React Native 0.73+
     */
    sharedTransitionTag?: string;
  }

  interface ViewProps {
    /**
     * Shared transition tag for shared element transitions.
     * When two screens have elements with matching sharedTransitionTag values,
     * the element will animate smoothly from the source to the destination.
     * 
     * Available in React Native 0.73+
     */
    sharedTransitionTag?: string;
  }

  interface ImageProps {
    /**
     * Shared transition tag for shared element transitions.
     * When two screens have elements with matching sharedTransitionTag values,
     * the element will animate smoothly from the source to the destination.
     * 
     * Available in React Native 0.73+
     */
    sharedTransitionTag?: string;
  }
}
