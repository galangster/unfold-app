import { Redirect } from 'expo-router';

/**
 * Legacy "Your Library" screen. Content lives in `my-content.tsx` now — the
 * unified library hub with Journal / Highlights / Bookmarks tabs. Existing
 * deep links and the reading-screen bookmark toast still land here, so keep
 * the route valid by redirecting instead of deleting the file.
 */
export default function SavedScreenRedirect() {
  return <Redirect href="/(tabs)/(you)/my-content?tab=highlights" />;
}
