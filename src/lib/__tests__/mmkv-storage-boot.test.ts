/**
 * Boot-sequence tests for mmkv-storage (RS5-1/RS6-1 disposable-copy probe).
 *
 * Population table (every 218→219 upgrade cohort, plus fresh installs):
 *   (a) 218 happy path (MAJORITY): encrypted file + key, no marker
 *   (b) 218 legacy-plain (tiny):   plain file + key, no marker
 *   (c) 219 fresh install:         no file + key, no marker
 *   (d) 219 crashed-before-marker: encrypted file + key, no marker (same as a)
 *   (e) probe unavailable:         encrypted file + key, no marker, probe IO fails
 *   (f) recovery namespace:        marker=encrypted, key unavailable
 *   (g) recrypt-throw retry:       plain file + key (RS5-3) — see its block
 *
 * LOUD MOCK CONTRACT: the fake MMKV below THROWS on any mode-mismatched open
 * of a real store file. Production react-native-mmkv instead SILENTLY
 * DISCARDS all contents in both directions — which is exactly how the
 * RS3-1/RS5-1/RS6-1 data-loss regressions passed review twice. With this mock,
 * any plan that opens the real store in the wrong mode fails the suite
 * immediately instead of "passing" on an empty store.
 *
 * The ONE exception is the disposable probe id ('unfold-store-v2-probe'): the
 * probe deliberately plain-opens a COPY that may be encrypted, so for that id
 * only the mock reproduces production semantics (silent discard → empty
 * store), which is what the probe's classification relies on.
 */

const STORE_ID = 'unfold-store-v2';
const PROBE_ID = 'unfold-store-v2-probe';
const RECOVERY_ID = 'unfold-store-v2-recovery';
const META_ID = 'unfold-storage-meta';
const MARKER_KEY = 'unfold-store-v2-mode';
const OUTBOX_KEY = 'unfold-sync-outbox-v1';
const STORAGE_KEY = 'unfold-storage';
const DOC_DIR = '/docs';

// Formula-computed fixtures: the store payload a real user accumulated on 218
// (zustand persist blob) and the production-shaped 32-hex encryption key.
const PAYLOAD = JSON.stringify({ state: { streakCount: 7, entries: ['e1', 'e2'] }, version: 36 });
const KEY = 'a1b2c3d4e5f60718293a4b5c6d7e8f90';

type FileMode = 'plain' | 'encrypted';

interface FakeStoreFile {
  mode: FileMode;
  key: string | undefined;
  data: Map<string, string>;
}

interface WorldOptions {
  /** Value SecureStore holds for any key id (null = nothing stored yet). */
  secureKey?: string | null;
  /** SecureStore.getItem/setItem throw (Keychain down). */
  secureThrows?: boolean;
  /** File.copySync throws (probe copy fails). */
  fsCopyThrows?: boolean;
  /** File.copySync throws ONLY for the .crc sibling copy (main copy succeeds). */
  fsCrcCopyThrows?: boolean;
  /** The expo-file-system module itself fails to load. */
  fsRequireThrows?: boolean;
  /** MMKV.recrypt throws (RS5-3). */
  recryptThrows?: boolean;
  /** MMKV constructor throws when opening the probe id (RS9-2). */
  probeMMKVThrows?: boolean;
  /**
   * FAP-X-1: keys the plain-open of the (actually encrypted) probe COPY
   * surfaces instead of an empty store. Models MMKV core's partial protobuf
   * decode of AES-CFB ciphertext (MiniPBCoder::decodeOneMap retains entries
   * parsed before a mid-stream exception), which can yield garbage
   * pseudo-keys — NOT the silent-discard-to-empty assumed by default.
   */
  probePhantomKeys?: string[];
}

class FakeWorld {
  files = new Map<string, FakeStoreFile>();
  crcs = new Set<string>(); // base ids that have a .crc sibling on disk
  copyCalls: { from: string; to: string }[] = [];
  opts: WorldOptions;

