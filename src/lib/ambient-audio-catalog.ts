export const AMBIENT_TRACK_IDS = [
  'a-lifetime-spent-with-you',
  'river-thread',
  'tideglass-drift',
  'alpine-serenity',
  'daylight-sequence',
  'morning-light-blooms',
  'galactic-drift',
  'static-harmony',
  'silent-warmth',
] as const;

export type AmbientTrackId = (typeof AMBIENT_TRACK_IDS)[number];

export type AmbientTrack = {
  id: AmbientTrackId;
  title: string;
  duration: number;
  source: number;
};

export const AMBIENT_TRACKS: readonly AmbientTrack[] = [
  {
    id: 'a-lifetime-spent-with-you',
    title: 'All My Days',
    duration: 196,
    source: require('../../assets/audio/piano/a-lifetime-spent-with-you.m4a'),
  },
  {
    id: 'river-thread',
    title: 'Still Waters',
    duration: 195,
    source: require('../../assets/audio/piano/river-thread.m4a'),
  },
  {
    id: 'tideglass-drift',
    title: 'Deep Calls to Deep',
    duration: 229,
    source: require('../../assets/audio/piano/tideglass-drift.m4a'),
  },
  {
    id: 'alpine-serenity',
    title: 'To the Hills',
    duration: 190,
    source: require('../../assets/audio/piano/alpine-serenity.m4a'),
  },
  {
    id: 'daylight-sequence',
    title: 'Brighter Still',
    duration: 184,
    source: require('../../assets/audio/piano/daylight-sequence.m4a'),
  },
  {
    id: 'morning-light-blooms',
    title: 'Morning by Morning',
    duration: 194,
    source: require('../../assets/audio/piano/morning-light-blooms.m4a'),
  },
  {
    id: 'galactic-drift',
    title: 'The Heavens',
    duration: 218,
    source: require('../../assets/audio/piano/galactic-drift.m4a'),
  },
  {
    id: 'static-harmony',
    title: 'Held Together',
    duration: 224,
    source: require('../../assets/audio/piano/static-harmony.m4a'),
  },
  {
    id: 'silent-warmth',
    title: 'Under Your Wings',
    duration: 120,
    source: require('../../assets/audio/piano/silent-warmth.m4a'),
  },
];

const TRACK_BY_ID = new Map<AmbientTrackId, AmbientTrack>(
  AMBIENT_TRACKS.map((track) => [track.id, track]),
);

export const DEFAULT_AMBIENT_TRACK_ID = AMBIENT_TRACKS[0].id;

export function isAmbientTrackId(value: unknown): value is AmbientTrackId {
  return typeof value === 'string' && (AMBIENT_TRACK_IDS as readonly string[]).includes(value);
}

export function getAmbientTrack(id: AmbientTrackId): AmbientTrack {
  return TRACK_BY_ID.get(id) ?? AMBIENT_TRACKS[0];
}

export function nextAmbientTrackId(id: AmbientTrackId): AmbientTrackId {
  const index = AMBIENT_TRACK_IDS.indexOf(id);
  return AMBIENT_TRACK_IDS[(index + 1) % AMBIENT_TRACK_IDS.length];
}

export function createAmbientShuffleOrder(
  current: AmbientTrackId,
  random: () => number = Math.random,
): AmbientTrackId[] {
  const rest = AMBIENT_TRACK_IDS.filter((id) => id !== current);
  for (let i = rest.length - 1; i > 0; i -= 1) {
    const j = Math.floor(random() * (i + 1));
    const swap = rest[i];
    rest[i] = rest[j]!;
    rest[j] = swap!;
  }
  return rest;
}

export function takeNextAmbientTrack(
  current: AmbientTrackId,
  shuffle: boolean,
  queue: readonly AmbientTrackId[],
  random: () => number = Math.random,
): { next: AmbientTrackId; queue: AmbientTrackId[] } {
  if (!shuffle) {
    return { next: nextAmbientTrackId(current), queue: [] };
  }
  const remaining = queue.length > 0 ? [...queue] : createAmbientShuffleOrder(current, random);
  const next = remaining.shift() ?? nextAmbientTrackId(current);
  return { next, queue: remaining };
}

export function formatTrackDuration(seconds: number): string {
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`;
}
