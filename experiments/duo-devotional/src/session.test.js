import { describe, expect, test } from 'bun:test';
import { get } from 'svelte/store';
import { failSaving, normalizeSession, retrySave, savedRevision, saveState, session, updateDraft } from './session';

describe('browser session continuity', () => {
  test('retains valid responses when unrelated saved fields are malformed', () => {
    const recovered = normalizeSession({
      route: 'removed-screen',
      question: null,
      drafts: { q1: 'Keep this response.', q2: 17, q3: 'And this one.' },
      selections: { q1: [2, 8], q3: null },
      anchor: { id: '"]', offset: -20, inset: 'bad' }
    });
    expect(recovered.drafts).toEqual({ q1: 'Keep this response.', q2: '', q3: 'And this one.' });
    expect(recovered.selections.q1).toEqual([2, 8]);
    expect(recovered.selections.q3).toEqual([0, 0]);
    expect(recovered.route).toBe('today');
    expect(recovered.anchor).toEqual({ id: 'start', offset: 0, inset: 0 });
  });

  test('preserves a fractional reading inset above the viewport', () => {
    const recovered = normalizeSession({ anchor: { id: 'p5', offset: 128, inset: -6.25 } });
    expect(recovered.anchor).toEqual({ id: 'p5', offset: 128, inset: -6.25 });
  });

  test('keeps failed edits in memory and saves the newest revision on retry', () => {
    const writes = new Map();
    const previousStorage = globalThis.localStorage;
    globalThis.localStorage = {
      setItem(key, value) { writes.set(key, value); },
      getItem(key) { return writes.get(key) ?? null; }
    };
    try {
      session.set(normalizeSession(null));
      updateDraft('First response.');
      const durable = get(savedRevision);
      failSaving.set(true);
      updateDraft('Latest response.');
      expect(get(saveState)).toBe('failed');
      expect(get(session).drafts.q1).toBe('Latest response.');
      expect(get(savedRevision)).toBe(durable);
      retrySave();
      expect(get(saveState)).toBe('saved');
      expect(get(savedRevision)).toBe(durable + 1);
      const recovered = normalizeSession(JSON.parse(writes.get('unfold-duo-devotional-prototype-v1')));
      expect(recovered.drafts.q1).toBe('Latest response.');
      updateDraft('Latest response.');
      expect(get(savedRevision)).toBe(durable + 1);
    } finally {
      globalThis.localStorage = previousStorage;
      failSaving.set(false);
    }
  });
});