  constructor(opts: WorldOptions = {}) {
    this.opts = { secureKey: null, ...opts };
  }

  seedStore(id: string, mode: FileMode, key: string | undefined, entries: Record<string, string>): void {
    this.files.set(id, { mode, key, data: new Map(Object.entries(entries)) });
    this.crcs.add(id); // real MMKV always writes a .crc sibling
  }

  // -- fake filesystem keyed by '<DOC_DIR>/mmkv/<id>[.crc]' paths -------------
  private idOf(path: string): string {
    return path.replace(`${DOC_DIR}/mmkv/`, '');
  }

  pathExists(path: string): boolean {
    const id = this.idOf(path);
    return id.endsWith('.crc') ? this.crcs.has(id.slice(0, -4)) : this.files.has(id);
  }

  copyPath(from: string, to: string): void {
    if (this.opts.fsCopyThrows) throw new Error('simulated File.copySync failure');
    const fromId = this.idOf(from);
    // fsCrcCopyThrows: let the main-file copy succeed, throw only on .crc copy
    if (this.opts.fsCrcCopyThrows && fromId.endsWith('.crc')) {
      throw new Error('simulated .crc File.copySync failure');
    }
    this.copyCalls.push({ from, to });
    const toId = this.idOf(to);
    if (fromId.endsWith('.crc')) {
      if (!this.crcs.has(fromId.slice(0, -4))) throw new Error(`copy source missing: ${from}`);
      this.crcs.add(toId.slice(0, -4));
      return;
    }
    const src = this.files.get(fromId);
    if (!src) throw new Error(`copy source missing: ${from}`);
    this.files.set(toId, { mode: src.mode, key: src.key, data: new Map(src.data) });
  }

  deletePath(path: string): void {
    const id = this.idOf(path);
    if (id.endsWith('.crc')) {
      if (!this.crcs.delete(id.slice(0, -4))) throw new Error(`delete target missing: ${path}`);
      return;
    }
    if (!this.files.delete(id)) throw new Error(`delete target missing: ${path}`);
  }
}

function makeMMKVClass(world: FakeWorld) {
  return class FakeMMKV {
    private file: FakeStoreFile;

    constructor(config: { id: string; encryptionKey?: string }) {
      const { id, encryptionKey } = config;
      // RS9-2: probe MMKV constructor failure simulation
      if (world.opts.probeMMKVThrows && id === PROBE_ID) {
        throw new Error('simulated MMKV probe constructor failure');
      }
      let file = world.files.get(id);
      if (!file) {
        file = {
          mode: encryptionKey ? 'encrypted' : 'plain',
          key: encryptionKey,
          data: new Map(),
        };
        world.files.set(id, file);
        world.crcs.add(id);
      } else {
        const mismatched = encryptionKey
          ? file.mode !== 'encrypted' || file.key !== encryptionKey
          : file.mode !== 'plain';
        if (mismatched) {
          if (id === PROBE_ID) {
            // The disposable copy is DESIGNED to absorb a mismatch: reproduce
            // production react-native-mmkv semantics — usually silent discard
            // to empty, but partial protobuf decode of ciphertext can also
            // surface garbage pseudo-keys (FAP-X-1: probePhantomKeys).
            file.mode = encryptionKey ? 'encrypted' : 'plain';
            file.key = encryptionKey;
            file.data = new Map(
              (world.opts.probePhantomKeys ?? []).map((k) => [k, 'garbage-bytes']),
            );
          } else {
            throw new Error(
              `LOUD MOCK FAILURE: MMKV id="${id}" opened ${encryptionKey ? 'ENCRYPTED' : 'PLAIN'} ` +
                `but the on-disk file is ${file.mode.toUpperCase()}. In production ` +
                `react-native-mmkv would SILENTLY DISCARD ALL CONTENTS (RS5-1/RS6-1). ` +
                `A mismatched open of a real store is always a regression.`,
            );
          }
        }
      }
      this.file = file;
    }

    getString(k: string): string | undefined {
      return this.file.data.get(k);
    }
    set(k: string, v: string): void {
      this.file.data.set(k, String(v));
    }
    delete(k: string): void {
      this.file.data.delete(k);
    }
    contains(k: string): boolean {
      return this.file.data.has(k);
    }
    getAllKeys(): string[] {
      return [...this.file.data.keys()];
    }
    clearAll(): void {
      this.file.data.clear();
    }
    recrypt(key?: string): void {
      if (world.opts.recryptThrows) throw new Error('simulated recrypt failure');
      this.file.mode = key ? 'encrypted' : 'plain';
      this.file.key = key;
    }
  };
}

