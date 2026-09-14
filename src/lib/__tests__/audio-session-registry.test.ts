import {
  createAudioInterruptionCoordinator,
  createAudioSessionRegistry,
} from "../audio-session-registry";

jest.mock("expo-audio", () => ({ setAudioModeAsync: jest.fn() }));
jest.mock("../logger", () => ({ logger: { warn: jest.fn() } }));

describe("audio session registry", () => {
  it("invalidates a pending cue synchronously and applies the newer recording mode last", async () => {
    let finishCueMode!: () => void;
    const writes: string[] = [];
    const setMode = jest.fn(({ label }: { label: string }) => {
      writes.push(`start:${label}`);
      if (label === "cue") {
        return new Promise<void>((resolve) => {
          finishCueMode = () => {
            writes.push("finish:cue");
            resolve();
          };
        });
      }
      writes.push(`finish:${label}`);
      return Promise.resolve();
    });
    const registry = createAudioSessionRegistry(setMode);
    const invalidated = jest.fn();
    const cue = registry.acquire({
      owner: "success-cue",
      mode: { label: "cue" },
      onInvalidated: invalidated,
    });
    expect(cue).not.toBeNull();
    const cueConfigured = cue!.configure();
    await Promise.resolve();

    const recording = registry.acquire({
      owner: "voice-recording",
      mode: { label: "recording" },
    });
    expect(cue!.isActive()).toBe(false);
    expect(invalidated).toHaveBeenCalledTimes(1);
    const recordingConfigured = recording!.configure();
    await Promise.resolve();
    expect(writes).toEqual(["start:cue"]);

    finishCueMode();
    await expect(cueConfigured).resolves.toBe(false);
    await expect(recordingConfigured).resolves.toBe(true);
    expect(writes).toEqual([
      "start:cue",
      "finish:cue",
      "start:recording",
      "finish:recording",
    ]);
  });

  it("holds recognition at a mode barrier until an invalidated cue write finishes", async () => {
    let finishCueMode!: () => void;
    const setMode = jest.fn(
      () =>
        new Promise<void>((resolve) => {
          finishCueMode = resolve;
        }),
    );
    const registry = createAudioSessionRegistry(setMode);
    const cue = registry.acquire({
      owner: "success-cue",
      mode: { label: "cue" },
    })!;
    const cueConfigured = cue.configure();
    await Promise.resolve();

    const recognition = registry.acquire({ owner: "speech-recognition" })!;
    let recognitionReady = false;
    const barrier = recognition.configure().then((ready) => {
      recognitionReady = ready;
    });
    await Promise.resolve();
    expect(recognitionReady).toBe(false);

    finishCueMode();
    await expect(cueConfigured).resolves.toBe(false);
    await barrier;
    expect(recognitionReady).toBe(true);
    expect(setMode).toHaveBeenCalledTimes(1);
  });

  it("recovers the serialized writer after a mode exception", async () => {
    const setMode = jest
      .fn()
      .mockRejectedValueOnce(new Error("native mode failed"))
      .mockResolvedValueOnce(undefined);
    const registry = createAudioSessionRegistry(setMode);
    const ambient = registry.acquire({
      owner: "ambient",
      mode: { label: "ambient" },
    })!;
    await expect(ambient.configure()).rejects.toThrow("native mode failed");
    ambient.release();

    const narration = registry.acquire({
      owner: "narration",
      mode: { label: "narration" },
    })!;
    await expect(narration.configure()).resolves.toBe(true);
    expect(setMode).toHaveBeenCalledTimes(2);
  });

  it("lets only the latest rapid owner configure and does not resume released owners", async () => {
    const setMode = jest.fn().mockResolvedValue(undefined);
    const registry = createAudioSessionRegistry(setMode);
    const first = registry.acquire({
      owner: "narration",
      mode: { label: "one" },
    })!;
    const second = registry.acquire({
      owner: "narration",
      mode: { label: "two" },
    })!;
    const recording = registry.acquire({
      owner: "voice-recording",
      mode: { label: "three" },
    })!;

    await expect(first.configure()).resolves.toBe(false);
    await expect(second.configure()).resolves.toBe(false);
    await expect(recording.configure()).resolves.toBe(true);
    recording.release();

    expect(registry.getSnapshot()).toEqual({ owner: null, revision: 4 });
    expect(setMode).toHaveBeenCalledTimes(1);
    expect(setMode).toHaveBeenCalledWith({ label: "three" });
  });

  it("rejects lower priority ownership while audio is active", () => {
    const registry = createAudioSessionRegistry(
      jest.fn().mockResolvedValue(undefined),
    );
    const voice = registry.acquire({
      owner: "voice-review",
      mode: { label: "voice" },
    })!;
    expect(
      registry.acquire({ owner: "success-cue", mode: { label: "cue" } }),
    ).toBeNull();
    voice.release();
    expect(
      registry.acquire({ owner: "success-cue", mode: { label: "cue" } }),
    ).not.toBeNull();
  });
});


