import AsyncStorage from '@react-native-async-storage/async-storage';
import NetInfo from '@react-native-community/netinfo';
import * as Application from 'expo-application';
import Constants from 'expo-constants';
import * as FileSystem from 'expo-file-system/legacy';
import { Platform } from 'react-native';
import { logger } from './logger';
import { addAppBreadcrumb, captureAppError } from './sentry';

import { useUnfoldStore } from './store';

const BUG_LOG_STORAGE_KEY = 'unfold-bug-log-v1';
const BUG_LOG_MAX_ENTRIES = 200;

export type BugLogLevel = 'info' | 'warn' | 'error';

export interface BugLogEntry {
  id: string;
  ts: string;
  level: BugLogLevel;
  category: string;
  message: string;
  data?: unknown;
}

export interface BugReportBundle {
  generatedAt: string;
  app: {
    platform: string;
    platformVersion: string | number;
    appVersion: string | null;
    buildVersion: string | null;
    expoRuntimeVersion?: string;
    releaseChannel?: string;
  };
  network: {
    isConnected: boolean | null;
    isInternetReachable: boolean | null;
    type: string;
  };
  context: {
    source?: string;
    note?: string;
  };
  stateSnapshot: {
    currentDevotionalId: string | null;
    devotionalCount: number;
    currentDevotional?: {
      id: string;
      title: string;
      totalDays: number;
      currentDay: number;
      availableDays: number;
      generatedDayNumbers: number[];
    };
    generationSession: ReturnType<typeof getGenerationSessionSnapshot>;
    user?: {
      isPremium: boolean;
      devotionalLength: number;
      readingDuration: number;
      bibleTranslation: string;
      hasCompletedOnboarding: boolean;
      hasCompletedStyleOnboarding: boolean;
    };
  };
  events: BugLogEntry[];
}

export interface BugTriageSummary {
  headline: string;
  overview: string;
  latestError: string | null;
  quickFacts: {
    totalEvents: number;
    errorEvents: number;
    warningEvents: number;
    retryEvents: number;
    offlineEvents: number;
    latestEventAt: string | null;
  };
  suggestedFocus: string[];
}

let writeQueue: Promise<void> = Promise.resolve();

