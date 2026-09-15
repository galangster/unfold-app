import {
  BOOK_OPENING_EXPAND_END,
  HARDCOVER_HINGE_DEGREES,
  HARDCOVER_PAPER_EXPOSE,
  bookActionLabel,
  bookOpeningExpand,
  bookPlaceLine,
  hardcoverHingeDegrees,
  hardcoverPaperCurlProgress,
  heroBookSize,
} from '../book-opening';
import type { BookTodayPage } from '../book-of-seasons';

const page: BookTodayPage = {
  dayNumber: 2,
  totalDays: 7,
  title: 'The Middle Hour',
  contentReady: true,
  completedToday: false,
  seriesComplete: false,
  canOpen: true,
  action: 'continue',
  eyebrow: 'today',
};

it('keeps paper curl at zero until the hardcover has exposed the page', () => {
  expect(hardcoverPaperCurlProgress(0)).toBe(0);
  expect(hardcoverPaperCurlProgress(HARDCOVER_PAPER_EXPOSE)).toBe(0);
  expect(hardcoverPaperCurlProgress(HARDCOVER_PAPER_EXPOSE - 0.05)).toBe(0);
  expect(hardcoverPaperCurlProgress(HARDCOVER_PAPER_EXPOSE + 0.01)).toBeGreaterThan(0);
  expect(hardcoverPaperCurlProgress(1)).toBeCloseTo(1);
});

it('hinges the cover from the left spine and matches shader expansion', () => {
  expect(hardcoverHingeDegrees(0)).toBeCloseTo(0);
  expect(hardcoverHingeDegrees(1)).toBe(HARDCOVER_HINGE_DEGREES);
  expect(hardcoverHingeDegrees(0.5)).toBe(HARDCOVER_HINGE_DEGREES / 2);
  expect(bookOpeningExpand(0)).toBe(0);
  expect(bookOpeningExpand(BOOK_OPENING_EXPAND_END)).toBe(1);
  expect(bookOpeningExpand(1)).toBe(1);
  expect(bookOpeningExpand(BOOK_OPENING_EXPAND_END / 2)).toBeCloseTo(0.5);
});

it('shrinks the hero book on short screens and larger text', () => {
  const phone = heroBookSize(390, 844, 1);
  expect(phone.height / phone.width).toBeCloseTo(1.4, 1);
  const small = heroBookSize(320, 568, 1);
  expect(small.height).toBeLessThan(phone.height);
  expect(small.height).toBeLessThan(568 * 0.44);
  const largeType = heroBookSize(390, 844, 1.6);
  expect(largeType.height).toBeLessThan(phone.height);
});

it('keeps continue copy aligned with the paper page', () => {
  expect(bookActionLabel('continue')).toBe('Continue reading');
  expect(bookActionLabel('read-again')).toBe('Read again');
  expect(bookActionLabel(null)).toBeNull();
  expect(bookPlaceLine(page)).toBeUndefined();
  expect(bookPlaceLine({ ...page, completedToday: true })).toBe('Your next reading will be here tomorrow.');
});
