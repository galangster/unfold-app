/**
 * At-most-one listener registration with safe disposal under races
 * (one-owner-per-os-resource). Wraps an async register() that resolves to a
 * Result whose data is the remover. Guarantees:
 *  - concurrent ensure() collapses to one register() call
 *  - dispose() during an in-flight register() invokes the remover the moment
 *    it lands (a registration is never stranded)
 *  - after dispose(), ensure() is a permanent no-op
 */
type RegisterResult<R> = { ok: true; data: R } | { ok: false; reason: string };

export function createSingleListenerGuard<R extends () => unknown>(
  register: () => Promise<RegisterResult<R>>,
) {
  let remover: R | undefined;
  let inFlight = false;
  let disposed = false;

  return {
    async ensure(): Promise<void> {
      if (remover || inFlight || disposed) return;
      inFlight = true;
      try {
        const result = await register();
        if (!result.ok) return;
        if (disposed || remover) {
          result.data(); // lost the race or unmounted — never strand it
          return;
        }
        remover = result.data;
      } finally {
        inFlight = false;
      }
    },
    dispose(): void {
      disposed = true;
      remover?.();
      remover = undefined;
    },
    hasListener(): boolean {
      return remover !== undefined;
    },
  };
}
