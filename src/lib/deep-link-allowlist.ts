/**
 * External deep-link allowlist (P3-4 item 2).
 *
 * expo-router maps EVERY file route to `unfold://<path>` by default, so any
 * app on the device — or any tapped link — could open internal screens with
 * arbitrary params. `src/app/+native-intent.tsx` runs every externally
 * arriving URL (cold-start initial URL and warm `Linking` events; native
 * only) through `resolveExternalDeepLink` and rewrites anything unknown or
 * invalid to `DEEP_LINK_FALLBACK_PATH`.
 *
 * Pure module: no React / native imports, fully unit-tested.
 *
 * Inventory of `unfold://` producers that must keep working (keep the test
 * file's "legitimate producers" block in sync):
 *   - iOS widgets (src/widgets/ios/{UnfoldStreak,UnfoldToday,UnfoldDashboard}.tsx)
 *     emit `unfold://(tabs)/(today)` via widgetURL.
 *   - Notification taps never travel as URLs (expo-notifications response
 *     listener → router.replace in src/lib/push-notification-helpers.ts), so
 *     they bypass this layer entirely.
 *   - No universal links / associated domains and no Android VIEW intent
 *     filters are configured; no share flow emits an `unfold://` URL.
 *   - Info.plist registers a second scheme, `com.unfoldapp.ios`; the parser
 *     is scheme-agnostic so it is treated exactly like `unfold`.
 *
 * Why the fallback is `/` (the welcome/index anchor) and not the Today tab:
 * Phase 1's completed-user redirect in src/app/index.tsx already handles `/`
 * for both populations — a completed user is forwarded to Today once
 * notification hydration settles, a fresh install sees onboarding. Landing an
 * un-onboarded user directly on Today would skip onboarding.
 */

export const DEEP_LINK_FALLBACK_PATH = '/';

// ─── Limits ──────────────────────────────────────────────────────────────────

const MAX_URL_LENGTH = 4096;
const MAX_PARAMS = 16;
/** Devotional series never span more than a year of days. */
const MAX_DAY_NUMBER = 366;
const MAX_BOOK_ID = 66;
/** Psalms. */
const MAX_CHAPTER = 150;
/** Psalm 119. */
const MAX_VERSE = 176;

// ─── Param schemas ───────────────────────────────────────────────────────────

type ParamSchema =
  | { kind: 'id' }
  | { kind: 'int'; min: number; max: number }
  | { kind: 'enum'; values: readonly string[] }
  | { kind: 'text'; maxLength: number }
  | { kind: 'slug' };

export interface RouteSchema {
  /** Param name → schema. Any param not listed here rejects the URL. */
  params: Readonly<Record<string, ParamSchema>>;
  required?: readonly string[];
}

const id = (): ParamSchema => ({ kind: 'id' });
const int = (min: number, max: number): ParamSchema => ({ kind: 'int', min, max });
const oneOf = (values: readonly string[]): ParamSchema => ({ kind: 'enum', values });
const text = (maxLength: number): ParamSchema => ({ kind: 'text', maxLength });
const slug = (): ParamSchema => ({ kind: 'slug' });

// Store ids are uuid / cuid / `<prefix>_<ts>_<rand>` / `onboarding-sample-anon_<uuid>`.
const ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/;
const SLUG_PATTERN = /^[A-Za-z][A-Za-z0-9_-]{0,63}$/;
/** Canonical non-negative decimal only — no sign, exponent, hex, or fraction. */
const INT_PATTERN = /^(?:0|[1-9]\d{0,5})$/;
/**
 * C0 control characters (except tab and newline) and DEL. Built from code
 * points so the source file itself contains no control bytes.
 */
const CONTROL_CHARS = new RegExp(
  `[${String.fromCharCode(0)}-${String.fromCharCode(8)}${String.fromCharCode(11)}-${String.fromCharCode(31)}${String.fromCharCode(127)}]`,
);
const MARKUP_CHARS = /[<>]/;
const SCRIPT_PREFIX = /^\s*(?:javascript|data|vbscript):/i;

// ─── Enums mirrored from the screens that consume them ───────────────────────

/** Mirror of the FROM_TO_ROUTE keys in src/hooks/useCrossTabBack.ts. */
const CROSS_TAB_FROM = ['home', 'journal', 'bible', 'you'] as const;
/** Mirrors VALID_TABS / VALID_TYPES / VALID_SOURCES in src/app/(tabs)/(you)/my-content.tsx. */
const MY_CONTENT_TABS = ['journal', 'highlights', 'bookmarks'] as const;
const MY_CONTENT_TYPES = ['all', 'notes', 'highlights'] as const;
const MY_CONTENT_SOURCES = ['all', 'devotional', 'bible'] as const;

// ─── Route table (canonical, group-less paths) ───────────────────────────────

const JOURNAL_ROUTE: RouteSchema = {
  params: {
    devotionalId: id(),
    dayNumber: int(1, MAX_DAY_NUMBER),
    focusQuestion: int(0, 99),
  },
  required: ['devotionalId', 'dayNumber'],
};

