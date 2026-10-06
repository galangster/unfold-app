import { assertSyncSessionCurrent, captureSyncSession, isSyncSessionCurrent, registerSyncTransport, SyncSessionInvalidatedError } from './sync-session-fence';

/** Owns one caller's lifetime; cancelling an observer never cancels shared work. */
export function createSyncOperation(options: {
  action: string;
  session?: number;
  deadlineAt?: number;
  signal?: AbortSignal;
  timeoutError?: Error;
}) {
  const session = options.session ?? captureSyncSession();
  const controller = new AbortController();
  const unregister = registerSyncTransport(controller);
  const timeoutError = options.timeoutError ?? new Error(`${options.action} timed out`);
  let expiresAt = options.deadlineAt ?? Infinity;
  let timedOut = false;
  let timer: ReturnType<typeof setTimeout> | undefined;
  let rejectInterrupted!: (error: Error) => void;
  const interrupted = new Promise<never>((_resolve, reject) => { rejectInterrupted = reject; });
  void interrupted.catch(() => {});
  const interruption = () => !isSyncSessionCurrent(session)
    ? new SyncSessionInvalidatedError(options.action)
    : timedOut ? timeoutError : new Error(`${options.action} cancelled`);
  const onAbort = () => rejectInterrupted(interruption());
  const cancel = () => controller.abort();
  controller.signal.addEventListener('abort', onAbort, { once: true });
  options.signal?.addEventListener('abort', cancel, { once: true });
  if (options.signal?.aborted) cancel();
  const setDeadlineAt = (at: number) => {
    expiresAt = at;
    clearTimeout(timer);
    if (Number.isFinite(at)) timer = setTimeout(() => { timedOut = true; cancel(); }, Math.max(0, at - Date.now()));
  };
  setDeadlineAt(expiresAt);
  const assertCurrent = () => {
    assertSyncSessionCurrent(session, options.action);
    if (Date.now() >= expiresAt) { timedOut = true; cancel(); }
    if (controller.signal.aborted) throw interruption();
  };
  return {
    signal: controller.signal, cancel, assertCurrent, setDeadlineAt,
    async wait<T>(pending: Promise<T>): Promise<T> {
      assertCurrent();
      const result = await Promise.race([pending, interrupted]);
      assertCurrent();
      return result;
    },
    dispose() {
      clearTimeout(timer);
      controller.signal.removeEventListener('abort', onAbort);
      options.signal?.removeEventListener('abort', cancel);
      unregister();
    },
  };
}
