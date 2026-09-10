import type { DevotionalDay } from '@/lib/store';
import type { ReaderSection } from '@/components/reading/DevotionalContent';

/** Rows for the reader Contents tab: the two fixed sections, then only what the day has. */
export interface ReaderContentsRow {
  section: ReaderSection;
  label: string;
  detail?: string;
}

export function buildReaderContents(day: DevotionalDay): ReaderContentsRow[] {
  const rows: ReaderContentsRow[] = [
    { section: 'scripture', label: 'Scripture', detail: day.scriptureReference },
    { section: 'devotional', label: 'Devotional', detail: day.title },
  ];
  if (day.reflectionQuestions && day.reflectionQuestions.length > 0) {
    rows.push({ section: 'reflection', label: 'For Reflection', detail: `${day.reflectionQuestions.length} ${day.reflectionQuestions.length === 1 ? 'question' : 'questions'}` });
  }
  if (day.act) rows.push({ section: 'act', label: 'Today', detail: 'One act for today' });
  if (day.closingPrayer) rows.push({ section: 'prayer', label: 'A Prayer' });
  return rows;
}