function randomId() {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function serializeData(data: unknown): unknown {
  if (data === undefined || data === null) return data;

  if (data instanceof Error) {
    return {
      name: data.name,
      message: data.message,
      stack: data.stack,
    };
  }

  try {
    return JSON.parse(JSON.stringify(data));
  } catch {
    return String(data);
  }
}

async function readLogEntries(): Promise<BugLogEntry[]> {
  const raw = await AsyncStorage.getItem(BUG_LOG_STORAGE_KEY);
  if (!raw) return [];

  try {
    const parsed = JSON.parse(raw) as BugLogEntry[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

async function writeLogEntries(entries: BugLogEntry[]): Promise<void> {
  const trimmed = entries.slice(-BUG_LOG_MAX_ENTRIES);
  await AsyncStorage.setItem(BUG_LOG_STORAGE_KEY, JSON.stringify(trimmed));
}

export async function getBugLogEntries(): Promise<BugLogEntry[]> {
  return readLogEntries();
}

/**
 * Bug-log payloads carry user-derived text: a devotional title is generated
 * from what someone wrote about their own life, and `dayTitle` with it. Only
 * the shape of a payload is safe to leave the device, so every value is
 * dropped and the key names are kept as the breadcrumb's signal.
 */
function describePayloadShape(data: unknown): { dataKeys: string } | undefined {
  if (!data || typeof data !== 'object') return undefined;
  const keys = Array.isArray(data) ? [] : Object.keys(data as Record<string, unknown>);
  return keys.length > 0 ? { dataKeys: keys.join(',') } : undefined;
}

export function logBugEvent(
  category: string,
  message: string,
  data?: unknown,
  level: BugLogLevel = 'info'
): Promise<void> {
  // Events are context, not failures — they become breadcrumbs attached to
  // whatever error is captured later. Messages are developer-authored
  // constants at every call site; payload values are not, so only their key
  // names travel.
  addAppBreadcrumb(category, message, { level, ...describePayloadShape(data) });

  writeQueue = writeQueue.then(async () => {
    const existing = await readLogEntries();
    const next: BugLogEntry = {
      id: randomId(),
      ts: new Date().toISOString(),
      level,
      category,
      message,
      data: serializeData(data),
    };
    await writeLogEntries([...existing, next]);
  }).catch((error) => {
    logger.warn('[bug-logger] failed to write event', error);
  });

  return writeQueue;
}

/**
 * Writes an error to the local bug log AND reports it.
 *
 * Three paths legitimately reach one failure twice: `reportError` writes its
 * local trail through this function after capturing; `devotional-service`
 * calls both back to back with the same error; and the error boundary and the
 * fatal handler capture explicitly before writing here. Rather than silence
 * this layer — which would leave direct callers such as the store's
 * rehydration and validation failures reporting as breadcrumbs only, and a
 * breadcrumb is invisible unless a later event carries it — the echo is
 * collapsed by making this the only place that reports: `reportError`, the
 * fatal handler and the error boundary all route through here rather than
 * capturing alongside it.
 *
 * `data` is NOT forwarded. Call sites pass user-derived text through it
 * (`generating.tsx` sends a series title), so only its key names travel.
 */
export function logBugError(
  category: string,
  error: unknown,
  data?: unknown,
  reportExtra?: Record<string, string | number | boolean> | false,
): Promise<void> {
  const payload = {
    error: serializeData(error),
    ...(data !== undefined ? { data: serializeData(data) } : {}),
  };

  // `false` means the caller has a specific reason not to report — today only
  // the replay of a previous launch's fatal, which the native SDK already filed
  // at the moment of the crash. Reporting it again would duplicate every crash
  // on the following launch.
  if (reportExtra !== false) {
    captureAppError(
      category,
      error instanceof Error ? error : new Error(String(error)),
      // `data` is never forwarded: call sites put user-authored text in it (a
      // series title, a devotional day title). `reportExtra` is the caller's
      // vouched, primitive-only payload, and the scrubber still gates it.
      reportExtra ?? (data && typeof data === 'object'
        ? { dataKeys: Object.keys(data as object).join(',') }
        : undefined),
    );
  }

  return logBugEvent(category, 'error', payload, 'error');
}

export async function clearBugLogEntries(): Promise<void> {
  await AsyncStorage.removeItem(BUG_LOG_STORAGE_KEY);
}

function getGenerationSessionSnapshot() {
  const session = useUnfoldStore.getState().generationSession;
  return {
    status: session.status,
    devotionalId: session.devotionalId,
    totalDays: session.totalDays,
    generatedDayNumbers: [...session.generatedDayNumbers],
    title: session.title,
    error: session.error,
    startedAt: session.startedAt,
    updatedAt: session.updatedAt,
  };
}

function isRetryEvent(event: BugLogEntry) {
  return /retry/i.test(event.message);
}

function isOfflineEvent(event: BugLogEntry) {
  return /offline|internet-reachable-false|network-offline/i.test(
    `${event.category}:${event.message}`
  );
}

function buildBugTriageSummary(bundle: BugReportBundle): BugTriageSummary {
  const errorEvents = bundle.events.filter((event) => event.level === 'error');
  const warningEvents = bundle.events.filter((event) => event.level === 'warn');
  const retryEvents = bundle.events.filter(isRetryEvent);
  const offlineEvents = bundle.events.filter(isOfflineEvent);

  const latestEvent = bundle.events[bundle.events.length - 1];
  const latestError = [...bundle.events].reverse().find((event) => event.level === 'error');

  const latestErrorText = latestError
    ? `${latestError.ts} • ${latestError.category} • ${latestError.message}`
    : null;

  const headline = latestError
    ? `Most likely failing area: ${latestError.category}`
    : warningEvents.length > 0
      ? `No hard errors captured (${warningEvents.length} warning event${warningEvents.length === 1 ? '' : 's'})`
      : 'No warning/error events captured in this timeline';

  const overview = latestError
    ? `Latest error happened in ${latestError.category}. Start investigation around that timestamp.`
    : retryEvents.length > 0
      ? `Retries were detected without a hard error. Check timeout/backoff behavior first.`
      : `No obvious failure signature detected. Reproduce once more and export immediately after.`;

  const suggestedFocus: string[] = [];

  if (latestError) {
    suggestedFocus.push(`Trace the ${latestError.category} event chain leading to ${latestError.ts}.`);
  }

  if (retryEvents.length > 0) {
    suggestedFocus.push(`Inspect retry flow (${retryEvents.length} retry-tagged event${retryEvents.length === 1 ? '' : 's'}).`);
  }

  if (offlineEvents.length > 0) {
    suggestedFocus.push(`Validate offline recovery (${offlineEvents.length} offline-related signal${offlineEvents.length === 1 ? '' : 's'}).`);
  }

  if (suggestedFocus.length === 0) {
    suggestedFocus.push('No high-signal indicators found. Capture another report right after reproducing the issue.');
  }

  return {
    headline,
    overview,
    latestError: latestErrorText,
    quickFacts: {
      totalEvents: bundle.events.length,
      errorEvents: errorEvents.length,
      warningEvents: warningEvents.length,
      retryEvents: retryEvents.length,
      offlineEvents: offlineEvents.length,
      latestEventAt: latestEvent?.ts ?? null,
    },
    suggestedFocus,
  };
}

export async function createBugReportBundle(context?: { source?: string; note?: string }): Promise<BugReportBundle> {
  const state = useUnfoldStore.getState();
  const currentDevotional = state.devotionals.find((d) => d.id === state.currentDevotionalId);
  const net = await NetInfo.fetch();
  const events = await getBugLogEntries();

  return {
    generatedAt: new Date().toISOString(),
    app: {
      platform: Platform.OS,
      platformVersion: Platform.Version,
      appVersion: Application.nativeApplicationVersion ?? Constants.expoConfig?.version ?? null,
      buildVersion: Application.nativeBuildVersion ?? null,
      expoRuntimeVersion:
        typeof Constants.expoConfig?.runtimeVersion === 'string'
          ? Constants.expoConfig.runtimeVersion
          : undefined,
      releaseChannel: Constants.expoConfig?.updates?.url,
    },
    network: {
      isConnected: net.isConnected,
      isInternetReachable: net.isInternetReachable,
      type: net.type,
    },
    context: {
      source: context?.source,
      note: context?.note,
    },
    stateSnapshot: {
      currentDevotionalId: state.currentDevotionalId,
      devotionalCount: state.devotionals.length,
      ...(currentDevotional
        ? {
            currentDevotional: {
              id: currentDevotional.id,
              title: currentDevotional.title,
              totalDays: currentDevotional.totalDays,
              currentDay: currentDevotional.currentDay,
              availableDays: currentDevotional.days.length,
              generatedDayNumbers: currentDevotional.days.map((d) => d.dayNumber),
            },
          }
        : {}),
      generationSession: getGenerationSessionSnapshot(),
      ...(state.user
        ? {
            user: {
              isPremium: state.user.isPremium,
              devotionalLength: state.user.devotionalLength,
              readingDuration: state.user.readingDuration,
              bibleTranslation: state.user.bibleTranslation,
              hasCompletedOnboarding: state.user.hasCompletedOnboarding,
              hasCompletedStyleOnboarding: state.user.hasCompletedStyleOnboarding,
            },
          }
        : {}),
    },
    events,
  };
}

function sanitizeLabelForFileName(label?: string): string | null {
  if (!label) return null;

  const cleaned = label
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40);

  return cleaned.length > 0 ? cleaned : null;
}

export async function exportBugReportBundleToFile(context?: {
  source?: string;
  note?: string;
  label?: string;
}): Promise<{ path: string; bundle: BugReportBundle; triageSummary: BugTriageSummary }> {
  const bundle = await createBugReportBundle(context);
  const triageSummary = buildBugTriageSummary(bundle);
  const baseDir = FileSystem.cacheDirectory ?? FileSystem.documentDirectory;

  if (!baseDir) {
    throw new Error('No writable directory available for bug report export.');
  }

  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const labelPart = sanitizeLabelForFileName(context?.label);
  const path = `${baseDir}unfold-bug-report${labelPart ? `-${labelPart}` : ''}-${timestamp}.json`;

  const exportPayload = {
    triageSummary,
    ...bundle,
  };

  await FileSystem.writeAsStringAsync(path, JSON.stringify(exportPayload, null, 2), {
    encoding: FileSystem.EncodingType.UTF8,
  });

  return { path, bundle, triageSummary };
}
