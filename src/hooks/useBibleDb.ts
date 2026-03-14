/**
 * useBibleDb — Bible Database Readiness Hook
 *
 * Checks whether the offline Bible database is downloaded and ready.
 * Provides a download trigger with progress tracking.
 *
 * Usage:
 *   const { isReady, isDownloading, progress, download, error } = useBibleDb();
 *
 *   if (!isReady) {
 *     return <DownloadPrompt onPress={download} progress={progress} />;
 *   }
 */

import { useState, useEffect, useCallback, useRef } from 'react';
import {
  getBibleDbStatus,
  verifyBibleDb,
  downloadBibleDb,
  type BibleDbStatus,
} from '@/lib/bible-db';
import { logger } from '@/lib/logger';

export interface UseBibleDbReturn {
  /** Database is downloaded, verified, and ready to query */
  isReady: boolean;
  /** Download is currently in progress */
  isDownloading: boolean;
  /** Download progress (0-1), null when not downloading */
  progress: number | null;
  /** Start downloading the database */
  download: () => Promise<boolean>;
  /** Error message from the last failed download, or null */
  error: string | null;
  /** Raw status string for debugging */
  status: BibleDbStatus;
}

export function useBibleDb(): UseBibleDbReturn {
  const [status, setStatus] = useState<BibleDbStatus>('not_downloaded');
  const [progress, setProgress] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const isMountedRef = useRef<boolean>(true);

  // Check status on mount
  useEffect(() => {
    let cancelled = false;

    const checkStatus = async () => {
      try {
        const verified = await verifyBibleDb();
        if (!cancelled && isMountedRef.current) {
          setStatus(verified);

          // If status is 'error', pull the error message from meta
          if (verified === 'error') {
            const meta = getBibleDbStatus();
            setError(meta.errorMessage);
          }
        }
      } catch (err: unknown) {
        if (!cancelled && isMountedRef.current) {
          const message = err instanceof Error ? err.message : 'Status check failed';
          logger.error('[useBibleDb] Status check failed:', message);
          setStatus('error');
          setError(message);
        }
      }
    };

    checkStatus();

    return () => {
      cancelled = true;
    };
  }, []);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      isMountedRef.current = false;
    };
  }, []);

  const download = useCallback(async (): Promise<boolean> => {
    if (status === 'downloading') {
      logger.warn('[useBibleDb] Download already in progress');
      return false;
    }

    setStatus('downloading');
    setProgress(0);
    setError(null);

    const success = await downloadBibleDb((p: number) => {
      if (isMountedRef.current) {
        setProgress(p);
      }
    });

    if (!isMountedRef.current) return success;

    if (success) {
      setStatus('ready');
      setProgress(null);
      setError(null);
      logger.log('[useBibleDb] Download complete');
    } else {
      const meta = getBibleDbStatus();
      setStatus('error');
      setProgress(null);
      setError(meta.errorMessage ?? 'Download failed');
      logger.error('[useBibleDb] Download failed:', meta.errorMessage);
    }

    return success;
  }, [status]);

  return {
    isReady: status === 'ready',
    isDownloading: status === 'downloading',
    progress,
    download,
    error,
    status,
  };
}
