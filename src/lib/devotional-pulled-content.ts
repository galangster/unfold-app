import type { Devotional, DevotionalDay } from './store';
import type { PulledDevotionalContent } from './devotional-sync-pull';
import { canonicalGeneratedDayId } from './devotional-canonical-days';
import { buildDevotionalSyncMetadataPatch } from './devotional-sync-metadata';

function normalizePulledDaysForDevotional(
  devotionalId: string,
  days: DevotionalDay[],
  updatedAt: string,
): DevotionalDay[] {
  return days
    .map((day) => ({
      ...day,
      id: day.id ?? canonicalGeneratedDayId(devotionalId, day.dayNumber),
      devotionalId,
      updatedAt: day.updatedAt ?? updatedAt,
    }))
    .sort((a, b) => a.dayNumber - b.dayNumber);
}

function buildPulledDevotionalShell(
  devotionalId: string,
  pulled: PulledDevotionalContent,
): Devotional | null {
  if (!pulled.devotional && pulled.days.length === 0) return null;

  const updatedAt = pulled.devotional?.updatedAt ?? pulled.timestamp ?? new Date().toISOString();
  const days = normalizePulledDaysForDevotional(devotionalId, pulled.days, updatedAt);
  const highestPulledDayNumber = days.reduce((highest, day) => Math.max(highest, day.dayNumber), 0);
  const totalDays = Math.max(
    pulled.devotional?.totalDays ?? 0,
    highestPulledDayNumber,
    days.length,
    1,
  );

  return {
    id: devotionalId,
    title: pulled.devotional?.title ?? days[0]?.title ?? 'Your Devotional',
    totalDays,
    currentDay: Math.max(1, pulled.devotional?.currentDay ?? days[0]?.dayNumber ?? 1),
    days,
    createdAt: days[0]?.generatedAt ?? updatedAt,
    updatedAt,
    seriesStartDate: days[0]?.generatedAt ?? updatedAt,
    userContext: {
      name: '',
      aboutMe: '',
      currentSituation: '',
      emotionalState: '',
    },
    generationMode: 'progressive',
  };
}

export function applyPulledDevotionalMetadataToDevotionals(
  devotionals: Devotional[],
  devotionalId: string,
  pulled: PulledDevotionalContent,
): Devotional[] {
  if (!pulled.devotional) return devotionals;

  let didChange = false;
  const nextDevotionals = devotionals.map((devotional) => {
    if (devotional.id !== devotionalId) return devotional;

    const patch = buildDevotionalSyncMetadataPatch(devotional, pulled.devotional);
    if (Object.keys(patch).length === 0) return devotional;

    didChange = true;
    return { ...devotional, ...patch };
  });

  return didChange ? nextDevotionals : devotionals;
}

export function applyPulledDevotionalContentToDevotionals(
  devotionals: Devotional[],
  devotionalId: string,
  pulled: PulledDevotionalContent,
): Devotional[] {
  const existing = devotionals.some((devotional) => devotional.id === devotionalId);
  if (existing) {
    return applyPulledDevotionalMetadataToDevotionals(devotionals, devotionalId, pulled);
  }

  const shell = buildPulledDevotionalShell(devotionalId, pulled);
  return shell ? [shell, ...devotionals] : devotionals;
}

export function applyPulledDevotionalContent({
  devotionalId,
  pulled,
  updateDevotionalDays,
  updateDevotionals,
}: {
  devotionalId: string;
  pulled: PulledDevotionalContent;
  updateDevotionalDays: (devotionalId: string, days: DevotionalDay[], title?: string) => void;
  updateDevotionals: (updater: (devotionals: Devotional[]) => Devotional[]) => void;
}): void {
  if (pulled.devotional || pulled.days.length > 0) {
    updateDevotionals((devotionals) =>
      applyPulledDevotionalContentToDevotionals(devotionals, devotionalId, pulled),
    );
  }

  if (pulled.days.length > 0) {
    updateDevotionalDays(devotionalId, pulled.days, pulled.devotional?.title);
  }
}
