import { buildInitialArcUserContext } from '../generation-api';

describe('buildInitialArcUserContext', () => {
  const baseUser = {
    name: 'Nick',
    aboutMe: 'Building Unfold',
    currentSituation: 'Launch week is heavy',
    emotionalState: 'anxious',
    spiritualSeeking: 'More peace',
  };

  it('maps the core profile fields to the legacy userContext shape', () => {
    const context = buildInitialArcUserContext(baseUser);

    expect(context).toMatchObject({
      name: 'Nick',
      aboutMe: 'Building Unfold',
      situation: 'Launch week is heavy',
      emotion: 'anxious',
      faith: '',
      seeking: 'More peace',
      themeCategory: '',
      devotionalType: 'personal',
      bibleTranslation: 'BSB',
    });
  });

  it('passes through the 5 new personalization fields when present', () => {
    const context = buildInitialArcUserContext({
      ...baseUser,
      keyPeople: [{ name: 'Sam', relationship: 'Spouse' }],
      upcomingEvent: { label: 'A move', date: '2026-08-15' },
      diagnosticAnswers: [{ question: 'What feels heaviest?', answer: 'The unknown' }],
      mirrorWorkingRead: 'It sounds like control is the real ask here.',
      mirrorCorrection: 'Actually it is about trust, not control.',
    });

    expect(context.keyPeople).toEqual([{ name: 'Sam', relationship: 'Spouse' }]);
    expect(context.upcomingEvent).toEqual({ label: 'A move', date: '2026-08-15' });
    expect(context.diagnosticAnswers).toEqual([{ question: 'What feels heaviest?', answer: 'The unknown' }]);
    expect(context.workingRead).toBe('It sounds like control is the real ask here.');
    expect(context.userCorrection).toBe('Actually it is about trust, not control.');
  });

  it('passes several people who share a relationship through unchanged', () => {
    const keyPeople = [
      { name: 'Anthony', relationship: 'Friend' },
      { name: 'Mi Young', relationship: 'Friend' },
    ];
    const context = buildInitialArcUserContext({ ...baseUser, keyPeople });

    expect(context.keyPeople).toEqual(keyPeople);
  });

  it('leaves the 5 new fields undefined when absent, without inventing defaults', () => {
    const context = buildInitialArcUserContext(baseUser);

    expect(context.keyPeople).toBeUndefined();
    expect(context.upcomingEvent).toBeUndefined();
    expect(context.diagnosticAnswers).toBeUndefined();
    expect(context.workingRead).toBeUndefined();
    expect(context.userCorrection).toBeUndefined();
  });

  it('falls back to sensible defaults for theme, type, and translation', () => {
    const context = buildInitialArcUserContext(baseUser);
    expect(context.themeCategory).toBe('');
    expect(context.devotionalType).toBe('personal');
    expect(context.bibleTranslation).toBe('BSB');

    const withSelections = buildInitialArcUserContext({
      ...baseUser,
      selectedTheme: 'trust',
      selectedType: 'book_study',
      bibleTranslation: 'ESV',
    });
    expect(withSelections.themeCategory).toBe('trust');
    expect(withSelections.devotionalType).toBe('book_study');
    expect(withSelections.bibleTranslation).toBe('ESV');
  });
});
