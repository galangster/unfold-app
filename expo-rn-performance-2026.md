# Expo & React Native Performance Optimization Reference (2025-2026)

Comprehensive reference covering the latest performance techniques, tools, and patterns for Expo SDK 55 / React Native 0.83+ / React 19 apps.

---

## 1. React Native New Architecture Performance Wins

The New Architecture became the default in RN 0.76 (Sept 2025) and the old architecture was permanently removed in 0.82. It replaces the classic Batched Bridge with a JSI-based runtime -- no more JSON serialization overhead.

### Fabric Renderer
- **Synchronous layout reads**: Fabric allows synchronous access to native view measurements from JS, eliminating the async round-trip that caused layout thrashing.
- **Concurrent rendering**: Full support for React 18 Suspense, useTransition, and automatic batching. Updates wrapped in `startTransition` keep the UI responsive during heavy state changes.
- **Shared C++ core**: Rendering logic is unified across iOS and Android, reducing platform-specific bugs and enabling more predictable performance.

### TurboModules
- **Lazy loading**: Native modules are loaded on-demand instead of all at startup. Apps report 30-40% reductions in cold start time.
- **Synchronous calls via JSI**: No serialization/deserialization. Direct C++ function calls from JS.
- **Type-safe codegen**: TypeScript/Flow specs generate native interfaces at build time, catching errors early and reducing runtime overhead.

### Concrete Patterns to Adopt

```tsx
// 1. Use useTransition for non-urgent updates
import { useTransition } from 'react';

function SearchScreen() {
  const [isPending, startTransition] = useTransition();
  const [query, setQuery] = useState('');
  const [results, setResults] = useState([]);

  const handleSearch = (text: string) => {
    setQuery(text); // Urgent: update input immediately
    startTransition(() => {
      setResults(filterLargeDataset(text)); // Deferred: won't block input
    });
  };

  return (
    <>
      <TextInput value={query} onChangeText={handleSearch} />
      {isPending ? <ActivityIndicator /> : <ResultsList data={results} />}
    </>
  );
}

// 2. Automatic batching -- no code needed, just know it works
// In the New Architecture, these two setState calls result in ONE render:
function handlePress() {
  setCount(c => c + 1);
  setFlag(f => !f);
  // Only one re-render, automatically batched
}

// 3. Suspense for data loading
function DevotionalScreen() {
  return (
    <Suspense fallback={<SkeletonLoader />}>
      <DevotionalContent />
    </Suspense>
  );
}
```

### Migration Checklist
- Verify all third-party native modules support the New Architecture (check `reactNativeConfig` in their package.json)
- Remove any `UIManager.getViewManagerConfig` calls (replaced by Fabric)
- Test on low-end Android devices -- the biggest perf wins are there

---

## 2. React Compiler (React 19)

React Compiler v1.0 shipped October 2025. It's a build-time tool that automatically inserts memoization (useMemo, useCallback, React.memo) during compilation.

### Setup for Expo

```js
// babel.config.js (Expo SDK 54+)
module.exports = function (api) {
  api.cache(true);
  return {
    presets: [
      ['babel-preset-expo', {
        'react-compiler': {
          compilationMode: 'all', // or 'annotation' for gradual adoption
          panicThreshold: 'all_errors',
        },
      }],
    ],
  };
};
```

For Expo SDK 54+, `babel-preset-expo` has built-in support. Just configure the options.

### What It Eliminates
- Manual `useMemo` for derived values
- Manual `useCallback` for event handlers
- Manual `React.memo` for pure components
- Dependency array management and its associated bugs

### Edge Cases Where Manual Optimization Is Still Needed

| Scenario | Why Compiler Fails | Manual Fix |
|---|---|---|
| Third-party libs requiring referential equality | Compiler can't see into opaque library boundaries | Keep `useCallback`/`useMemo` at interop boundaries |
| Cross-component-boundary analysis | Compiler analyzes one component at a time | Use `React.memo` on the child component |
| Effect dependency pinning | When `useEffect` must only re-run on a strictly stable value | Keep `useCallback` for the specific callback |
| Extremely expensive calculations (>16ms) | Compiler memoizes but can't predict computation cost | Keep `useMemo` with a comment explaining why |
| Dynamic code patterns (eval, computed property access) | Compiler bails out on non-static analysis | Restructure to static patterns |

