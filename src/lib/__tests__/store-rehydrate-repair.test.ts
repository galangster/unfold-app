import { repairRehydratedState } from '../store-rehydrate-repair';

// Build a minimal valid state for testing
function makeValidState(): Record<string, any> {
  return {
    devotionals: [],
    journalEntries: [],
    bookmarks: [],
    highlights: [],
    usedScriptures: [],
    checkIns: [],
    notes: [],
    folders: [],
    bibleHighlights: [],
    bibleReadingHistory: [],
    generationSession: { status: 'idle', devotionalId: null, totalDays: 0, generatedDayNumbers: [] },
    currentDevotionalId: null,
    resumeContext: null,
    user: { id: 'u1' },
  };
}

const initialState: Record<string, any> = {
  devotionals: [],
  journalEntries: [],
  bookmarks: [],
  highlights: [],
  usedScriptures: [],
  checkIns: [],
  notes: [],
  folders: [],
  bibleHighlights: [],
  bibleReadingHistory: [],
  generationSession: { status: 'idle', devotionalId: null, totalDays: 0, generatedDayNumbers: [] },
  currentDevotionalId: null,
  resumeContext: null,
  user: null,
};

describe('repairRehydratedState', () => {
  it('resets only the corrupt slice', () => {
    const state = makeValidState();
    state.usedScriptures = 'corrupt';
    const journalRef = [{ id: 'j1' }];
    state.journalEntries = journalRef;

    const { repairedKeys } = repairRehydratedState(state, initialState);

    expect(state.usedScriptures).toEqual([]);
    expect(state.journalEntries).toBe(journalRef); // reference identity preserved
    expect(repairedKeys).toEqual(['usedScriptures']);
  });

  it('validates the notebook and bible slices', () => {
    const state = makeValidState();
    state.notes = 42;
    state.folders = null;
    state.bibleHighlights = {};
    state.bibleReadingHistory = 'x';

    const { repairedKeys } = repairRehydratedState(state, initialState);

    expect(state.notes).toEqual([]);
    expect(state.folders).toEqual([]);
    expect(state.bibleHighlights).toEqual([]);
    expect(state.bibleReadingHistory).toEqual([]);
    expect(repairedKeys).toHaveLength(4);
  });

  it('resetting devotionals also resets its dependents', () => {
    const state = makeValidState();
    state.devotionals = null;
    state.currentDevotionalId = 'd1';
    state.resumeContext = { x: 1 };
    const journalRef = [{ id: 'j1' }];
    state.journalEntries = journalRef;
    const checkInsRef: any[] = [];
    state.checkIns = checkInsRef;
    const notesRef: any[] = [];
    state.notes = notesRef;

    const { repairedKeys } = repairRehydratedState(state, initialState);

    expect(state.devotionals).toEqual([]);
    expect(state.currentDevotionalId).toBeNull();
    expect(state.resumeContext).toBeNull(); // initialState.resumeContext === null
    // Non-dependent slices untouched
    expect(state.journalEntries).toBe(journalRef);
    expect(state.checkIns).toBe(checkInsRef);
    expect(state.notes).toBe(notesRef);
    expect(repairedKeys).toContain('devotionals');
    expect(repairedKeys).toContain('currentDevotionalId');
    expect(repairedKeys).toContain('resumeContext');
  });

  it('valid state is untouched', () => {
    const state = makeValidState();
    const originalKeys = Object.keys(state);
    const snapshots: Record<string, any> = {};
    for (const k of originalKeys) snapshots[k] = state[k];

    const { repairedKeys } = repairRehydratedState(state, initialState);

    expect(repairedKeys).toEqual([]);
    // Every slice keeps reference identity
    for (const k of originalKeys) {
      expect(state[k]).toBe(snapshots[k]);
    }
  });

  it('invalid generationSession resets only generationSession', () => {
    const state = makeValidState();
    state.generationSession = null;

    const { repairedKeys } = repairRehydratedState(state, initialState);

    expect(repairedKeys).toEqual(['generationSession']);
    expect(state.generationSession).toEqual(initialState.generationSession);
  });
});
