import { Spacing } from '@/constants/spacing';

/**
 * Tabs the custom bar actually draws. (you) is href:null and is not listed.
 * Tab layout, onboarding spotlight math, and compact-width fitting all read
 * this list so a sixth tab cannot drift the divisor again.
 */
export const VISIBLE_TAB_GROUPS = [
  '(today)',
  '(study)',
  '(bible)',
  '(ask)',
  '(journal)',
] as const;

export type VisibleTabGroup = (typeof VISIBLE_TAB_GROUPS)[number];

/** User-facing titles. Internal group remains (study); the label is Devotional. */
export const VISIBLE_TAB_TITLES: Record<VisibleTabGroup, string> = {
  '(today)': 'Today',
  '(study)': 'Devotional',
  '(bible)': 'Bible',
  '(ask)': 'Companion',
  '(journal)': 'Journal',
};

export const VISIBLE_TAB_COUNT = VISIBLE_TAB_GROUPS.length;

/**
 * Horizontal inset of the custom tab bar. Tightened from Spacing['6'] so five
 * labels fit compact widths before type is reduced. Onboarding uses the same
 * value so the spotlight stays aligned.
 */
export const TAB_BAR_HORIZONTAL_PADDING = Spacing['2'];

export function isVisibleTabGroup(name: string): name is VisibleTabGroup {
  return (VISIBLE_TAB_GROUPS as readonly string[]).includes(name);
}

export function titleForVisibleTab(name: string): string | undefined {
  return isVisibleTabGroup(name) ? VISIBLE_TAB_TITLES[name] : undefined;
}