### Validation

```bash
# Install the ESLint plugin to catch compiler-incompatible patterns
npx expo lint
npm install eslint-plugin-react-compiler --save-dev
```

### Recommendation for 2026
- **New projects**: Enable compiler from day one. Don't write manual `useMemo`/`useCallback`.
- **Existing projects**: Enable in `annotation` mode first. Add `'use memo'` directive to opt-in per file. Gradually remove manual memoization after confirming the compiler handles it.
- **Rule of thumb**: If removing a `useMemo`/`useCallback` doesn't cause a measurable perf regression in the React Profiler, remove it and let the compiler handle it.

---

## 3. Hermes Engine 2025-2026 Optimizations

### Hermes V1 Timeline
- **RN 0.82** (Oct 2025): Hermes V1 introduced as experimental opt-in
- **RN 0.83**: Performance improvements to V1
- **RN 0.84** (Feb 2026): Hermes V1 becomes the default engine

### Key Improvements in V1

**Modern JS Support (no more polyfills):**
- Native `let`/`const` (no Babel downleveling needed)
- Native ES6 classes
- Native `async`/`await`
- Native `Map`, `Set`, `WeakMap`, `WeakSet`
- Removes property count limits on objects

This means smaller bundles because polyfills for these features are no longer needed.

**Experimental JIT Engine:**
- Available for computation-heavy workloads
- Configurable per device class -- can be turned off on low-end devices where startup time and battery matter more
- Best for: heavy data processing, complex animations calculated in JS, crypto operations

**Bytecode Improvements:**
- AOT compilation converts JS to optimized bytecode at build time
- Eliminates parsing and compilation at startup
- Results in faster TTI (Time to Interactive) and smaller bundle sizes
- Bytecode is platform-specific and optimized for the target architecture

### Static Hermes (Future)
- Still in development as of March 2026
- Hermes V1 lays the groundwork for Static Hermes
- Will enable ahead-of-time native code generation (like a traditional compiled language)
- Expected to bring near-native execution speed for JS code

### Practical Impact
```bash
# Verify Hermes is enabled (should be by default in Expo SDK 55)
# In your app at runtime:
const isHermes = () => !!global.HermesInternal;

# Check bytecode compilation in build output
# Look for .hbc files instead of .jsbundle
```

---

## 4. FlashList vs FlatList in 2025-2026

### FlashList v2: The New Standard

Shopify released **FlashList v2** as a ground-up rewrite for the New Architecture. Key changes:

| Feature | FlashList v1 | FlashList v2 |
|---|---|---|
| Item size estimates | Required (`estimatedItemSize`) | Not needed -- auto-measured |
| Architecture | RecyclerListView wrapper | New Architecture native |
| Cell recycling | Yes | Yes, improved |
| Blank area prevention | Good | Better -- pre-measures before render |
| `overrideItemLayout` | For size + span | Span only (size auto-calculated) |

### Performance Numbers
- **5-10x faster** than FlatList in most benchmarks
- **JS thread CPU**: Drops from >90% to <10% in heavy list scenarios
- **60 FPS** even on low-end Android devices
- **Memory**: Much smaller buffer than FlatList, reducing memory footprint

### Migration from FlatList to FlashList v2

```tsx
// Before: FlatList
import { FlatList } from 'react-native';

<FlatList
  data={items}
  renderItem={({ item }) => <ItemCard item={item} />}
  keyExtractor={(item) => item.id}
  getItemLayout={(_, index) => ({
    length: ITEM_HEIGHT,
    offset: ITEM_HEIGHT * index,
    index,
  })}
/>

// After: FlashList v2
import { FlashList } from '@shopify/flash-list';

<FlashList
  data={items}
  renderItem={({ item }) => <ItemCard item={item} />}
  keyExtractor={(item) => item.id}
  estimatedItemSize={80} // v2: optional hint, not required
  getItemType={(item) => item.type} // Important for heterogeneous lists
/>
```

### FlashList v2 Performance Tips
1. **Memoize props**: More important in v2 than v1. Wrap `renderItem`, `data`, and other props in `useMemo`/`useCallback`.
2. **Always provide `keyExtractor`**: Critical for preventing glitches when scrolling upward.
3. **Use `getItemType`**: For lists with different view types, this helps the recycler reuse the right cell type.
4. **Nest FlashList in FlashList**: If you have horizontal lists inside a vertical list, make both FlashList for coordinated layout optimization.
5. **Test in release mode**: FlashList uses a small render buffer in dev mode, making it appear slower than it actually is.