function makeFileSystemMock(world: FakeWorld) {
  class FakeFile {
    path: string;
    constructor(...segments: (string | { path: string })[]) {
      this.path = segments.map((s) => (typeof s === 'string' ? s : s.path)).join('/');
    }
    get exists(): boolean {
      return world.pathExists(this.path);
    }
    copySync(dst: FakeFile): void {
      world.copyPath(this.path, dst.path);
    }
    delete(): void {
      world.deletePath(this.path);
    }
  }
  return { File: FakeFile, Paths: { document: { path: DOC_DIR } } };
}

/** Boot the mmkv-storage module from scratch against the given fake world. */
function bootWith(world: FakeWorld): typeof import('@/lib/mmkv-storage') {
  jest.resetModules();
  jest.doMock('react-native-get-random-values', () => ({}));
  jest.doMock('react-native-mmkv', () => ({ MMKV: makeMMKVClass(world) }));
  if (world.opts.fsRequireThrows) {
    jest.doMock('expo-file-system', () => {
      throw new Error('expo-file-system unavailable');
    });
  } else {
    jest.doMock('expo-file-system', () => makeFileSystemMock(world));
  }
  jest.doMock('expo-secure-store', () => ({
    getItem: jest.fn((): string | null => {
      if (world.opts.secureThrows) throw new Error('Keychain unavailable');
      return world.opts.secureKey ?? null;
    }),
    setItem: jest.fn((_k: string, v: string): void => {
      if (world.opts.secureThrows) throw new Error('Keychain unavailable');
      world.opts.secureKey = v;
    }),
  }));
  jest.doMock('@/lib/logger', () => ({
    logger: { log: jest.fn(), warn: jest.fn(), error: jest.fn() },
  }));
  // uuid ships untransformed ESM; only used by getDeviceId/rotateDeviceId,
  // which the boot path never calls.
  jest.doMock('uuid', () => ({ v4: jest.fn(() => 'test-uuid-v4') }));

  let mod: typeof import('@/lib/mmkv-storage') | undefined;
  jest.isolateModules(() => {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    mod = require('@/lib/mmkv-storage');
  });
  return mod!;
}

function expectNoProbeLeftovers(world: FakeWorld): void {
  expect(world.files.has(PROBE_ID)).toBe(false);
  expect(world.crcs.has(PROBE_ID)).toBe(false);
}

