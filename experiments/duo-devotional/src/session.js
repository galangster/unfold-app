import { get, writable } from 'svelte/store';
import { paragraphs, questions } from './content';

const storageKey = 'unfold-duo-devotional-prototype-v1';
const presentationKey = 'unfold-duo-devotional-prototype-v1-presentation';
const questionIds = questions.map(question => question.id);
const anchorIds = ['start', 'scripture', ...paragraphs.map(paragraph => paragraph.id), 'prayer'];
const poses = ['closed', 'flat-portrait', 'flat-landscape', 'book', 'upright', 'seated', 'standing'];
const typeScales = [1, 1.2, 1.5, 2];
const initial = {
  version: 1,
  id: 'remain-day-4',
  route: 'today',
  activePane: 'read',
  question: 'q1',
  drafts: { q1: '', q2: '', q3: '' },
  selections: { q1: [0, 0], q2: [0, 0], q3: [0, 0] },
  anchor: { id: 'start', offset: 0, inset: 0 },
  revision: 0,
  stay: 'passage',
  bookmark: false
};

function isMap(value) {
  return value !== null && Object.prototype.toString.call(value) === '[object Object]';
}

function isText(value) {
  return Object.prototype.toString.call(value) === '[object String]';
}

function asCount(value, fallback = 0) {
  const number = Number(value);
  if (!Number.isFinite(number) || number < 0) return fallback;
  return Math.floor(number);
}

function asDrafts(primary, secondary) {
  const drafts = { q1: '', q2: '', q3: '' };
  for (const id of questionIds) {
    if (isMap(primary) && isText(primary[id])) drafts[id] = primary[id];
    else if (isMap(secondary) && isText(secondary[id])) drafts[id] = secondary[id];
  }
  return drafts;
}

function asPair(value) {
  if (!Array.isArray(value) || value.length < 2) return [0, 0];
  return [asCount(value[0]), asCount(value[1])];
}

function asSelections(value) {
  const selections = { q1: [0, 0], q2: [0, 0], q3: [0, 0] };
  if (!isMap(value)) return selections;
  for (const id of questionIds) selections[id] = asPair(value[id]);
  return selections;
}

function asAnchor(value) {
  if (!isMap(value)) return { ...initial.anchor };
  const id = anchorIds.includes(value.id) ? value.id : initial.anchor.id;
  const inset = Number.isFinite(value.inset) ? value.inset : 0;
  return { id, offset: asCount(value.offset), inset };
}

function recover() {
  let saved = null;
  try {
    const raw = localStorage.getItem(storageKey);
    saved = raw ? JSON.parse(raw) : null;
  } catch {
    saved = null;
  }
  return normalizeSession(saved);
}

export function normalizeSession(saved) {
  if (!isMap(saved)) return structuredClone(initial);
  return {
    version: 1,
    id: initial.id,
    route: ['today', 'reading', 'stay'].includes(saved.route) ? saved.route : initial.route,
    activePane: ['read', 'reflect'].includes(saved.activePane) ? saved.activePane : initial.activePane,
    question: questionIds.includes(saved.question) ? saved.question : initial.question,
    drafts: asDrafts(saved.drafts, saved),
    selections: asSelections(saved.selections),
    anchor: asAnchor(saved.anchor),
    revision: asCount(saved.revision, initial.revision),
    stay: ['passage', 'prayer'].includes(saved.stay) ? saved.stay : initial.stay,
    bookmark: saved.bookmark === true
  };
}

const recovered = recover();
let lastSerialized = JSON.stringify(recovered);
let lastPresentation = '';

export const session = writable(recovered);
export const saveState = writable('saved');
export const savedRevision = writable(recovered.revision);
export const failSaving = writable(false);

function persist(current) {
  const serialized = JSON.stringify(current);
  if (serialized === lastSerialized) return;
  try {
    if (get(failSaving)) throw new Error('Prototype storage failure');
    localStorage.setItem(storageKey, serialized);
    lastSerialized = serialized;
    savedRevision.set(current.revision);
    saveState.set('saved');
  } catch {
    saveState.set('failed');
  }
}

session.subscribe(persist);

export function recoverPresentation() {
  const fallback = {
    pose: 'book',
    typeScale: 1,
    shortSpace: false,
    dark: window.matchMedia('(prefers-color-scheme: dark)').matches
  };
  let saved = null;
  try {
    const raw = localStorage.getItem(presentationKey);
    saved = raw ? JSON.parse(raw) : null;
  } catch {
    saved = null;
  }
  const next = !isMap(saved)
    ? fallback
    : {
        pose: poses.includes(saved.pose) ? saved.pose : fallback.pose,
        typeScale: typeScales.includes(saved.typeScale) ? saved.typeScale : fallback.typeScale,
        shortSpace: saved.shortSpace === true,
        dark: saved.dark === true || saved.dark === false ? saved.dark : fallback.dark
      };
  lastPresentation = JSON.stringify(next);
  return next;
}

export function persistPresentation(pose, typeScale, shortSpace, dark) {
  const serialized = JSON.stringify({ pose, typeScale, shortSpace, dark });
  if (serialized === lastPresentation) return;
  try {
    localStorage.setItem(presentationKey, serialized);
    lastPresentation = serialized;
  } catch {
    // The next preference change can retry a failed browser write.
  }
}

export function updateDraft(text) {
  session.update(current => current.drafts[current.question] === text ? current : ({
    ...current,
    drafts: { ...current.drafts, [current.question]: text },
    revision: current.revision + 1
  }));
}

export function rememberSelection(start, end) {
  session.update(current => {
    const [prevStart, prevEnd] = current.selections[current.question];
    if (prevStart === start && prevEnd === end) return current;
    return {
      ...current,
      selections: { ...current.selections, [current.question]: [start, end] }
    };
  });
}

export function setAnchor(anchor) {
  session.update(current => {
    const prev = current.anchor;
    if (prev.id === anchor.id && prev.offset === anchor.offset && prev.inset === anchor.inset) {
      return current;
    }
    return { ...current, anchor };
  });
}

export function setPane(activePane) {
  session.update(current => (current.activePane === activePane ? current : { ...current, activePane }));
}

export function selectQuestion(question) {
  session.update(current => {
    if (current.question === question && current.activePane === 'reflect') return current;
    return { ...current, question, activePane: 'reflect' };
  });
}

export function navigate(route) {
  session.update(current => (current.route === route ? current : { ...current, route }));
}

export function enterStay(stay) {
  session.update(current => ({ ...current, route: 'stay', activePane: 'read', stay }));
}

export function retrySave() {
  failSaving.set(false);
  persist(get(session));
}

export function toggleBookmark() {
  session.update(current => ({ ...current, bookmark: !current.bookmark }));
}
