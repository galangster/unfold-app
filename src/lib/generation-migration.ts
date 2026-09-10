/**
 * One-time migration: push local progressive generation data to server.
 * Runs on first app launch after the server-side generation update.
 * Idempotent — safe to re-run if interrupted.
 */
import { mmkvStorage } from "./mmkv-storage";
import { useUnfoldStore } from "./store";
import { PRIMARY_BACKEND_URL, getAuthHeaders } from "./api-config";
import { logger } from "./logger";
import {
  assertSyncSessionCurrent,
  captureSyncSession,
  isSyncSessionCurrent,
  registerSyncTransport,
} from "./generation-session";

/** Exported so full-reset can clear it — the migration is idempotent and re-runs after a wipe. */
export const MIGRATION_KEY = "generation-migration-v1-complete";
export const ARC_RECONCILIATION_KEY = "generation-arc-reconciliation-v2";

type MigrationStore = ReturnType<typeof useUnfoldStore.getState>;

function buildMemoryPayload(memory: NonNullable<MigrationStore["devotionals"][number]["progressiveMemory"]>) {
  return {
    fullDays: (memory.fullDays ?? [])
      .filter((day) => typeof day?.dayNumber === "number")
      .map((day) => ({
        dayNumber: day.dayNumber,
        content: day,
      })),
    summaries: (memory.summaries ?? [])
      .filter((summary) => typeof summary?.startDay === "number" && typeof summary?.endDay === "number")
      .map((summary) => ({
        dayRangeStart: summary.startDay,
        dayRangeEnd: summary.endDay,
        content: summary,
      })),
    narrative: memory.narrative
      ? {
          content: memory.narrative,
        }
      : null,
  };
}

function buildScriptureDayLookup(devotionals: MigrationStore["devotionals"]) {
  const lookup = new Map<string, number[]>();

  for (const devotional of devotionals) {
    for (const day of devotional.days ?? []) {
      if (!day?.scriptureReference || typeof day.dayNumber !== "number") continue;
      const key = `${devotional.id}::${day.scriptureReference}`;
      const matches = lookup.get(key) ?? [];
      matches.push(day.dayNumber);
      lookup.set(key, matches);
    }
  }

  return lookup;
}

function buildScripturesPayload(store: MigrationStore) {
  const lookup = buildScriptureDayLookup(store.devotionals ?? []);
  const nextMatchIndex = new Map<string, number>();

  return (store.usedScriptures ?? []).flatMap((scripture) => {
    const directDayNumber = (scripture as { dayNumber?: unknown }).dayNumber;
    const key = `${scripture.devotionalId}::${scripture.reference}`;
    const matchingDays = lookup.get(key) ?? [];
    const matchIndex = nextMatchIndex.get(key) ?? 0;
    const derivedDayNumber =
      typeof directDayNumber === "number"
        ? directDayNumber
        : matchingDays[matchIndex];

    if (typeof derivedDayNumber !== "number") {
      logger.warn(
        `[gen-migration] Skipping scripture without resolvable dayNumber: ${scripture.devotionalId} ${scripture.reference}`,
      );
      return [];
    }

    if (typeof directDayNumber !== "number") {
      nextMatchIndex.set(key, matchIndex + 1);
    }

    return [{
      reference: scripture.reference,
      book: scripture.book,
      devotionalId: scripture.devotionalId,
      dayNumber: derivedDayNumber,
    }];
  });
}

async function postMigrationStep(
  session: number,
  headers: Record<string, string>,
  path: string,
  body: unknown,
): Promise<boolean> {
  if (!isSyncSessionCurrent(session)) return false;
  const controller = new AbortController();
  const unregister = registerSyncTransport(controller);
  try {
    const response = await fetch(`${PRIMARY_BACKEND_URL}${path}`, {
      method: "POST",
      headers,
      body: JSON.stringify(body),
      signal: controller.signal,
    });
    if (!isSyncSessionCurrent(session)) return false;

    if (!response.ok) {
      logger.warn(`[gen-migration] ${path} failed with status ${response.status}`);
      return false;
    }

    return true;
  } catch (error) {
    if (!isSyncSessionCurrent(session)) return false;
    logger.warn(`[gen-migration] ${path} request failed:`, error);
    return false;
  } finally {
    unregister();
  }
}