### Alternatives Status
- **RecyclerListView**: FlashList is built on an improved version. Use FlashList directly.
- **@react-native/virtualized-lists**: Still the base for FlatList/SectionList. Fine for simple lists (<100 items).
- **LegendList**: New contender from LegendApp, focused on fine-grained reactivity. Worth watching but FlashList v2 is the proven choice.

---

## 5. getItemLayout Patterns

### When It's Essential
- **`scrollToIndex` / `scrollToItem`**: Without `getItemLayout`, FlatList must render all items up to the target index first. With it, the scroll position is calculated mathematically.
- **`initialScrollIndex`**: Requires `getItemLayout` to work correctly. Without it, the list renders from the top and then scrolls.
- **Very long lists (1000+ items)**: Prevents FlatList from needing to measure items dynamically during scroll.

### When It's Optional
- **FlashList v2**: Auto-measures items, making `getItemLayout` unnecessary.
- **Short lists (<50 items)**: The measurement overhead is negligible.
- **Variable-height items**: If items truly have unpredictable heights, `getItemLayout` would return wrong values and cause scroll jumpiness.

### Implementation Patterns

```tsx
// Pattern 1: Fixed height items
const ITEM_HEIGHT = 72;
const SEPARATOR_HEIGHT = 1;

const getItemLayout = (_: any, index: number) => ({
  length: ITEM_HEIGHT,
  offset: (ITEM_HEIGHT + SEPARATOR_HEIGHT) * index,
  index,
});

// Pattern 2: Items with headers (SectionList)
// This is trickier -- use a helper library
// npm install react-native-section-list-get-item-layout
import sectionListGetItemLayout from 'react-native-section-list-get-item-layout';

const getItemLayout = sectionListGetItemLayout({
  getItemHeight: () => 72,
  getSectionHeaderHeight: () => 40,
  getSeparatorHeight: () => 1,
  getSectionFooterHeight: () => 0,
});

// Pattern 3: Multiple item types with known heights
const HEIGHTS = { header: 120, regular: 72, compact: 48 };

const getItemLayout = (data: Item[] | null, index: number) => {
  if (!data) return { length: 0, offset: 0, index };
  let offset = 0;
  for (let i = 0; i < index; i++) {
    offset += HEIGHTS[data[i].type] || HEIGHTS.regular;
  }
  return { length: HEIGHTS[data[index]?.type] || HEIGHTS.regular, offset, index };
};
```

### Impact Summary
| Metric | Without getItemLayout | With getItemLayout |
|---|---|---|
| `scrollToIndex` | Must render all preceding items | Instant calculation |
| Initial render | Measures each item | Skips measurement |
| Memory | Higher (keeps measurements) | Lower (no measurement cache) |
| Accuracy | Perfect (measured) | Depends on correct values |

---

## 6. Zustand Store Splitting Best Practices

### The Slices Pattern

Split a monolithic store into domain-specific slices that are composed into a single store:

```tsx
// stores/slices/readingSlice.ts
import { StateCreator } from 'zustand';

export interface ReadingSlice {
  currentDay: number;
  isComplete: boolean;
  markComplete: () => void;
}

export const createReadingSlice: StateCreator<
  ReadingSlice & SettingsSlice, // Full store type for cross-slice access
  [],
  [],
  ReadingSlice
> = (set) => ({
  currentDay: 1,
  isComplete: false,
  markComplete: () => set({ isComplete: true }),
});

// stores/slices/settingsSlice.ts
export interface SettingsSlice {
  theme: string;
  fontSize: number;
  setTheme: (theme: string) => void;
}

export const createSettingsSlice: StateCreator<
  ReadingSlice & SettingsSlice,
  [],
  [],
  SettingsSlice
> = (set) => ({
  theme: 'serenity',
  fontSize: 16,
  setTheme: (theme) => set({ theme }),
});

// stores/useStore.ts -- compose slices
import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import AsyncStorage from '@react-native-async-storage/async-storage';

type StoreState = ReadingSlice & SettingsSlice;

export const useStore = create<StoreState>()(
  persist(
    (...a) => ({
      ...createReadingSlice(...a),
      ...createSettingsSlice(...a),
    }),
    {
      name: 'app-storage',
      storage: createJSONStorage(() => AsyncStorage),
      version: 7,
      partialPersist: true, // Only persist what you need
    }
  )
);
```

