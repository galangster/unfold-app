import { resolveMmkvOpenPlan } from '../mmkv-open-mode';

describe('resolveMmkvOpenPlan', () => {
  // ── Rows 1–4: marker is non-null; fileExists is irrelevant ──────────────────
  it('row 1 - encrypted marker, key available → encrypted mode, no writeMarker, no recrypt', () => {
    const plan = resolveMmkvOpenPlan('encrypted', true);
    expect(plan).toEqual({ mode: 'encrypted', writeMarker: null, recrypt: false, clearOnOpen: false });
  });

  it('row 1 - encrypted marker, key available, fileExists=true → same (fileExists ignored)', () => {
    const plan = resolveMmkvOpenPlan('encrypted', true, true);
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

  // ── Row 5a: null marker + key available + NO existing file (fresh install) ──
  it('row 5a - null marker, key available, fileExists=false → encrypted (fresh install)', () => {
    const plan = resolveMmkvOpenPlan(null, true, false);
    expect(plan).toEqual({ mode: 'encrypted', writeMarker: 'encrypted', recrypt: false, clearOnOpen: false });
  });

  // Legacy callers (no third arg) behave as fileExists=false (fresh install) ──
  it('row 5 (legacy 2-arg) - null marker, key available → encrypted mode, writeMarker encrypted', () => {
    const plan = resolveMmkvOpenPlan(null, true);
    expect(plan).toEqual({ mode: 'encrypted', writeMarker: 'encrypted', recrypt: false, clearOnOpen: false });
  });

  // ── Row 5b: null marker + key available + file EXISTS (218 upgrade) ─────────
  it('row 5b - null marker, key available, fileExists=true → plain+recrypt (218 upgrade, no data loss)', () => {
    const plan = resolveMmkvOpenPlan(null, true, true);
    // Must open plain (matches a 218-legacy-plain file) then recrypt to encrypted.
    // Opening encrypted on a plain file would silently discard ALL content.
    expect(plan).toEqual({ mode: 'plain', writeMarker: 'encrypted', recrypt: true, clearOnOpen: false });
  });

  // 218 upgrade: plain file probe asserts NO data loss ────────────────────────
  it('218-legacy-plain: marker=null + keyAvailable=true + fileExists=true → plain+recrypt, never discard', () => {
    // A 218 user whose 'unfold-store-v2' was created PLAIN (Keychain failure)
    // upgrading to 219. If we incorrectly opened encrypted, MMKV would silently
    // discard ALL content. Row 5b must yield mode:'plain' so the file is opened
    // in the matching mode before recrypt upgrades it.
    const plan = resolveMmkvOpenPlan(null, true, true);
    expect(plan.mode).toBe('plain');
    expect(plan.recrypt).toBe(true);
    expect(plan.writeMarker).toBe('encrypted');
    expect(plan.clearOnOpen).toBe(false);
  });

  // ── Row 6: null marker + key unavailable (any fileExists) ────────────────────
  it('row 6 - null marker, key unavailable → plain mode, writeMarker plain, no recrypt', () => {
    const plan = resolveMmkvOpenPlan(null, false);
    expect(plan).toEqual({ mode: 'plain', writeMarker: 'plain', recrypt: false, clearOnOpen: false });
  });

  it('row 6 - null marker, key unavailable, fileExists=true → plain mode (key unavailable wins)', () => {
    const plan = resolveMmkvOpenPlan(null, false, true);
    expect(plan).toEqual({ mode: 'plain', writeMarker: 'plain', recrypt: false, clearOnOpen: false });
  });
});
