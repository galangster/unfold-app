/**
 * useCopyConfirmation — copies text to the clipboard and holds the short
 * confirmation that follows.
 *
 * After a write that succeeds, `copied` stays true for COPY_CONFIRMATION_MS,
 * counted from the last copy, and a screen reader hears "Copied". A write that
 * fails confirms nothing. A write that lands after a reset, an unmount, or a
 * later copy changes nothing.
 *
 * The text goes to the clipboard and nowhere else: not to a log line, an
 * analytics event, or an accessibility label.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { AccessibilityInfo } from 'react-native';
import * as Clipboard from 'expo-clipboard';
import { useLatestRequest } from '@/hooks/useLatestRequest';

export const COPY_CONFIRMATION_MS = 2000;
/** What a screen reader hears, and what a copy confirmation says. */
export const COPIED_MESSAGE = 'Copied';

export interface CopyConfirmation {
  copied: boolean;
  /** Does not reject. Resolves true when the clipboard took the text. A
   *  write that fails leaves `copied` as it was. */
  copy: (text: string) => Promise<boolean>;
  /** Ends the confirmation now. A write still on its way confirms nothing. */
  reset: () => void;
}

export function useCopyConfirmation(): CopyConfirmation {
  const [copied, setCopied] = useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const request = useLatestRequest();

  const reset = useCallback(() => {
    request.invalidate();
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = null;
    setCopied(false);
  }, [request]);

  // The cleanup ends the confirmation with its timer. A component that React
  // hides and shows again does not come back with the check mark on.
  useEffect(() => reset, [reset]);

  const copy = useCallback(async (text: string) => {
    const isCurrent = request.begin();
    let didCopy = false;
    try {
      didCopy = await Clipboard.setStringAsync(text);
    } catch {
      // The clipboard refused the write. There is nothing to confirm.
    }
    if (!didCopy || !isCurrent()) return didCopy;

    setCopied(true);
    AccessibilityInfo.announceForAccessibility(COPIED_MESSAGE);
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => {
      timerRef.current = null;
      setCopied(false);
    }, COPY_CONFIRMATION_MS);
    return true;
  }, [request]);

  return { copied, copy, reset };
}