### Selector Patterns (Preventing Re-renders)

```tsx
// BAD: Subscribes to entire store, re-renders on ANY change
const { theme, fontSize } = useStore();

// GOOD: Subscribe to specific values with selectors
const theme = useStore((s) => s.theme);
const fontSize = useStore((s) => s.fontSize);

// GOOD: Multiple values with shallow equality
import { useShallow } from 'zustand/react/shallow';

const { theme, fontSize } = useStore(
  useShallow((s) => ({ theme: s.theme, fontSize: s.fontSize }))
);

// GOOD: Derived/computed values
const useCompletedDays = () => useStore((s) =>
  s.devotionals.filter(d => d.isComplete).length
);
```

### When to Use Multiple Stores vs Slices
- **Multiple stores**: When domains are truly independent (e.g., auth store vs analytics store). No cross-references needed.
- **Slices in one store**: When domains need to reference each other (e.g., reading progress needs user settings). Shared persistence config.

### Migration from Monolithic Store
1. Identify domain boundaries in your existing store
2. Extract each domain into a `createXxxSlice` function
3. Keep the same top-level `useStore` hook -- component code doesn't change
4. Selectors continue to work as before
5. Bump the persist `version` and add a `migrate` function for the schema change

### Zustand vs Jotai vs Legend State for 2026

| Criteria | Zustand | Jotai | Legend State |
|---|---|---|---|
| **Bundle size** | ~1 KB | ~2.5 KB | ~4 KB |
| **Mental model** | Single store, flux-like | Atomic, bottom-up | Observable, signals-like |
| **Re-render optimization** | Manual selectors | Automatic per-atom | Automatic fine-grained |
| **Persistence** | Built-in middleware | Plugin (jotai-persist) | Built-in, very powerful |
| **React Native** | Excellent | Good | Excellent |
| **Code splitting** | Manual slices | Natural (atoms are independent) | Natural (observables) |
| **Best for** | Most apps, teams familiar with Redux patterns | Complex interdependent state, many small pieces | Performance-critical apps needing minimal re-renders |
| **Recommendation** | Default choice for most Expo apps | Consider for apps with many independent pieces of derived state | Consider if re-render count is a measured bottleneck |

**For the Unfold app specifically**: Zustand with slices is the right call. The store is already Zustand-based, persistence is set up, and the team is familiar with the API. Splitting into slices (reading, settings, auth, onboarding) would improve maintainability without requiring a full migration.

---

## 7. expo-sqlite Performance

### WAL Mode Setup

```tsx
import * as SQLite from 'expo-sqlite';

const db = await SQLite.openDatabaseAsync('app.db');

// Enable WAL mode -- up to 40% write performance improvement
await db.execAsync('PRAGMA journal_mode = WAL;');

// Other essential PRAGMAs
await db.execAsync('PRAGMA synchronous = NORMAL;'); // Faster than FULL, safe with WAL
await db.execAsync('PRAGMA cache_size = -20000;');   // 20MB cache (negative = KB)
await db.execAsync('PRAGMA temp_store = MEMORY;');   // Temp tables in memory
await db.execAsync('PRAGMA mmap_size = 268435456;'); // 256MB memory-mapped I/O
```

### Transaction Batching

```tsx
// BAD: 100 individual writes (100 transactions)
for (const item of items) {
  await db.runAsync('INSERT INTO readings (id, text) VALUES (?, ?)', item.id, item.text);
}

// GOOD: Batch in a single transaction
await db.withExclusiveTransactionAsync(async (tx) => {
  const stmt = await tx.prepareAsync('INSERT INTO readings (id, text) VALUES (?, ?)');
  try {
    for (const item of items) {
      await stmt.executeAsync(item.id, item.text);
    }
  } finally {
    await stmt.finalizeAsync();
  }
});
```

### FTS5 Full-Text Search

```tsx
// Create FTS5 virtual table
await db.execAsync(`
  CREATE VIRTUAL TABLE IF NOT EXISTS readings_fts USING fts5(
    title,
    content,
    scripture_ref,
    tokenize='porter unicode61'
  );