const MY_CONTENT_ROUTE: RouteSchema = {
  params: {
    tab: oneOf(MY_CONTENT_TABS),
    source: oneOf(MY_CONTENT_SOURCES),
    type: oneOf(MY_CONTENT_TYPES),
    from: oneOf(CROSS_TAB_FROM),
  },
};

/**
 * Every route an external URL may open, with its param schema. Keys are
 * canonical paths with route groups removed (`/(tabs)/(today)/reading` and
 * `/reading` both resolve to `/reading`). Duplicate file routes that
 * re-export one screen ((today)/(you) my-content, past-devotionals,
 * series-detail; (journal)/entry → journal) share a single entry.
 */
export const EXTERNAL_ROUTE_ALLOWLIST: Readonly<Record<string, RouteSchema>> = {
  // Root stack + tab roots (`/(tabs)`, `/(tabs)/(today)`, … all canonicalise to `/`)
  '/': { params: {} },
  '/how-it-works': { params: {} },
  '/streak-settings': { params: {} },
  // `source=onboarding|onboarding_early` reroutes paywall completion into the
  // onboarding flow and has no in-app URL producer — external links get the
  // plain paywall only.
  '/paywall': { params: {} },
  '/onboarding': { params: { startAt: slug(), flow: oneOf(['newSeries']) } },
  '/share-card': {
    params: { text: text(1000), reference: text(160), translation: text(24), type: oneOf(['verse']) },
    required: ['text'],
  },
  '/reveal': {
    params: {
      devotionalId: id(),
      dayNumber: int(1, MAX_DAY_NUMBER),
      seriesTitle: text(200),
      dayTitle: text(200),
      totalDays: int(1, MAX_DAY_NUMBER),
    },
    required: ['devotionalId', 'dayNumber'],
  },
  // Today tab
  '/reading': {
    params: {
      devotionalId: id(),
      dayNumber: int(1, MAX_DAY_NUMBER),
      highlightId: id(),
      bookmarkId: id(),
    },
  },
  '/journal': JOURNAL_ROUTE,
  '/journal-detail': { params: { entryId: id() }, required: ['entryId'] },
  '/evening-wind-down': { params: { devotionalId: id(), dayNumber: int(1, MAX_DAY_NUMBER) } },
  '/my-content': MY_CONTENT_ROUTE,
  '/past-devotionals': { params: { from: oneOf(CROSS_TAB_FROM) } },
  '/series-detail': { params: { id: id(), from: oneOf(CROSS_TAB_FROM) }, required: ['id'] },
  // Bible tab
  '/reader': {
    params: { bookId: int(1, MAX_BOOK_ID), chapter: int(1, MAX_CHAPTER), verse: int(1, MAX_VERSE) },
  },
  '/search': { params: {} },
  // Journal tab (the scripture-anchor params note-detail accepts in-app —
  // verseText, reference, bookId… — feed the editor document and have no
  // external producer, so they are deliberately not accepted here)
  '/entry': JOURNAL_ROUTE,
  '/note-detail': { params: { noteId: id(), startEditing: oneOf(['true', 'false']), folderId: id() } },
  '/recently-deleted': { params: {} },
  // You tab
  '/settings': { params: { from: oneOf(CROSS_TAB_FROM) } },
  '/checkin-schedule': { params: { type: oneOf(['midday', 'evening']) }, required: ['type'] },
};

/** File routes that exist but must never be opened from outside the app. */
export const EXTERNAL_ROUTE_BLOCKLIST: ReadonlySet<string> = new Set([
  '/unfolded', // hidden year-in-review recap; its only in-app entry is dead code
  '/generating', // transitional screen, meaningful only mid-flow
  '/day-menu', // in-reader sheet that needs reader context
]);

/** Route groups that may appear as path segments; anything else is rejected. */
const KNOWN_ROUTE_GROUPS: ReadonlySet<string> = new Set([
  '(tabs)',
  '(today)',
  '(bible)',
  '(ask)',
  '(journal)',
  '(you)',
]);

// ─── Parsing ─────────────────────────────────────────────────────────────────

export type DeepLinkRejectionReason =
  | 'malformed'
  | 'too-long'
  | 'unknown-group'
  | 'blocked-route'
  | 'unknown-route'
  | 'too-many-params'
  | 'duplicate-param'
  | 'unknown-param'
  | 'missing-param'
  | 'invalid-param';

export type DeepLinkDecision =
  | { allowed: true; route: string }
  | { allowed: false; reason: DeepLinkRejectionReason; route?: string; param?: string };

interface ParsedExternalUrl {
  segments: string[];
  params: Map<string, string>;
}

const SCHEME_PATTERN = /^([a-z][a-z0-9+.-]*):(.*)$/i;
/** Schemes whose first component is an authority (host[:port]) rather than a path segment. */
const AUTHORITY_SCHEMES: ReadonlySet<string> = new Set(['http', 'https', 'exp', 'exps']);

function safeDecode(value: string): string | null {
  try {
    return decodeURIComponent(value);
  } catch {
    return null;
  }
}

