/**
 * One-time migration: push local progressive generation data to server.
 * Runs on first app launch after the server-side generation update.
 * Idempotent — safe to re-run if interrupted.
 */
import { mmkvStorage } from "./mmkv-storage";
import { useUnfoldStore } from "./store";
import { PRIMARY_BACKEND_URL, getAuthHeaders } from "./api-config";
import { logger } from "./logger";

const MIGRATION_KEY = "generation-migration-v1-complete";

export async function migrateGenerationDataToServer(): Promise<void> {
  // Check if already migrated
  if (mmkvStorage.getItem(MIGRATION_KEY) === "true") return;

  const store = useUnfoldStore.getState();
  const headers = await getAuthHeaders();

  try {
    // Gather progressive devotionals to migrate
    const devotionals = store.devotionals.filter(
      (d) => d.generationMode === "progressive"
    );

    for (const devo of devotionals) {
      // Push series arc
      if (devo.seriesArc) {
        await fetch(`${PRIMARY_BACKEND_URL}/api/jobs/migrate-arc`, {
          method: "POST",
          headers,
          body: JSON.stringify({
            devotionalId: devo.id,
            arc: devo.seriesArc,
          }),
        }).catch(() => {});
      }

      // Push progressive memory
      if (devo.progressiveMemory) {
        await fetch(`${PRIMARY_BACKEND_URL}/api/jobs/migrate-memory`, {
          method: "POST",
          headers,
          body: JSON.stringify({
            devotionalId: devo.id,
            memory: devo.progressiveMemory,
          }),
        }).catch(() => {});
      }
    }

    // Push used scriptures
    const scriptures = store.usedScriptures ?? [];
    if (scriptures.length > 0) {
      await fetch(`${PRIMARY_BACKEND_URL}/api/jobs/migrate-scriptures`, {
        method: "POST",
        headers,
        body: JSON.stringify({ scriptures }),
      }).catch(() => {});
    }

    // Push persona history
    const personas = store.seriesPersonaHistory ?? [];
    if (personas.length > 0) {
      await fetch(`${PRIMARY_BACKEND_URL}/api/jobs/migrate-personas`, {
        method: "POST",
        headers,
        body: JSON.stringify({ personas }),
      }).catch(() => {});
    }

    // Mark migration complete
    mmkvStorage.setItem(MIGRATION_KEY, "true");
    logger.log("[gen-migration] Migration complete");
  } catch (err) {
    logger.warn("[gen-migration] Migration failed (will retry next launch):", err);
    // Don't mark complete — will retry on next app launch
  }
}
