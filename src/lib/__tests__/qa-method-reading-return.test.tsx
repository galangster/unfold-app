/* eslint-disable import/first */
const mockIsScripturePracticeEnabled = jest.fn(() => true);
jest.mock('../scripture-practice-feature', () => ({
  isScripturePracticeEnabled: () => mockIsScripturePracticeEnabled(),
}));

import React from 'react';
import renderer, { act } from 'react-test-renderer';
import { Text } from 'react-native';
import {
  clearQaMethodReadingReturn,
  getQaMethodReadingReturn,
  resolveQaMethodReadingReturn,
  setQaMethodReadingReturn,
  useQaMethodReadingReturn,
} from '../qa-method-reading-return';

function PointerProbe() {
  const value = useQaMethodReadingReturn();
  return <Text testID="qa-return-pointer">{value?.methodId ?? 'none'}</Text>;
}

describe('qa method reading return pointer', () => {
  beforeEach(() => {
    mockIsScripturePracticeEnabled.mockReturnValue(true);
    clearQaMethodReadingReturn();
  });

  it('stores a valid method and rejects unknown ids without touching production state', () => {
    expect(setQaMethodReadingReturn('lectio_divina')).toBe(true);
    expect(getQaMethodReadingReturn()).toEqual({ methodId: 'lectio_divina' });
    expect(resolveQaMethodReadingReturn()).toEqual({ methodId: 'lectio_divina' });

    expect(setQaMethodReadingReturn('not_a_method')).toBe(false);
    expect(getQaMethodReadingReturn()).toEqual({ methodId: 'lectio_divina' });

    clearQaMethodReadingReturn();
    expect(resolveQaMethodReadingReturn()).toBeNull();
  });

  it('clears and refuses the pointer when the QA gate is off', () => {
    expect(setQaMethodReadingReturn('inductive_oia')).toBe(true);
    mockIsScripturePracticeEnabled.mockReturnValue(false);
    expect(resolveQaMethodReadingReturn()).toBeNull();
    expect(setQaMethodReadingReturn('lectio_divina')).toBe(false);
    expect(getQaMethodReadingReturn()).toEqual({ methodId: 'inductive_oia' });
    clearQaMethodReadingReturn();
    expect(getQaMethodReadingReturn()).toBeNull();
  });

  it('notifies an already mounted subscriber when the pointer is set or cleared', async () => {
    let tree: renderer.ReactTestRenderer;
    await act(async () => {
      tree = renderer.create(<PointerProbe />);
    });
    expect(tree!.root.findByProps({ testID: 'qa-return-pointer' }).props.children).toBe('none');

    await act(async () => {
      expect(setQaMethodReadingReturn('lectio_divina')).toBe(true);
    });
    expect(tree!.root.findByProps({ testID: 'qa-return-pointer' }).props.children).toBe('lectio_divina');

    await act(async () => {
      clearQaMethodReadingReturn();
    });
    expect(tree!.root.findByProps({ testID: 'qa-return-pointer' }).props.children).toBe('none');
  });
});
