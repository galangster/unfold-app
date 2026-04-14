/**
 * Scripture ACK — shared types + payload validator for the WebView bridge.
 *
 * The journal editor posts ack messages via `window.ReactNativeWebView.postMessage`
 * after each scripture-insert attempt. The RN side routes those through
 * `ScriptureAckBridge.onEditorMessage` (declared in note-detail.tsx) which
 * must verify the message shape before dispatching to the handler ref.
 *
 * This module is pure — no React, no tentap-editor, no RN primitives — so
 * the validator is importable from Jest tests without dragging the WebView
 * module chain in. See note-content-parser.ts for the same pattern.
 *
 * See:
 *   - ~/vault/standards/ack-before-clearing-pending-state.md
 *   - ~/vault/gotchas/tentap-editor-bridge-quirks.md
 */

export const MAX_SCRIPTURE_INSERT_ATTEMPTS = 3;
export const SCRIPTURE_INSERT_TIMEOUT_MS = 3000;

export type ScriptureAckPayload = {
  ok: boolean;
  reference: string;
  attempts: number;
  error?: string;
};

export type ScriptureAckMessage = {
  type: 'scriptureInserted';
  payload: ScriptureAckPayload;
};

/**
 * Structural type guard for scripture ack messages posted from the WebView.
 *
 * Returns true only when the payload carries ALL of:
 *   - `type === 'scriptureInserted'`
 *   - `payload.ok` is a boolean
 *   - `payload.reference` is a string
 *   - `payload.attempts` is a number
 *
 * Everything else (nulls, wrong types, extra keys, malformed shapes) is
 * rejected. This runs on every `postMessage` from the editor, so it's on
 * the critical path of scripture-insertion reliability.
 */
export function isScriptureAckMessage(message: unknown): message is ScriptureAckMessage {
  if (message === null || typeof message !== 'object') return false;
  const m = message as { type?: unknown; payload?: unknown };
  if (m.type !== 'scriptureInserted') return false;
  if (m.payload === null || typeof m.payload !== 'object') return false;
  const p = m.payload as {
    ok?: unknown;
    reference?: unknown;
    attempts?: unknown;
  };
  if (typeof p.ok !== 'boolean') return false;
  if (typeof p.reference !== 'string') return false;
  if (typeof p.attempts !== 'number') return false;
  return true;
}
