const QA_TODAY_PROFILE_MARKER_PARTS = ['Seeded Today-screen runtime QA', 'profile.'] as const;

export function getQaTodayProfileMarker(): string {
  return QA_TODAY_PROFILE_MARKER_PARTS.join(' ');
}