`);

// Search with ranking
const results = await db.getAllAsync(`
  SELECT *, rank
  FROM readings_fts
  WHERE readings_fts MATCH ?
  ORDER BY rank
  LIMIT 20
`, [searchQuery]);

// BM25 relevance ranking (built into FTS5)
const results = await db.getAllAsync(`
  SELECT *, bm25(readings_fts, 10.0, 5.0, 1.0) as relevance
  FROM readings_fts
  WHERE readings_fts MATCH ?
  ORDER BY relevance
  LIMIT 20
`, [searchQuery]);
```

### Prepared Statements (Batch Alternative)

```tsx
// Expo doesn't have a batch API, but prepared statements achieve similar perf
const stmt = await db.prepareAsync(
  'SELECT * FROM devotionals WHERE series_id = ? AND day = ?'
);
try {
  const result = await stmt.executeAsync(seriesId, dayNumber);
  const rows = await result.getAllAsync();
  return rows;
} finally {
  await stmt.finalizeAsync(); // Always finalize to prevent leaks
}
```

### Performance Checklist
- [ ] WAL mode enabled
- [ ] `PRAGMA synchronous = NORMAL` (not FULL)
- [ ] Batch writes in transactions (not individual inserts)
- [ ] Use prepared statements for repeated queries
- [ ] Create indexes on frequently queried columns
- [ ] Run `PRAGMA optimize` periodically (e.g., on app background)
- [ ] Use FTS5 instead of `LIKE '%query%'` for text search
- [ ] Note: FTS5 has known limitations on Expo web platform

---

## 8. Image Optimization in Expo 2026

### expo-image vs React Native Image

| Feature | RN `<Image>` | `expo-image` |
|---|---|---|
| Caching | Basic, no disk cache control | Disk + memory cache with policies |
| Placeholders | None | BlurHash, ThumbHash, low-res image |
| Transitions | None | Built-in crossfade, flip, curl |
| Content fit | `resizeMode` | `contentFit` (CSS object-fit) |
| Preloading | `Image.prefetch` | `Image.prefetch` + cache control |
| Native backend | RN Image | SDWebImage (iOS) + Glide (Android) |
| SVG support | No | Yes |
| Animated images | Limited | GIF, APNG, WebP animated |
| **Recommendation** | Legacy only | **Use for all new code** |

### expo-image Best Practices

```tsx
import { Image } from 'expo-image';

// 1. BlurHash placeholder for perceived performance
<Image
  source={{ uri: imageUrl }}
  placeholder={{ blurhash: 'LKO2:N%2Tw=w]~RBVZRi};RPxuwH' }}
  contentFit="cover"
  transition={200}
  style={{ width: 300, height: 200 }}
  cachePolicy="disk" // 'memory' | 'disk' | 'memory-disk' | 'none'
/>

// 2. Preload images before they're needed
await Image.prefetch([
  'https://example.com/image1.jpg',
  'https://example.com/image2.jpg',
]);

// 3. recyclingKey for FlashList (prevents showing stale images)
<FlashList
  data={items}
  renderItem={({ item }) => (
    <Image
      source={{ uri: item.imageUrl }}
      recyclingKey={item.id}
      placeholder={{ blurhash: item.blurhash }}
      contentFit="cover"
      transition={150}
      style={styles.listImage}
    />
  )}
  estimatedItemSize={100}
/>

// 4. Cache management
import { Image } from 'expo-image';

// Clear disk cache (e.g., in settings)
await Image.clearDiskCache();

// Clear memory cache
await Image.clearMemoryCache();
```

### Image Optimization Pipeline
1. **Serve WebP**: 25-34% smaller than JPEG at equivalent quality
2. **Serve responsive sizes**: Use CDN image transforms (Cloudflare Images, Imgix, Cloudinary) to serve appropriately sized images based on device screen width
3. **Generate BlurHash at upload time**: Store the blurhash string alongside the image URL in your database
4. **Preload above-the-fold images**: Call `Image.prefetch()` for images that will be visible on first render
5. **Use `cachePolicy="disk"`**: Default. Good balance of speed and memory usage. Use `memory-disk` only for high-resolution images that are rendered repeatedly.

---

## 9. Bundle Size Reduction

### Expo Tree Shaking (SDK 52+)

