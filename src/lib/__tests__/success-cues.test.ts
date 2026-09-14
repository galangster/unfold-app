import { AccessibilityInfo, AppState } from "react-native";
import {
  createSuccessCueOwner,
  emitSuccessCue,
  SOUND_EFFECTS_ENABLED_KEY,
  SUCCESS_CUE_LEDGER_KEY,
} from "../success-cues";
import {
  createAudioInterruptionCoordinator,
  createAudioSessionRegistry,
  type AudioSessionRegistry,
} from "../audio-session-registry";

jest.mock("expo-audio", () => ({
  createAudioPlayer: jest.fn(),
  setAudioModeAsync: jest.fn(),
}));
jest.mock("../mmkv-storage", () => ({
  getDeviceId: jest.fn(() => "production-device"),
  mmkvStorage: {
    getItem: jest.fn(() => null),
    setItem: jest.fn(),
    removeItem: jest.fn(),
  },
}));
jest.mock("../logger", () => ({ logger: { warn: jest.fn() } }));
jest.mock("../success-cue-assets", () => ({
  SUCCESS_CUE_SOURCES: {
    "first-devotional-revealed": 1,
    "new-series-revealed": 2,
    "new-day-revealed": 3,
    "day-completed": 4,
  },
}));

type Status = {
  isLoaded?: boolean;
  playing?: boolean;
  didJustFinish?: boolean;
  error?: string | null;
  mediaServicesDidReset?: boolean;
};

function makeHarness() {
  const values = new Map<string, string>();
  let identity = "anonymous-device-1";
  let foreground = true;
  let screenReader = false;
  let listener: ((status: Status) => void) | null = null;
  const player = {
    play: jest.fn(),
    pause: jest.fn(),
    remove: jest.fn(),
    addListener: jest.fn((_event: string, next: (status: Status) => void) => {
      listener = next;
      return {
        remove: jest.fn(() => {
          listener = null;
        }),
      };
    }),
  };
  const lease = {
    owner: "success-cue" as const,
    revision: 1,
    configure: jest.fn().mockResolvedValue(true),
    isActive: jest.fn(() => true),
    release: jest.fn(),
  };
  const registry = {
    acquire: jest.fn(() => lease),
  } as unknown as AudioSessionRegistry;
  const owner = createSuccessCueOwner({
    storage: {
      getItem: (key) => values.get(key) ?? null,
      setItem: (key, value) => {
        values.set(key, value);
      },
    },
    getIdentity: () => identity,
    isForeground: () => foreground,
    isScreenReaderEnabled: async () => screenReader,
    sessionRegistry: registry,
    createPlayer: jest.fn(() => player),
    sources: {
      "first-devotional-revealed": 1,
      "new-series-revealed": 2,
      "new-day-revealed": 3,
      "day-completed": 4,
    },
    loadTimeoutMs: 100,
  });
  return {
    owner,
    values,
    player,
    lease,
    registry,
    emitStatus: (status: Status) => listener?.(status),
    setIdentity: (next: string) => {
      identity = next;
    },
    setForeground: (next: boolean) => {
      foreground = next;
    },
    setScreenReader: (next: boolean) => {
      screenReader = next;
    },
  };
}

async function flush() {
  await Promise.resolve();
  await Promise.resolve();
  await Promise.resolve();
}

function liveRegistry() {
  const registry = createAudioSessionRegistry(async () => undefined);
  const coordinator = createAudioInterruptionCoordinator(
    registry as AudioSessionRegistry,
  );
  return { registry, coordinator };
}

async function waitForPlayer(
  player: { addListener: { mock: { calls: unknown[] } } },
  previousCalls = 0,
) {
  for (let i = 0; i < 20 && player.addListener.mock.calls.length <= previousCalls; i++) {
    await Promise.resolve();
  }
  expect(player.addListener.mock.calls.length).toBeGreaterThan(previousCalls);
}

function notify(listener: ((status: Status) => void) | null, status: Status) {
  listener?.(status);
}