function readReconciledArcIds(): Set<string> {
  const stored = mmkvStorage.getItem(ARC_RECONCILIATION_KEY) as string | null;
  if (!stored) return new Set();
  try {
    const ids = JSON.parse(stored);
    return new Set(Array.isArray(ids) ? ids.filter((id): id is string => typeof id === "string") : []);
  } catch {
    return new Set();
  }
}

async function reconcileSeriesArcs(
  session: number,
  headers: Record<string, string>,
  devotionals: MigrationStore["devotionals"],
): Promise<boolean> {
  const reconciled = readReconciledArcIds();
  let allSucceeded = true;

  for (const devotional of devotionals) {
    if (!isSyncSessionCurrent(session)) return false;
    if (devotional.generationMode !== "progressive" || !devotional.seriesArc || reconciled.has(devotional.id)) {
      continue;
    }

    const succeeded = await postMigrationStep(
      session,
      headers,
      "/api/jobs/migrate-arc",
      { devotionalId: devotional.id, arc: devotional.seriesArc },
    );
    if (!isSyncSessionCurrent(session)) return false;
    if (!succeeded) {
      allSucceeded = false;
      continue;
    }

    reconciled.add(devotional.id);
    mmkvStorage.setItem(ARC_RECONCILIATION_KEY, JSON.stringify([...reconciled].sort()));
  }

  return allSucceeded;
}

export async function migrateGenerationDataToServer(): Promise<void> {
  const session = captureSyncSession();
  const store = useUnfoldStore.getState();
  const headers = await getAuthHeaders();
  if (!isSyncSessionCurrent(session)) return;

  try {
    // Gather progressive devotionals to migrate
    const devotionals = store.devotionals.filter(
      (d) => d.generationMode === "progressive"
    );
    const arcsSucceeded = await reconcileSeriesArcs(session, headers, devotionals);
    if (!isSyncSessionCurrent(session)) return;

    // The versioned arc receipt is per devotional. It must run even on devices
    // whose legacy global migration marker was written after an ignored failure.
    if (mmkvStorage.getItem(MIGRATION_KEY) === "true") {
      if (!arcsSucceeded) logger.warn("[gen-migration] Arc reconciliation incomplete — will retry next launch");
      return;
    }

    let migrationSucceeded = arcsSucceeded;

    for (const devo of devotionals) {
      if (!isSyncSessionCurrent(session)) return;
      // Push progressive memory
      if (devo.progressiveMemory) {
        const stepSucceeded = await postMigrationStep(
          session,
          headers,
          "/api/jobs/migrate-memory",
          {
            devotionalId: devo.id,
            memory: buildMemoryPayload(devo.progressiveMemory),
          },
        );
        migrationSucceeded = migrationSucceeded && stepSucceeded;
      }
    }

    if (!isSyncSessionCurrent(session)) return;
    // Push used scriptures
    const scriptures = buildScripturesPayload(store);
    if (scriptures.length > 0) {
      const stepSucceeded = await postMigrationStep(
        session,
        headers,
        "/api/jobs/migrate-scriptures",
        { scriptures },
      );
      migrationSucceeded = migrationSucceeded && stepSucceeded;
    }

    if (!isSyncSessionCurrent(session)) return;
    // Push persona history
    const personas = store.seriesPersonaHistory ?? [];
    if (personas.length > 0) {
      const stepSucceeded = await postMigrationStep(
        session,
        headers,
        "/api/jobs/migrate-personas",
        { personas },
      );
      migrationSucceeded = migrationSucceeded && stepSucceeded;
    }

    if (!isSyncSessionCurrent(session)) return;
    if (!migrationSucceeded) {
      logger.warn("[gen-migration] Migration incomplete — will retry next launch");
      return;
    }

    // Mark migration complete
    assertSyncSessionCurrent(session, 'generation migration');
    mmkvStorage.setItem(MIGRATION_KEY, "true");
    logger.log("[gen-migration] Migration complete");
  } catch (err) {
    if (!isSyncSessionCurrent(session)) return;
    logger.warn("[gen-migration] Migration failed (will retry next launch):", err);
    // Don't mark complete — will retry on next app launch
  }
}
