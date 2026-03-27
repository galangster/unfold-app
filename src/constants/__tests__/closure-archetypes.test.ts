import { CLOSURE_ARCHETYPES, getClosureArchetypeForSeries } from '../writing-craft';

describe('CLOSURE_ARCHETYPES', () => {
  it('has exactly 11 archetypes', () => {
    expect(CLOSURE_ARCHETYPES).toHaveLength(11);
  });

  it('each archetype has id, name, and description', () => {
    CLOSURE_ARCHETYPES.forEach((a) => {
      expect(a.id).toBeTruthy();
      expect(a.name).toBeTruthy();
      expect(a.description.length).toBeGreaterThan(20);
    });
  });
});

describe('getClosureArchetypeForSeries', () => {
  it('returns the same archetype for the same devotionalId', () => {
    const a = getClosureArchetypeForSeries('devo-abc-123');
    const b = getClosureArchetypeForSeries('devo-abc-123');
    expect(a.id).toBe(b.id);
  });

  it('returns different archetypes for different devotionalIds', () => {
    // Not guaranteed for every pair but should differ for these
    const ids = ['devo-1', 'devo-2', 'devo-3', 'devo-4', 'devo-5'];
    const archetypes = ids.map((id) => getClosureArchetypeForSeries(id).id);
    const unique = new Set(archetypes);
    // At least 2 different archetypes out of 5 IDs (probabilistically near-certain)
    expect(unique.size).toBeGreaterThanOrEqual(2);
  });
});
