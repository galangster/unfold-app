import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react-native';

import FeelingsScreen from '@/app/feelings';
import { FEELINGS } from '@/constants/feelings';

const mockClose = jest.fn();
const mockStartNewSeries = jest.fn();
let mockParams: { feeling?: string | string[] };

jest.mock('expo-router', () => ({ useLocalSearchParams: () => mockParams }));
jest.mock('@/hooks/useGuardedBack', () => ({ useGuardedBack: () => mockClose }));
jest.mock('@/hooks/useStartNewSeries', () => ({ useStartNewSeries: () => mockStartNewSeries }));
jest.mock('@/hooks/useCreationGate', () => ({
  useCreationGate: () => ({ gate: () => true, showExclusiveOffer: false, dismissOffer: jest.fn(), handleOfferVerifiedExit: jest.fn() }),
}));
jest.mock('@/components/ExclusiveOfferSheet', () => ({ ExclusiveOfferSheet: () => null }));
// The real Button, without the barrel's sheet and gesture imports.
jest.mock('@/components/ui', () => ({ Button: jest.requireActual('@/components/ui/Button').Button }));
jest.mock('@/components/icons', () => ({ ArrowClockwiseIcon: () => null, CaretLeftIcon: () => null, XIcon: () => null }));
jest.mock('@/lib/theme', () => ({
  useTheme: () => ({ colors: jest.requireActual('@/constants/colors').DarkColors, isDark: true }),
}));
jest.mock('@/lib/useReadingFont', () => ({ useReadingFont: () => ({ body: 'SourceSerifPro_400Regular' }) }));
jest.mock('react-native-safe-area-context', () => ({ SafeAreaView: jest.requireActual('react-native').View }));
jest.mock('expo-haptics', () => ({
  ImpactFeedbackStyle: { Light: 'light' },
  impactAsync: jest.fn(),
  selectionAsync: jest.fn(),
}));
jest.mock('react-native-reanimated', () => {
  const { View } = jest.requireActual('react-native');
  const builder: Record<string, unknown> = {};
  for (const method of ['delay', 'duration', 'easing', 'reduceMotion', 'withInitialValues']) builder[method] = () => builder;
  return {
    __esModule: true,
    default: { View },
    FadeIn: builder,
    FadeInDown: builder,
    FadeOut: builder,
    ReduceMotion: { System: 'system' },
    Easing: { cubic: 'cubic', in: (e: unknown) => e, inOut: (e: unknown) => e, out: (e: unknown) => e },
  };
});

const pressButton = (name: string | RegExp) => fireEvent.press(screen.getByRole('button', { name }));
const expectList = () => expect(screen.getByRole('header', { name: 'How are you, really?' })).toBeTruthy();

describe('feelings screen', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockParams = {};
  });

  it('asks how you are and offers all twelve words as buttons', () => {
    render(<FeelingsScreen />);
    expect(screen.getByText('Check in')).toBeTruthy();
    expectList();
    expect(screen.getByText('Pick a word. Unfold finds you a passage for it.')).toBeTruthy();
    for (const feeling of FEELINGS) expect(screen.getByRole('button', { name: feeling.word })).toBeTruthy();
  });

  it('answers Weary with its label, Matthew 11:28, and the series button', () => {
    render(<FeelingsScreen />);
    pressButton('Weary');
    expect(screen.getByText('For the weary')).toBeTruthy();
    expect(screen.getByRole('header', { name: 'Weary' })).toBeTruthy();
    expect(screen.getByText(/^28 Come to Me, all you who are weary and burdened, and I will give you rest\.$/)).toBeTruthy();
    expect(screen.getByText('Matthew 11:28 · Berean Standard Bible')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Begin a 5-day series for this' })).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Anxious' })).toBeNull();
  });

  it('cycles through the feeling\'s passages with Another passage', () => {
    render(<FeelingsScreen />);
    pressButton('Weary');
    expect(screen.getByText('Another passage 1/3')).toBeTruthy();

    pressButton('Another passage, 1 of 3');
    expect(screen.getByText(/He gives power to the faint and increases the strength of the weak\./)).toBeTruthy();
    expect(screen.getByText('Isaiah 40:29 · Berean Standard Bible')).toBeTruthy();
    expect(screen.getByText('Another passage 2/3')).toBeTruthy();

    pressButton('Another passage, 2 of 3');
    expect(screen.getByText('Psalm 116:7 · Berean Standard Bible')).toBeTruthy();
    pressButton('Another passage, 3 of 3');
    expect(screen.getByText('Matthew 11:28 · Berean Standard Bible')).toBeTruthy();
  });

  it('opens straight on the answer the feeling param names', () => {
    mockParams = { feeling: 'grieving' };
    render(<FeelingsScreen />);
    expect(screen.getByText('For the grieving')).toBeTruthy();
    // LORD keeps its letters while the last three are set as small capitals.
    expect(screen.getByText(/^18 The LORD is near to the brokenhearted; He saves the contrite in spirit\.$/)).toBeTruthy();
    expect(screen.getByText('Psalm 34:18 · Berean Standard Bible')).toBeTruthy();
  });

  it.each([['an unknown id', { feeling: 'overjoyed' }], ['no id', {}]])('opens on the list for %s', (_case, params) => {
    mockParams = params;
    render(<FeelingsScreen />);
    expectList();
    expect(screen.queryByText(/Berean Standard Bible/)).toBeNull();
  });

  it('returns to the list from All feelings', () => {
    render(<FeelingsScreen />);
    pressButton('Weary');
    pressButton('All feelings');
    expectList();
    expect(screen.queryByText('For the weary')).toBeNull();
    expect(screen.getByRole('button', { name: 'Weary' })).toBeTruthy();
  });

  it('trims a closing quote that opens in an earlier verse', () => {
    mockParams = { feeling: 'alone' };
    render(<FeelingsScreen />);
    expect(screen.getByText(/Do not be afraid or discouraged\.$/)).toBeTruthy();
  });

  it('closes through the guarded back from either state', () => {
    render(<FeelingsScreen />);
    pressButton('Close');
    pressButton('Weary');
    pressButton('Close');
    expect(mockClose).toHaveBeenCalledTimes(2);
  });

  it('starts a new series from the primary button', () => {
    render(<FeelingsScreen />);
    pressButton('Anxious');
    pressButton('Begin a 5-day series for this');
    expect(mockStartNewSeries).toHaveBeenCalledTimes(1);
  });
});
