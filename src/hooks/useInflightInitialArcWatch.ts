import { useEffect } from 'react';

import { pollJobStatus } from '@/lib/generation-api';
import type { InflightGenerationJob } from '@/lib/inflight-generation-job';
import { watchInflightInitialArc } from '@/lib/inflight-initial-arc-watch';
import { settleInflightInitialArcWatch } from '@/lib/initial-arc-result';
import { logger } from '@/lib/logger';

/**
 * While `enabled`, keep polling the first-series job the reader left behind on
 * /generating ("Go home — we'll keep writing") and land it in the store when it
 * finishes. Nothing else watches that job once /generating unmounts: without
 * this, Today sat on the new-user empty state with the devotional finishing
 * unseen on the server. The watch stops when `enabled` turns false or on
 * unmount and restarts from the same record when it turns true again.
 */
export function useInflightInitialArcWatch({
  job,
  enabled,
  onSettled,
}: {
  job: InflightGenerationJob | null;
  enabled: boolean;
  onSettled?: () => void;
}): void {
  const jobId = job?.jobId;
  const devotionalId = job?.devotionalId;
  const submittedAt = job?.submittedAt;

  useEffect(() => {
    if (!enabled || !jobId || submittedAt == null) return;

    let cancelled = false;
    void watchInflightInitialArc({
      jobId,
      fetchStatus: pollJobStatus,
      fallbackDevotionalId: devotionalId,
      startedAt: submittedAt,
      isCancelled: () => cancelled,
    })
      .then((outcome) => {
        if (cancelled || outcome.kind === 'cancelled') return;
        settleInflightInitialArcWatch(outcome, { jobId });
        onSettled?.();
      })
      .catch((err) => {
        logger.warn('[home] Inflight first-series watch stopped unexpectedly:', err);
      });

    return () => { cancelled = true; };
  }, [enabled, jobId, devotionalId, submittedAt, onSettled]);
}
