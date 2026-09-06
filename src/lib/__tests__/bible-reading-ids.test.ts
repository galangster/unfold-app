import {
  allocateBibleReadingId,
  isCollidingBibleReadingId,
} from '../bible-reading-ids';
import { compositeId } from '../sync-ids';

const UUID_V4 = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

describe('bible reading id recipes', () => {
  it('treats the old brp recipe and book+translation v5 as colliding', () => {
    expect(isCollidingBibleReadingId(undefined, 1, 'KJV')).toBe(true);
    expect(isCollidingBibleReadingId('brp_1_1_KJV', 1, 'KJV')).toBe(true);
    expect(isCollidingBibleReadingId(compositeId(1, 'KJV'), 1, 'KJV')).toBe(true);
    expect(isCollidingBibleReadingId(compositeId(1, 'BSB'), 1, 'WEB')).toBe(true);
    expect(isCollidingBibleReadingId('brp_43_3_BSB')).toBe(true);
    expect(isCollidingBibleReadingId(compositeId(1, 'BSB'), 1)).toBe(true);
    expect(isCollidingBibleReadingId(compositeId(1, 'BSB'), 1, undefined)).toBe(true);
    expect(isCollidingBibleReadingId(compositeId(1, 'KJV'), 1)).toBe(false);
    expect(isCollidingBibleReadingId('11111111-1111-4111-8111-111111111111', 1)).toBe(false);
  });

  it('retains an already unique id and mints distinct v4s for two identities', () => {
    const kept = '2c1a9b40-4d3e-4a1f-8b2c-0d1e2f3a4b5c';
    expect(allocateBibleReadingId({
      id: kept,
      bookId: 1,
      chapter: 1,
      translation: 'KJV',
    })).toBe(kept);

    const firstUser = allocateBibleReadingId({ bookId: 1, chapter: 1, translation: 'KJV' });
    const secondUser = allocateBibleReadingId({ bookId: 1, chapter: 1, translation: 'KJV' });
    expect(firstUser).toMatch(UUID_V4);
    expect(secondUser).toMatch(UUID_V4);
    expect(firstUser).not.toBe(secondUser);
  });

  it('reuses a history row id for the same book, chapter, and translation', () => {
    const existing = 'cccccccc-3333-4333-8333-333333333333';
    expect(allocateBibleReadingId(
      { bookId: 1, chapter: 1, translation: 'KJV' },
      [{ id: existing, bookId: 1, chapter: 1, translation: 'KJV' }],
    )).toBe(existing);
  });
});
