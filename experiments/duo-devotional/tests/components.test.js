import { afterEach, beforeEach, expect, test } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/svelte';
import { tick } from 'svelte';
import { get } from 'svelte/store';
import App from '../src/App.svelte';
import ReadingPane from '../src/ReadingPane.svelte';
import ReflectionPane from '../src/ReflectionPane.svelte';
import { failSaving, normalizeSession, session, setAnchor } from '../src/session';
import { clearFrames, finishFrame, readingGeometry } from './dom-setup';

beforeEach(() => {
  localStorage.clear();
  failSaving.set(false);
  session.set(normalizeSession({ route: 'reading', activePane: 'reflect' }));
});

afterEach(() => {
  cleanup();
  clearFrames();
});

test('question drafts and selections survive concealment and question changes', async () => {
  const view = render(ReflectionPane);
  const editor = screen.getByRole('textbox');
  editor.focus();
  await fireEvent.input(editor, { target: { value: 'Keep this first response.' } });
  editor.setSelectionRange(2, 8);
  await fireEvent.select(editor);
  await view.rerender({ hidden: true });
  await view.rerender({ hidden: false });
  expect(editor.selectionStart).toBe(2);
  expect(editor.selectionEnd).toBe(8);

  await fireEvent.click(screen.getByRole('button', { name: /What would it mean/ }));
  expect(editor.value).toBe('');
  await fireEvent.input(editor, { target: { value: 'A separate second response.' } });
  await fireEvent.click(screen.getByRole('button', { name: /Where are you trying/ }));
  expect(editor.value).toBe('Keep this first response.');
  expect([editor.selectionStart, editor.selectionEnd]).toEqual([2, 8]);
  expect(document.activeElement).toBe(editor);
});

test('composition completes in its original question before a requested switch', async () => {
  render(ReflectionPane);
  const editor = screen.getByRole('textbox');
  editor.focus();
  await fireEvent.compositionStart(editor);
  await fireEvent.input(editor, { target: { value: '信頼する' } });
  await fireEvent.click(screen.getByRole('button', { name: /What would it mean/ }));
  expect(get(session).question).toBe('q1');
  await fireEvent.compositionEnd(editor);
  expect(get(session).drafts.q1).toBe('信頼する');
  expect(get(session).question).toBe('q2');
  expect(editor.value).toBe('');
});

test('presentation changes and Today preserve the active response and editor instance', async () => {
  render(App);
  const editor = screen.getByRole('textbox');
  editor.focus();
  await fireEvent.input(editor, { target: { value: 'A response across every arrangement.' } });
  editor.setSelectionRange(2, 6);
  await fireEvent.select(editor);
  for (const value of ['closed', 'flat-portrait', 'flat-landscape', 'book', 'upright', 'seated', 'standing']) {
    await fireEvent.change(screen.getByLabelText('Preview position'), { target: { value } });
    expect(get(session).route).toBe('reading');
    expect(get(session).activePane).toBe('reflect');
    expect(screen.getByRole('textbox')).toBe(editor);
    expect([editor.selectionStart, editor.selectionEnd]).toEqual([2, 6]);
  }
  await fireEvent.change(screen.getByLabelText('Preview text size'), { target: { value: '2' } });
  await fireEvent.change(screen.getByLabelText('Available height'), { target: { value: 'short' } });
  await fireEvent.click(screen.getByRole('button', { name: 'Back to Today' }));
  expect(document.activeElement.id).toBe('today-heading');
  await fireEvent.click(screen.getByRole('button', { name: /Continue your reflection/ }));
  expect(screen.getByRole('textbox')).toBe(editor);
  expect(editor.value).toBe('A response across every arrangement.');
  expect([editor.selectionStart, editor.selectionEnd]).toEqual([2, 6]);
  await fireEvent.click(screen.getByRole('button', { name: 'Read', exact: true }));
  await waitFor(() => expect(document.activeElement.id).toBe('reading-pane'));
  expect(get(session).activePane).toBe('read');
});

test('save retry restores editor focus and the latest response', async () => {
  render(ReflectionPane);
  const editor = screen.getByRole('textbox');
  editor.focus();
  failSaving.set(true);
  await fireEvent.input(editor, { target: { value: 'Keep the most recent edit.' } });
  const retry = screen.getByRole('button', { name: 'Retry save' });
  retry.focus();
  await fireEvent.click(retry);
  expect(document.activeElement).toBe(editor);
  expect(screen.getByRole('status').textContent).toBe('Saved on this device');
  expect(JSON.parse(localStorage.getItem('unfold-duo-devotional-prototype-v1')).drafts.q1).toBe(editor.value);
});

test.each(['another restore', 'collapse'])('scroll input during restoration survives %s', async boundary => {
  const view = render(ReadingPane);
  const scroller = document.getElementById('reading-pane');
  const resetGeometry = readingGeometry(scroller);
  try {
    setAnchor({ id: 'p5', offset: 128, inset: 24 });
    await view.component.restore();
    finishFrame();
    await tick();
    const previousPlace = scroller.scrollTop;
    await view.component.restore();
    await fireEvent.scroll(scroller); // The programmatic event must not drift the anchor.
    expect(get(session).anchor).toEqual({ id: 'p5', offset: 128, inset: 24 });
    scroller.scrollTop += 90;
    await fireEvent.scroll(scroller); // User input arrives before the restoration frame ends.
    if (boundary === 'collapse') {
      view.component.capture();
      await view.rerender({ hidden: true });
      await view.rerender({ hidden: false });
    } else {
      await view.component.restore();
    }
    finishFrame();
    await tick();
    expect(get(session).anchor.offset).toBeGreaterThan(128);
    expect(get(session).activePane).toBe('read');
    scroller.scrollTop = 0;
    await view.component.restore();
    expect(scroller.scrollTop).toBe(previousPlace + 90);
  } finally {
    resetGeometry();
  }
});
