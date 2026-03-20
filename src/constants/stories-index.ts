// ==========================================
// STORY REPOSITORY INDEX
// Combined access to all story collections
// ==========================================

export type { StoryEntry } from './stories-psychology-science';
export { PSYCHOLOGY_SCIENCE_STORIES } from './stories-psychology-science';
export { LITERATURE_FILM_STORIES } from './stories-literature-film';

import { PSYCHOLOGY_SCIENCE_STORIES } from './stories-psychology-science';
import { LITERATURE_FILM_STORIES } from './stories-literature-film';
import type { StoryEntry } from './stories-psychology-science';

/** All stories combined */
export const ALL_STORIES: StoryEntry[] = [
  ...PSYCHOLOGY_SCIENCE_STORIES,
  ...LITERATURE_FILM_STORIES,
];

/** Get stories by theme tag */
export function getStoriesByTheme(theme: string): StoryEntry[] {
  return ALL_STORIES.filter((s) => s.themes.includes(theme));
}

/** Get a random story from a category */
export function getRandomStory(
  category?: 'psychology-science' | 'literature-film',
): StoryEntry {
  const pool = category
    ? ALL_STORIES.filter((s) => s.category === category)
    : ALL_STORIES;
  return pool[Math.floor(Math.random() * pool.length)];
}

/** Get stories matching any of the provided themes */
export function getStoriesByThemes(themes: string[]): StoryEntry[] {
  return ALL_STORIES.filter((s) =>
    s.themes.some((t) => themes.includes(t)),
  );
}

/** Get all unique theme tags across the repository */
export function getAllThemes(): string[] {
  const themeSet = new Set<string>();
  ALL_STORIES.forEach((s) => s.themes.forEach((t) => themeSet.add(t)));
  return Array.from(themeSet).sort();
}

/** Story count summary */
export const STORY_COUNTS = {
  psychologyScience: PSYCHOLOGY_SCIENCE_STORIES.length,
  literatureFilm: LITERATURE_FILM_STORIES.length,
  total: PSYCHOLOGY_SCIENCE_STORIES.length + LITERATURE_FILM_STORIES.length,
} as const;
