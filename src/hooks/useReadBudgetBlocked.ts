import { useSyncExternalStore } from 'react';

import { readBudgetRetryAfterMs, subscribeReadBudget } from '@/lib/sync-pull-backoff';

function isReadBudgetBlocked(): boolean {
  return readBudgetRetryAfterMs() > 0;
}

export function useReadBudgetBlocked(): boolean {
  return useSyncExternalStore(subscribeReadBudget, isReadBudgetBlocked, isReadBudgetBlocked);
}