/**
 * Reduce a URL to its path + query. Custom schemes (`unfold://reveal?…`,
 * `unfold:///reveal`, `com.unfoldapp.ios://paywall`) keep the "host" as the
 * first path segment — that is how expo-router reads them; web / Expo Go
 * URLs drop their authority. Plain paths pass through unchanged.
 */
function stripSchemeAndAuthority(url: string): string {
  const match = SCHEME_PATTERN.exec(url);
  if (!match) return url;
  const scheme = match[1].toLowerCase();
  let rest = match[2];
  if (rest.startsWith('//')) rest = rest.slice(2);
  if (AUTHORITY_SCHEMES.has(scheme)) {
    const end = rest.search(/[/?#]/);
    rest = end === -1 ? '' : rest.slice(end);
  }
  return rest;
}

function parseExternalUrl(url: string): ParsedExternalUrl | DeepLinkRejectionReason {
  const withoutFragment = url.split('#')[0];
  const rest = stripSchemeAndAuthority(withoutFragment);
  const queryIndex = rest.indexOf('?');
  const rawPath = queryIndex === -1 ? rest : rest.slice(0, queryIndex);
  const rawQuery = queryIndex === -1 ? '' : rest.slice(queryIndex + 1);

  const segments: string[] = [];
  for (const rawSegment of rawPath.split('/')) {
    if (rawSegment === '') continue;
    const segment = safeDecode(rawSegment);
    if (segment === null || segment === '.' || segment === '..') return 'malformed';
    segments.push(segment);
  }
  // Expo Go prefixes deep-link paths with `/--/`.
  if (segments[0] === '--') segments.shift();

  const params = new Map<string, string>();
  if (rawQuery.length > 0) {
    for (const pair of rawQuery.split('&')) {
      if (pair === '') continue;
      const eq = pair.indexOf('=');
      const rawKey = eq === -1 ? pair : pair.slice(0, eq);
      const rawValue = eq === -1 ? '' : pair.slice(eq + 1);
      const key = safeDecode(rawKey.replace(/\+/g, ' '));
      const value = safeDecode(rawValue.replace(/\+/g, ' '));
      if (key === null || value === null || key === '') return 'malformed';
      if (params.has(key)) return 'duplicate-param';
      if (params.size >= MAX_PARAMS) return 'too-many-params';
      params.set(key, value);
    }
  }

  return { segments, params };
}

function canonicalizeRoute(segments: readonly string[]): string | 'unknown-group' {
  const kept: string[] = [];
  for (const segment of segments) {
    if (segment.startsWith('(') && segment.endsWith(')')) {
      if (!KNOWN_ROUTE_GROUPS.has(segment)) return 'unknown-group';
      continue;
    }
    kept.push(segment);
  }
  return `/${kept.join('/')}`;
}

function isValidParam(schema: ParamSchema, value: string): boolean {
  switch (schema.kind) {
    case 'id':
      return ID_PATTERN.test(value);
    case 'slug':
      return SLUG_PATTERN.test(value);
    case 'enum':
      return schema.values.includes(value);
    case 'int': {
      if (!INT_PATTERN.test(value)) return false;
      const parsed = Number(value);
      return parsed >= schema.min && parsed <= schema.max;
    }
    case 'text':
      return (
        value.length > 0 &&
        value.length <= schema.maxLength &&
        !CONTROL_CHARS.test(value) &&
        !MARKUP_CHARS.test(value) &&
        !SCRIPT_PREFIX.test(value)
      );
  }
}

/**
 * Decide whether an externally arriving URL may open as-is. Accepted URLs
 * are returned untouched by the caller (no rewriting), so legitimate
 * producers keep their exact expo-router behaviour.
 */
export function resolveExternalDeepLink(url: string): DeepLinkDecision {
  if (typeof url !== 'string') return { allowed: false, reason: 'malformed' };
  if (url.length > MAX_URL_LENGTH) return { allowed: false, reason: 'too-long' };

  const parsed = parseExternalUrl(url);
  if (typeof parsed === 'string') return { allowed: false, reason: parsed };

  const route = canonicalizeRoute(parsed.segments);
  if (route === 'unknown-group') return { allowed: false, reason: 'unknown-group' };

  if (EXTERNAL_ROUTE_BLOCKLIST.has(route)) return { allowed: false, reason: 'blocked-route', route };
  if (!Object.prototype.hasOwnProperty.call(EXTERNAL_ROUTE_ALLOWLIST, route)) {
    return { allowed: false, reason: 'unknown-route', route };
  }
  const schema = EXTERNAL_ROUTE_ALLOWLIST[route];

  for (const [key, value] of parsed.params) {
    if (!Object.prototype.hasOwnProperty.call(schema.params, key)) {
      return { allowed: false, reason: 'unknown-param', route, param: key };
    }
    if (!isValidParam(schema.params[key], value)) {
      return { allowed: false, reason: 'invalid-param', route, param: key };
    }
  }
  for (const required of schema.required ?? []) {
    if (!parsed.params.has(required)) {
      return { allowed: false, reason: 'missing-param', route, param: required };
    }
  }

  return { allowed: true, route };
}