```js
// metro.config.js
const { getDefaultConfig } = require('expo/metro-config');

const config = getDefaultConfig(__dirname);

// Enable tree shaking (experimental in SDK 52+)
config.transformer.minifierConfig = {
  compress: {
    drop_console: true,     // Remove console.log in production
    dead_code: true,
    unused: true,
  },
};

module.exports = config;
```

```json
// app.json -- enable tree shaking
{
  "expo": {
    "experiments": {
      "treeShaking": true
    }
  }
}
```

When tree shaking is enabled, you can safely enable `inlineRequires` for production bundles, which lazily loads modules and improves startup time.

### Dynamic Imports / Code Splitting

```tsx
// Lazy load heavy screens
import { lazy, Suspense } from 'react';

const SettingsScreen = lazy(() => import('./screens/SettingsScreen'));
const AudioPlayer = lazy(() => import('./components/AudioPlayer'));

// Use with Suspense
<Suspense fallback={<LoadingSpinner />}>
  <SettingsScreen />
</Suspense>

// React.lazy reduces initial bundle by 20-40% for large apps
```

### Import Optimization

```tsx
// BAD: Imports entire library
import { format, parse, addDays, subDays, isAfter, isBefore } from 'date-fns';

// GOOD: Cherry-pick imports (tree-shakeable)
import format from 'date-fns/format';
import addDays from 'date-fns/addDays';

// BAD: Barrel file imports
import { Button, Card, Text } from '@/components';

// GOOD: Direct imports (if barrel file prevents tree shaking)
import { Button } from '@/components/Button';
import { Card } from '@/components/Card';
```

### Bundle Analysis Tools

```bash
# 1. Expo Atlas (built-in, best for Expo projects)
# Add to app.json:
# { "expo": { "plugins": ["expo-atlas"] } }
# Then run: npx expo start --atlas
# Opens interactive bundle visualization in browser

# 2. react-native-bundle-visualizer
npm install --save-dev react-native-bundle-visualizer
npx react-native-bundle-visualizer
# Generates interactive HTML treemap

# 3. Manual source-map analysis
npx expo export --platform ios
npx source-map-explorer dist/bundles/ios/*.js
```

### Quick Wins Checklist
- [ ] Enable Hermes (default in SDK 55) -- 15-25% size reduction via bytecode
- [ ] Enable tree shaking (`experiments.treeShaking: true`)
- [ ] Drop console in production (`drop_console: true`)
- [ ] Audit large dependencies with Expo Atlas
- [ ] Replace moment.js with date-fns or dayjs
- [ ] Use `react-native-svg` transformer for SVGs instead of PNG assets
- [ ] Compress images to WebP before bundling
- [ ] Remove unused fonts (each font file is 50-200KB)
- [ ] Expected total reduction: 30-70% with all optimizations applied

---

## 10. Memory Leak Detection

### Tools

**1. React Native DevTools Memory Tab (Hermes)**
```
1. Open React Native DevTools (press j in Metro)
2. Navigate to Memory tab
3. Take Heap Snapshot #1
4. Navigate through your app (trigger the suspected leak)
5. Take Heap Snapshot #2
6. Use "Comparison" view to see objects allocated between snapshots
7. Look for growing counts of components, closures, or data objects
```

**2. Xcode Instruments (iOS)**
- Open Instruments > Leaks template
- Run your app and exercise the suspected flow
- Instruments shows leaked objects with their allocation stack trace
- Best for native-level leaks (images, native modules)

**3. Flipper (Legacy but still useful)**
- LeakCanary plugin for Android
- Layout Inspector for component hierarchy
- Being phased out in favor of Chrome DevTools Protocol

**4. Custom Memory Monitor Hook**
```tsx
import { useEffect, useRef } from 'react';
import { AppState } from 'react-native';

export function useMemoryWarning() {
  useEffect(() => {
    const subscription = AppState.addEventListener('memoryWarning', () => {
      console.warn('Memory warning received!');
      // Clear caches, release heavy resources
      Image.clearMemoryCache();
    });
    return () => subscription.remove();
  }, []);
}
```

### Common Leak Patterns and Fixes

**1. Uncleared timers**
```tsx
// LEAK: Timer runs after unmount
useEffect(() => {
  const id = setInterval(() => fetchData(), 30000);
  // Missing cleanup!
}, []);

// FIX: Clear in cleanup
useEffect(() => {
  const id = setInterval(() => fetchData(), 30000);
  return () => clearInterval(id);
}, []);
```

