/**
 * One-time migration: push local progressive generation data to server.
 * Runs on first app launch after the server-side generation update.
 * Idempotent — safe to re-run if interrupted.
 */
import { mmkvStorage } from "./mmkv-storage";
import { useUnfoldStore } from "./store";
import { PRIMARY_BACKEND_URL, getAuthHeaders } from "./api-config";
import { logger } from "./logger";

/** Exported so full-reset can clear it — the migration is idempotent and re-runs after a wipe. */
export const MIGRATION_KEY = "generation-migration-v1-complete";

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
  headers: Record<string, string>,
  path: string,
  body: unknown,
): Promise<boolean> {
  try {
    const response = await fetch(`${PRIMARY_BACKEND_URL}${path}`, {
      method: "POST",
      headers,
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      logger.warn(`[gen-migration] ${path} failed with status ${response.status}`);
      return false;
    }

    return true;
  } catch (error) {
    logger.warn(`[gen-migration] ${path} request failed:`, error);
    return false;
  }
}

export async function migrateGenerationDataToServer(): Promise<void> {
  // Check if already migrated
  if (mmkvStorage.getItem(MIGRATION_KEY) === "true") return;

  const store = useUnfoldStore.getState();
  const headers = await getAuthHeaders();

  try {
    let migrationSucceeded = true;

    // Gather progressive devotionals to migrate
    const devotionals = store.devotionals.filter(
      (d) => d.generationMode === "progressive"
    );

    for (const devo of devotionals) {
      // Push series arc
      if (devo.seriesArc) {
        const stepSucceeded = await postMigrationStep(
          headers,
          "/api/jobs/migrate-arc",
          {
            devotionalId: devo.id,
            arc: devo.seriesArc,
          },
        );
        migrationSucceeded = migrationSucceeded && stepSucceeded;
      }

      // Push progressive memory
      if (devo.progressiveMemory) {
        const stepSucceeded = await postMigrationStep(
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

    // Push used scriptures
    const scriptures = buildScripturesPayload(store);
    if (scriptures.length > 0) {
      const stepSucceeded = await postMigrationStep(
        headers,
        "/api/jobs/migrate-scriptures",
        { scriptures },
      );
      migrationSucceeded = migrationSucceeded && stepSucceeded;
    }

    // Push persona history
    const personas = store.seriesPersonaHistory ?? [];
    if (personas.length > 0) {
      const stepSucceeded = await postMigrationStep(
        headers,
        "/api/jobs/migrate-personas",
        { personas },
      );
      migrationSucceeded = migrationSucceeded && stepSucceeded;
    }

    if (!migrationSucceeded) {
      logger.warn("[gen-migration] Migration incomplete — will retry next launch");
      return;
    }

    // Mark migration complete
    mmkvStorage.setItem(MIGRATION_KEY, "true");
    logger.log("[gen-migration] Migration complete");
  } catch (err) {
    logger.warn("[gen-migration] Migration failed (will retry next launch):", err);
    // Don't mark complete — will retry on next app launch
  }
}
