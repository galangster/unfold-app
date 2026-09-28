import React from 'react';
import { TextInput } from 'react-native';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';
import LifeUpdateScreen from '@/app/life-update';
import { beginLocalResetSession, endLocalResetSession } from '@/lib/sync-session-fence';

const mockReplace = jest.fn();
const mockBack = jest.fn();
const mockGate = jest.fn(() => true);
let mockNext: string | undefined;
const mockUpdateUser = jest.fn();
const mockDraft = jest.fn();
let mockState: any;
// The store keeps what it is given, so a remount sees the persisted draft.
const mockSeriesDraft = jest.fn((text: string | null) => { mockState.newSeriesLifeDraft = text; });

jest.mock('expo-router', () => ({
  useRouter: () => ({ replace: mockReplace }),
  useLocalSearchParams: () => ({ next: mockNext }),
  Redirect: () => null,
}));
jest.mock('@/hooks/useGuardedBack', () => ({ useGuardedBack: () => mockBack }));
jest.mock('@/hooks/useCreationGate', () => ({ useCreationGate: () => ({ gate: mockGate }) }));
jest.mock('@/components/ExclusiveOfferSheet', () => ({ ExclusiveOfferSheet: () => null }));
jest.mock('@/lib/store', () => ({
  useHasHydrated: () => true,
  useUnfoldStore: Object.assign((selector: (state: unknown) => unknown) => selector(mockState), { getState: () => mockState }),
}));
jest.mock('@/lib/theme', () => ({ useTheme: () => ({ colors: { background: '#000', text: '#fff', textMuted: '#ccc' }, isDark: true }) }));
jest.mock('react-native-safe-area-context', () => ({ SafeAreaView: jest.requireActual('react-native').View }));
jest.mock('@/components/ui', () => {
  const { createElement } = jest.requireActual('react');
  return { Button: (props: object) => createElement('Button', props) };
});
jest.mock('@/components/LifeContextInput', () => {
  const { createElement } = jest.requireActual('react');
  return { LifeContextInput: (props: object) => createElement(jest.requireActual('react-native').TextInput, props) };
});

