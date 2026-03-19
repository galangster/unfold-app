#!/bin/bash
# generate-changelog.sh — Tester-friendly changelog for TestFlight builds
#
# Usage:
#   ./scripts/generate-changelog.sh                  # auto-detect last build tag
#   ./scripts/generate-changelog.sh build-28          # diff from specific tag
#   ./scripts/generate-changelog.sh build-28 build-30 # diff between two tags
#
# Creates: changelogs/build-{N}.md
# Also prints to stdout for pasting into TestFlight "What to Test" field.

set -euo pipefail
cd "$(git rev-parse --show-toplevel)"

# ── Resolve build number ──
BUILD_NUMBER=$(grep -o '"buildNumber": "[^"]*"' app.json | head -1 | grep -o '[0-9]*')
if [ -z "$BUILD_NUMBER" ]; then
  echo "Error: Could not read buildNumber from app.json" >&2
  exit 1
fi

# ── Resolve commit range ──
if [ $# -ge 2 ]; then
  FROM_REF="$1"
  TO_REF="$2"
elif [ $# -eq 1 ]; then
  FROM_REF="$1"
  TO_REF="HEAD"
else
  # Find the most recent build-* tag
  LAST_TAG=$(git tag -l 'build-*' --sort=-version:refname | head -1 || true)
  if [ -n "$LAST_TAG" ]; then
    FROM_REF="$LAST_TAG"
  else
    # No tags yet — use the last 15 commits
    FROM_REF="HEAD~15"
  fi
  TO_REF="HEAD"
fi

# ── Gather commits ──
RAW_LOG=$(git log --pretty=format:"%s" "$FROM_REF".."$TO_REF" 2>/dev/null || \
          git log --pretty=format:"%s" -15)

# ── Categorize changes ──
FEATURES=""
FIXES=""
IMPROVEMENTS=""
OTHER=""

while IFS= read -r line; do
  [ -z "$line" ] && continue

  # Strip conventional commit prefix for display
  CLEAN=$(echo "$line" | sed -E 's/^(feat|fix|refactor|chore|style|perf|docs|test)(\([^)]*\))?:\s*//')

  case "$line" in
    feat:*|feat\(*) FEATURES="${FEATURES}\n- ${CLEAN}" ;;
    fix:*|fix\(*)   FIXES="${FIXES}\n- ${CLEAN}" ;;
    refactor:*|perf:*|style:*) IMPROVEMENTS="${IMPROVEMENTS}\n- ${CLEAN}" ;;
    *)              OTHER="${OTHER}\n- ${CLEAN}" ;;
  esac
done <<< "$RAW_LOG"

# ── Build date ──
BUILD_DATE=$(date +"%B %d, %Y")
SHORT_HASH=$(git rev-parse --short HEAD)

# ── Generate changelog ──
mkdir -p changelogs

CHANGELOG="changelogs/build-${BUILD_NUMBER}.md"

cat > "$CHANGELOG" << HEREDOC
# Build ${BUILD_NUMBER} — ${BUILD_DATE}

**Commit:** ${SHORT_HASH} | **Branch:** $(git branch --show-current)

---
HEREDOC

if [ -n "$FEATURES" ]; then
  cat >> "$CHANGELOG" << HEREDOC

## New
$(echo -e "$FEATURES")
HEREDOC
fi

if [ -n "$FIXES" ]; then
  cat >> "$CHANGELOG" << HEREDOC

## Fixed
$(echo -e "$FIXES")
HEREDOC
fi

if [ -n "$IMPROVEMENTS" ]; then
  cat >> "$CHANGELOG" << HEREDOC

## Improved
$(echo -e "$IMPROVEMENTS")
HEREDOC
fi

if [ -n "$OTHER" ]; then
  cat >> "$CHANGELOG" << HEREDOC

## Other
$(echo -e "$OTHER")
HEREDOC
fi

cat >> "$CHANGELOG" << HEREDOC

---

## What to Test
- [ ] Open Journal > Notebook > tap existing note — opens in read mode
- [ ] Tap Edit — toggles to edit mode on same screen (no flash)
- [ ] Tap Done — saves and returns to read mode
- [ ] Tap + to create new note — opens in edit mode
- [ ] Switch between Reflections/Notebook tabs — smooth slide, no bounce
- [ ] Navigate between screens — no white flash at edges

HEREDOC

# ── Also print a compact version for TestFlight "What to Test" ──
echo ""
echo "═══════════════════════════════════════════════"
echo "  CHANGELOG — Build ${BUILD_NUMBER} (${BUILD_DATE})"
echo "═══════════════════════════════════════════════"
echo ""

if [ -n "$FEATURES" ]; then
  echo "NEW:"
  echo -e "$FEATURES"
  echo ""
fi
if [ -n "$FIXES" ]; then
  echo "FIXED:"
  echo -e "$FIXES"
  echo ""
fi
if [ -n "$IMPROVEMENTS" ]; then
  echo "IMPROVED:"
  echo -e "$IMPROVEMENTS"
  echo ""
fi

echo "───────────────────────────────────────────────"
echo "Saved to: ${CHANGELOG}"
echo ""
echo "Next steps:"
echo "  1. git tag build-${BUILD_NUMBER}"
echo "  2. eas build --local --platform ios"
echo "  3. Upload .ipa via Transporter"
echo "  4. Paste changelog into TestFlight 'What to Test'"
echo "───────────────────────────────────────────────"
