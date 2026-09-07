export const BIBLE_HUB_VIEW_STORAGE_KEY = 'bibleHomeView';
export const BIBLE_HUB_VIEW_VALUES = ['grid', 'names'] as const;
export const BIBLE_HUB_VIEW_LABELS = ['Grid', 'Names'] as const;

export type BibleHubView = (typeof BIBLE_HUB_VIEW_VALUES)[number];

export const BIBLE_HUB_DEFAULT_VIEW: BibleHubView = 'grid';

export function parseBibleHubViewPreference(value: unknown): BibleHubView {
  return value === 'grid' || value === 'names' ? value : BIBLE_HUB_DEFAULT_VIEW;
}

export function bibleHubViewFromLabel(label: string): BibleHubView {
  return label === 'Names' ? 'names' : 'grid';
}
