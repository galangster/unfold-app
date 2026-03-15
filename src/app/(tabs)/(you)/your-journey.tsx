import { Redirect } from 'expo-router';

/**
 * Your Journey route - redirects to Past Devotionals
 */
export default function YourJourneyScreen() {
  return <Redirect href="/(tabs)/(you)/past-devotionals" />;
}
