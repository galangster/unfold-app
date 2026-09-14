import React from 'react';
import { FEATURE_ANNOUNCEMENT_CATALOG } from '@/lib/feature-announcements';
import { FeatureAnnouncement } from './FeatureAnnouncement';

const MUSIC_PAGES = FEATURE_ANNOUNCEMENT_CATALOG.filter((page) => page.kind === 'music');

/** Preserve the existing single-page replay entry. */
export function MusicAnnouncement(props: Omit<React.ComponentProps<typeof FeatureAnnouncement>, 'pages'>) {
  return <FeatureAnnouncement {...props} pages={MUSIC_PAGES} />;
}
