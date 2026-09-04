import type { Devotional } from './store';
import { canonicalGeneratedDayId } from './devotional-canonical-days';

export function buildDevotionalSeed({
  devotionalId = 'seeded-qa-devotional',
  nowIso = new Date().toISOString(),
}: {
  devotionalId?: string;
  nowIso?: string;
} = {}): Devotional {
  return {
    id: devotionalId,
    title: 'Quiet Path Series',
    totalDays: 3,
    currentDay: 1,
    createdAt: nowIso,
    updatedAt: nowIso,
    // Day gating (tomorrow lock, unlock labels) keys off this anchor and
    // fails closed without it, so a seed without one hides those states.
    seriesStartDate: nowIso,
    generationMode: 'progressive',
    userContext: {
      name: 'Nick',
      aboutMe: 'Seeded devotional for runtime QA.',
      currentSituation: 'Verifying reveal and reading handoff.',
      emotionalState: 'Hopeful',
    },
    days: [
      {
        devotionalId,
        id: canonicalGeneratedDayId(devotionalId, 1),
        dayNumber: 1,
        title: 'When the Path Is Quiet',
        scriptureReference: 'Psalm 46:10',
        scriptureText: 'Be still, and know that I am God.',
        bodyText:
          'God often meets us in stillness before He moves us into action. The quiet path is not empty; it is the place where attention returns, hurry loosens its grip, and the soul learns to recognize His presence again.',
        quotableLine: 'Stillness is not absence; it is attention.',
        isRead: false,
        isRevealed: false,
        generatedAt: nowIso,
        updatedAt: nowIso,
      },
      {
        devotionalId,
        id: canonicalGeneratedDayId(devotionalId, 2),
        dayNumber: 2,
        title: 'Strength for the Middle',
        scriptureReference: 'Isaiah 40:31',
        scriptureText: 'But those who wait on the Lord shall renew their strength.',
        bodyText:
          'The second day is present so reading navigation can move through a realistic multi-day series during QA.',
        quotableLine: 'Waiting is where strength is quietly renewed.',
        isRead: false,
        isRevealed: false,
        generatedAt: nowIso,
        updatedAt: nowIso,
      },
      {
        devotionalId,
        id: canonicalGeneratedDayId(devotionalId, 3),
        dayNumber: 3,
        title: 'A Faithful Next Step',
        scriptureReference: 'Proverbs 3:5-6',
        scriptureText: 'In all your ways acknowledge Him, and He shall direct your paths.',
        bodyText:
          'The final seeded day gives the series a believable ending state for downstream reading and progression checks.',
        quotableLine: 'The next faithful step is enough for today.',
        isRead: false,
        isRevealed: false,
        generatedAt: nowIso,
        updatedAt: nowIso,
      },
    ],
  };
}
