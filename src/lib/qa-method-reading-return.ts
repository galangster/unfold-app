import { useSyncExternalStore } from 'react';
import { getScripturePractice } from '@/constants/scripture-practices';
import { isScripturePracticeEnabled } from '@/lib/scripture-practice-feature';

export interface QaMethodReadingReturn {
  methodId: string;
}

let current: QaMethodReadingReturn | null = null;
const listeners = new Set<() => void>();

function isMethodId(value: unknown): value is string {
  return typeof value === 'string' && getScripturePractice(value) != null;
}

function emit(): void {
  for (const listener of listeners) listener();
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function setQaMethodReadingReturn(methodId: string): boolean {
  if (!isScripturePracticeEnabled() || !isMethodId(methodId)) {
    return false;
  }
  current = { methodId };
  emit();
  return true;
}

export function getQaMethodReadingReturn(): QaMethodReadingReturn | null {
  return current;
}

export function clearQaMethodReadingReturn(): void {
  if (current === null) return;
  current = null;
  emit();
}

export function resolveQaMethodReadingReturn(): QaMethodReadingReturn | null {
  if (!isScripturePracticeEnabled() || !current || !isMethodId(current.methodId)) {
    return null;
  }
  return current;
}

export function useQaMethodReadingReturn(): QaMethodReadingReturn | null {
  return useSyncExternalStore(subscribe, resolveQaMethodReadingReturn, resolveQaMethodReadingReturn);
}
