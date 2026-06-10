# Plan 02 — Data Integrity + Networking P1s (Unfold mobile, build 218 audit)

## Header

- **Repo / worktree:** `/Users/galangster/clawd/work/unfold-audit` (branch `audit/e2e-build218-2026-06`)
- **Base commit for all `src/` code:** `9f36ef6` (origin/main). The audit branch only adds audit docs — verified `git diff --stat 9f36ef6..HEAD -- src/` is empty. Every excerpt below was read from this tree. **If any excerpt does not match the file at the cited lines, STOP and report drift — do not improvise.**
- **Findings covered:** DAT-1, DAT-2, DAT-3, DAT-4, DAT-5, DAT-6, DAT-7 (P1, data-integrity); NET-2, NET-3, NET-4, NET-5, NET-15 (P1, network). Cheap same-file P2s folded in: NET-14, DAT-13, NET-7, NET-13, DAT-9.
- **Test/typecheck/lint commands** (run from repo root):
  - `npm run typecheck` → expect exit 0, no output.
  - `npm run lint` → expect exit 0.
  - `npx jest <testfile> --silent` → expect `Tests: N passed` with the counts given per fix.
  - Full suite at the end: `npm test -- --silent` → expect 0 failures.
- **Test conventions in this repo** (follow them exactly):
  - Tests live in `src/lib/__tests__/*.test.ts(x)`, jest preset `@react-native/jest-preset`, `@/` maps to `src/`.
  - Native-touching modules are mocked **per test file** (see `src/lib/__tests__/use-companion-chat-fallback.test.tsx:27-43` for the canonical `../mmkv-storage` mock with a `Map`-backed store, and `src/lib/__tests__/devotional-read-sync.test.ts:1-4` for the `@/lib/api-config` mock). `expo-secure-store` is mocked globally in `jest.setup.js`.
  - The repo's dominant pattern is **extract pure logic into a `src/lib/*.ts` helper and unit-test the helper** (`creation-gate-policy.ts`, `journal-folder-delete.ts`, `push-notification-helpers.ts` all exist for exactly this reason). Every fix below follows that pattern.
  - Vault rule `compute-test-expected-values-by-formula-not-intuition`: every expected value in the test specs below is derived in-line; do not change them to "what looks right".

### Dependency order

1. **FIX-2** (MMKV mode marker) and **FIX-3** (device-id → Keychain) — storage substrate; do these first, FIX-3 after FIX-2 (same file).
2. **FIX-1** (rehydrate repair) — independent.
3. **FIX-7** (sync outbox + schemaVersion) — before FIX-8 (uses the outbox) and before FIX-6 (reset must clear the outbox).
4. **FIX-6** (delete-all-data) — after FIX-3 (reset must rotate the SecureStore device-id) and FIX-7 (reset must clear the outbox key).
5. **FIX-11** (RevenueCat recovery + onlineManager) — before FIX-10 ideally (reconnect refetch helps the paywall), but both are standalone-safe.
6. **FIX-4, FIX-5, FIX-9, FIX-10, FIX-12, FIX-13** — independent of each other.

### Risk estimates

| Fix | Finding(s) | Risk | Why |
|---|---|---|---|
| FIX-1 | DAT-1 | Low | Pure repair logic, behavior only changes on already-corrupt state |
| FIX-2 | DAT-4 | **Medium-high** | Touches storage-open path for every user; mistakes here ARE the data loss we're preventing. Finding confidence was 0.65 — runtime-verify on device |
| FIX-3 | DAT-7 | Medium | Identity migration; must be lossless for existing users |
| FIX-4 | DAT-3 | Low-medium | Pure helper + one call site |
| FIX-5 | DAT-5+NET-14 | Low | Local, additive verification |
| FIX-6 | DAT-6 | Medium | Wipe superset must not wipe things it shouldn't; **product decision** |
| FIX-7 | NET-5+DAT-13 | Medium | New persistence + drain loop; backend contract for extra field unverified |
| FIX-8 | DAT-2 | **High** | New sync surface; **product decision**; staging verification required |
| FIX-9 | NET-2+NET-13 | Low-medium | Hook return-shape change, one consumer |
| FIX-10 | NET-3 | Low | Mirrors an existing in-repo pattern (paywall.tsx) |
| FIX-11 | NET-4+NET-7 | Medium | Module-state retry in revenuecatClient; foreground listeners |
| FIX-12 | NET-15 | Low | Removes a call; adds a guard + re-register hook |
| FIX-13 | DAT-9 | Low | State shape `single → queue` in one screen |

---

## PRODUCT DECISIONS FOR NICK (plan is written for the recommended option in each)