describe('mmkv-storage boot (218→219 upgrade populations)', () => {
  it('(a) 218 happy-path MAJORITY: encrypted file + key + no marker → encrypted open, NO data loss', () => {
    const world = new FakeWorld({ secureKey: KEY });
    world.seedStore(STORE_ID, 'encrypted', KEY, { [STORAGE_KEY]: PAYLOAD });

    const storage = bootWith(world);

    // Probe ran against a disposable copy and classified the file encrypted.
    expect(world.copyCalls.length).toBeGreaterThan(0);
    expect(world.copyCalls.every((c) => c.to.includes(PROBE_ID))).toBe(true);
    expectNoProbeLeftovers(world);
    // The real store was opened in the PROVEN mode — loud mock would have
    // thrown on a plain open — and the data survived verbatim.
    expect(storage.mmkvStorage.getItem(STORAGE_KEY)).toBe(PAYLOAD);
    expect(world.files.get(STORE_ID)!.mode).toBe('encrypted');
    expect(world.files.get(STORE_ID)!.key).toBe(KEY);
    // Marker backfilled so subsequent boots skip the probe entirely.
    expect(world.files.get(META_ID)!.data.get(MARKER_KEY)).toBe('encrypted');
  });

  it('(a2) FAP-X-1 paranoia: probe copy decoding ciphertext to phantom keys must NOT misclassify the encrypted store as plain', () => {
    // MMKV's plain-open of encrypted bytes is not guaranteed to discard to
    // EMPTY: partial protobuf decode can retain garbage pseudo-keys, and the
    // copied .crc sibling guarantees the CRC gate passes. Classification must
    // therefore require the KNOWN zustand persist root key ('unfold-storage',
    // store.ts persist config) — a phantom key can never equal it. Any-key
    // classification would plain-open the REAL encrypted file (silent total
    // discard), recrypt the emptied store, and seal the loss with the marker.
    const world = new FakeWorld({ secureKey: KEY, probePhantomKeys: ['x9f3'] });
    world.seedStore(STORE_ID, 'encrypted', KEY, { [STORAGE_KEY]: PAYLOAD });

    const storage = bootWith(world);

    // Phantom keys ≠ 'unfold-storage' → 'no-plain-data' → encrypted open.
    expect(storage.mmkvStorage.getItem(STORAGE_KEY)).toBe(PAYLOAD);
    expect(world.files.get(STORE_ID)!.mode).toBe('encrypted');
    expect(world.files.get(STORE_ID)!.key).toBe(KEY);
    expect(world.files.get(META_ID)!.data.get(MARKER_KEY)).toBe('encrypted');
    expectNoProbeLeftovers(world);
  });

  it('(b) 218 legacy-plain rescue: plain file + key + no marker → plain open + recrypt, data preserved', () => {
    const world = new FakeWorld({ secureKey: KEY });
    world.seedStore(STORE_ID, 'plain', undefined, { [STORAGE_KEY]: PAYLOAD });

    const storage = bootWith(world);

    expect(storage.mmkvStorage.getItem(STORAGE_KEY)).toBe(PAYLOAD);
    // Upgrade completed: file is now encrypted with the SecureStore key.
    expect(world.files.get(STORE_ID)!.mode).toBe('encrypted');
    expect(world.files.get(STORE_ID)!.key).toBe(KEY);
    expect(world.files.get(META_ID)!.data.get(MARKER_KEY)).toBe('encrypted');
    expectNoProbeLeftovers(world);
  });

  it('(c) 219 fresh install: no file → encrypted create, marker written, NO probe IO', () => {
    const world = new FakeWorld({ secureKey: null }); // also exercises key generation
    const storage = bootWith(world);

    // No file existed → probe exited at the exists() check: zero copies, no scratch store.
    expect(world.copyCalls).toHaveLength(0);
    expectNoProbeLeftovers(world);
    expect(world.files.get(STORE_ID)!.mode).toBe('encrypted');
    expect(world.files.get(META_ID)!.data.get(MARKER_KEY)).toBe('encrypted');
    // A fresh 32-hex key was generated and persisted to SecureStore.
    expect(world.opts.secureKey).toMatch(/^[0-9a-f]{32}$/);
    expect(world.files.get(STORE_ID)!.key).toBe(world.opts.secureKey);
    // Round-trip through the adapter works.
    storage.mmkvStorage.setItem(STORAGE_KEY, PAYLOAD);
    expect(storage.mmkvStorage.getItem(STORAGE_KEY)).toBe(PAYLOAD);
  });

  it('(d) 219 crashed-before-marker relaunch: encrypted file + key + no marker → same safe path as (a)', () => {
    // First 219 boot created the store encrypted but crashed before the
    // marker write. The relaunch is indistinguishable from (a) and must take
    // the same zero-risk route: probe copy → no plain data → encrypted open.
    const world = new FakeWorld({ secureKey: KEY });
    world.seedStore(STORE_ID, 'encrypted', KEY, { [STORAGE_KEY]: PAYLOAD });

    const storage = bootWith(world);

    expect(storage.mmkvStorage.getItem(STORAGE_KEY)).toBe(PAYLOAD);
    expect(world.files.get(STORE_ID)!.mode).toBe('encrypted');
    expect(world.files.get(META_ID)!.data.get(MARKER_KEY)).toBe('encrypted');
    expectNoProbeLeftovers(world);
  });

  it('(e1) probe copy fails → majority-safe ENCRYPTED fallback, majority data preserved', () => {
    // Caveat (documented in mmkv-open-mode.ts): under probe-unavailable a
    // 218-legacy-plain file would be discarded — accepted, because the plain
    // fallback would instead destroy the encrypted MAJORITY (RS5-1/RS6-1).
    const world = new FakeWorld({ secureKey: KEY, fsCopyThrows: true });
    world.seedStore(STORE_ID, 'encrypted', KEY, { [STORAGE_KEY]: PAYLOAD });

    const storage = bootWith(world);

    expect(storage.mmkvStorage.getItem(STORAGE_KEY)).toBe(PAYLOAD);
    expect(world.files.get(STORE_ID)!.mode).toBe('encrypted');
    expect(world.files.get(META_ID)!.data.get(MARKER_KEY)).toBe('encrypted');
    expectNoProbeLeftovers(world);
  });

  it('(e2) expo-file-system module unavailable → majority-safe ENCRYPTED fallback', () => {
    const world = new FakeWorld({ secureKey: KEY, fsRequireThrows: true });
    world.seedStore(STORE_ID, 'encrypted', KEY, { [STORAGE_KEY]: PAYLOAD });

    const storage = bootWith(world);

    expect(storage.mmkvStorage.getItem(STORAGE_KEY)).toBe(PAYLOAD);
    expect(world.files.get(STORE_ID)!.mode).toBe('encrypted');
    expect(world.files.get(META_ID)!.data.get(MARKER_KEY)).toBe('encrypted');
  });

  it('(f) recovery namespace: marker=encrypted + Keychain down → sandbox session, real file untouched, no probe IO', () => {
    const world = new FakeWorld({ secureThrows: true });
    world.seedStore(STORE_ID, 'encrypted', KEY, { [STORAGE_KEY]: PAYLOAD });
    world.seedStore(META_ID, 'plain', undefined, { [MARKER_KEY]: 'encrypted' });
    // A previous recovery session left stale "current" data behind.
    world.seedStore(RECOVERY_ID, 'plain', undefined, { [STORAGE_KEY]: 'stale-recovery-data' });

    const storage = bootWith(world);

    // The session runs on the EMPTY recovery sandbox (REVM-4 wipe applied).
    expect(storage.mmkvStorage.getItem(STORAGE_KEY)).toBeNull();
    // The real encrypted file and its marker are untouched.
    expect(world.files.get(STORE_ID)!.mode).toBe('encrypted');
    expect(world.files.get(STORE_ID)!.data.get(STORAGE_KEY)).toBe(PAYLOAD);
    expect(world.files.get(META_ID)!.data.get(MARKER_KEY)).toBe('encrypted');
    // Marker is authoritative → no probe IO.
    expect(world.copyCalls).toHaveLength(0);
    expectNoProbeLeftovers(world);
  });

  it('(h) marker present → marker is authoritative, no probe IO, data preserved', () => {
    const world = new FakeWorld({ secureKey: KEY });
    world.seedStore(STORE_ID, 'encrypted', KEY, { [STORAGE_KEY]: PAYLOAD });
    world.seedStore(META_ID, 'plain', undefined, { [MARKER_KEY]: 'encrypted' });

    const storage = bootWith(world);

    expect(world.copyCalls).toHaveLength(0);
    expect(storage.mmkvStorage.getItem(STORAGE_KEY)).toBe(PAYLOAD);
    expect(world.files.get(META_ID)!.data.get(MARKER_KEY)).toBe('encrypted');
  });

  it('(f2) RS5-4 back-to-back recovery boots: unmerged outbox survives the REVM-4 wipe', () => {
    // Formula-computed fixture: an outbox entry queued during recovery
    // session 1 that has NOT yet been drained into the real store.
    const outboxEntry = {
      table: 'devotionals',
      id: 'd1',
      clientUpdatedAt: '2026-06-09T00:00:00.000Z',
      data: { schemaVersion: 1 },
      deleted: false,
    };
    const outboxJson = JSON.stringify([outboxEntry]);

    const world = new FakeWorld({ secureThrows: true });
    world.seedStore(STORE_ID, 'encrypted', KEY, { [STORAGE_KEY]: PAYLOAD });
    world.seedStore(META_ID, 'plain', undefined, { [MARKER_KEY]: 'encrypted' });
    // Recovery session 1 left both queued outbox entries AND stale session data.
    world.seedStore(RECOVERY_ID, 'plain', undefined, {
      [OUTBOX_KEY]: outboxJson,
      [STORAGE_KEY]: 'stale-recovery-data',
    });

    // Keychain is STILL down → recovery session 2. Before RS5-4 this wipe
    // destroyed the unmerged outbox; the merge only runs on a normal boot.
    const storage = bootWith(world);

    expect(storage.mmkvStorage.getItem(STORAGE_KEY)).toBeNull(); // REVM-4 wipe intact
    expect(world.files.get(RECOVERY_ID)!.data.get(OUTBOX_KEY)).toBe(outboxJson); // RS5-4 carry
    expect(world.files.get(STORE_ID)!.data.get(STORAGE_KEY)).toBe(PAYLOAD); // real file untouched

    // A third consecutive recovery boot still preserves it.
    bootWith(world);
    expect(world.files.get(RECOVERY_ID)!.data.get(OUTBOX_KEY)).toBe(outboxJson);

    // Keychain returns → normal boot drains the queue into the REAL store and
    // clears the recovery copy (RS2-1 merge, dedup formula: table:id, newer
    // clientUpdatedAt wins; single entry → merged value is the entry verbatim).
    world.opts.secureThrows = false;
    world.opts.secureKey = KEY;
    const normalStorage = bootWith(world);

    expect(normalStorage.mmkvStorage.getItem(STORAGE_KEY)).toBe(PAYLOAD);
    expect(world.files.get(STORE_ID)!.data.get(OUTBOX_KEY)).toBe(JSON.stringify([outboxEntry]));
    expect(world.files.get(RECOVERY_ID)!.data.has(OUTBOX_KEY)).toBe(false);
  });

  it("(g) RS5-3 recrypt-throw: marker='plain' is written so the file mode is recorded truthfully", () => {
    const world = new FakeWorld({ secureKey: KEY, recryptThrows: true });
    world.seedStore(STORE_ID, 'plain', undefined, { [STORAGE_KEY]: PAYLOAD });

    const storage = bootWith(world);

    // Plain open succeeded; the upgrade failed; nothing was lost.
    expect(storage.mmkvStorage.getItem(STORAGE_KEY)).toBe(PAYLOAD);
    expect(world.files.get(STORE_ID)!.mode).toBe('plain');
    // RS5-3: the marker must say 'plain' — the ACTUAL file mode. The old code
    // skipped the write entirely, leaving marker=null (re-probe ambiguity);
    // writing 'encrypted' would make the next boot discard the plain file.
    expect(world.files.get(META_ID)!.data.get(MARKER_KEY)).toBe('plain');
    expectNoProbeLeftovers(world);
  });

  it('(g2) RS5-3 next-boot retry: marker=plain → row 3 recrypts without re-probing', () => {
    const world = new FakeWorld({ secureKey: KEY, recryptThrows: true });
    world.seedStore(STORE_ID, 'plain', undefined, { [STORAGE_KEY]: PAYLOAD });

    bootWith(world); // boot 1: recrypt throws, marker='plain' written
    const copyCallsAfterFirstBoot = world.copyCalls.length;

    world.opts.recryptThrows = false; // transient failure clears
    const storage = bootWith(world); // boot 2: marker row 3 retries the upgrade

    expect(storage.mmkvStorage.getItem(STORAGE_KEY)).toBe(PAYLOAD);
    expect(world.files.get(STORE_ID)!.mode).toBe('encrypted');
    expect(world.files.get(STORE_ID)!.key).toBe(KEY);
    expect(world.files.get(META_ID)!.data.get(MARKER_KEY)).toBe('encrypted');
    // The marker made boot 2 deterministic: no second probe ran.
    expect(world.copyCalls.length).toBe(copyCallsAfterFirstBoot);
  });

  it('stale probe files from a crashed previous probe are cleared and re-probed safely', () => {
    const world = new FakeWorld({ secureKey: KEY });
    world.seedStore(STORE_ID, 'encrypted', KEY, { [STORAGE_KEY]: PAYLOAD });
    // A previous boot crashed mid-probe, leaving a stale (plain-converted) copy.
    world.seedStore(PROBE_ID, 'plain', undefined, {});

    const storage = bootWith(world);

    expect(storage.mmkvStorage.getItem(STORAGE_KEY)).toBe(PAYLOAD);
    expect(world.files.get(META_ID)!.data.get(MARKER_KEY)).toBe('encrypted');
    expectNoProbeLeftovers(world);
  });

  // RS9-1: main copy succeeds but .crc copy throws — split failure.
  // The probe must return 'probe-unavailable' and the main probe file must be
  // cleaned up by the finally block. The real store data is preserved.
  it('(e3) RS9-1 split-failure: main copy succeeds + .crc copy throws → probe-unavailable, probe file cleaned, data preserved', () => {
    const world = new FakeWorld({ secureKey: KEY, fsCrcCopyThrows: true });
    world.seedStore(STORE_ID, 'encrypted', KEY, { [STORAGE_KEY]: PAYLOAD });

    const storage = bootWith(world);

    // Majority-safe encrypted fallback: data preserved.
    expect(storage.mmkvStorage.getItem(STORAGE_KEY)).toBe(PAYLOAD);
    expect(world.files.get(STORE_ID)!.mode).toBe('encrypted');
    expect(world.files.get(META_ID)!.data.get(MARKER_KEY)).toBe('encrypted');
    // The main copy was attempted (non-crc copyPath was recorded).
    expect(world.copyCalls.some((c) => !c.from.endsWith('.crc') && c.to.includes(PROBE_ID))).toBe(true);
    // The finally block cleaned up the probe file that was created by the main copy.
    expectNoProbeLeftovers(world);
  });

  // RS9-2: MMKV constructor throws when opening the probe store — probe unavailable.
  // The probe must return 'probe-unavailable', fall back to encrypted (majority-safe),
  // and still clean up the probe file copy.
  it('(e4) RS9-2 probe MMKV constructor throws → probe-unavailable, majority-safe encrypted fallback, probe file cleaned', () => {
    const world = new FakeWorld({ secureKey: KEY, probeMMKVThrows: true });
    world.seedStore(STORE_ID, 'encrypted', KEY, { [STORAGE_KEY]: PAYLOAD });

    const storage = bootWith(world);

    // Majority-safe encrypted fallback: data preserved.
    expect(storage.mmkvStorage.getItem(STORAGE_KEY)).toBe(PAYLOAD);
    expect(world.files.get(STORE_ID)!.mode).toBe('encrypted');
    expect(world.files.get(META_ID)!.data.get(MARKER_KEY)).toBe('encrypted');
    // The probe copy should have been cleaned up by the finally block.
    expectNoProbeLeftovers(world);
  });
});
