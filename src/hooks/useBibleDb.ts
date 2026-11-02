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
  subscribeBibleDbStatus,
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
  // Start from the stored status. The file check below waits in Expo's shared
  // native queue, behind any slow notification call, and a reader with the
  // Bible installed must not be offered a download in the meantime.
  const [stored] = useState(getBibleDbStatus);
  const [status, setStatus] = useState<BibleDbStatus>(stored.status);
  const [progress, setProgress] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(stored.errorMessage);
  const isMountedRef = useRef<boolean>(true);
  const isFollowingDownloadRef = useRef<boolean>(false);

  const runDownload = useCallback(async (): Promise<boolean> => {
    isFollowingDownloadRef.current = true;
    setStatus('downloading');
    setProgress((current) => current ?? 0);
    setError(null);

    const success = await downloadBibleDb((p: number) => {
      if (isMountedRef.current) {
        setProgress(p);
      }
    });
    isFollowingDownloadRef.current = false;

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
  }, []);

  // Check status on mount, and follow every later change. Each screen runs its
  // own hook, and a change from one screen must reach the others.
  useEffect(() => {
    let cancelled = false;

    // A download that started elsewhere, such as on Today.
    const followDownload = () => {
      if (!isFollowingDownloadRef.current) {
        void runDownload();
      }
    };

    const unsubscribe = subscribeBibleDbStatus(() => {
      const meta = getBibleDbStatus();
      if (meta.status === 'downloading') {
        followDownload();
        return;
      }
      setStatus(meta.status);
      setError(meta.errorMessage);
    });

    const checkStatus = async () => {
      try {
        const verified = await verifyBibleDb();
        if (!cancelled && isMountedRef.current) {
          if (verified === 'downloading') {
            followDownload();
            return;
          }

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
      unsubscribe();
    };
  }, [runDownload]);

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

    return runDownload();
  }, [status, runDownload]);

  return {
    isReady: status === 'ready',
    isDownloading: status === 'downloading',
    progress,
    download,
    error,
    status,
  };
}
