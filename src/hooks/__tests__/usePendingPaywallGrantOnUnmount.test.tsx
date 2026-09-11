import React, { useRef } from 'react';

const renderer = jest.requireActual('react-test-renderer');
const { act } = renderer;

const mockSetPendingPaywallGrant = jest.fn();

jest.mock('@/lib/ui-state', () => ({
  useUIState: {
    getState: () => ({ setPendingPaywallGrant: mockSetPendingPaywallGrant }),
  },
}));

import { usePendingPaywallGrantOnUnmount } from '../usePendingPaywallGrantOnUnmount';

function Host({
  armed,
  advanced,
}: {
  armed: boolean;
  advanced: boolean;
}) {
  const armedRef = useRef(armed);
  const advancedRef = useRef(advanced);
  usePendingPaywallGrantOnUnmount({
    surface: 'paywall_route',
    entry: 'later',
    armedRef,
    advancedRef,
  });
  return null;
}

describe('usePendingPaywallGrantOnUnmount', () => {
  beforeEach(() => {
    mockSetPendingPaywallGrant.mockClear();
  });

  it('writes the pending grant on unmount when armed and not advanced', () => {
    let tree!: { unmount: () => void };
    act(() => {
      tree = renderer.create(<Host armed advanced={false} />);
    });
    act(() => {
      tree.unmount();
    });
    expect(mockSetPendingPaywallGrant).toHaveBeenCalledWith({
      surface: 'paywall_route',
      entry: 'later',
      setAtMs: expect.any(Number),
    });
  });

  it('does not write when the host already advanced', () => {
    let tree!: { unmount: () => void };
    act(() => {
      tree = renderer.create(<Host armed advanced />);
    });
    act(() => {
      tree.unmount();
    });
    expect(mockSetPendingPaywallGrant).not.toHaveBeenCalled();
  });
});
