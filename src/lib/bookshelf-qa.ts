import { assertTrialSeriesFixtureEnvironment, buildTrialSeriesSeed, TRIAL_SERIES_FIXTURE_PERSONA } from './dev-seed';
import { useUnfoldStore } from './store';

/** Local, fictional fixtures only. Never change Today or replace a user's collection. */
export function seedBookshelfExamples() {
  assertTrialSeriesFixtureEnvironment();
  const state = useUnfoldStore.getState();
  if (state.user?.name !== TRIAL_SERIES_FIXTURE_PERSONA.name) throw new Error('Use the fictional trial profile before seeding books.');
  const titles = ['Where the Light Falls', 'The Courage to Begin', 'A Quiet Kind of Faith', 'Held in the Waiting', 'The Small and Sacred', 'Learning to Stay', 'When the Way Is Not Yet Clear and You Are Learning to Trust the Next Small Step', 'Room for Wonder'];
  const books = titles.map((title, index) => {
    const now = new Date(Date.now() - (index + 1) * 8 * 86400000);
    const seed = buildTrialSeriesSeed({ state: index % 3 === 0 ? 'series-complete' : 'today-day2-read', now, devotionalId: `qa-bookshelf-${index + 1}` });
    if (!seed.devotional) throw new Error('Fixture did not create a book.');
    return { ...seed.devotional, title, createdAt: now.toISOString(), archivedAt: now.toISOString() };
  });
  useUnfoldStore.setState({ devotionals: [...state.devotionals.filter(book => !books.some(fixture => fixture.id === book.id)), ...books] });
}

