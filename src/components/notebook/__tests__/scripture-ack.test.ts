/**
 * Tests for the scripture ACK structural validator.
 *
 * `isScriptureAckMessage` runs on every `postMessage` from the tentap
 * WebView, so it sits on the critical path of scripture-insertion
 * reliability. Structural mistakes here would silently drop valid ack
 * messages (breaking retries) or accept malformed ones (corrupting the
 * handler). This suite exercises the full matrix of malformed shapes.
 *
 * Imports from `../scripture-ack` directly (not note-detail.tsx) so the
 * test stays pure and doesn't need the tentap-editor module chain —
 * same pattern as NoteContentView.test.ts.
 */

import {
  isScriptureAckMessage,
  MAX_SCRIPTURE_INSERT_ATTEMPTS,
  SCRIPTURE_INSERT_TIMEOUT_MS,
  type ScriptureAckMessage,
} from '../scripture-ack';

describe('isScriptureAckMessage — happy path', () => {
  it('accepts a canonical success ack', () => {
    const msg: ScriptureAckMessage = {
      type: 'scriptureInserted',
      payload: { ok: true, reference: 'Hebrews 11:1', attempts: 1 },
    };
    expect(isScriptureAckMessage(msg)).toBe(true);
  });

  it('accepts a canonical failure ack with error string', () => {
    const msg: ScriptureAckMessage = {
      type: 'scriptureInserted',
      payload: {
        ok: false,
        reference: 'Hebrews 11:1',
        attempts: 3,
        error: 'inject failed',
      },
    };
    expect(isScriptureAckMessage(msg)).toBe(true);
  });

  it('accepts an ack with attempts === 0', () => {
    expect(
      isScriptureAckMessage({
        type: 'scriptureInserted',
        payload: { ok: true, reference: 'John 3:16', attempts: 0 },
      }),
    ).toBe(true);
  });

  it('accepts an ack with empty-string reference', () => {
    // Not semantically meaningful, but structurally valid — validator is
    // a type guard, not a business-rule enforcer.
    expect(
      isScriptureAckMessage({
        type: 'scriptureInserted',
        payload: { ok: false, reference: '', attempts: 1 },
      }),
    ).toBe(true);
  });

  it('narrows type correctly for TypeScript consumers', () => {
    const raw: unknown = {
      type: 'scriptureInserted',
      payload: { ok: true, reference: 'Psalm 23:1', attempts: 2 },
    };
    if (isScriptureAckMessage(raw)) {
      // If this branch compiles, the type guard is narrowing correctly.
      const ref: string = raw.payload.reference;
      const attempts: number = raw.payload.attempts;
      const ok: boolean = raw.payload.ok;
      expect(ref).toBe('Psalm 23:1');
      expect(attempts).toBe(2);
      expect(ok).toBe(true);
    } else {
      throw new Error('type guard rejected a valid message');
    }
  });
});

describe('isScriptureAckMessage — message-level rejections', () => {
  it('rejects null', () => {
    expect(isScriptureAckMessage(null)).toBe(false);
  });

  it('rejects undefined', () => {
    expect(isScriptureAckMessage(undefined)).toBe(false);
  });

  it('rejects primitives (string, number, boolean)', () => {
    expect(isScriptureAckMessage('scriptureInserted')).toBe(false);
    expect(isScriptureAckMessage(42)).toBe(false);
    expect(isScriptureAckMessage(true)).toBe(false);
  });

  it('rejects arrays', () => {
    expect(isScriptureAckMessage([])).toBe(false);
    expect(
      isScriptureAckMessage([
        { type: 'scriptureInserted', payload: { ok: true, reference: 'x', attempts: 1 } },
      ]),
    ).toBe(false);
  });

  it('rejects objects with wrong type field', () => {
    expect(
      isScriptureAckMessage({
        type: 'scriptureDeleted',
        payload: { ok: true, reference: 'x', attempts: 1 },
      }),
    ).toBe(false);
  });

  it('rejects objects with missing type field', () => {
    expect(
      isScriptureAckMessage({
        payload: { ok: true, reference: 'x', attempts: 1 },
      }),
    ).toBe(false);
  });

  it('rejects objects with non-string type field', () => {
    expect(
      isScriptureAckMessage({
        type: 42,
        payload: { ok: true, reference: 'x', attempts: 1 },
      }),
    ).toBe(false);
  });
});

