/**
 * Series archive/resume clocks. The backend writes these with compare-and-set
 * on archivedStateAt, independent of content last-write-wins. The client must
 * use the same clock so an explicit Archive cannot stay active on the server
 * or return as live after pull.
 */

export type DevotionalLifecycleFields = {
  archivedAt?: string | null;
  archivedStateAt?: string;
};

export function lifecycleTimestampMs(value: Date | string | null | undefined): number {
  if (value == null || value === '') return 0;
  const ms = value instanceof Date ? value.getTime() : Date.parse(value);
  return Number.isNaN(ms) ? 0 : ms;
}

export function parseLifecycleTimestamp(value: unknown): string | null | undefined {
  if (value === undefined) return undefined;
  if (value === null) return null;
  if (value instanceof Date) {
    return Number.isNaN(value.getTime()) ? undefined : value.toISOString();
  }
  if (typeof value === 'string' && value.length > 0) {
    const ms = Date.parse(value);
    return Number.isNaN(ms) ? undefined : new Date(ms).toISOString();
  }
  return undefined;
}

export function extractDevotionalLifecycle(
  source: Record<string, unknown> | DevotionalLifecycleFields | null | undefined,
): DevotionalLifecycleFields {
  if (!source) return {};
  const archivedStateAt = parseLifecycleTimestamp(
    'archivedStateAt' in source ? source.archivedStateAt : undefined,
  );
  const archivedAt = parseLifecycleTimestamp(
    'archivedAt' in source ? source.archivedAt : undefined,
  );
  const fields: DevotionalLifecycleFields = {};
  if (typeof archivedStateAt === 'string') fields.archivedStateAt = archivedStateAt;
  if (archivedAt !== undefined) fields.archivedAt = archivedAt;
  return fields;
}

export function isDevotionalArchived(
  series: Pick<DevotionalLifecycleFields, 'archivedAt'> | null | undefined,
): boolean {
  return Boolean(series?.archivedAt);
}

function nextIntentClock(previous: string | undefined, at: string): string {
  const previousMs = lifecycleTimestampMs(previous);
  const atMs = lifecycleTimestampMs(at);
  if (previousMs === 0 || previousMs < atMs) return at;
  return new Date(previousMs + 1).toISOString();
}

type WithArchiveIntent<T> = Omit<T, keyof DevotionalLifecycleFields | 'updatedAt'>
  & Required<DevotionalLifecycleFields>
  & { updatedAt: string };

export function applyArchiveIntent<T extends DevotionalLifecycleFields & { updatedAt?: string }>(
  series: T,
  at: string,
): WithArchiveIntent<T> {
  const archivedStateAt = nextIntentClock(series.archivedStateAt, at);
  return {
    ...series,
    archivedAt: archivedStateAt,
    archivedStateAt,
    updatedAt: archivedStateAt,
  };
}

export function applyUnarchiveIntent<T extends DevotionalLifecycleFields & { updatedAt?: string }>(
  series: T,
  at: string,
): WithArchiveIntent<T> {
  const archivedStateAt = nextIntentClock(series.archivedStateAt, at);
  return {
    ...series,
    archivedAt: null,
    archivedStateAt,
    updatedAt: archivedStateAt,
  };
}

/**
 * Last-write-wins on archivedStateAt, matching backend
 * compareAndSetDevotionalLifecycle. A content pull that omits the intent
 * clock leaves the local decision in place. A pending outbox intent is part
 * of the local clock so offline Archive/resume is not overwritten.
 */
export function mergeDevotionalLifecycle(options: {
  local?: DevotionalLifecycleFields | null;
  incoming?: DevotionalLifecycleFields | null;
  pendingArchivedStateAt?: string | null;
}): DevotionalLifecycleFields {
  const local = options.local ?? {};
  const incoming = options.incoming ?? {};
  const incomingStateAt = incoming.archivedStateAt;
  if (!incomingStateAt) {
    return {
      archivedAt: local.archivedAt,
      archivedStateAt: local.archivedStateAt,
    };
  }

  const localClock = Math.max(
    lifecycleTimestampMs(local.archivedStateAt),
    lifecycleTimestampMs(options.pendingArchivedStateAt),
  );
  const incomingClock = lifecycleTimestampMs(incomingStateAt);
  if (localClock !== 0 && !(localClock < incomingClock)) {
    return {
      archivedAt: local.archivedAt,
      archivedStateAt: local.archivedStateAt,
    };
  }

  return {
    archivedAt: incoming.archivedAt ?? null,
    archivedStateAt: incomingStateAt,
  };
}

export function didDevotionalLifecycleChange(
  local: DevotionalLifecycleFields | null | undefined,
  next: DevotionalLifecycleFields,
): boolean {
  return (local?.archivedAt ?? null) !== (next.archivedAt ?? null)
    || (local?.archivedStateAt ?? undefined) !== (next.archivedStateAt ?? undefined);
}

export function devotionalLifecycleSyncFields(
  series: DevotionalLifecycleFields,
): Record<string, string | null> {
  if (!series.archivedStateAt) return {};
  return {
    archivedAt: series.archivedAt ?? null,
    archivedStateAt: series.archivedStateAt,
  };
}
