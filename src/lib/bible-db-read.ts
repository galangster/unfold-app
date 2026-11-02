import { getBibleDbStatus } from '@/lib/bible-db';

/**
 * Fail an empty read when the database is not ready. Query caches would
 * otherwise keep the empty result, and the page or search would stay blank
 * after the reader downloads the Bible again.
 */
export function failEmptyReadWithoutDb<T>(rows: T[]): T[] {
  if (rows.length === 0 && getBibleDbStatus().status !== 'ready') {
    throw new Error('Bible database is not ready');
  }
  return rows;
}
