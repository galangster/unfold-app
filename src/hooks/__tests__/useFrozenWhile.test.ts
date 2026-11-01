import { renderHook } from '@testing-library/react-native';
import { useFrozenWhile } from '../useFrozenWhile';

describe('useFrozenWhile', () => {
  it('holds the first value while active and releases it when inactive', () => {
    const { result, rerender } = renderHook(({ active, value }: { active: boolean; value: string }) => useFrozenWhile(active, value), {
      initialProps: { active: true, value: 'first' },
    });
    expect(result.current).toBe('first');
    rerender({ active: true, value: 'second' });
    expect(result.current).toBe('first');
    rerender({ active: false, value: 'second' });
    expect(result.current).toBe('second');
    rerender({ active: true, value: 'third' });
    expect(result.current).toBe('third');
    rerender({ active: true, value: 'fourth' });
    expect(result.current).toBe('third');
  });
});
