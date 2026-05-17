import { LayoutAnimation, Platform, UIManager } from 'react-native';

let hasEnabledAndroidLayoutAnimation = false;

function enableLayoutAnimationIfNeeded() {
  if (Platform.OS !== 'android' || hasEnabledAndroidLayoutAnimation) return;
  UIManager.setLayoutAnimationEnabledExperimental?.(true);
  hasEnabledAndroidLayoutAnimation = true;
}

export function animateCardDismiss() {
  enableLayoutAnimationIfNeeded();
  LayoutAnimation.configureNext({
    duration: 220,
    create: {
      type: LayoutAnimation.Types.easeInEaseOut,
      property: LayoutAnimation.Properties.opacity,
    },
    update: {
      type: LayoutAnimation.Types.easeInEaseOut,
    },
    delete: {
      type: LayoutAnimation.Types.easeInEaseOut,
      property: LayoutAnimation.Properties.opacity,
    },
  });
}