describe("success cue owner", () => {
  beforeEach(() => jest.useFakeTimers());
  afterEach(() => jest.useRealTimers());

  it("claims first reveal and subordinate events before asynchronous playback", async () => {
    const h = makeHarness();
    h.owner.emit({
      type: "first-devotional-revealed",
      devotionalId: "dev-1",
      dayNumber: 1,
    });
    const ledger = JSON.parse(h.values.get(SUCCESS_CUE_LEDGER_KEY)!);
    expect(Object.keys(ledger)).toEqual(
      expect.arrayContaining([
        "anonymous-device-1:first-devotional",
        "anonymous-device-1:series:dev-1",
        "anonymous-device-1:day-reveal:dev-1:1",
      ]),
    );

    await flush();
    h.emitStatus({ isLoaded: true });
    await flush();
    expect(h.player.play).toHaveBeenCalledTimes(1);

    h.owner.emit({
      type: "new-series-revealed",
      devotionalId: "dev-1",
      dayNumber: 1,
    });
    await flush();
    expect(h.registry.acquire).toHaveBeenCalledTimes(1);
  });

  it("consumes events suppressed by preference, screen reader, foreground, and active audio", async () => {
    const preference = makeHarness();
    preference.values.set(SOUND_EFFECTS_ENABLED_KEY, "false");
    preference.owner.emit({
      type: "day-completed",
      devotionalId: "dev-1",
      dayNumber: 2,
    });

    const reader = makeHarness();
    reader.setScreenReader(true);
    reader.owner.emit({
      type: "new-day-revealed",
      devotionalId: "dev-2",
      dayNumber: 2,
    });

    const background = makeHarness();
    background.setForeground(false);
    background.owner.emit({
      type: "new-series-revealed",
      devotionalId: "dev-3",
      dayNumber: 1,
    });

    const activity = makeHarness();
    (activity.registry.acquire as jest.Mock).mockReturnValue(null);
    activity.owner.emit({
      type: "first-devotional-revealed",
      devotionalId: "dev-4",
      dayNumber: 1,
    });
    await flush();

    for (const h of [preference, reader, background, activity]) {
      expect(h.values.get(SUCCESS_CUE_LEDGER_KEY)).toBeTruthy();
      expect(h.player.play).not.toHaveBeenCalled();
    }
  });

  it("abandons playback when identity, preference, foreground, or lease changes after an await", async () => {
    const identity = makeHarness();
    identity.owner.emit({
      type: "new-day-revealed",
      devotionalId: "dev-a",
      dayNumber: 2,
    });
    identity.setIdentity("anonymous-device-2");

    const preference = makeHarness();
    preference.owner.emit({
      type: "new-day-revealed",
      devotionalId: "dev-b",
      dayNumber: 2,
    });
    preference.values.set(SOUND_EFFECTS_ENABLED_KEY, "false");

    const foreground = makeHarness();
    foreground.owner.emit({
      type: "new-day-revealed",
      devotionalId: "dev-c",
      dayNumber: 2,
    });
    foreground.setForeground(false);

    const lease = makeHarness();
    lease.owner.emit({
      type: "new-day-revealed",
      devotionalId: "dev-d",
      dayNumber: 2,
    });
    lease.lease.isActive.mockReturnValue(false);
    await flush();

    for (const h of [identity, preference, foreground, lease]) {
      expect(h.player.play).not.toHaveBeenCalled();
    }
  });

  it("releases the player on finish, load failure, and bounded load timeout", async () => {
    const finished = makeHarness();
    finished.owner.emit({
      type: "day-completed",
      devotionalId: "dev-a",
      dayNumber: 1,
    });
    await flush();
    finished.emitStatus({ isLoaded: true });
    await flush();
    finished.emitStatus({ isLoaded: true, didJustFinish: true });
    expect(finished.player.remove).toHaveBeenCalledTimes(1);
    expect(finished.lease.release).toHaveBeenCalledTimes(1);

    const failed = makeHarness();
    failed.owner.emit({
      type: "day-completed",
      devotionalId: "dev-b",
      dayNumber: 1,
    });
    await flush();
    failed.emitStatus({ error: "decode failed" });
    await flush();
    expect(failed.player.remove).toHaveBeenCalledTimes(1);

    const timeout = makeHarness();
    timeout.owner.emit({
      type: "day-completed",
      devotionalId: "dev-c",
      dayNumber: 1,
    });
    await flush();
    await jest.advanceTimersByTimeAsync(100);
    expect(timeout.player.play).not.toHaveBeenCalled();
    expect(timeout.player.remove).toHaveBeenCalledTimes(1);
    expect(timeout.lease.release).toHaveBeenCalledTimes(1);
  });

  it("consumes a cue interrupted while loading and never plays after the interruption ends", async () => {
    const { registry, coordinator } = liveRegistry();
    const values = new Map<string, string>();
    let listener: ((status: Status) => void) | null = null;
    const player = {
      play: jest.fn(),
      pause: jest.fn(),
      remove: jest.fn(),
      addListener: jest.fn((_event: string, next: (status: Status) => void) => {
        listener = next;
        return { remove: jest.fn(() => { listener = null; }) };
      }),
    };
    const owner = createSuccessCueOwner({
      storage: {
        getItem: (key) => values.get(key) ?? null,
        setItem: (key, value) => {
          values.set(key, value);
        },
      },
      getIdentity: () => "anonymous-device-1",
      isForeground: () => true,
      isScreenReaderEnabled: async () => false,
      sessionRegistry: registry,
      createPlayer: jest.fn(() => player),
      sources: {
        "first-devotional-revealed": 1,
        "new-series-revealed": 2,
        "new-day-revealed": 3,
        "day-completed": 4,
      },
      loadTimeoutMs: 100,
    });
    owner.emit({
      type: "day-completed",
      devotionalId: "dev-interrupt",
      dayNumber: 1,
    });
    await waitForPlayer(player);
    coordinator.handle({ interrupted: true });
    notify(listener, { isLoaded: true });
    await flush();
    expect(player.play).not.toHaveBeenCalled();
    expect(player.remove).toHaveBeenCalled();
    expect(registry.getSnapshot().owner).toBe("system-interruption");

    coordinator.handle({ interrupted: false });
    notify(listener, { isLoaded: true });
    await flush();
    expect(player.play).not.toHaveBeenCalled();
    owner.emit({
      type: "day-completed",
      devotionalId: "dev-interrupt",
      dayNumber: 1,
    });
    await flush();
    expect(player.play).not.toHaveBeenCalled();
  });

  it("cancels a loading cue on headphone removal and still allows a later distinct event", async () => {
    const { registry, coordinator } = liveRegistry();
    const values = new Map<string, string>();
    let listener: ((status: Status) => void) | null = null;
    const player = {
      play: jest.fn(),
      pause: jest.fn(),
      remove: jest.fn(),
      addListener: jest.fn((_event: string, next: (status: Status) => void) => {
        listener = next;
        return { remove: jest.fn(() => { listener = null; }) };
      }),
    };
    const owner = createSuccessCueOwner({
      storage: {
        getItem: (key) => values.get(key) ?? null,
        setItem: (key, value) => {
          values.set(key, value);
        },
      },
      getIdentity: () => "anonymous-device-1",
      isForeground: () => true,
      isScreenReaderEnabled: async () => false,
      sessionRegistry: registry,
      createPlayer: jest.fn(() => player),
      sources: {
        "first-devotional-revealed": 1,
        "new-series-revealed": 2,
        "new-day-revealed": 3,
        "day-completed": 4,
      },
      loadTimeoutMs: 100,
    });
    owner.emit({
      type: "day-completed",
      devotionalId: "dev-headphones",
      dayNumber: 1,
    });
    await waitForPlayer(player);
    coordinator.handle({ interrupted: true, canRetry: true });
    coordinator.handle({ interrupted: false });
    notify(listener, { isLoaded: true });
    await flush();
    expect(player.play).not.toHaveBeenCalled();
    expect(player.remove).toHaveBeenCalled();

    owner.emit({
      type: "day-completed",
      devotionalId: "dev-headphones",
      dayNumber: 1,
    });
    await flush();
    expect(player.play).not.toHaveBeenCalled();

    const prior = player.addListener.mock.calls.length;
    owner.emit({
      type: "new-day-revealed",
      devotionalId: "dev-later",
      dayNumber: 2,
    });
    await waitForPlayer(player, prior);
    notify(listener, { isLoaded: true });
    await flush();
    expect(player.play).toHaveBeenCalledTimes(1);
  });

  it("cancels a loading cue on media-services reset and does not replay it after the reset completes", async () => {
    const { registry, coordinator } = liveRegistry();
    const values = new Map<string, string>();
    let listener: ((status: Status) => void) | null = null;
    const player = {
      play: jest.fn(),
      pause: jest.fn(),
      remove: jest.fn(),
      addListener: jest.fn((_event: string, next: (status: Status) => void) => {
        listener = next;
        return { remove: jest.fn(() => { listener = null; }) };
      }),
    };
    const owner = createSuccessCueOwner({
      storage: {
        getItem: (key) => values.get(key) ?? null,
        setItem: (key, value) => {
          values.set(key, value);
        },
      },
      getIdentity: () => "anonymous-device-1",
      isForeground: () => true,
      isScreenReaderEnabled: async () => false,
      sessionRegistry: registry,
      createPlayer: jest.fn(() => player),
      sources: {
        "first-devotional-revealed": 1,
        "new-series-revealed": 2,
        "new-day-revealed": 3,
        "day-completed": 4,
      },
      loadTimeoutMs: 100,
    });
    owner.emit({
      type: "first-devotional-revealed",
      devotionalId: "dev-reset-media",
      dayNumber: 1,
    });
    await waitForPlayer(player);
    coordinator.handle({ interrupted: true, canRetry: true });
    notify(listener, { isLoaded: true, mediaServicesDidReset: true });
    coordinator.handle({ interrupted: false });
    await flush();
    expect(player.play).not.toHaveBeenCalled();
    owner.emit({
      type: "first-devotional-revealed",
      devotionalId: "dev-reset-media",
      dayNumber: 1,
    });
    await flush();
    expect(player.play).not.toHaveBeenCalled();
  });

  it("abandons a delayed configure when interruption begins and does not replay after end", async () => {
    let finishConfigure!: (value: boolean) => void;
    const lease = {
      owner: "success-cue" as const,
      revision: 1,
      configure: jest.fn(
        () =>
          new Promise<boolean>((resolve) => {
            finishConfigure = resolve;
          }),
      ),
      isActive: jest.fn(() => true),
      release: jest.fn(),
    };
    const registry = {
      acquire: jest.fn(() => lease),
    } as unknown as AudioSessionRegistry;
    const player = {
      play: jest.fn(),
      pause: jest.fn(),
      remove: jest.fn(),
      addListener: jest.fn(),
    };
    const values = new Map<string, string>();
    const owner = createSuccessCueOwner({
      storage: {
        getItem: (key) => values.get(key) ?? null,
        setItem: (key, value) => {
          values.set(key, value);
        },
      },
      getIdentity: () => "anonymous-device-1",
      isForeground: () => true,
      isScreenReaderEnabled: async () => false,
      sessionRegistry: registry,
      createPlayer: jest.fn(() => player),
      sources: {
        "first-devotional-revealed": 1,
        "new-series-revealed": 2,
        "new-day-revealed": 3,
        "day-completed": 4,
      },
      loadTimeoutMs: 100,
    });
    owner.emit({
      type: "new-day-revealed",
      devotionalId: "dev-configure",
      dayNumber: 2,
    });
    await flush();
    lease.isActive.mockReturnValue(false);
    finishConfigure(false);
    await flush();
    expect(player.play).not.toHaveBeenCalled();
    expect(lease.release).toHaveBeenCalled();
    owner.emit({
      type: "new-day-revealed",
      devotionalId: "dev-configure",
      dayNumber: 2,
    });
    await flush();
    expect(registry.acquire).toHaveBeenCalledTimes(1);
  });

  it("releases the lease when play throws and consumes the identity-scoped claim", async () => {
    const h = makeHarness();
    h.player.play.mockImplementation(() => {
      throw new Error("native play failed");
    });
    h.owner.emit({
      type: "new-series-revealed",
      devotionalId: "dev-exc",
      dayNumber: 1,
    });
    await flush();
    h.emitStatus({ isLoaded: true });
    await flush();
    expect(h.lease.release).toHaveBeenCalled();
    expect(h.player.remove).toHaveBeenCalled();
    h.owner.emit({
      type: "new-series-revealed",
      devotionalId: "dev-exc",
      dayNumber: 1,
    });
    await flush();
    expect(h.registry.acquire).toHaveBeenCalledTimes(1);
  });

  it("cancels an in-flight cue on identity reset and lets the new identity claim later", async () => {
    const h = makeHarness();
    h.owner.emit({
      type: "first-devotional-revealed",
      devotionalId: "dev-reset",
      dayNumber: 1,
    });
    await flush();
    h.setIdentity("anonymous-device-2");
    h.owner.cancel();
    h.emitStatus({ isLoaded: true });
    await flush();
    expect(h.player.play).not.toHaveBeenCalled();
    expect(h.lease.release).toHaveBeenCalled();

    h.owner.emit({
      type: "first-devotional-revealed",
      devotionalId: "dev-reset",
      dayNumber: 1,
    });
    await flush();
    h.emitStatus({ isLoaded: true });
    await flush();
    expect(h.player.play).toHaveBeenCalledTimes(1);
  });

  it("contains a synchronous ledger failure and consumes the attempt for this session", async () => {
    const h = makeHarness();
    const setItem = jest.fn(() => {
      throw new Error("disk failed");
    });
    const owner = createSuccessCueOwner({
      storage: { getItem: () => null, setItem },
      getIdentity: () => "anonymous-device-1",
      isForeground: () => true,
      isScreenReaderEnabled: async () => false,
      sessionRegistry: h.registry,
      createPlayer: jest.fn(() => h.player),
      sources: {
        "first-devotional-revealed": 1,
        "new-series-revealed": 2,
        "new-day-revealed": 3,
        "day-completed": 4,
      },
      loadTimeoutMs: 100,
    });
    expect(() =>
      owner.emit({
        type: "day-completed",
        devotionalId: "dev-1",
        dayNumber: 1,
      }),
    ).not.toThrow();
    owner.emit({ type: "day-completed", devotionalId: "dev-1", dayNumber: 1 });
    await flush();
    expect(setItem).toHaveBeenCalledTimes(1);
    expect(h.registry.acquire).not.toHaveBeenCalled();
  });
});