describe('life update before a new series', () => {
  let view: ReactTestRenderer;
  beforeEach(() => {
    jest.clearAllMocks();
    mockNext = 'series';
    mockGate.mockReturnValue(true);
    mockState = {
      user: { hasCompletedOnboarding: true, currentSituation: 'Caring for my father.' },
      lifeContextDraft: null,
      newSeriesLifeDraft: null,
      updateUser: mockUpdateUser,
      setLifeContextDraft: mockDraft,
      setNewSeriesLifeDraft: mockSeriesDraft,
    };
  });
  afterEach(() => { if (view) act(() => view.unmount()); });
  function render() { act(() => { view = create(<LifeUpdateScreen />); }); }
  function press(label: string) { act(() => view.root.findByProps({ label }).props.onPress()); }
  const situationWrites = () => mockUpdateUser.mock.calls.filter(([patch]) => 'currentSituation' in patch);
  const RETIRED_INTAKE = { diagnosticAnswers: undefined, mirrorWorkingRead: undefined, mirrorCorrection: undefined };

  it('opens a new series blank, without the previous answer or another screen\'s unsaved edit', () => {
    mockState.lifeContextDraft = 'I also want to learn about forgiveness.';
    render();
    expect(view.root.findByType(TextInput).props.value).toBe('');
    expect(view.root.findAllByProps({ label: 'Discard unfinished edits' })).toHaveLength(0);
  });

  it.each(['Skip for now', 'Save and create series'])('keeps the saved context and unfinished writing on "%s" with a blank field', (label) => {
    mockState.lifeContextDraft = 'I also want to learn about forgiveness.';
    render();
    press(label);
    expect(situationWrites()).toEqual([]);
    expect(mockDraft).not.toHaveBeenCalled();
    expect(mockSeriesDraft).toHaveBeenLastCalledWith(null);
    expect(mockReplace).toHaveBeenCalledWith('/generating');
  });

  it('keeps an unfinished new-series answer through a close and reopen, apart from Share an update\'s draft', () => {
    mockState.lifeContextDraft = 'I also want to learn about forgiveness.';
    render();
    act(() => view.root.findByType(TextInput).props.onChangeText('Starting a new job'));
    press('Close');
    act(() => view.unmount());
    render();
    expect(view.root.findByType(TextInput).props.value).toBe('Starting a new job');
    expect(view.root.findAllByProps({ label: 'Discard unfinished edits' }).length).toBeGreaterThan(0);
    expect(mockDraft).not.toHaveBeenCalled();
    expect(mockState.lifeContextDraft).toBe('I also want to learn about forgiveness.');
  });

  it('opens the next new series blank once this one is submitted', () => {
    render();
    act(() => view.root.findByType(TextInput).props.onChangeText('Starting a new job'));
    press('Save and create series');
    act(() => view.unmount());
    render();
    expect(view.root.findByType(TextInput).props.value).toBe('');
  });

  it('restores unfinished writing when sharing an update', () => {
    mockNext = undefined;
    mockState.lifeContextDraft = 'I also want to learn about forgiveness.';
    render();
    expect(view.root.findByType(TextInput).props.value).toBe(mockState.lifeContextDraft);
    expect(view.root.findAllByProps({ label: 'Discard unfinished edits' }).length).toBeGreaterThan(0);
    act(() => view.root.findByType(TextInput).props.onChangeText('I also want to learn about patience.'));
    expect(mockDraft).toHaveBeenLastCalledWith('I also want to learn about patience.');
  });

  it('saves all 6000 characters before generating and prevents duplicate navigation', () => {
    render();
    const detail = 'I want to learn how to listen better.';
    const update = 'a'.repeat(6000 - detail.length) + detail;
    act(() => view.root.findByType(TextInput).props.onChangeText(update));
    // A new series answer is not written as a Share an update draft.
    expect(mockDraft).not.toHaveBeenCalled();
    press('Save and create series');
    press('Save and create series');
    expect(situationWrites()).toEqual([[{ currentSituation: update }]]);
    expect(mockDraft).not.toHaveBeenCalled();
    expect(mockSeriesDraft).toHaveBeenLastCalledWith(null);
    expect(mockReplace).toHaveBeenCalledTimes(1);
  });

  it('keeps an over-limit edit available and blocks saving without truncating', () => {
    render();
    const update = 'a'.repeat(6001);
    act(() => view.root.findByType(TextInput).props.onChangeText(update));
    expect(view.root.findByProps({ label: 'Save and create series' }).props.disabled).toBe(true);
    press('Save and create series');
    expect(view.root.findByType(TextInput).props.value).toBe(update);
    expect(mockSeriesDraft).toHaveBeenLastCalledWith(update);
    expect(mockUpdateUser).not.toHaveBeenCalled();
  });

  it('does not generate while the subscription gate is unresolved', () => {
    mockGate.mockReturnValue(false);
    render();
    press('Skip for now');
    expect(mockReplace).not.toHaveBeenCalled();
    expect(situationWrites()).toEqual([]);
  });

  it('starts the new series without the last intake\'s deeper answers and read', () => {
    render();
    act(() => view.root.findByType(TextInput).props.onChangeText('Starting a new job next month.'));
    press('Save and create series');
    expect(mockUpdateUser).toHaveBeenCalledWith({ currentSituation: 'Starting a new job next month.' });
    expect(mockUpdateUser).toHaveBeenCalledWith(RETIRED_INTAKE);
    expect(mockReplace).toHaveBeenCalledWith('/generating');
  });

  it('retires the last intake before the creation gate, whose paywall routes can start the series', () => {
    mockGate.mockReturnValue(false);
    render();
    press('Skip for now');
    expect(mockUpdateUser).toHaveBeenCalledWith(RETIRED_INTAKE);
    expect(mockReplace).not.toHaveBeenCalled();
  });

  it('does not apply an old session draft after account reset', () => {
    render();
    const reset = beginLocalResetSession();
    endLocalResetSession(reset);
    press('Save and create series');
    expect(mockUpdateUser).not.toHaveBeenCalled();
    expect(mockReplace).not.toHaveBeenCalled();
  });

  it('saves a reminder update without starting a series', () => {
    mockNext = undefined;
    render();
    press('Save update');
    expect(mockUpdateUser).toHaveBeenCalledWith({ currentSituation: 'Caring for my father.' });
    expect(mockReplace).not.toHaveBeenCalled();
    press('Done');
    expect(mockBack).toHaveBeenCalledTimes(1);
  });
});
