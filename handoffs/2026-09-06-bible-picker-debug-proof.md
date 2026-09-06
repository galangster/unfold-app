# Bible picker debug proof

Date: 2026-09-06

## Scope

- Source started at `a1fb2a44bb7aa44e21913d79b50e17d970d97f15`.
- This proof used the existing Debug Unfold app.
- Metro served this worktree on port 8083.
- This proof does not validate submitted App Store build 262.

## Results

- Normal text showed three equal book columns.
- Extra extra extra large text showed two equal book columns.
- Full book names remained visible and wrapped when needed.
- The selected book kept its gold fill and border.
- `Malachi` stayed 182 points wide in its final Old Testament row.
- `Revelation` stayed 182 points wide in its final New Testament row.
- The flow reached Genesis chapter 1, verse 1, and the reader.
- The reader displayed `Genesis 1` after selection.
- Navigator tabs show complete labels at normal text size.
- Navigator tabs show complete labels at extra extra extra large text size.
- Tab items keep a 44-point minimum touch target.
- Simulator Dynamic Type now reads `large`.

## Proof files

- `proofs/2026-09-06-bible-picker/normal.png`
- `proofs/2026-09-06-bible-picker/large-text.png`
- `proofs/2026-09-06-bible-picker/reader-genesis-1.jpg`
- `proofs/2026-09-06-bible-picker/final-row-geometry.json`
- `proofs/2026-09-06-bible-picker/tabs-normal-fixed.jpg`
- `proofs/2026-09-06-bible-picker/tabs-large-text-fixed.jpg`

The proof contains Bible navigation only. It contains no journal or user content.

## Checks

- Focused Jest checks passed: 3 suites and 17 tests.
- TypeScript passed with `bun run typecheck`.
- Affected ESLint checks passed.
- `git diff --check` passed.

## Preview restart

Run this command from the worktree:

```sh
REACT_NATIVE_PACKAGER_HOSTNAME=127.0.0.1 EXPO_NO_TELEMETRY=1 bunx expo start --dev-client --port 8083 --host lan
```

Open this URL in the existing Debug Unfold app:

```text
exp+unfold-app://expo-development-client/?url=http%3A%2F%2F127.0.0.1%3A8083
```
