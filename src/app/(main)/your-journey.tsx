import { Redirect } from 'expo-router';

/**
 * Your Journey route - redirects to Past Devotionals
 * Deep link: vibecode:///(main)/your-journey
 */
export default function YourJourneyScreen() {
  return <Redirect href="/(main)/past-devotionals" />;
}