describe("approved production success cues", () => {
  it.each([
    ["first-devotional-revealed", 1],
    ["new-series-revealed", 2],
    ["new-day-revealed", 3],
    ["day-completed", 4],
  ] as const)("plays approved %s through the public owner", async (type, source) => {
    const h = makeHarness();
    const { createAudioPlayer } = jest.requireMock("expo-audio");
    const { getDeviceId, mmkvStorage } = jest.requireMock("../mmkv-storage");
    const { audioSessionRegistry } = jest.requireActual("../audio-session-registry");
    const priorState = AppState.currentState;
    AppState.currentState = "active";
    getDeviceId.mockReturnValue(`approved-production-${type}`);
    mmkvStorage.getItem.mockReturnValue(null);
    createAudioPlayer.mockClear();
    createAudioPlayer.mockReturnValue(h.player);
    const acquire = jest.spyOn(audioSessionRegistry, "acquire").mockReturnValue(h.lease);
    const screenReader = jest.spyOn(AccessibilityInfo, "isScreenReaderEnabled").mockResolvedValue(false);
    try {
      const event = { type, devotionalId: "approved-production", dayNumber: 2, eligible: true };
      const cancel = emitSuccessCue(event);
      expect(cancel).toEqual(expect.any(Function));
      await flush();
      expect(createAudioPlayer).toHaveBeenCalledWith(source, expect.objectContaining({ autoResumeOnInterruption: false }));
      h.emitStatus({ isLoaded: true });
      await flush();
      expect(h.player.play).toHaveBeenCalledTimes(1);
      expect(emitSuccessCue(event)).toBeUndefined();
      cancel?.();
      expect(h.player.remove).toHaveBeenCalledTimes(1);
      expect(h.lease.release).toHaveBeenCalled();
      cancel?.();
      expect(h.player.remove).toHaveBeenCalledTimes(1);
    } finally {
      acquire.mockRestore();
      screenReader.mockRestore();
      AppState.currentState = priorState;
    }
  });
});