describe('isScriptureAckMessage — payload-level rejections', () => {
  it('rejects when payload is missing', () => {
    expect(isScriptureAckMessage({ type: 'scriptureInserted' })).toBe(false);
  });

  it('rejects when payload is null', () => {
    expect(isScriptureAckMessage({ type: 'scriptureInserted', payload: null })).toBe(false);
  });

  it('rejects when payload is a primitive', () => {
    expect(isScriptureAckMessage({ type: 'scriptureInserted', payload: 'ok' })).toBe(false);
    expect(isScriptureAckMessage({ type: 'scriptureInserted', payload: 1 })).toBe(false);
    expect(isScriptureAckMessage({ type: 'scriptureInserted', payload: true })).toBe(false);
  });

  it('rejects when payload is an array', () => {
    expect(isScriptureAckMessage({ type: 'scriptureInserted', payload: [] })).toBe(false);
  });
});

describe('isScriptureAckMessage — field-level rejections', () => {
  it('rejects when ok is missing', () => {
    expect(
      isScriptureAckMessage({
        type: 'scriptureInserted',
        payload: { reference: 'x', attempts: 1 },
      }),
    ).toBe(false);
  });

  it('rejects when ok is not a boolean', () => {
    expect(
      isScriptureAckMessage({
        type: 'scriptureInserted',
        payload: { ok: 'true', reference: 'x', attempts: 1 },
      }),
    ).toBe(false);
    expect(
      isScriptureAckMessage({
        type: 'scriptureInserted',
        payload: { ok: 1, reference: 'x', attempts: 1 },
      }),
    ).toBe(false);
    expect(
      isScriptureAckMessage({
        type: 'scriptureInserted',
        payload: { ok: null, reference: 'x', attempts: 1 },
      }),
    ).toBe(false);
  });

  it('rejects when reference is missing', () => {
    expect(
      isScriptureAckMessage({
        type: 'scriptureInserted',
        payload: { ok: true, attempts: 1 },
      }),
    ).toBe(false);
  });

  it('rejects when reference is not a string', () => {
    expect(
      isScriptureAckMessage({
        type: 'scriptureInserted',
        payload: { ok: true, reference: 42, attempts: 1 },
      }),
    ).toBe(false);
    expect(
      isScriptureAckMessage({
        type: 'scriptureInserted',
        payload: { ok: true, reference: null, attempts: 1 },
      }),
    ).toBe(false);
  });

  it('rejects when attempts is missing', () => {
    expect(
      isScriptureAckMessage({
        type: 'scriptureInserted',
        payload: { ok: true, reference: 'x' },
      }),
    ).toBe(false);
  });

  it('rejects when attempts is not a number', () => {
    expect(
      isScriptureAckMessage({
        type: 'scriptureInserted',
        payload: { ok: true, reference: 'x', attempts: '3' },
      }),
    ).toBe(false);
    expect(
      isScriptureAckMessage({
        type: 'scriptureInserted',
        payload: { ok: true, reference: 'x', attempts: null },
      }),
    ).toBe(false);
  });

  it('accepts extra fields gracefully (e.g., error on success)', () => {
    // Extra keys do not cause rejection — the validator checks that the
    // required fields are present and typed correctly, not that the
    // object is exactly the canonical shape.
    expect(
      isScriptureAckMessage({
        type: 'scriptureInserted',
        payload: { ok: true, reference: 'x', attempts: 1, extra: 'ignored' },
      }),
    ).toBe(true);
  });
});

describe('scripture-ack constants', () => {
  it('MAX_SCRIPTURE_INSERT_ATTEMPTS is a positive integer', () => {
    expect(Number.isInteger(MAX_SCRIPTURE_INSERT_ATTEMPTS)).toBe(true);
    expect(MAX_SCRIPTURE_INSERT_ATTEMPTS).toBeGreaterThan(0);
  });

  it('SCRIPTURE_INSERT_TIMEOUT_MS is a positive number', () => {
    expect(typeof SCRIPTURE_INSERT_TIMEOUT_MS).toBe('number');
    expect(SCRIPTURE_INSERT_TIMEOUT_MS).toBeGreaterThan(0);
  });
});