**2. Uncancelled fetch requests**
```tsx
// LEAK: setState after unmount
useEffect(() => {
  fetch('/api/data').then(r => r.json()).then(setData);
}, []);

// FIX: AbortController
useEffect(() => {
  const controller = new AbortController();
  fetch('/api/data', { signal: controller.signal })
    .then(r => r.json())
    .then(setData)
    .catch(e => {
      if (e.name !== 'AbortError') throw e;
    });
  return () => controller.abort();
}, []);
```

**3. Event listener accumulation**
```tsx
// LEAK: Listeners stack up on every render
useEffect(() => {
  const handler = (e) => handleEvent(e);
  emitter.addListener('event', handler);
  return () => emitter.removeListener('event', handler);
  // Must use same function reference for removal
}, []);
```

**4. Zustand subscription leaks**
```tsx
// LEAK: Manual subscribe without unsubscribe
useEffect(() => {
  useStore.subscribe((state) => {
    // Do something
  });
  // Missing cleanup!
}, []);

// FIX: subscribe returns unsubscribe function
useEffect(() => {
  const unsub = useStore.subscribe((state) => {
    // Do something
  });
  return unsub;
}, []);
```

**5. Animated values not cleaned up**
```tsx
// LEAK: Animation loops continue after unmount
useEffect(() => {
  const animation = Animated.loop(
    Animated.timing(opacity, { toValue: 1, duration: 1000, useNativeDriver: true })
  );
  animation.start();
  return () => animation.stop(); // Must stop!
}, []);
```

**6. WebSocket connections**
```tsx
// FIX: Close connection on unmount
useEffect(() => {
  const ws = new WebSocket('wss://api.example.com');
  ws.onmessage = (e) => handleMessage(e.data);
  return () => {
    ws.close();
  };
}, []);
```

### Detection Workflow
1. Use React Profiler to identify components that render too often
2. Take heap snapshots before and after navigating away from a screen
3. Compare snapshots -- look for objects from the previous screen still in memory
4. Check `useEffect` cleanup functions in suspected components
5. On iOS, use Xcode Instruments "Leaks" and "Allocations" for native leaks
6. Monitor `AppState` memory warnings in production with crash reporting (Sentry)

---

## Quick Reference: Priority Actions for Unfold App

Based on the current stack (Expo SDK 55, RN 0.83, React 19, Zustand, FlashList):

1. **Enable React Compiler** -- Add to babel.config.js, remove manual useMemo/useCallback over time
2. **Upgrade to FlashList v2** -- Remove estimatedItemSize requirements, get auto-measurement
3. **Split Zustand store** -- Create slices for reading, settings, auth, onboarding domains
4. **Enable tree shaking** -- Add `experiments.treeShaking: true` to app.json
5. **Audit with Expo Atlas** -- Identify the largest dependencies in the bundle
6. **Switch all images to expo-image** -- Add blurhash placeholders, recyclingKey in lists
7. **Add AbortController to all fetch calls** -- Prevent memory leaks from unmounted components
8. **Enable WAL mode** -- If using expo-sqlite, add PRAGMA optimizations at DB open
9. **Hermes V1** -- Verify running on latest Hermes for native ES6 support (fewer polyfills)
10. **Profile on low-end Android** -- The biggest performance wins are always on constrained devices

---

## Sources

