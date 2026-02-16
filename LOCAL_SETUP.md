# 🌿 Unfold App

**THE** Unfold devotional app — single source of truth.

## 📍 Location

```
~/clawd/work/vibecodeapp-fix/app/mobile/
```

**This is the ONLY copy.** Everything else has been deleted.

## 🔄 Daily Workflow

```bash
# 1. Pull latest changes
git pull origin main

# 2. Open in Xcode
open ios/Unfold.xcworkspace

# 3. Make your changes in Xcode...

# 4. Commit and push when done
git add .
git commit -m "What you changed"
git push origin main
```

## 🌿 Branching (for experiments)

```bash
# Create experiment branch
git checkout -b experiment/feature-name

# Work on it...

# If it works — merge it:
git checkout main
git merge experiment/feature-name
git push origin main

# If it breaks — delete it:
git checkout main
git branch -D experiment/feature-name
```

## ⚠️ Golden Rules

1. **If it's not in GitHub, it doesn't exist**
2. **Commit early, commit often** (small logical chunks)
3. **Never create duplicate folders** — use branches instead
4. **Push before you stop working**

## 🔗 GitHub Repo

https://github.com/galangster/unfold-app

---
*Last cleaned: 2026-02-16*
