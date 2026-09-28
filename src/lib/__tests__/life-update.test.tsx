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
      updateUser: mockUpdateUser,
      setLifeContextDraft: mockDraft,
    };
  });
  afterEach(() => { if (view) act(() => view.unmount()); });
  function render() { act(() => { view = create(<LifeUpdateScreen />); }); }
  function press(label: string) { act(() => view.root.findByProps({ label }).props.onPress()); }
  const situationWrites = () => mockUpdateUser.mock.calls.filter(([patch]) => 'currentSituation' in patch);

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
    expect(mockReplace).toHaveBeenCalledWith('/generating');
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
    expect(mockReplace).toHaveBeenCalledTimes(1);
  });

  it('keeps an over-limit edit available and blocks saving without truncating', () => {
    render();
    const update = 'a'.repeat(6001);
    act(() => view.root.findByType(TextInput).props.onChangeText(update));
    expect(view.root.findByProps({ label: 'Save and create series' }).props.disabled).toBe(true);
    press('Save and create series');
    expect(view.root.findByType(TextInput).props.value).toBe(update);
    expect(mockUpdateUser).not.toHaveBeenCalled();
  });

  it('does not generate while the subscription gate is unresolved', () => {
    mockGate.mockReturnValue(false);
    render();
    press('Skip for now');
    expect(mockReplace).not.toHaveBeenCalled();
    expect(situationWrites()).toEqual([]);
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
