import type { Devotional, DevotionalDay } from './store';
import type { PulledDevotionalContent } from './devotional-sync-pull';
import { buildDevotionalSyncMetadataPatch } from './devotional-sync-metadata';

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
  if (pulled.days.length > 0) {
    updateDevotionalDays(devotionalId, pulled.days, pulled.devotional?.title);
  }

  if (pulled.devotional) {
    updateDevotionals((devotionals) =>
      applyPulledDevotionalMetadataToDevotionals(devotionals, devotionalId, pulled),
    );
  }
}
