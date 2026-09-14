import { initializeAudioInterruptionHandling } from "../audio-interruption-events";
import { handleAudioInterruption } from "../audio-session-registry";

const listeners: ((event: { interrupted: boolean; canRetry?: boolean }) => void)[] =
  [];
const mockRemove = jest.fn();

jest.mock("expo-audio", () => ({
  addAudioInterruptionListener: (
    listener: (event: { interrupted: boolean; canRetry?: boolean }) => void,
  ) => {
    listeners.push(listener);
    return { remove: mockRemove };
  },
}));

jest.mock("../audio-session-registry", () => {
  const actual = jest.requireActual("../audio-session-registry");
  return {
    ...actual,
    handleAudioInterruption: jest.fn(actual.handleAudioInterruption),
  };
});

describe("audio interruption events", () => {
  beforeEach(() => {
    listeners.length = 0;
    mockRemove.mockClear();
    (handleAudioInterruption as jest.Mock).mockClear();
  });

  it("forwards native begin and end to the registry coordinator", () => {
    const dispose = initializeAudioInterruptionHandling();
    expect(listeners).toHaveLength(1);

    listeners[0]({ interrupted: true });
    expect(handleAudioInterruption).toHaveBeenCalledWith({ interrupted: true });

    listeners[0]({ interrupted: false });
    expect(handleAudioInterruption).toHaveBeenCalledWith({ interrupted: false });

    dispose();
    expect(mockRemove).toHaveBeenCalledTimes(1);
  });
});
