/**
 * The reflection desk scrolls on its own, so a focused answer moves this page
 * and never the reading beside it.
 */
import { createRef } from 'react';
import type { ScrollView } from 'react-native';
import renderer, { act } from 'react-test-renderer';
import { ReflectionFacingPage } from '../ReflectionFacingPage';

type JournalProps = {
  questions: string[];
  scrollContentRef?: { current: unknown };
  onFocusInput?: (contentY: number) => void;
  onOpenFullJournal: (focusQuestion?: number) => void;
};
const mockJournal = jest.fn((_props: JournalProps) => null);

jest.mock('../InlineReflectionJournal', () => ({
  InlineReflectionJournal: (props: JournalProps) => mockJournal(props),
}));
jest.mock('react-native-reanimated', () => ({ useReducedMotion: () => true }));
jest.mock('@/lib/theme', () => ({
  useTheme: () => ({ isDark: false, colors: new Proxy({}, { get: () => '#888888' }) }),
}));

describe('ReflectionFacingPage', () => {
  it('hosts the day journal and scrolls its own page to a focused answer', () => {
    const scrollViewRef = createRef<ScrollView>();
    const onOpenFullJournal = jest.fn();
    act(() => {
      renderer.create(
        <ReflectionFacingPage
          questions={['What stayed with you?']}
          devotionalId="devo"
          dayNumber={3}
          dayTitle="Room to breathe"
          fontSize="medium"
          onOpenFullJournal={onOpenFullJournal}
          scrollViewRef={scrollViewRef}
        />,
      );
    });

    const props = mockJournal.mock.calls.at(-1)![0];
    expect(props.questions).toEqual(['What stayed with you?']);
    expect(props.onOpenFullJournal).toBe(onOpenFullJournal);
    expect(props.scrollContentRef?.current).toBeTruthy();

    const scrollTo = jest.fn();
    (scrollViewRef.current as unknown as { scrollTo: typeof scrollTo }).scrollTo = scrollTo;
    act(() => props.onFocusInput?.(400));
    expect(scrollTo).toHaveBeenCalledWith({ y: 336, animated: false });

    act(() => props.onFocusInput?.(20));
    expect(scrollTo).toHaveBeenLastCalledWith({ y: 0, animated: false });
  });
});