### New Architecture
- [About the New Architecture - React Native](https://reactnative.dev/architecture/landing-page)
- [React Native New Architecture Complete Guide 2026 - Oflight](https://www.oflight.co.jp/en/columns/react-native-new-architecture-fabric)
- [How does React Native's New Architecture affect performance? - DEV Community](https://dev.to/amazonappdev/how-does-react-natives-new-architecture-affect-performance-1dkf)
- [New Architecture is here - React Native Blog](https://reactnative.dev/blog/2024/10/23/the-new-architecture-is-here)

### React Compiler
- [Goodbye useCallback and useMemo: How React Compiler Takes Over - DEV Community](https://dev.to/moruno21/goodbye-usecallback-and-usememo-how-react-compiler-takes-over-40m8)
- [React 19 Compiler 2025: Do You Still Need useMemo/useCallback? - IsItDev](https://isitdev.com/react-19-compiler-usememo-usecallback-2025/)
- [React Compiler - Expo Documentation](https://docs.expo.dev/guides/react-compiler/)
- [React Compiler: No More useMemo and useCallback - Certificates.dev](https://certificates.dev/blog/react-compiler-no-more-usememo-and-usecallback)

### Hermes Engine
- [React Native 0.84 - Hermes V1 by Default](https://reactnative.dev/blog/2026/02/11/react-native-0.84)
- [Hermes V1 in React Native 0.82 - Software Mansion](https://blog.swmansion.com/welcoming-the-next-generation-of-hermes-67ab5679e184)
- [Hermes V1: What It Is, What It Isn't, and What's Next - Callstack](https://www.callstack.com/events/hermes-v1-what-it-is-what-it-isnt-and-whats-next)
- [Hermes in 2025: The Invisible Engine - Medium](https://medium.com/@devonmobile/hermes-in-2025-the-invisible-engine-powering-a-faster-react-native-955711815acd)

### FlashList
- [FlashList v2: A ground-up rewrite - Shopify Engineering](https://shopify.engineering/flashlist-v2)
- [FlashList Documentation](https://shopify.github.io/flash-list/)
- [What is the best React Native list component? - Expo Blog](https://expo.dev/blog/what-is-the-best-react-native-list-component)
- [Instant Performance Upgrade: From FlatList to FlashList - Shopify](https://shopify.engineering/instant-performance-upgrade-flatlist-flashlist)

### FlatList Optimization
- [FlatList - React Native Docs](https://reactnative.dev/docs/flatlist)
- [How I Increased List Scroll FPS from 30 to 58 - Medium](https://medium.com/@arsdev/how-i-increased-list-scroll-fps-from-30-to-58-in-react-native-34504f8d802c)
- [How to Implement FlatList Optimization - OneUptime](https://oneuptime.com/blog/post/2026-01-15-react-native-flatlist-optimization/view)

### State Management
- [Ultimate React Native State Management Guide 2026 - Oflight](https://www.oflight.co.jp/en/columns/react-native-state-management-2026)
- [Top 5 React State Management Tools 2026 - Syncfusion](https://www.syncfusion.com/blogs/post/react-state-management-libraries)
- [Splitting the store into separate slices - Zustand Wiki](https://github.com/pmndrs/zustand/wiki/Splitting-the-store-into-separate-slices)
- [Fine Grained Reactivity - Legend State](https://legendapp.com/open-source/state/v3/react/fine-grained-reactivity/)

### expo-sqlite
- [SQLite - Expo Documentation](https://docs.expo.dev/versions/latest/sdk/sqlite/)
- [React Native Database Performance Comparison - PowerSync](https://www.powersync.com/blog/react-native-database-performance-comparison)
- [SQLite Performance Tuning - DEV Community](https://dev.to/labex/sqlite-performance-tuning-3-practical-labs-for-pragma-indexing-and-fts5-full-text-search-4gmk)

### Image Optimization
- [Image - Expo Documentation](https://docs.expo.dev/versions/latest/sdk/image/)
- [React Native Image Optimization - Medium](https://medium.com/@engin.bolat/react-native-image-optimization-performance-essentials-9e8ce6a1193e)

### Bundle Size
- [Tree shaking and code removal - Expo Documentation](https://docs.expo.dev/guides/tree-shaking/)
- [Analyzing JavaScript bundles with Expo Atlas - Expo Documentation](https://docs.expo.dev/guides/analyzing-bundles/)
- [Optimize Your React Native App's JavaScript Bundle - Callstack](https://www.callstack.com/blog/optimize-react-native-apps-javascript-bundle)
- [react-native-bundle-visualizer - GitHub](https://github.com/callstack/react-native-bundle-visualizer)

### Memory Leaks
- [React Native Memory Leak Fixes - Instamobile](https://instamobile.io/blog/react-native-memory-leak-fixes/)
- [Debugging and profiling tools - Expo Documentation](https://docs.expo.dev/debugging/tools/)
- [useEffect Cleanup Patterns in React Native - Medium](https://medium.com/@saundhkulwindar/useeffect-cleanup-patterns-in-react-native-4503916faa96)
- [How to Debug Memory Leaks in React Native - OneUptime](https://oneuptime.com/blog/post/2026-01-15-react-native-memory-leaks/view)