describe("audio interruption coordinator", () => {
  it("acquires system-interruption on begin and invalidates a delayed configure", async () => {
    let finishCueMode!: () => void;
    const setMode = jest.fn(
      () =>
        new Promise<void>((resolve) => {
          finishCueMode = resolve;
        }),
    );
    const registry = createAudioSessionRegistry(setMode);
    const coordinator = createAudioInterruptionCoordinator(registry);
    const invalidated = jest.fn();
    const cue = registry.acquire({
      owner: "success-cue",
      mode: { label: "cue" },
      onInvalidated: invalidated,
    })!;
    const configured = cue.configure();
    await Promise.resolve();

    coordinator.handle({ interrupted: true });
    expect(invalidated).toHaveBeenCalledTimes(1);
    expect(cue.isActive()).toBe(false);
    expect(registry.getSnapshot().owner).toBe("system-interruption");

    finishCueMode();
    await expect(configured).resolves.toBe(false);
    expect(
      registry.acquire({ owner: "success-cue", mode: { label: "late" } }),
    ).toBeNull();
  });

  it("releases a completed interruption without allowing a cancelled owner to resume", async () => {
    const registry = createAudioSessionRegistry(
      jest.fn().mockResolvedValue(undefined),
    );
    const coordinator = createAudioInterruptionCoordinator(registry);
    const cue = registry.acquire({
      owner: "success-cue",
      mode: { label: "cue" },
    })!;
    coordinator.handle({ interrupted: true });
    expect(cue.isActive()).toBe(false);

    coordinator.handle({ interrupted: false });
    expect(registry.getSnapshot().owner).toBeNull();
    expect(cue.isActive()).toBe(false);
    await expect(cue.configure()).resolves.toBe(false);
  });

  it("keeps permanent Android focus loss until an explicit user retry", () => {
    const registry = createAudioSessionRegistry(
      jest.fn().mockResolvedValue(undefined),
    );
    const coordinator = createAudioInterruptionCoordinator(registry);
    coordinator.handle({ interrupted: true, canRetry: true });
    expect(registry.getSnapshot().owner).toBe("system-interruption");
    expect(
      registry.acquire({ owner: "success-cue", mode: { label: "late" } }),
    ).toBeNull();

    coordinator.retryExplicitPlayback();
    expect(registry.getSnapshot().owner).toBeNull();
    expect(
      registry.acquire({ owner: "ambient", mode: { label: "music" } }),
    ).not.toBeNull();
  });

  it("cancels a loading owner on headphone or media-reset and then allows a later valid owner", async () => {
    const setMode = jest.fn().mockResolvedValue(undefined);
    const registry = createAudioSessionRegistry(setMode);
    const coordinator = createAudioInterruptionCoordinator(registry);
    const loadingCue = registry.acquire({
      owner: "success-cue",
      mode: { label: "loading" },
    })!;
    const loadingConfigured = loadingCue.configure();

    coordinator.handle({ interrupted: true, canRetry: true });
    expect(loadingCue.isActive()).toBe(false);
    coordinator.handle({ interrupted: false });
    await expect(loadingConfigured).resolves.toBe(false);
    expect(loadingCue.isActive()).toBe(false);

    const later = registry.acquire({
      owner: "ambient",
      mode: { label: "music" },
    });
    expect(later).not.toBeNull();
    await expect(later!.configure()).resolves.toBe(true);
  });

  it("does not treat a transient end as permission to retry during the call", () => {
    const registry = createAudioSessionRegistry(
      jest.fn().mockResolvedValue(undefined),
    );
    const coordinator = createAudioInterruptionCoordinator(registry);
    coordinator.handle({ interrupted: true, canRetry: false });
    coordinator.retryExplicitPlayback();
    expect(registry.getSnapshot().owner).toBe("system-interruption");
  });
});

it("preserves a higher owner acquired inside an invalidation callback", async () => {
  const setMode = jest.fn().mockResolvedValue(undefined);
  const registry = createAudioSessionRegistry(setMode);
  registry.acquire({
    owner: "success-cue",
    onInvalidated: () => {
      registry.acquire({ owner: "voice-recording", mode: "recording" });
    },
  });
  const ambient = registry.acquire({ owner: "ambient", mode: "ambient" })!;
  expect(ambient.isActive()).toBe(false);
  await expect(ambient.configure()).resolves.toBe(false);
  expect(registry.getSnapshot().owner).toBe("voice-recording");
  expect(setMode).not.toHaveBeenCalled();
});