1. **DAT-6 — what should "Delete all data" do about server-side data?** No backend delete endpoint exists (exhaustive client grep; backend repo has push/pull only). Options: (a) **[RECOMMENDED]** rotate the device-id locally after the wipe (server data becomes permanently unreachable — orphaned-by-design) and soften the dialog copy to "deleted from this device and disconnected from your account data"; file a backend `DELETE /api/sync/user` follow-up for true deletion. (b) Build the backend delete endpoint first and call it (blocks on backend work, out of this plan's scope). (c) Copy-only fix (weakest; the "permanently deleted" promise stays false). Plan implements (a).
2. **DAT-2 — how much personal-writing sync ships in 1.0?** Journal entries, notes, folders, Bible highlights, and check-ins currently never leave the device despite a sync-ready schema; reinstall restores devotionals but silently loses all personal writing. Options: (a) **[RECOMMENDED]** push-backup + reinstall-restore: enqueue these five tables through the new sync outbox on mutation, and on pull apply them **only when the local table is empty** (reinstall-restore semantics, no LWW merge risk). (b) Device-only for 1.0: label journal/notes as "stored on this device" and ship full sync later (smallest, but the partial-restore betrayal stays). (c) Full bidirectional LWW sync (largest; not appropriate for a cheaper-model executor pre-App-Review). Plan implements (a) with a hard staging-verification gate.
3. **NET-3 — should the onboarding hard paywall have a non-QA escape when RevenueCat is unreachable?** Options: (a) **[RECOMMENDED]** no free skip — keep the hard paywall, add visible error + retry on the CTA (monetization posture unchanged). (b) After N consecutive failures show a "continue with limited access" escape (conversion risk, but zero dead-ends). Plan implements (a).
4. **NET-4 — `unknown` premium policy stays fail-closed.** The code comments mark fail-closed as intentional; this plan keeps it and only adds (i) in-session retry paths so `unknown` actually resolves when connectivity returns, and (ii) a visible message instead of a silent no-op when a gate blocks on `unknown`. The alternative — fail-open grace for users whose persisted `user.isPremium` is true — is a revenue/abuse trade-off only Nick can make. Plan implements fail-closed + retry + feedback.
5. **NET-2 — free-message quota semantics.** Recommended invariant: **a free message is consumed iff a companion response was received** (including a user-stopped partial). Alternative: consume on dispatch (server-cost-protective but burns quota on failures — the current bug). Plan implements the recommended invariant.

---

# FIX-1 (DAT-1, P1) — Rehydrate validation wipes 9 slices wholesale; notes/folders/bibleHighlights never validated

## Context

`src/lib/store.ts:1861-1891` (inside `onRehydrateStorage`). If ANY one of six shape checks fails, **nine** slices are reset to initial — including never-synced, unrecoverable user data (`journalEntries`, `checkIns`, `bookmarks`, `highlights`). Meanwhile `notes`, `folders`, `bibleHighlights`, `bibleReadingHistory` are not validated at all, so corruption there passes through and crashes at runtime. Because the store persists whole-state on every `set()`, the wipe commits to MMKV on the next action — permanent. A real trigger exists without MMKV corruption: `src/lib/store-migrations.ts` wraps each migration step in its own try/catch and continues on failure, so a failed step that leaves any checked array non-array trips the wipe on the same launch.

Current code (must match exactly):

```ts
// src/lib/store.ts:1861-1891
          if (state) {
            // Validate required fields exist
            const isValid =
              Array.isArray(state.devotionals) &&
              Array.isArray(state.journalEntries) &&
              Array.isArray(state.bookmarks) &&
              Array.isArray(state.highlights) &&
              Array.isArray(state.usedScriptures) &&
              state.generationSession != null &&
              typeof state.generationSession === 'object';

            if (!isValid) {
              logger.warn('[store] Invalid state detected, resetting to initial state');
              void logBugError('store-validation', new Error('Invalid persisted state'), {
                stateKeys: Object.keys(state),
              });
              // Reset to initial state on validation failure (graceful degradation)
              state.devotionals = initialState.devotionals;
              state.journalEntries = initialState.journalEntries;
              state.bookmarks = initialState.bookmarks;
              state.highlights = initialState.highlights;
              state.usedScriptures = initialState.usedScriptures;
              state.generationSession = initialState.generationSession;
              state.resumeContext = initialState.resumeContext;
              state.currentDevotionalId = initialState.currentDevotionalId;
              state.checkIns = initialState.checkIns;
              // Preserve user if it seems valid
              if (!state.user || typeof state.user === 'object') {
```

(Note: the last line above in the real file reads `if (!state.user || typeof state.user !== 'object') { state.user = initialState.user; }` — read it before editing.)

Relevant slice names in `initialState` (`src/lib/store.ts:811-816`): `notes: [] as Note[]`, `folders: [] as NoteFolder[]`, `bibleHighlights: [] as BibleHighlight[]`, `bibleReadingHistory: [] as BibleReadingPosition[]`.

## Failing test FIRST

New file `src/lib/__tests__/store-rehydrate-repair.test.ts`. It imports the **new** pure helper (does not exist yet → test fails to compile today, which is the red state):

```ts
import { repairRehydratedState } from '../store-rehydrate-repair';
```

Test cases (compute expectations by formula — "repaired" means replaced by the initial value for exactly that slice and its declared dependents, nothing else):

1. `'resets only the corrupt slice'`: state with `usedScriptures: 'corrupt'` (string) and `journalEntries: [{ id: 'j1' }]` → after repair, `usedScriptures` equals `[]`, `journalEntries` still `[{ id: 'j1' }]` (same reference), and the returned `repairedKeys` equals `['usedScriptures']`.
2. `'validates the notebook and bible slices'`: state with `notes: 42`, `folders: null`, `bibleHighlights: {}`, `bibleReadingHistory: 'x'`, everything else valid arrays → all four become `[]`, `repairedKeys` has length 4.
3. `'resetting devotionals also resets its dependents'`: state with `devotionals: null` and `currentDevotionalId: 'd1'`, `resumeContext: { x: 1 }` → `devotionals` → `[]`, `currentDevotionalId` → `null`, `resumeContext` → initial value, and `journalEntries`/`checkIns`/`notes` untouched. `repairedKeys` contains `'devotionals'`, `'currentDevotionalId'`, `'resumeContext'`.
4. `'valid state is untouched'`: a fully valid state → `repairedKeys` is `[]` and every slice keeps reference identity.
5. `'invalid generationSession resets only generationSession'`: `generationSession: null` → only that key repaired.

## Minimal fix

1. Create `src/lib/store-rehydrate-repair.ts` — a pure module (no zustand/native imports, mirroring `creation-gate-policy.ts` style):

```ts
type AnyState = Record<string, any>;

const ARRAY_SLICES = [
  'devotionals', 'journalEntries', 'bookmarks', 'highlights', 'usedScriptures',
  'checkIns', 'notes', 'folders', 'bibleHighlights', 'bibleReadingHistory',
] as const;

/** Slices that must be reset together when their parent is invalid. */
const DEPENDENTS: Partial<Record<string, string[]>> = {
  devotionals: ['currentDevotionalId', 'resumeContext'],
};

export function repairRehydratedState(
  state: AnyState,
  initial: AnyState,
): { repairedKeys: string[] } {
  const repairedKeys: string[] = [];
  const reset = (key: string) => {
    state[key] = initial[key];
    repairedKeys.push(key);
  };
  for (const key of ARRAY_SLICES) {
    if (!Array.isArray(state[key])) {
      reset(key);
      for (const dep of DEPENDENTS[key] ?? []) reset(dep);
    }
  }
  if (state.generationSession == null || typeof state.generationSession !== 'object') {
    reset('generationSession');
  }
  if (!state.user || typeof state.user !== 'object') {
    reset('user');
  }
  return { repairedKeys };
}
```

2. In `src/lib/store.ts`, replace the whole `isValid` block (lines 1861-1891, from `// Validate required fields exist` through the closing brace of `if (!isValid) { ... }` including the user-preserve branch) with:

```ts
          if (state) {
            const { repairedKeys } = repairRehydratedState(state, initialState);
            if (repairedKeys.length > 0) {
              logger.warn('[store] Repaired invalid persisted slices:', repairedKeys.join(', '));
              void logBugError('store-validation', new Error('Invalid persisted state (repaired per-slice)'), {
                repairedKeys,
                stateKeys: Object.keys(state),
              });
            }
```

   Add `import { repairRehydratedState } from './store-rehydrate-repair';` near the other relative imports at the top of `store.ts`. Do NOT touch the session-flag resets at lines 1893-1895 or the highlight-dedupe block below them.

## Verification

- `npx jest src/lib/__tests__/store-rehydrate-repair.test.ts --silent` → `Tests: 5 passed`.
- `npm run typecheck` → exit 0.
- `grep -n "state.devotionals = initialState.devotionals" src/lib/store.ts` → **no matches** (wholesale block removed).
- Full suite green.

## Out of scope / STOP

- Do not add validation of element shapes inside arrays (only top-level type checks).
- Do not change `migrateUnfoldStore`.
- STOP if `onRehydrateStorage` in `store.ts` does not contain the exact `isValid` block above.

---

# FIX-2 (DAT-4, P1) — A transient SecureStore failure flips the MMKV encryption mode on the existing data file

## Context

`src/lib/mmkv-storage.ts:37-66`. `getOrCreateEncryptionKey()` runs once at module load; on ANY SecureStore throw it returns `undefined` and the **same file id** `unfold-store-v2` is opened without a key:

```ts
// src/lib/mmkv-storage.ts:60-66
const encryptionKey = getOrCreateEncryptionKey();

// Use 'unfold-store-v2' for the encrypted instance.
// The old 'unfold-store' (unencrypted) is migrated below and then cleared.
const mmkv = encryptionKey
  ? new MMKV({ id: 'unfold-store-v2', encryptionKey })
  : new MMKV({ id: 'unfold-store-v2' });
```

react-native-mmkv (installed: `^3.2.0`) cannot open a file in the wrong mode — contents are discarded and the first write clobbers the old file. Two loss chains: (a) first-launch SecureStore failure → file created plain → later launch generates a NEW key → encrypted open of plain file → wiped; (b) months of encrypted use → one transient Keychain read error → plain open of encrypted file → wiped. Everything lives in this namespace: main store, companion chat, device-id. `recrypt(key)` exists in the installed version (`node_modules/react-native-mmkv/lib/typescript/src/Types.d.ts:139`) — it is the only legal way to change modes.

## Failing test FIRST

New pure helper + test. File `src/lib/__tests__/mmkv-open-mode.test.ts`, importing `resolveMmkvOpenPlan` from `../mmkv-open-mode` (new module → red today). Decision-table tests (one `it` per row; expectations derived from the invariant *"never open the existing file in a mode different from the marker"*):

| # | `marker` | `keyAvailable` | expected plan |
|---|---|---|---|
| 1 | `'encrypted'` | `true` | `{ mode: 'encrypted', writeMarker: null, recrypt: false }` |
| 2 | `'encrypted'` | `false` | `{ mode: 'recovery', writeMarker: null, recrypt: false }` — do NOT touch the real file |
| 3 | `'plain'` | `true` | `{ mode: 'plain', writeMarker: 'encrypted', recrypt: true }` — open plain (matches file), then `recrypt(key)` to upgrade |
| 4 | `'plain'` | `false` | `{ mode: 'plain', writeMarker: null, recrypt: false }` |
| 5 | `null` (legacy, no marker) | `true` | `{ mode: 'encrypted', writeMarker: 'encrypted', recrypt: false }` (status-quo inference + backfill marker) |
| 6 | `null` | `false` | `{ mode: 'plain', writeMarker: 'plain', recrypt: false }` (status-quo inference + backfill marker) |

## Minimal fix

1. New `src/lib/mmkv-open-mode.ts` — pure function implementing exactly the table above:

```ts
export type MmkvMode = 'encrypted' | 'plain' | 'recovery';
export interface MmkvOpenPlan {
  mode: MmkvMode;
  writeMarker: 'encrypted' | 'plain' | null;
  recrypt: boolean;
}
export function resolveMmkvOpenPlan(
  marker: 'encrypted' | 'plain' | null,
  keyAvailable: boolean,
): MmkvOpenPlan { /* table above */ }
```

2. In `src/lib/mmkv-storage.ts`, between the key resolution and the `mmkv` construction:
   - Add a retry inside `getOrCreateEncryptionKey`: on the first catch, retry the `SecureStore.getItem`/`setItem` sequence once before returning `undefined` (transient Keychain errors are the whole threat model).
   - Add an **unencrypted** marker instance and use the plan:

```ts
const storageMeta = new MMKV({ id: 'unfold-storage-meta' });
const MODE_MARKER_KEY = 'unfold-store-v2-mode';

const encryptionKey = getOrCreateEncryptionKey();
const storedMarker = (storageMeta.getString(MODE_MARKER_KEY) as 'encrypted' | 'plain' | undefined) ?? null;
const openPlan = resolveMmkvOpenPlan(storedMarker, encryptionKey !== undefined);

const mmkv =
  openPlan.mode === 'encrypted'
    ? new MMKV({ id: 'unfold-store-v2', encryptionKey })
    : openPlan.mode === 'plain'
      ? new MMKV({ id: 'unfold-store-v2' })
      // recovery: keychain down but the real file is encrypted — run this session
      // on a throwaway namespace; NEVER open the real file in the wrong mode.
      : new MMKV({ id: 'unfold-store-v2-recovery' });

if (openPlan.mode === 'recovery') {
  logger.error('[MMKV] Keychain unavailable but store is encrypted — running in recovery namespace this session; user data preserved on disk');
}
if (openPlan.recrypt && encryptionKey) {
  try {
    mmkv.recrypt(encryptionKey);
    storageMeta.set(MODE_MARKER_KEY, 'encrypted');
    logger.log('[MMKV] Upgraded plain store to encrypted via recrypt');
  } catch (error) {
    logger.warn('[MMKV] recrypt failed; staying plain', error);
  }
} else if (openPlan.writeMarker) {
  storageMeta.set(MODE_MARKER_KEY, openPlan.writeMarker);
}
```

   Keep everything else (migration, adapter, exports) untouched. Note `recrypt` already sets the marker inside its own success branch, so `writeMarker: 'encrypted'` for row 3 is satisfied there.

3. Acknowledge the residual window in a comment: a legacy install (no marker yet) that hits a transient Keychain failure on its first launch of this build still infers `plain` (row 6) — one-launch exposure, eliminated for all subsequent launches by the marker backfill.

## Verification

- `npx jest src/lib/__tests__/mmkv-open-mode.test.ts --silent` → `Tests: 6 passed`.
- `npm run typecheck`, `npm run lint` → exit 0.
- **Runtime gate (required — finding confidence was 0.65):** on the iOS simulator, launch the app, create data, kill, relaunch → data persists; `grep` Metro logs for `[MMKV]` — no recovery/recrypt lines on a healthy device.

## Out of scope / STOP

- Do not migrate data INTO the recovery namespace or out of it — recovery is a deliberately empty one-session sandbox.
- Do not change the v1→v2 / AsyncStorage migration block (DAT-15 is below-bar, not in this batch).
- STOP if `new MMKV({ id: 'unfold-store-v2' ...` does not appear at lines ~64-66 as excerpted.

---

# FIX-3 (DAT-7, P1) — Device-id (sole auth credential + RevenueCat identity) lives in MMKV, not Keychain

## Context

`src/lib/mmkv-storage.ts:131-145`:

```ts
const DEVICE_ID_KEY = 'unfold-device-id';

export function getDeviceId(): string {
  let id = mmkv.getString(DEVICE_ID_KEY);
  if (id) return id;

  id = uuidv4();
  mmkv.set(DEVICE_ID_KEY, id);
  logger.log('[MMKV] Generated new device ID:', id);
  return id;
}
```

Reinstall wipes MMKV but preserves Keychain — the app keeps the (now useless) encryption key and loses the identity all server-side recovery depends on. New UUID → `/api/sync/pull` returns nothing, RevenueCat app-user-id (`anon_<uuid>`, see `src/lib/revenuecat-user-id.ts`) churns. Consumers: `src/lib/api-config.ts:33` (`'X-Device-ID': getDeviceId()`) and `src/lib/revenuecatClient.ts:313` (`buildRevenueCatAppUserId(getDeviceId())` at **module scope — synchronous**). The fix must stay synchronous: `SecureStore.getItem`/`setItem` (sync variants) are already used for the encryption key at lines 39/47.

## Failing test FIRST

New `src/lib/__tests__/device-id.test.ts` importing `resolveDeviceId` from `../device-id` (new module → red). Mock-free pure function taking injected reads/writes:

1. `'prefers the keychain value'`: `resolveDeviceId({ secureValue: 'K', mmkvValue: 'M', generate: () => 'G' })` → `{ id: 'K', writeSecure: false, writeMmkv: true }` (mirror keychain value into MMKV when they differ — keeps the fallback mirror fresh).
2. `'migrates an existing MMKV id into the keychain'`: `{ secureValue: null, mmkvValue: 'M' }` → `{ id: 'M', writeSecure: true, writeMmkv: false }` — existing users keep their identity.
3. `'generates once and writes both'`: `{ secureValue: null, mmkvValue: null, generate: () => 'G' }` → `{ id: 'G', writeSecure: true, writeMmkv: true }`.
4. `'keychain and mirror already consistent'`: `{ secureValue: 'K', mmkvValue: 'K' }` → `{ id: 'K', writeSecure: false, writeMmkv: false }`.

## Minimal fix

1. New `src/lib/device-id.ts`:

```ts
export function resolveDeviceId(args: {
  secureValue: string | null;
  mmkvValue: string | null;
  generate: () => string;
}): { id: string; writeSecure: boolean; writeMmkv: boolean } { /* table above */ }
```

2. In `src/lib/mmkv-storage.ts`, rewrite `getDeviceId()` to use it, with SecureStore failure falling back to today's behavior:

```ts
const DEVICE_ID_KEY = 'unfold-device-id';
const SECURE_DEVICE_ID_KEY = 'unfold-device-id'; // SecureStore namespace is separate from MMKV

export function getDeviceId(): string {
  let secureValue: string | null = null;
  let secureAvailable = true;
  try {
    secureValue = SecureStore.getItem(SECURE_DEVICE_ID_KEY);
  } catch {
    secureAvailable = false; // Keychain down — MMKV mirror keeps us working
  }
  const plan = resolveDeviceId({
    secureValue,
    mmkvValue: mmkv.getString(DEVICE_ID_KEY) ?? null,
    generate: () => uuidv4(),
  });
  if (plan.writeSecure && secureAvailable) {
    try { SecureStore.setItem(SECURE_DEVICE_ID_KEY, plan.id); } catch {}
  }
  if (plan.writeMmkv) mmkv.set(DEVICE_ID_KEY, plan.id);
  return plan.id;
}
```

3. Export a rotation hook for FIX-6: `export function rotateDeviceId(): string` — generates a fresh uuid, writes it to both SecureStore (try/catch) and MMKV, returns it.

Keep the export from `@/lib/mmkv-storage` (both consumers import from there — `grep -rn "from '@/lib/mmkv-storage'" src | grep getDeviceId` to confirm only `api-config.ts` and `revenuecatClient.ts`).

## Verification

- `npx jest src/lib/__tests__/device-id.test.ts --silent` → `Tests: 4 passed`.
- `npx jest src/lib/__tests__/revenuecat-user-id.test.ts --silent` → still passes (no change to id format).
- `npm run typecheck` → exit 0.
- Runtime: simulator launch → Metro log shows no new-device-id generation on second launch.

## Out of scope / STOP

- Do not change `getSharedEncryptionKey` or any cache instance.
- Behavior note to preserve: keychain persistence across reinstall is the **goal** here; FIX-6's rotation is the only sanctioned way to shed the identity.
- STOP if `getDeviceId` body differs from the excerpt.

---

# FIX-4 (DAT-3, P1) — Applying a Bible highlight silently destroys every overlapping highlight and its notes

## Context

`src/app/(tabs)/(bible)/reader.tsx:530-556` (`handleHighlight`) and the chapter memo at 428-431:

```ts
// reader.tsx:428-431
  const highlights = useMemo(
    () => bibleHighlights.filter((h) => h.bookId === bookId && h.chapter === chapter),
    [bibleHighlights, bookId, chapter],
  );
```

```ts
// reader.tsx:530-556 (abridged, read in full before editing)
  const handleHighlight = useCallback((color: BibleHighlightColor) => {
    if (!verses || selectedVerses.size === 0 || !book) return;
    const sorted = Array.from(selectedVerses).sort((a, b) => a - b);
    const selectedTexts = sorted
      .map((v) => verses.find((vr) => vr.verse === v)?.text ?? '')
      .join(' ');

    // Remove any existing highlights that overlap
    for (const h of highlights) {
      if (sorted.some((v) => v >= h.verseStart && v <= h.verseEnd)) {
        removeBibleHighlight(h.id);
      }
    }

    addBibleHighlight({
      bookId, bookName: book.name, chapter,
      verseStart: sorted[0], verseEnd: sorted[sorted.length - 1],
      text: selectedTexts, color,
      translation: bibleReaderSettings.translation,
    });
    ...
```

Four defects: (1) overlapped highlights carrying a `note` are deleted silently — the note is destroyed (`BibleHighlight.note` lives on the record, `store.ts:104-118`); note-only entries (`color: null`) are matched and destroyed too; (2) non-contiguous selections (tap v2 and v9) store `verseStart:2, verseEnd:9` with text from only v2+v9 — corrupt range; (3) overlap removal is translation-blind (a KJV highlight dies when highlighting the same verses in BSB); (4) partially-overlapped highlights are deleted whole instead of trimmed. `handleRemoveHighlight` (619-631) shares (1)-note-only and (3).

## Failing test FIRST

New `src/lib/__tests__/bible-highlight-overlap.test.ts` importing `planHighlightApplication` from `../bible-highlight-overlap` (new → red). Build fixtures with the real `BibleHighlight` shape (import the type from `@/lib/store`). Expected values computed from the rules: *runs = maximal consecutive integer sequences of the selection; an existing highlight is affected only if same translation, color ≠ null, and its [verseStart,verseEnd] intersects a run; affected highlights are removed and their non-selected remainder segments re-added with the same color/translation; a removed highlight's note transfers to the first new/remainder segment that intersects it, else onto the new highlight.*

1. `'non-contiguous selection produces one record per run'`: selection `{2, 9}`, no existing → `toAdd` = two records: `(2,2)` and `(9,9)`; `toRemove` = `[]`.
2. `'partial overlap splits instead of destroying'`: existing yellow `(1,10)`, selection `{5}` green → `toRemove = [existing.id]`; `toAdd` = green `(5,5)` + yellow `(1,4)` + yellow `(6,10)` (remainders preserve the old color and translation).
3. `'notes survive a re-color'`: existing yellow `(3,4)` with `note: 'study'`, selection `{3, 4}` blue → `toRemove = [id]`; `toAdd` = one blue `(3,4)` whose `note === 'study'`.
4. `'note-only entries are never removed'`: existing `(5,5)` with `color: null, note: 'n'`, selection `{5}` red → `toRemove = []`; `toAdd` = red `(5,5)` without the note.
5. `'other translations untouched'`: existing KJV yellow `(2,3)`, selection `{2}` in BSB → `toRemove = []`.
6. `'text is built per run from the run's verses only'`: with verses `1..10` text `t1..t10`, selection `{2,3,9}` → adds `(2,3)` with text `'t2 t3'` and `(9,9)` with `'t9'`.

## Minimal fix

1. New pure module `src/lib/bible-highlight-overlap.ts`:

```ts
import type { BibleHighlight, BibleHighlightColor } from '@/lib/store';

export interface HighlightApplicationPlan {
  toRemove: string[]; // existing highlight ids
  toAdd: Array<Omit<BibleHighlight, 'id' | 'createdAt'>>;
}

export function planHighlightApplication(args: {
  chapterHighlights: BibleHighlight[]; // already filtered to bookId+chapter
  selectedVerses: number[];            // unsorted ok
  color: BibleHighlightColor;
  translation: string;
  bookId: number;
  bookName: string;
  chapter: number;
  verseText: (verse: number) => string;
}): HighlightApplicationPlan { /* rules above */ }
```

   Also export `planHighlightRemoval(args: { chapterHighlights, selectedVerses, translation })` → `{ toRemove: string[] }` applying the translation + `color !== null` filters for `handleRemoveHighlight` (explicit removal still removes whole overlapped highlights — that is the user's stated intent — but must not kill note-only entries or other translations).

2. In `reader.tsx`, replace the bodies:
   - `handleHighlight`: build the plan, `for (const id of plan.toRemove) removeBibleHighlight(id);` then `for (const h of plan.toAdd) addBibleHighlight(h);` keep the existing haptic/UI-reset tail untouched. Delete the local `selectedTexts` construction (the helper owns text now).
   - `handleRemoveHighlight` (619-631): replace the inline loop with `planHighlightRemoval`.
   - Do NOT change the `highlights` memo at 428-431 (rendering stays translation-agnostic on purpose) and do not touch `handleNote`/`noteMap`.

## Verification

- `npx jest src/lib/__tests__/bible-highlight-overlap.test.ts --silent` → `Tests: 6 passed`.
- `npx jest src/lib/__tests__/bible-reader-visuals.test.ts --silent` → still green.
- `npm run typecheck` → exit 0.
- Manual sim check: highlight v1-10, then re-highlight v5 in another color → v1-4 and v6-10 keep the old color.

## Out of scope / STOP

- No confirmation dialogs (the split+note-merge makes destruction impossible; dialog not needed).
- No store mutator changes (`addBibleHighlight` already stamps id/createdAt/updatedAt, `store.ts:1616-1630`).
- STOP if `handleHighlight` does not contain the `// Remove any existing highlights that overlap` loop as excerpted.

---

# FIX-5 (DAT-5 P1 + NET-14 P2) — Partial Bible download auto-marked `ready` with no schema check; unguarded progress division

## Context

`src/lib/bible-db.ts:138-152` — auto-detect branch trusts any ≥5MB file:

```ts
  // Auto-detect DB file if status isn't 'ready' (e.g., stuck download, manual copy)
  if (meta.status !== 'ready') {
    const fileInfo = await getInfoAsync(DB_FILE_PATH);
    if (fileInfo.exists) {
      const sizeBytes = 'size' in fileInfo ? (fileInfo.size ?? 0) : 0;
      if (sizeBytes >= 5 * 1024 * 1024) {
        logger.log('[BibleDB] Found existing DB file, marking as ready');
        setMeta(META_KEY_STATUS, 'ready');
        ...
```

`createDownloadResumable` writes progressively to the final path; an app-kill after >5MB leaves a truncated SQLite file that this branch promotes to `ready` **without** `verifyDownloadedDb()` (which only runs on the fresh-download success path, line 230). All query helpers in this file swallow errors and return `[]` → permanently empty Bible tab, and no re-download path exists because status is `ready`. The graceful-failure path already deletes partials (251-256) — this is specifically the kill/crash window.

NET-14 (same file, 202-205): `const progress = downloadProgress.totalBytesWritten / downloadProgress.totalBytesExpectedToWrite;` — `totalBytesExpectedToWrite` is `-1`/`0` when Content-Length is absent → negative/`Infinity` progress fed into `DownloadBibleSheet`, which renders `${Math.round((progress ?? 0) * 100)}%` (`src/components/bible/DownloadBibleSheet.tsx:70,75`).

## Failing test FIRST

New `src/lib/__tests__/bible-db-verify.test.ts`. Mock `expo-file-system` (legacy functions used: `getInfoAsync`, `deleteAsync`, `createDownloadResumable`, `makeDirectoryAsync`), `expo-sqlite` (`openDatabaseAsync`), `react-native-mmkv` (Map-backed `MMKV` class — the file creates `new MMKV({ id: 'unfold-bible-meta' })` at module scope, line 86), and `@/lib/api-config`. Follow the existing mock pattern in `src/lib/__tests__/bible-db-download-headers.test.ts` (read it first and reuse its mock scaffolding).

1. `'auto-detect verifies schema before marking ready'`: meta status `'downloading'`; `getInfoAsync` → `{ exists: true, size: 6 * 1024 * 1024 }`; `openDatabaseAsync` returns a db whose `getFirstAsync` resolves `{ count: 66 }` then `{ count: 50001 }` → `verifyBibleDb()` resolves `'ready'`. (Today this passes without opening the DB — assert `openDatabaseAsync` **was called**, which fails today.)
2. `'corrupt partial file is deleted and status reset'`: same file info, but `openDatabaseAsync` rejects (truncated file) → `verifyBibleDb()` resolves `'not_downloaded'`, `deleteAsync` called with `DB_FILE_PATH`, and meta status persisted as `'not_downloaded'`.
3. `'progress callback clamps missing content-length'` (NET-14): export and test a tiny pure helper `computeDownloadProgress(written, totalExpected)` → `computeDownloadProgress(500, -1) === -1`, `computeDownloadProgress(500, 0) === -1`, `computeDownloadProgress(5, 10) === 0.5`, `computeDownloadProgress(15, 10) === 1` (clamped).

## Minimal fix

1. In `verifyBibleDb()`'s auto-detect branch, before `setMeta(META_KEY_STATUS, 'ready')`:

```ts
      if (sizeBytes >= 5 * 1024 * 1024) {
        const verified = await verifyDownloadedDb();
        if (!verified) {
          logger.warn('[BibleDB] Existing DB file failed verification — deleting partial file');
          try { await deleteAsync(DB_FILE_PATH, { idempotent: true }); } catch {}
          setMeta(META_KEY_STATUS, 'not_downloaded');
          setMeta(META_KEY_ERROR, null);
          return 'not_downloaded';
        }
        logger.log('[BibleDB] Found existing DB file, marking as ready');
        ... // existing setMeta lines unchanged
```

   `verifyDownloadedDb` is a function declaration below (line 265) — hoisting makes it callable here; no reordering needed.

2. NET-14: add `export function computeDownloadProgress(written: number, totalExpected: number): number { return totalExpected > 0 ? Math.min(written / totalExpected, 1) : -1; }` and use it in the `createDownloadResumable` callback. In `DownloadBibleSheet.tsx`, where `progress` renders (lines 65-76): when `progress != null && progress < 0`, render the bar at width `'100%'` with reduced opacity (or the existing accent at 30%) and the text `Downloading…` instead of a percent. Keep `null` behavior (0%) unchanged.

## Verification

- `npx jest src/lib/__tests__/bible-db-verify.test.ts --silent` → `Tests: 3 passed` (or more if split).
- `npx jest src/lib/__tests__/bible-db-download-headers.test.ts --silent` → still green.
- `npm run typecheck` → exit 0.

## Out of scope / STOP

- Do not add a user-facing re-download button (the reset to `not_downloaded` re-arms the existing download prompt — that IS the recovery path).
- Do not touch the FTS/search query helpers.
- STOP if the auto-detect branch at 138-152 differs from the excerpt.

---

# FIX-6 (DAT-6, P1) — "Delete all data" leaves server data, device identity, AI caches, bug log, and a resurrectable inflight job

**Product decision #1 applies — plan implements: full local wipe superset + device-id rotation + honest copy.**

## Context

`src/app/(tabs)/(you)/index.tsx:298-313` — the user-facing handler only does:

```ts
                    await cancelAllReminders();
                    reset();
                    useCompanionChatStore.getState().clearAllConversations();
                    router.dismissAll();
                    setTimeout(() => router.replace('/'), 50);
```

while the QA reset (`src/app/debug-reset-beginning.tsx:20-45`) additionally removes `unfold-storage`, `unfold-companion-chat`, `@unfold_companion_daily`, `@unfold_exclusive_offer_seen`, `@unfold_onboarding_offer_seen`, **`inflight-generation-job`** and resets UI state. Twin paths violating `deterministic-twin-paths-must-share-one-helper`. Left behind by the user path: the inflight job (Today's mount effect at `(today)/index.tsx:261-286` resumes it and rebuilds a devotional after the user confirmed deletion twice), AI caches derived from personal context (`unfold-scripture-explain-cache`, `unfold-verse-cache`, `unfold-bridge-cache`, `unfold-examen-cache` — `clearBridgeCache()` and `clearExamenCache()` already exist; the other two need exported clears), trial-notification mirror (`unfold-trial-notification`), the plaintext AsyncStorage bug log (`unfold-bug-log-v1`, `clearBugLogEntries()` exists in `bug-logger.ts:161`), the device-id, and ALL server-side synced data (dialog says "permanently deleted" — false).

## Failing test FIRST

New `src/lib/__tests__/full-reset.test.ts`. Mock `../mmkv-storage` (Map-backed, plus `rotateDeviceId: jest.fn(() => 'new-id')`), `../notifications` (`cancelAllReminders`), `../companion-chat-store`, `../store`, `../bridge-service`, `../examen-service`, `../scripture-explain-api`, `../bible-api`, `../trial-notification`, `../bug-logger`. Import `performFullLocalReset, FULL_RESET_MMKV_KEYS` from `../full-reset` (new → red).

1. `'removes every enumerated MMKV key'`: seed the mock store with every key in `FULL_RESET_MMKV_KEYS` plus a survivor key `'unfold-bible-meta-not-in-list'`; after `await performFullLocalReset()`, all listed keys gone, survivor intact.
2. `'covers the QA reset key set'`: assert `FULL_RESET_MMKV_KEYS` contains at least `['unfold-storage','unfold-companion-chat','@unfold_companion_daily','@unfold_exclusive_offer_seen','@unfold_onboarding_offer_seen','inflight-generation-job','unfold-sync-outbox-v1']` (the last from FIX-7).
3. `'clears caches, bug log, trial mirror, and rotates identity'`: each mocked clear fn called once; `rotateDeviceId` called once.
4. `'cancels reminders before store reset'`: assert call order `cancelAllReminders` → `reset` (use `mock.invocationCallOrder`).

## Minimal fix

1. New `src/lib/full-reset.ts` exporting `FULL_RESET_MMKV_KEYS: readonly string[]` and:

```ts
export async function performFullLocalReset(): Promise<void> {
  await cancelAllReminders();                       // before wiping store — frozen payloads otherwise keep firing
  useUnfoldStore.getState().reset();
  useCompanionChatStore.getState().clearAllConversations();
  for (const key of FULL_RESET_MMKV_KEYS) mmkvStorage.removeItem(key);
  clearBridgeCache();
  clearExamenCache();
  clearScriptureExplainCache();                     // new export, see step 2
  clearVerseCache();                                // new export, see step 2
  clearTrialNotificationMirror();                   // new export wrapping the trial-notification MMKV clearAll
  await clearBugLogEntries();
  rotateDeviceId();                                 // server data orphaned-by-design (product decision #1)
}
```

2. Add the missing clear exports: in `scripture-explain-api.ts` and `bible-api.ts`, `export function clearScriptureExplainCache() { cache.clearAll(); }` style (match `clearBridgeCache` at `bridge-service.ts:374-376`); in `trial-notification.ts` an equivalent for its MMKV instance (also cancel its scheduled notification if a cancel helper exists there — read the file; `requestPermissionsAsync` at 238 hints it schedules).
3. `(you)/index.tsx` `handleResetData` destructive branch becomes `await performFullLocalReset(); router.dismissAll(); setTimeout(() => router.replace('/'), 50);` — delete the inline three calls. Soften the copy: second alert message → `'This will permanently delete your data from this device and disconnect this install from your synced data. This cannot be undone.'`.
4. `debug-reset-beginning.tsx`: replace its inline wipe (lines 21-31) with `await performFullLocalReset();` keeping its extra UI-state lines (`setQaPremiumOverride` etc.) — the QA path keeps its existing device-id? **No**: QA path also rotates now (acceptable for QA; deterministic). Keep the `useUIState` block as-is after the helper call.
5. RevenueCat note: after rotation the module-scope RC identity (configured at launch with the old `anon_<uuid>`) is stale until next cold start. Add `logger.warn('[reset] Device identity rotated; RevenueCat identity refreshes on next launch')` — do NOT attempt a live `Purchases.logIn` here (out of scope; entitlement recovery is via Apple restore anyway).

## Verification

- `npx jest src/lib/__tests__/full-reset.test.ts --silent` → `Tests: 4 passed`.
- `grep -rn "inflight-generation-job" src/app/(tabs)/(you)/index.tsx src/lib/full-reset.ts` → appears in `full-reset.ts` key list.
- `grep -c "removeItem" src/app/debug-reset-beginning.tsx` → `0` (twin path unified).
- `npm run typecheck`, full suite → green.

## Out of scope / STOP

- No backend delete call (endpoint does not exist — follow-up filed per product decision #1).
- Do not wipe `unfold-bible-meta` or the Bible DB file (generic content, not personal data).
- Do not wipe the TTS audio cache in this fix **unless** `src/lib/audio-cache.ts` exposes a one-call clear (read it; if `clearAudioCache()` or similar exists, add it to the helper + test 3).
- STOP if `handleResetData` at `(you)/index.tsx:279-321` differs from the excerpt.

---

# FIX-7 (NET-5 P1 + DAT-13 P2) — No sync outbox: offline read-completions are permanently lost; synced blobs carry no schema version

## Context

`src/app/(tabs)/(today)/reading.tsx:833-843` — completion push is fire-and-forget:

```ts
        void syncDevotionalDayRead({
          devotional: currentDevotional,
          day: currentDayData,
        }).catch((err) => {
          logger.warn('[reading] Failed to sync read state:', ...);
          void logBugError('reading', err, { ... });
        });
```

`src/lib/devotional-read-sync.ts:88-103` is a single plain `fetch` to `/api/sync/push` — no retry, no queue. Completing a day offline (plane/subway — content is local, so reading works) is permanently lost to the server: cron/recommendations run on stale read state and a reinstall pulls the day as unread. DAT-13 (same file): the pushed `data` payloads (`buildDevotionalReadSyncChanges`, lines 13-73) carry complex evolving shapes (`seriesArc`, `progressiveMemory`, `content: day`) with **no version field** — direct violation of vault rule `schema-version-lives-on-the-synced-blob`.

The repo has NetInfo (`@react-native-community/netinfo@12.0.1`); the reconnect-listener pattern to copy is `reading.tsx:438-457`.

## Failing test FIRST

New `src/lib/__tests__/sync-outbox.test.ts`. Mock `../mmkv-storage` (Map-backed) and `@/lib/api-config`; mock `global.fetch`. Import from `../sync-outbox` (new → red).

1. `'enqueue persists and dedupes by table+id keeping newest clientUpdatedAt'`: enqueue change A `{table:'devotionals', id:'d1', clientUpdatedAt:'2026-06-01T00:00:00Z'}` then A' same id at `'2026-06-02T00:00:00Z'` → `peekSyncOutbox()` has length 1 with the later timestamp.
2. `'drain posts all changes and clears on accepted'`: enqueue 2 changes; fetch resolves `{ok:true, json: async () => ({results:[{status:'accepted'},{status:'accepted'}]})}` → after `await drainSyncOutbox()`, outbox empty, fetch called once with body containing both changes.
3. `'network failure keeps the outbox'`: fetch rejects → outbox unchanged, `drainSyncOutbox()` resolves (never throws).
4. `'rejected results are dropped, not retried forever'`: results `[{status:'rejected'},{status:'accepted'}]` → outbox empty afterward (server is authoritative on rejects; conflicts count as server-resolved too).
5. `'concurrent drains are single-flight'`: call `drainSyncOutbox()` twice without awaiting; fetch called exactly once (`one-owner-per-os-resource`).
6. `'outbox is capped'`: enqueue 250 distinct changes → length ≤ 200, newest retained.

Extend `src/lib/__tests__/devotional-read-sync.test.ts` (existing, currently 2+ tests using `toMatchObject`): add assertions `expect(changes[0].data.schemaVersion).toBe(1)` and `expect(changes[1].data.schemaVersion).toBe(1)` — fails today.

## Minimal fix

1. New `src/lib/sync-outbox.ts`:

```ts
import { mmkvStorage } from '@/lib/mmkv-storage';
import { PRIMARY_BACKEND_URL, getAuthHeaders } from '@/lib/api-config';
import type { SyncPushChange } from '@/lib/devotional-read-sync';

const OUTBOX_KEY = 'unfold-sync-outbox-v1';
const OUTBOX_CAP = 200;

export function enqueueSyncChanges(changes: SyncPushChange[]): void { /* read, dedupe by `${table}:${id}` keep max clientUpdatedAt, cap to newest 200, write */ }
export function peekSyncOutbox(): SyncPushChange[] { /* parse or [] */ }
let inflight: Promise<void> | null = null;
export function drainSyncOutbox(): Promise<void> { /* single-flight: if (inflight) return inflight; POST {changes} to /api/sync/push with a 15s AbortController timeout (mirror generation-api.ts); on HTTP ok → drop everything the server answered for (accepted|conflict|rejected); on network error/timeout/non-ok → keep; always clear inflight in finally; never throw */ }
```

2. `devotional-read-sync.ts`: add `schemaVersion: 1` as the first key of **both** `data` objects in `buildDevotionalReadSyncChanges` (the non-canonical day object at lines 30-41 and the devotionals data at 57-70). For the canonical-progressive day path, `buildReadOnlyCanonicalDayData(...)` builds the object — spread it and add the field: `{ ...buildReadOnlyCanonicalDayData(devotional.id, day, readAt), schemaVersion: 1 }`.
3. Wire the enqueue: in `syncDevotionalDayRead`, on any failure path (non-ok response, rejected results, fetch throw), call `enqueueSyncChanges(changes)` before rethrowing — wrap the existing `fetch`+checks in try/catch:

```ts
  try {
    const response = await fetch(...);
    if (!response.ok) { ... throw ... }
    ... rejected check ...
  } catch (err) {
    enqueueSyncChanges(changes);
    throw err;
  }
```

   (`reading.tsx`'s existing `.catch` logging stays as-is — no change there.)
4. Drain triggers — new hook `src/hooks/useSyncOutboxDrain.ts`: on mount, drain once; subscribe `NetInfo.addEventListener` and drain when `Boolean(state.isConnected && state.isInternetReachable !== false)` flips to true (copy the online derivation from `reading.tsx:440` verbatim — twin logic, keep the formula identical). Mount it in `RootLayoutNav` (`src/app/_layout.tsx`, next to `useUserProfileSync()` at line 72). Also call `void drainSyncOutbox()` at the top of the Today focus pull effect (`(today)/index.tsx:310-338`, inside the `useFocusEffect` callback before the devotional pull).
5. Add `'unfold-sync-outbox-v1'` to FIX-6's `FULL_RESET_MMKV_KEYS`.

## Verification

- `npx jest src/lib/__tests__/sync-outbox.test.ts --silent` → `Tests: 6 passed`.
- `npx jest src/lib/__tests__/devotional-read-sync.test.ts --silent` → green incl. 2 new schemaVersion assertions.
- `npm run typecheck` → exit 0.
- **Staging gate (DAT-13):** one manual push against the staging/prod backend with `schemaVersion` in `data` must return `accepted` for both tables. If the server **rejects** the field, drop the `schemaVersion` edit only (keep the outbox), report, and flag DAT-13 as needs-backend-change. This is a STOP-and-report, not an improvise.

## Out of scope / STOP

- No pull-side changes here (FIX-8 owns pull).
- Do not give the direct `syncDevotionalDayRead` fetch a retry loop — the outbox IS the retry (one owner).
- Do not enqueue on success. Do not build a generic mutation queue beyond `SyncPushChange[]`.
- STOP if `syncDevotionalDayRead` body differs from the excerpt in Context.

---

# FIX-8 (DAT-2, P1) — Journal entries, notes, folders, Bible highlights, check-ins never sync

**Product decision #2 applies — plan implements: push-backup on mutation + empty-table pull-restore. HIGHEST-RISK FIX; do it last; staging verification is a hard gate.**

## Context

`src/lib/sync-types.ts:4-20` declares 16 sync tables including `journal_entries`, `notes`, `note_folders`, `bible_highlights`, `check_ins`; every journal/note/highlight mutator maintains `updatedAt` — but repo-wide grep shows `journal_entries` appears only in sync-types + an analytics constant. Push implementations exist only for `devotionals`/`devotional_days` (`devotional-read-sync.ts`) and `users` (`user-profile-sync.ts`); pull extraction (`devotional-sync-pull.ts`) reads only devotionals/devotional_days. Backend contract-matrix confirms the server's pull already returns **all 16 tables** for the user and push validates against the same SYNC_TABLES key set. Net effect today: reinstall restores devotional content but silently destroys all personal writing — the most trust-destroying data loss in the app.

## Failing test FIRST

New `src/lib/__tests__/personal-sync.test.ts` importing `diffRecordsForPush`, `buildPersonalSyncChanges` from `../personal-sync` (new → red):

1. `'detects new and updated records by id+updatedAt'`: prev `[ {id:'a', updatedAt:'T1'} ]`, next `[ {id:'a', updatedAt:'T2'}, {id:'b', updatedAt:'T1'} ]` → diff = both records (`a` changed, `b` new).
2. `'unchanged records are not pushed'`: identical prev/next → `[]`.
3. `'deletions produce deleted-flag changes'`: prev has `a`, next doesn't → change `{ id:'a', deleted: true }`.
4. `'records missing updatedAt are treated as dirty once'`: next record without `updatedAt` → included, with `clientUpdatedAt` set from the injected `now` parameter (vault rule `deterministic-paths-must-receive-now-as-parameter` — `buildPersonalSyncChanges` takes `now: string`).
5. `'change shape matches the sync contract'`: each change is `{ table, id, clientUpdatedAt, data, deleted }` with `data.schemaVersion === 1` and `data` containing the full client record.

New `src/lib/__tests__/personal-sync-pull.test.ts` importing `extractPersonalRestore` from `../personal-sync` :

6. `'restores only into empty local tables'`: pull response containing 2 `journal_entries` + local `journalEntries: [existing]` → journal NOT restored; local `notes: []` + pulled notes → notes restored.
7. `'soft-deleted pulled records are skipped'`: pulled record with `deleted: true` → excluded.

## Minimal fix

1. New `src/lib/personal-sync.ts`:
   - `const PERSONAL_TABLES = { journal_entries: 'journalEntries', notes: 'notes', note_folders: 'folders', bible_highlights: 'bibleHighlights', check_ins: 'checkIns' } as const;` (store slice mapping — verify each slice name against `initialState` in `store.ts` before coding; `checkIns` exists at the initialState block, confirm exact casing with grep).
   - `diffRecordsForPush(prev, next)` and `buildPersonalSyncChanges({ table, prev, next, now })` per the tests; `data` = the full record object spread + `schemaVersion: 1`.
   - A subscriber `startPersonalSyncSubscription()`: `useUnfoldStore.subscribe` with a 5s debounce; per tick, for each table diff the current slice vs a module-held last-pushed snapshot (initialized from store state at first tick **after** an initial successful push, so first run pushes everything once), `enqueueSyncChanges(changes)` (FIX-7 outbox — server-bound work always goes through the one queue), then `void drainSyncOutbox()`. Snapshot updates only after enqueue.
   - `extractPersonalRestore(pullChanges, localState)` → `Partial<{journalEntries, notes, folders, bibleHighlights, checkIns}>` applying the empty-table rule.
2. Call `startPersonalSyncSubscription()` from `RootLayoutNav` in `_layout.tsx` (one-time `useEffect`, next to the FIX-7 drain hook).
3. Pull-restore: in `src/lib/devotional-sync-pull.ts`, after the existing devotional extraction, feed the same parsed response through `extractPersonalRestore` with the current store state and `useUnfoldStore.setState` the returned slices. Read `devotional-sync-pull.ts` in full first; reuse its defensive-coercion style for record parsing; do not change its devotional logic.
4. Outbox `SyncPushChange` type: FIX-7 typed it from `devotional-read-sync.ts` whose local type allows only `'devotionals' | 'devotional_days'`. Switch the outbox import to the wider `SyncPushChange` in `src/lib/sync-types.ts:30-36` (it has `deleted: boolean`; devotional-read-sync's lacks it — when unifying, make `deleted` optional or pass `deleted: false` from devotional-read-sync; prefer changing devotional-read-sync's local type to the sync-types one and adding `deleted: false` to its two changes, so there is ONE change type in the codebase).

## Verification

- `npx jest src/lib/__tests__/personal-sync.test.ts src/lib/__tests__/personal-sync-pull.test.ts --silent` → `Tests: 7 passed`.
- Existing `devotional-sync-pull.test.ts`, `devotional-read-sync.test.ts`, `user-profile-sync.test.ts` → still green.
- `npm run typecheck` → exit 0.
- **HARD STAGING GATE:** before merging, push one real `journal_entries` and one `notes` change at the backend (device build or curl with `X-Device-ID`) and confirm `accepted`; then call `/api/sync/pull` and confirm the records come back under those table keys. If push returns `rejected` for these tables, **STOP — report "backend does not accept personal tables", do not work around** (the fallback is product option (b): device-only labeling, a separate decision).

## Out of scope / STOP

- No LWW conflict merge; no restore into non-empty tables; no `companion_conversations`/`companion_messages` sync (separate store, separate decision).
- No UI affordances (export buttons, sync indicators).
- STOP if `useUnfoldStore.subscribe` is unavailable in the installed zustand version's typing for this store (then report; do not hand-roll polling).

---

# FIX-9 (NET-2 P1 + NET-13 P2) — Free companion messages burned on failed/no-op sends; "Tap to retry" has no handler

**Product decision #5 applies — implemented invariant: a free message is consumed iff a response was received.**

## Context

`src/app/(tabs)/(ask)/index.tsx:179-202`:

```ts
  const handleSend = useCallback(
    (text: string) => {
      if (!gate()) return;

      if (!isPremium && !canSendCompanionMessage()) {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
        setShowPremiumSheet(true);
        return;
      }

      sendMessage(text);

      // Track daily usage for free users
      if (!isPremium) {
        incrementCompanionDailyCount();
        setDailyRemaining(getCompanionDailyUsage().remaining);
      }
      ...
```

`sendMessage` (`src/lib/use-companion-chat.ts:257-259`) early-returns on `!text.trim() || isStreaming` (a double-tap burns a message with zero network activity) and its catch path (473-492) marks the message `status: 'error'` — the free user's 1-of-5 quota is consumed regardless. Offline worst case: 5 failed sends = "Daily limit reached. Upgrade for unlimited." with zero responses. NET-13: the error bubble copy is `'Something went wrong. Tap to retry.'` (`use-companion-chat.ts:490`) but `CompanionMessageContent.tsx:91-109` renders it in a plain `View`/`Text` — no handler exists anywhere; the only retry path is retyping, which (today) burns another message.

## Failing test FIRST

Extend `src/lib/__tests__/use-companion-chat-fallback.test.tsx` (reuse its mock scaffolding — `expo/fetch` mocked through `mockFetch`, mmkv mocked, store mocked). Add a new `describe('sendMessage outcome')`:

1. `'resolves "noop" when called while streaming'`: drive the hook into a streaming state (start a send whose fetch never resolves), call `sendMessage('again')` → resolves `'noop'`; assert only ONE fetch happened.
2. `'resolves "error" when stream and fallback both fail'`: `mockFetch` rejects for both the SSE attempt and the fallback POST → `await sendMessage('hi')` resolves `'error'` and the companion message status is `'error'`.
3. `'resolves "sent" on a successful exchange'`: reuse the file's existing successful-SSE fixture → resolves `'sent'`.

These compile-fail/red today because `sendMessage` returns `Promise<void>`.

## Minimal fix

1. `use-companion-chat.ts` — give `sendMessage` an outcome type `export type SendOutcome = 'sent' | 'noop' | 'error';`
   - Line 259: `if (!text.trim() || isStreaming) return 'noop';`
   - Success paths: at the end of the try block (after the title-generation block) `return 'sent';`
   - Catch: AbortError branch → the user stopped; they received whatever streamed: `return current?.content ? 'sent' : 'error';` (reuse the `current` lookup already there). Non-abort error branch → `return 'error';` after the existing `updateMessage`.
   - Callback type: `(text: string) => Promise<SendOutcome>`.
2. `(ask)/index.tsx` `handleSend` becomes async; increment **after** the outcome:

```ts
      void (async () => {
        const outcome = await sendMessage(text);
        if (!isPremium && outcome === 'sent') {
          incrementCompanionDailyCount();
          setDailyRemaining(getCompanionDailyUsage().remaining);
        }
      })();
```

   Keep the pre-send `gate()` and `canSendCompanionMessage()` checks and the scroll `setTimeout` exactly where they are. Note in a comment: the limit check stays pre-send, the charge is post-response; the `isStreaming` no-op guard prevents concurrent overspend.
3. NET-13: in `CompanionMessageContent.tsx`, accept an optional `onRetry?: () => void` prop and wrap the error `View` (lines 91-109) in a `Pressable` with `accessibilityRole="button"` and `accessibilityLabel="Retry sending your message"` when `onRetry` is provided; otherwise render as today and keep copy. In `(ask)/index.tsx`'s renderItem, pass `onRetry` for `status === 'error'` companion messages: find the most recent `role === 'user'` message preceding it in `messages` and call `handleSend(thatText)` — with step 2, a retry only charges quota if it succeeds. (Read the renderItem to find where `CompanionMessageContent` is instantiated; pass the prop there.)

## Verification

- `npx jest src/lib/__tests__/use-companion-chat-fallback.test.tsx --silent` → green, +3 tests over its current count (run before editing to record the baseline count; expect baseline+3).
- `npm run typecheck` → exit 0 (this catches any other `sendMessage` consumer — `grep -rn "sendMessage(" src/app src/components` and fix signatures if more exist; known consumer is `(ask)/index.tsx` incl. `handleChipSelect → handleSend`).
- Manual: airplane mode → send → error bubble; tap bubble → resend; quota counter unchanged after failures.

## Out of scope / STOP

- Do not change `premium-gating.ts` (no decrement/refund API — the outcome approach makes it unnecessary).
- Do not touch the SSE parsing, fallback logic, or throttle machinery (build-206 regression area — verified PASS; leave it).
- STOP if `handleSend` or the early return at `use-companion-chat.ts:259` differ from the excerpts.

---

# FIX-10 (NET-3, P1) — Onboarding hard-paywall dead-end when offerings fail to load

**Product decision #3 applies — implemented: no free skip; visible error + refetch on the CTA.**

## Context

`src/components/onboarding/ThreeStepPaywall.tsx:1148-1150`:

```ts
  const handlePurchase = useCallback(async () => {
    const pkg = selectedPlan === 'yearly' ? yearlyPackage : monthlyPackage;
    if (!pkg) return;
```

Silent no-op: when offerings failed (offline/RC outage), prices render from hardcoded fallbacks (`onboarding.tsx:476` `?? '$59.99'`, `:2824-2826` `?? '$9.99'/9.99/59.99`) so the page looks fully live, the CTA does nothing, no error renders, and the offerings query (`onboarding.tsx:467-471`) never recovers: `getOfferings` never rejects (Result-wrapped via `guardRevenueCatUsage`, `revenuecatClient.ts:180-250`), so the failure is cached as fresh *success* data and react-query won't retry. The only skip is QA-gated (`ThreeStepPaywall.tsx:1282-1296`). The repo already has the correct pattern at `src/app/paywall.tsx:413-429`: on `!pkg`, refetch once, re-derive, then error out.

## Failing test FIRST

The purchase handler is embedded in a heavy component; per repo convention extract the decision and test it. New `src/lib/__tests__/paywall-purchase-readiness.test.ts` importing `resolvePurchaseReadiness` from `../paywall-purchase-readiness` (new → red):

1. `'package present → purchase'`: `resolvePurchaseReadiness({ pkg: {} as any })` → `{ action: 'purchase' }`.
2. `'package missing → refetch then purchase when refetch yields one'`: `{ pkg: null, refetchedPkg: {} as any }` → `{ action: 'purchase-after-refetch' }`.
3. `'package missing and refetch empty → visible error'`: `{ pkg: null, refetchedPkg: null }` → `{ action: 'error', message: 'Couldn’t load subscription plans. Check your connection and try again.' }` (exact copy — single source of truth in this module).

## Minimal fix

1. New tiny module `src/lib/paywall-purchase-readiness.ts` per the tests (pure; 3 branches).
2. `ThreeStepPaywall.tsx`:
   - `import { useQueryClient } from '@tanstack/react-query';` + `import { getOfferings } from '@/lib/revenuecatClient';` (check existing imports first).
   - Replace `if (!pkg) return;` with:

```ts
    let pkg = selectedPlan === 'yearly' ? yearlyPackage : monthlyPackage;
    if (!pkg) {
      setIsLoading(true);
      setPurchaseError(null);
      const fresh = await queryClient.fetchQuery({ queryKey: ['revenuecat', 'offerings'], queryFn: getOfferings, staleTime: 0 });
      const freshOfferings = fresh?.ok ? fresh.data : null;
      pkg = freshOfferings?.current?.availablePackages.find(
        (p) => p.identifier === (selectedPlan === 'yearly' ? '$rc_annual' : '$rc_monthly'),
      );
      if (!pkg) {
        setIsLoading(false);
        setPurchaseError(PURCHASE_PLANS_UNAVAILABLE_MESSAGE); // exported from paywall-purchase-readiness.ts
        return;
      }
    }
```

   (`const pkg` becomes `let pkg`. `queryClient.fetchQuery` with `staleTime: 0` forces a real refetch and updates the cache, so onboarding's `useQuery` re-renders with live prices once it succeeds — replacing the hardcoded fallbacks automatically.) The rest of `handlePurchase` (1151-1178) is untouched; `purchaseError` already renders via `BottomCTA`'s `purchaseError` prop (line 1279) — verify by reading `BottomCTA` that the error text is displayed; if it is not rendered there, STOP and report (do not invent new error UI).
   - Add `queryClient` to the `useCallback` dep array.
3. No change to the QA skip, no new skip, no change to `onboarding.tsx`'s query config.

## Verification

- `npx jest src/lib/__tests__/paywall-purchase-readiness.test.ts --silent` → `Tests: 3 passed`.
- `npm run typecheck`, `npm run lint` → exit 0.
- Manual: airplane mode through onboarding to the pricing page → tap CTA → spinner then visible error; disable airplane mode → tap CTA → purchase sheet appears (refetch path).

## Out of scope / STOP

- Do not convert `getOfferings` to a throwing queryFn (NET-6's full fix) — that changes every consumer's result shape; out of scope.
- Restore-offline behavior untouched (it already surfaces `outcome.message`).
- STOP if `handlePurchase` does not start with the exact 3 lines excerpted.

---

# FIX-11 (NET-4 P1 + NET-7 P2) — Sticky RevenueCat identity error never retried: session-long fail-closed `unknown` lockout; no reconnect refetch anywhere

**Product decision #4 applies — fail-closed retained; this fix adds recovery + feedback.**

## Context

The chain (every line verified):
- `revenuecatClient.ts:326-333`: `revenueCatIdentityReadyPromise = synchronizeRevenueCatAppUserID(appUserID).catch((error) => { revenueCatIdentityError = error; ... })` — runs once at module load; no retry path exists.
- `revenuecatClient.ts:208-213` (inside `guardRevenueCatUsage`): every guarded op awaits the promise then `if (revenueCatIdentityError) { throw revenueCatIdentityError; }` — **sticky for the whole session**, poisoning `getCustomerInfo`, `getOfferings`, AND `addCustomerInfoUpdateListener`.
- `useRevenueCatSync.ts:63-78`: initial `getCustomerInfo()` non-ok → log only; the comment says the listener will fix it — but the listener registration itself failed (99-103), so **nothing can ever flip `revenueCatResolved`** (`ui-state.ts:43-44`) until restart.
- `premium-access-policy.ts:24`: `if (!inputs.hydrated || !inputs.revenueCatResolved) return 'unknown';`
- `creation-gate-policy.ts:18`: `if (policy === 'unknown') return 'blocked';` → `useCreationGate.ts:23-24`: `if (action === 'blocked') return false;` — **silent**: companion send, Today create, journal Go-Deeper, note editing all no-op with zero feedback.

NET-7 (systemic enabler): zero references to `onlineManager`/`focusManager` in `src/` — on React Native, TanStack Query v5 cannot see reconnect/foreground without explicit wiring, so no query in the app ever refetches on reconnect.

## Failing test FIRST

Extend `src/lib/__tests__/revenuecatClient-entitlement-refresh.test.ts`'s mock setup as a reference for mocking `react-native-purchases` — but put the new tests in a new file `src/lib/__tests__/revenuecat-identity-retry.test.ts` (module-state tests need `jest.isolateModules`):

1. `'identity failure is sticky until retried'`: mock `Purchases.logIn` to reject once; load the module; `await getCustomerInfo()` → `{ ok: false, reason: 'sdk_error' }` (passes today — baseline pin).
2. `'retryRevenueCatIdentitySync clears the sticky error'`: same setup; flip the `logIn` mock to resolve `{ created: false, customerInfo: {...} }`; `await retryRevenueCatIdentitySync()` → `true`; then `await getCustomerInfo()` → `{ ok: true, ... }` (mock `Purchases.getCustomerInfo` to resolve). **Red today: the export does not exist.**
3. `'retry is single-flight'`: make the retried `logIn` hang on a deferred promise; call retry twice; resolve; `Purchases.logIn` called exactly once for the retry round.

Read the existing entitlement-refresh test FIRST and copy its `react-native-purchases` mock shape exactly (it already runs in CI, so its mock surface is known-compatible).

## Minimal fix

1. `revenuecatClient.ts`:
   - Hoist the app-user-id: add `let configuredAppUserID: string | null = null;` next to lines 72-73 and set it in the init block (line 313 area) where `appUserID` is built.
   - New export:

```ts
let identityRetryInflight: Promise<boolean> | null = null;
export const retryRevenueCatIdentitySync = (): Promise<boolean> => {
  if (!revenueCatConfigured || !configuredAppUserID) return Promise.resolve(false);
  if (!revenueCatIdentityError) return Promise.resolve(true); // nothing to repair
  if (identityRetryInflight) return identityRetryInflight;
  identityRetryInflight = synchronizeRevenueCatAppUserID(configuredAppUserID)
    .then(() => { revenueCatIdentityError = null; revenueCatIdentityReadyPromise = Promise.resolve(); return true; })
    .catch((error) => { revenueCatIdentityError = error; return false; })
    .finally(() => { identityRetryInflight = null; });
  return identityRetryInflight;
};
```

2. `useRevenueCatSync.ts`: add a foreground-recovery listener inside the same `useEffect` (before the `return` cleanup):

```ts
    const appStateSub = AppState.addEventListener('change', (next) => {
      if (next !== 'active') return;
      if (useUIState.getState().revenueCatResolved) return; // recovered already
      void (async () => {
        await retryRevenueCatIdentitySync();
        const result = await getCustomerInfo();
        if (result.ok) applyCustomerInfo(result.data);
        if (!removeCustomerInfoListener) {
          const reg = await addCustomerInfoUpdateListener(applyCustomerInfo);
          if (reg.ok && !didCancel) removeCustomerInfoListener = reg.data;
        }
      })();
    });
```

   …and `appStateSub.remove()` in the cleanup. Import `AppState` from `react-native` and `retryRevenueCatIdentitySync` from the client. This is naturally rate-limited to foreground transitions; no timer loops.
3. NET-7 — in `_layout.tsx`, after the `queryClient` construction (line 48):

```ts
import NetInfo from '@react-native-community/netinfo';
import { AppState, Platform } from 'react-native';
import { onlineManager, focusManager } from '@tanstack/react-query';

onlineManager.setEventListener((setOnline) =>
  NetInfo.addEventListener((state) =>
    setOnline(Boolean(state.isConnected && state.isInternetReachable !== false))));
AppState.addEventListener('change', (status) => {
  if (Platform.OS !== 'web') focusManager.setFocused(status === 'active');
});
```

   (Standard TanStack RN wiring; keep `refetchOnWindowFocus: false` as-is — this primarily enables refetch-on-reconnect for stale queries and correct online gating.)
4. Silent-gate feedback — `useCreationGate.ts:23-24`: replace `if (action === 'blocked') return false;` with:

```ts
    if (action === 'blocked') {
      Alert.alert(
        'One moment',
        'We’re still confirming your subscription. Check your connection and try again in a few seconds.',
      );
      return false;
    }
```

   Import `Alert` from `react-native`. (Copy is provisional — flag to Nick with the product decisions; behavior > silence either way.)

## Verification

- `npx jest src/lib/__tests__/revenuecat-identity-retry.test.ts --silent` → `Tests: 3 passed`.
- `npx jest src/lib/__tests__/revenuecatClient-entitlement-refresh.test.ts src/lib/__tests__/premium-access-policy.test.ts src/lib/__tests__/creation-gate-policy.test.ts --silent` → all still green (policy files unchanged).
- `npm run typecheck` → exit 0.
- Manual: launch in airplane mode (fresh install sim) → gates show the Alert instead of dead taps; enable network → background+foreground the app → premium resolves without restart.

## Out of scope / STOP

- Do not change `resolvePremiumAccessPolicy` or `getChurnedCreationGateAction` (fail-closed policy is intentional).
- Do not add NetInfo-driven retry loops in the RC client itself (foreground listener is the single owner of recovery).
- STOP if `guardRevenueCatUsage` lines 206-213 or the init block at 313-333 differ from the excerpts.

---

# FIX-12 (NET-15, P1) — Push permission dialog fires at first app launch, pre-onboarding; failed registration never retried

## Context

`src/app/_layout.tsx:75-77` calls `registerPushToken()` on root mount; `src/lib/push-notifications.ts:95-102`:

```ts
    const { status: existingStatus } =
      await Notifications.getPermissionsAsync();
    let finalStatus = existingStatus;

    if (existingStatus !== 'granted') {
      const { status } = await Notifications.requestPermissionsAsync();
      finalStatus = status;
    }
```

On a fresh **physical-device** install (`undetermined`), the iOS system permission dialog fires at app launch, before onboarding — preempting the designed in-context ask (`generating.tsx:316-327` → `requestNotificationPermissions`). Simulators hide this (`Device.isDevice` early-return at 89-92), so it never showed in sim QA. The docstring's claim ("skips gracefully … when the user is not authenticated") has no implementing guard. Secondarily, a failed backend POST (157-162) is never retried in-session, and the POST fires on every cold start with no dedupe.

## Failing test FIRST

`src/lib/push-notification-helpers.ts` + its test file already exist — follow that exact pattern. Add to `src/lib/__tests__/push-notification-helpers.test.ts`:

1. `'never requests permission from background registration'`: `shouldProceedWithPushRegistration({ existingStatus: 'undetermined' })` → `{ proceed: false, request: false }`; `'denied'` → same; `'granted'` → `{ proceed: true, request: false }`. (Red: helper doesn't exist.)
2. `'session dedupe'`: `shouldPostPushRegistration({ alreadyRegisteredThisSession: true })` → `false`; `{ alreadyRegisteredThisSession: false }` → `true`.

## Minimal fix

1. Add the two pure helpers to `src/lib/push-notification-helpers.ts` (trivial bodies encoding the table above — the value is the greppable contract + tests).
2. `push-notifications.ts` `registerPushToken()`:
   - Replace the request block with:

```ts
    const { status: existingStatus } = await Notifications.getPermissionsAsync();
    // NEVER request permission here — the in-context ask (generating.tsx /
    // settings) owns requestPermissionsAsync. Background registration only
    // proceeds when permission already exists.
    if (existingStatus !== 'granted') {
      logger.log('[push] Permission not granted; skipping background registration');
      return;
    }
```

   - Add module-level `let registeredThisSession = false;` — early-return at the top when true; set true only after the backend `response.ok` path (line 164 area). Export `export function resetPushRegistrationSession(): void { registeredThisSession = false; }` for tests.
3. Re-register at the moments permission can newly exist or the POST may have failed:
   - `generating.tsx` `handleRequestNotifications` (line 316-327): after `granted === true`, add `void registerPushToken();` (import it).
   - `_layout.tsx`: extend the existing mount effect (75-77) to also re-attempt on foreground:

```ts
  useEffect(() => {
    registerPushToken();
    const sub = AppState.addEventListener('change', (s) => {
      if (s === 'active') void registerPushToken();
    });
    return () => sub.remove();
  }, []);
```

   (The session-dedupe flag makes the foreground calls free after one success; failed/permission-missing attempts retry naturally.) `AppState` import may already exist after FIX-11 — check.
4. Fix the stale docstring at `push-notifications.ts:80-86` to describe the new contract.

## Verification

- `npx jest src/lib/__tests__/push-notification-helpers.test.ts --silent` → green, +2 tests over baseline (record baseline count first).
- `grep -n "requestPermissionsAsync" src/lib/push-notifications.ts` → **no matches**.
- `npm run typecheck` → exit 0.
- **Physical-device gate (sim-invisible by construction):** fresh install on a real iPhone → NO permission dialog at launch; dialog appears only at the generating-screen prompt; after grant, backend registration log line appears.

## Out of scope / STOP

- Do not touch `notifications.ts` permission flows (216/276 callers own their own asks) or `trial-notification.ts:238`.
- Do not add backoff timers for the POST — foreground retry is enough.
- STOP if `registerPushToken` differs from the excerpt at lines 95-107.

---

# FIX-13 (DAT-9, P2 — explicitly requested) — Single-slot undo: a second delete inside the toast window silently destroys the first deletion's only copy

## Context

`src/app/(tabs)/(journal)/index.tsx:525` holds `const [undoAction, setUndoAction] = useState<UndoAction | null>(null);`. Note delete (935-947) and folder delete (901-927) both `setUndoAction(...)` unconditionally — deleting note B 2s after note A (3s window; folders 4s) replaces A's restore payload; the data is already gone from the store, so the slot was the only copy. Restore logic is at 949-978 (note → prepend to `notes`; folder → `prepareJournalFolderDelete`'s `JournalFolderUndoAction` from `src/lib/journal-folder-delete.ts:3-9`).

## Failing test FIRST

New `src/lib/__tests__/journal-undo-queue.test.ts` importing `applyUndoActions` from `../journal-undo` (new → red). Use the real `UndoAction` shapes (note: `{ type: 'note', note: Note }`; folder: `JournalFolderUndoAction`).

1. `'restores multiple queued note deletions'`: state `{ notes: [], folders: [] }`, actions = [delete-A-undo, delete-B-undo] → resulting `notes` contains both A and B (order: most-recently-deleted first is fine; assert set membership + length 2).
2. `'restores a note and a folder tree together'`: queue a note action + a folder action with `folders: [f1]`, `affectedNoteIds: ['n1']`, `noteFolderIds: { n1: 'f1' }` and state notes containing `n1` with `folderId: undefined` → result has the note restored AND `n1.folderId === 'f1'` AND `f1` in folders.
3. `'restores in reverse order so later deletions rebuild first'`: construct two folder actions where the second deleted a child of the first; assert no duplicate folder ids in the result (the existing dedupe filter logic — `folders.filter(f => !restored.some(...))` — must be preserved per-action).

## Minimal fix

1. New `src/lib/journal-undo.ts` exporting the union type and the pure reducer:

```ts
import type { Note, NoteFolder } from '@/lib/store';
import type { JournalFolderUndoAction } from '@/lib/journal-folder-delete';

export type JournalUndoAction = { type: 'note'; note: Note } | JournalFolderUndoAction;

export function applyUndoActions(
  state: { notes: Note[]; folders: NoteFolder[] },
  actions: JournalUndoAction[],
): { notes: Note[]; folders: NoteFolder[] } {
  // iterate actions newest-first (reverse), applying exactly the logic
  // currently inlined at (journal)/index.tsx:954-973 per action
}
```

2. `(journal)/index.tsx`:
   - `const [undoActions, setUndoActions] = useState<JournalUndoAction[]>([]);` (replace line 525; the screen's local `UndoAction` type — find and remove/alias it to the lib type).
   - Both delete handlers: `setUndoActions((prev) => [...prev, action]);` and reset the shared timer as today (timer expiry → `setUndoActions([])`). Keep the per-type 3s/4s durations: when queuing, restart the timer with the NEW action's duration.
   - `handleUndoAction`: `useUnfoldStore.setState((state) => applyUndoActions({ notes: state.notes, folders: state.folders }, undoActions)); setUndoActions([]);` + existing haptic.
   - `handleUndoDismiss` → `setUndoActions([])`.
   - `UndoToast` call site (line 1674): visible when `undoActions.length > 0`; message: 1 action → existing copy; >1 → `` `${undoActions.length} items deleted` `` (read `UndoToast`'s props for the message prop name).

## Verification

- `npx jest src/lib/__tests__/journal-undo-queue.test.ts --silent` → `Tests: 3 passed`.
- `npx jest src/lib/__tests__/journal-folder-delete.test.ts --silent` → still green (untouched).
- `npm run typecheck` → exit 0.
- Manual: swipe-delete two notes quickly → toast shows "2 items deleted" → Undo restores both.

## Out of scope / STOP

- No per-item undo UI, no animation changes (vault: `no-bounce-animations`), no changes to `prepareJournalFolderDelete`.
- STOP if the undo block at `(journal)/index.tsx:949-978` differs from the read excerpt.

---

# Final gates (run after ALL fixes)

```bash
npm run typecheck        # exit 0
npm run lint             # exit 0
npm test -- --silent     # 0 failures; new tests: 5+6+4+6+3+4+6(+2 read-sync asserts)+7+3+3+3+2+3 ≈ 55 added
```

Then the runtime gates that static tests cannot cover, in priority order:
1. FIX-2 device persistence check (sim relaunch, no `[MMKV]` recovery lines).
2. FIX-12 fresh physical-device install — no launch-time permission dialog.
3. FIX-8/FIX-7 staging push/pull round-trip for `journal_entries`/`notes` + `schemaVersion` acceptance.
4. FIX-11 airplane-mode launch → foreground recovery → premium resolves.

Do NOT submit, merge to main, or trigger any build/TestFlight action — Nick gates all of those.
