import { resolveMmkvOpenPlan } from '../mmkv-open-mode';
import type { MmkvOpenPlan, MmkvStoreProbeResult } from '../mmkv-open-mode';

type Marker = 'encrypted' | 'plain' | null;

const MARKERS: Marker[] = ['encrypted', 'plain', null];
const KEYS: boolean[] = [true, false];
const PROBES: MmkvStoreProbeResult[] = [
  'no-file',
  'plain-data',
  'no-plain-data',
  'probe-unavailable',
];

describe('resolveMmkvOpenPlan', () => {
  // ── Rows 1–4: marker is non-null; probeResult is irrelevant ────────────────
  it('row 1 - encrypted marker, key available → encrypted mode, no writeMarker, no recrypt', () => {
    const plan = resolveMmkvOpenPlan('encrypted', true);
    expect(plan).toEqual({ mode: 'encrypted', writeMarker: null, recrypt: false, clearOnOpen: false });
  });

  it('row 1 - encrypted marker is authoritative even if probe claims plain-data', () => {
    // A non-null marker means the file mode is KNOWN; probe input must never
    // override it (and the caller never runs the probe for these rows anyway).
    const plan = resolveMmkvOpenPlan('encrypted', true, 'plain-data');
    expect(plan).toEqual({ mode: 'encrypted', writeMarker: null, recrypt: false, clearOnOpen: false });
  });

  it('row 2 - encrypted marker, key unavailable → recovery mode, no writeMarker, no recrypt', () => {
    const plan = resolveMmkvOpenPlan('encrypted', false);
    expect(plan).toEqual({ mode: 'recovery', writeMarker: null, recrypt: false, clearOnOpen: true });
  });

  it('row 3 - plain marker, key available → plain mode, writeMarker encrypted, recrypt true', () => {
    const plan = resolveMmkvOpenPlan('plain', true);
    expect(plan).toEqual({ mode: 'plain', writeMarker: 'encrypted', recrypt: true, clearOnOpen: false });
  });

  it('row 4 - plain marker, key unavailable → plain mode, no writeMarker, no recrypt', () => {
    const plan = resolveMmkvOpenPlan('plain', false);
    expect(plan).toEqual({ mode: 'plain', writeMarker: null, recrypt: false, clearOnOpen: false });
  });

  // ── Rows 5–8: null marker + key available — differentiated by the probe ────
  it("row 5 - null marker, key available, probe='no-file' → encrypted (fresh install)", () => {
    const plan = resolveMmkvOpenPlan(null, true, 'no-file');
    expect(plan).toEqual({ mode: 'encrypted', writeMarker: 'encrypted', recrypt: false, clearOnOpen: false });
  });

  it("row 6 - null marker, key available, probe='plain-data' → plain+recrypt (218 legacy-plain rescue)", () => {
    // The disposable-copy probe POSITIVELY identified a plain file. Plain is
    // the only matching open mode; recrypt then upgrades it. Encrypted-open
    // would silently discard ALL content (RS3-1).
    const plan = resolveMmkvOpenPlan(null, true, 'plain-data');
    expect(plan).toEqual({ mode: 'plain', writeMarker: 'encrypted', recrypt: true, clearOnOpen: false });
  });

  it("row 7 - null marker, key available, probe='no-plain-data' → encrypted (218 majority)", () => {
    // The copy surfaced no plain data → the original is encrypted (correct to
    // open encrypted) or genuinely empty (encrypted-open harmless). This is
    // the MAJORITY 218 population — plain-opening it was the RS5-1/RS6-1 P0.
    const plan = resolveMmkvOpenPlan(null, true, 'no-plain-data');
    expect(plan).toEqual({ mode: 'encrypted', writeMarker: 'encrypted', recrypt: false, clearOnOpen: false });
  });

  it("row 8 - null marker, key available, probe='probe-unavailable' → encrypted (majority-safe fallback)", () => {
    // Probe could not run. Fall back to encrypted — correct for the majority;
    // documented caveat: a 218-legacy-plain file (tiny population) is
    // discarded. NEVER fall back to plain (that destroys the majority).
    const plan = resolveMmkvOpenPlan(null, true, 'probe-unavailable');
    expect(plan).toEqual({ mode: 'encrypted', writeMarker: 'encrypted', recrypt: false, clearOnOpen: false });
  });

  it('row 8 (default) - null marker, key available, no probe arg → majority-safe encrypted', () => {
    const plan = resolveMmkvOpenPlan(null, true);
    expect(plan).toEqual({ mode: 'encrypted', writeMarker: 'encrypted', recrypt: false, clearOnOpen: false });
  });

  // ── Row 9: null marker + key unavailable (any probe) ───────────────────────
  it('row 9 - null marker, key unavailable → plain mode, writeMarker plain, no recrypt', () => {
    const plan = resolveMmkvOpenPlan(null, false);
    expect(plan).toEqual({ mode: 'plain', writeMarker: 'plain', recrypt: false, clearOnOpen: false });
  });

  it.each(PROBES)('row 9 - null marker, key unavailable, probe=%s → plain (key unavailable wins)', (probe) => {
    const plan = resolveMmkvOpenPlan(null, false, probe);
    expect(plan).toEqual({ mode: 'plain', writeMarker: 'plain', recrypt: false, clearOnOpen: false });
  });

  // ── Invariant sweep over the ENTIRE input space (3 × 2 × 4 = 24 combos) ────
  // These are the formula-level safety properties; any regression that
  // re-introduces a wrong-mode open of the real store must violate one.
  describe('invariants over all 24 input combinations', () => {
    const combos: [Marker, boolean, MmkvStoreProbeResult, MmkvOpenPlan][] = [];
    for (const marker of MARKERS) {
      for (const keyAvailable of KEYS) {
        for (const probe of PROBES) {
          combos.push([marker, keyAvailable, probe, resolveMmkvOpenPlan(marker, keyAvailable, probe)]);
        }
      }
    }

    it('encrypted mode requires an available key', () => {
      for (const [, keyAvailable, , plan] of combos) {
        if (plan.mode === 'encrypted') expect(keyAvailable).toBe(true);
      }
    });

    it('a marker=encrypted file is NEVER opened plain (recovery when key is gone)', () => {
      for (const [marker, keyAvailable, , plan] of combos) {
        if (marker === 'encrypted') {
          expect(plan.mode).toBe(keyAvailable ? 'encrypted' : 'recovery');
        }
      }
    });

    it('RS5-1/RS6-1 guard: with a key and no marker, plain-open requires POSITIVE plain evidence', () => {
      for (const [marker, keyAvailable, probe, plan] of combos) {
        if (marker === null && keyAvailable && probe !== 'plain-data') {
          expect(plan.mode).toBe('encrypted');
        }
      }
    });

    it('plain-open with a key available always schedules recrypt (upgrade path)', () => {
      for (const [, keyAvailable, , plan] of combos) {
        if (plan.mode === 'plain' && keyAvailable) expect(plan.recrypt).toBe(true);
      }
    });

    it('recrypt implies plain mode, key available, and success-marker=encrypted', () => {
      for (const [, keyAvailable, , plan] of combos) {
        if (plan.recrypt) {
          expect(plan.mode).toBe('plain');
          expect(keyAvailable).toBe(true);
          expect(plan.writeMarker).toBe('encrypted');
        }
      }
    });

    it('clearOnOpen is exactly the recovery rows (REVM-4: never the real store)', () => {
      for (const [, , , plan] of combos) {
        expect(plan.clearOnOpen).toBe(plan.mode === 'recovery');
      }
    });

    it('probe input only ever influences the marker=null + keyAvailable branch', () => {
      for (const marker of MARKERS) {
        for (const keyAvailable of KEYS) {
          if (marker === null && keyAvailable) continue;
          const reference = resolveMmkvOpenPlan(marker, keyAvailable, PROBES[0]);
          for (const probe of PROBES) {
            expect(resolveMmkvOpenPlan(marker, keyAvailable, probe)).toEqual(reference);
          }
        }
      }
    });
  });
});
