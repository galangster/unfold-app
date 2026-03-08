import { Redirect } from 'expo-router';

/**
 * Your Journey route - redirects to Past Devotionals
 * Deep link: vibecode:///(tabs)/(you)/your-journey
 */
export default function YourJourneyScreen() {
  return <Redirect href="/(tabs)/(you)/past-devotionals" />;
}
