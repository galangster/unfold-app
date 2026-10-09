import React, { useCallback, useEffect, useLayoutEffect, useRef, useMemo, useState } from 'react';
import type { RefObject } from 'react';
import { AccessibilityInfo, View, StyleSheet, Dimensions, PixelRatio, Platform, Share } from 'react-native';
import { WebView } from 'react-native-webview';
import * as Haptics from 'expo-haptics';
import { useTheme } from '@/lib/theme';
import { useReadingFont } from '@/lib/useReadingFont';
import { FONT_SIZE_VALUES, FontSize, DevotionalDay, Highlight, HighlightColor, Bookmark, HIGHLIGHT_COLOR_LABELS, useUnfoldStore } from '@/lib/store';
import type { LiveHighlight } from '@/lib/store';
import { logger } from '@/lib/logger';
import { stripOuterQuotes } from '@/lib/cn';
import { isStructuredWordStudy, normalizeWordStudy } from '@/lib/word-study';
import { DISPLAY_SERIF_WOFF2_BASE64 } from '@/lib/display-font-base64';
import { RANGY_BUNDLE } from './rangy-bundle';
import { highlightInk, highlighterStroke, HIGHLIGHT_STROKE_FIT, webFontNameFor } from '@/constants/bible-highlight-colors';
import { parseWebViewLayoutGeneration, parseWebViewParagraphYs, WEBVIEW_COLLECT_PARAGRAPH_YS_JS } from '@/lib/reader-scroll-anchor';
import { useDevotionalWebFont } from '@/lib/devotional-web-fonts';
import {
  bookmarkIdentity,
  bookmarkIdentityToken,
  bookmarkKindFromBoxType,
  findBookmarkByIdentity,
  storedReferenceFor,
  storedScripturePhrase,
} from '@/lib/bookmark-identity';
import type { BookmarkKind, BoxBookmarkKind } from '@/lib/bookmark-identity';
import { bookmarkPageWords } from '@/lib/bookmark-landing';
import { READER_WORDS_PAGE_JS } from '@/lib/reader-words';
import { formatSelectionShareText, unwrapQuotes } from '@/lib/selection-share';
import { COPIED_MESSAGE, copyText } from '@/hooks/useCopyConfirmation';
import { useScreenReaderEnabled } from '@/hooks/useScreenReaderEnabled';
import { escapeHtml, renderDevotionalInline } from './devotional-text-html';
import { TAP_MAX_MS, TAP_SLOP_PX } from './useSelectionBarOutsideTap';

/** The document is the source of truth: every mutation reports the diff of
 *  live highlights before and after, and the store reconciles from it. */
/** A change sent to the live page: an Undo, or (reason `replay`) a late change replayed forward. */
type PageChange = Pick<HighlightsChangedEvent, 'added' | 'removed' | 'docId'> & { reason?: 'replay' };

export interface HighlightsChangedEvent {
  /** `replay`: a change an older page of the same content posted too late, applied here. */
  reason: 'create' | 'remove' | 'recolor' | 'undo' | 'heal' | 'replay';
  removed: LiveHighlight[];
  added: LiveHighlight[];
  /** Serial of the highlight the person acted on (create / recolor). */
  primarySerial: string;
  /** True for undo replays — reconcile the store, show no toast. */
  silent: boolean;
  /** The document that produced the change. Undo replays it into that document only. */
  docId: string;
}

/** Imperative handle for the reader screen (undo). */
export interface DevotionalWebViewCommands {
  /** Apply the inverse of a reported change to the document. The resulting
   *  diff comes back through `onHighlightsChanged` with `silent: true`. The
   *  change replays by character position, so it is dropped once the
   *  document that produced it is gone (new text for the same day). */
  applyInverse: (change: Pick<HighlightsChangedEvent, 'added' | 'removed' | 'docId'>) => void;
  /** Flash and report the y of a stored highlight in the live document
   *  (reader Highlights sheet). Resolves through `onTargetHighlightLocated`. */
  scrollToHighlight: (highlight: Highlight) => void;
  /** Place an open selection bar again. The reader calls it when a scroll
   *  it ran itself (a reflow restore after an Aa change, a jump) ends: the
   *  visible band the bar was placed in moved with that scroll. */
  refreshSelectionBar: () => void;
  /** Close an open selection bar and clear its selection. The reader calls it
   *  for a tap on one of its own views, outside the page. */
  closeSelectionBar: () => void;
}

interface DevotionalWebViewProps {
  day: DevotionalDay;
  fontSize: FontSize;
  onHighlightsChanged?: (event: HighlightsChangedEvent) => void;
  /** The selection could not be turned into a highlight (nothing stored). */
  onHighlightFailed?: () => void;
  /** Stored highlights whose text no longer exists in this document. They
   *  stay in the store; the reader just cannot show them. */
  onHighlightsLost?: (serials: string[]) => void;
  commandRef?: React.MutableRefObject<DevotionalWebViewCommands | null>;
  existingHighlights?: Highlight[];
  targetHighlight?: Highlight | null;
  onTargetHighlightLocated?: (y: number) => void;
  onContentLocations?: (paragraphYs: number[], layoutGeneration: number) => void;
  onLayoutGenerationCommitted?: (layoutGeneration: number) => void;
  layoutGeneration?: number;
  targetBookmark?: Bookmark | null;
  onTargetBookmarkLocated?: (y: number) => void;
  /** The page could not find the target bookmark's words. */
  onTargetBookmarkMissing?: () => void;
  onScriptureTap?: (reference: string) => void;
  devotionalId?: string;
  devotionalTitle?: string;
  dayNumber?: number;
  dayTitle?: string;
  bookmarks?: Bookmark[];
  /** The view with the frame of the reader's scroll viewport. The selection
   *  bar flips below a selection that has no room above inside it. Without
   *  it, the window stands in. */
  viewportRef?: RefObject<View | null>;
}

const CONTENT_PADDING = 24;

/** Android keeps its native selection menu; iOS draws the selection bar in the page. */
const IS_ANDROID = Platform.OS === 'android';

// System Dynamic Type is layered on top of the reader's own Aa font-size
// choice, capped so a very large system setting can't blow up the layout.
const MAX_SYSTEM_FONT_SCALE = 1.6;

/** Clamp the system font scale to a sane multiplier for the reader body text. */
export function clampSystemFontScale(scale: number): number {
  if (!Number.isFinite(scale) || scale <= 0) return 1;
  return Math.min(scale, MAX_SYSTEM_FONT_SCALE);
}

/** Stable empty default for `existingHighlights` — an inline `= []` default
 *  mints a new array identity on every render, invalidating the injected-JS
 *  memo below and re-injecting script into the WebView for free. */
const NO_HIGHLIGHTS: Highlight[] = [];
const NO_BOOKMARKS: Bookmark[] = [];

/** iOS: the page draws the selection bar, so the system edit menu, Look Up
 *  and Writing Tools stay off ('all' comes from the react-native-webview
 *  patch). No menuItems: they would bring back the long-press-only menu. */
const IOS_SUPPRESS_MENU_ITEMS: ['all'] = ['all'];

type SelectionAction = 'highlight' | 'bookmark' | 'share' | 'copy';

/** The four selection actions, in order: the buttons of the iOS bar and the
 *  items of the Android menu. Android keeps a native menu; custom entries
 *  REPLACE it (react-native-webview semantics), and each key runs the same
 *  page path as the matching button of the iOS bar. */
const SELECTION_ACTIONS: { key: SelectionAction; label: string }[] = [
  { key: 'highlight', label: 'Highlight' },
  { key: 'bookmark', label: 'Bookmark' },
  { key: 'share', label: 'Share' },
  { key: 'copy', label: 'Copy' },
];

/** The app's name for the place that lists bookmarks. */
const BOOKMARK_SAVED_MESSAGE = 'Saved to My library';
/** The store keeps one bookmark per identity: the same prose words, or any
 *  words from a Scripture passage that is already saved, add nothing. */
const BOOKMARK_EXISTS_MESSAGE = 'Already in My library';

/** Phosphor (regular weight, 256 viewBox) paths for the selection bar, the
 *  same icon set phosphor-react-native draws elsewhere in the app. */
const BAR_ICON_PATHS = {
  highlight: 'M253.66 106.34a8 8 0 0 0-11.32 0L192 156.69 107.31 72l50.35-50.34a8 8 0 1 0-11.32-11.32L96 60.69a16 16 0 0 0-2.82 18.81L72 100.69a16 16 0 0 0 0 22.62l4.69 4.69-58.35 58.34a8 8 0 0 0 3.13 13.25l72 24A7.9 7.9 0 0 0 96 224a8 8 0 0 0 5.66-2.34L136 187.31l4.69 4.69a16 16 0 0 0 22.62 0l21.19-21.18a16 16 0 0 0 18.81-2.82l50.35-50.34a8 8 0 0 0 0-11.32M93.84 206.85l-55-18.35L88 139.31 124.69 176ZM152 180.69 83.31 112 104 91.31 172.69 160Z',
  bookmark: 'M184 32H72a16 16 0 0 0-16 16v176a8 8 0 0 0 12.24 6.78L128 193.43l59.77 37.35A8 8 0 0 0 200 224V48a16 16 0 0 0-16-16m0 177.57-51.77-32.35a8 8 0 0 0-8.48 0L72 209.57V48h112Z',
  share: 'M224 144v64a8 8 0 0 1-8 8H40a8 8 0 0 1-8-8v-64a8 8 0 0 1 16 0v56h160v-56a8 8 0 0 1 16 0M93.66 77.66 120 51.31V144a8 8 0 0 0 16 0V51.31l26.34 26.35a8 8 0 0 0 11.32-11.32l-40-40a8 8 0 0 0-11.32 0l-40 40a8 8 0 0 0 11.32 11.32',
  copy: 'M216 32H88a8 8 0 0 0-8 8v40H40a8 8 0 0 0-8 8v128a8 8 0 0 0 8 8h128a8 8 0 0 0 8-8v-40h40a8 8 0 0 0 8-8V40a8 8 0 0 0-8-8m-56 176H48V96h112Zm48-48h-32V88a8 8 0 0 0-8-8H96V48h112Z',
  back: 'M165.66 202.34a8 8 0 0 1-11.32 11.32l-80-80a8 8 0 0 1 0-11.32l80-80a8 8 0 0 1 11.32 11.32L91.31 128Z',
  check: 'm229.66 77.66-128 128a8 8 0 0 1-11.32 0l-56-56a8 8 0 0 1 11.32-11.32L96 188.69 218.34 66.34a8 8 0 0 1 11.32 11.32',
} as const;

const barIcon = (path: string) =>
  `<svg viewBox="0 0 256 256" aria-hidden="true" focusable="false"><path d="${path}"/></svg>`;

const HIGHLIGHT_COLOR_NAMES = Object.keys(HIGHLIGHT_COLOR_LABELS) as HighlightColor[];

/** The steps of the bar the page names to RN when it opens or changes step:
 *  the actions, the colour step, and tap-to-edit. Its fourth step, a
 *  confirmation ('status'), says its own words. */
const ANNOUNCED_BAR_MODES = ['actions', 'colors', 'edit'] as const;
type AnnouncedBarMode = (typeof ANNOUNCED_BAR_MODES)[number];

function isAnnouncedBarMode(mode: unknown): mode is AnnouncedBarMode {
  return (ANNOUNCED_BAR_MODES as readonly unknown[]).includes(mode);
}

/** VoiceOver and TalkBack hear these when the bar opens or changes step:
 *  the bar is the last element of the page, after the whole article. */
const HIGHLIGHT_CHOICES = HIGHLIGHT_COLOR_NAMES.map((color) => HIGHLIGHT_COLOR_LABELS[color]).join(', ');
const SELECTION_BAR_ANNOUNCEMENTS: Record<AnnouncedBarMode, string> = {
  actions: `Selection actions: ${SELECTION_ACTIONS.map(({ label }) => label).join(', ')}`,
  colors: `Highlight: ${HIGHLIGHT_CHOICES}`,
  edit: `Edit highlight: ${HIGHLIGHT_CHOICES}, or remove it`,
};

/** A SELECTION_ACTION message from the page. Highlight never comes: its
 *  colour step stays in the page. */
interface SelectionActionMessage {
  action: Exclude<SelectionAction, 'highlight'>;
  /** Bookmark and Share: one line. Copy: the words as selected. */
  text: string;
  /** The Scripture passage the words sit in, or ''. */
  reference: string;
  requestId: number;
}

function parseSelectionAction(data: Record<string, unknown>): SelectionActionMessage | null {
  const { action } = data;
  if (action !== 'bookmark' && action !== 'share' && action !== 'copy') return null;
  return {
    action,
    text: typeof data.text === 'string' ? data.text : '',
    reference: typeof data.reference === 'string' ? data.reference.trim() : '',
    requestId: typeof data.requestId === 'number' ? data.requestId : 0,
  };
}

/** The selection bar: the four actions, the colour step, a confirmation. */
const SELECTION_BAR_HTML = `
  <div id="highlight-toolbar" role="toolbar" aria-label="Selection" data-mode="actions">
    <div class="bar-group bar-actions">
      ${SELECTION_ACTIONS.map(({ key, label }) => `<button type="button" class="action-btn" data-action="${key}">${barIcon(BAR_ICON_PATHS[key])}<span class="lbl">${label}</span></button>`).join('\n      ')}
    </div>
    <div class="bar-group bar-colors">
      <button type="button" class="back-btn" data-action="back" aria-label="Back">${barIcon(BAR_ICON_PATHS.back)}</button>
      ${HIGHLIGHT_COLOR_NAMES.map((color) => `<button type="button" class="color-btn ${color}" data-color="${color}" data-label="${HIGHLIGHT_COLOR_LABELS[color]}" aria-label="Highlight ${HIGHLIGHT_COLOR_LABELS[color]}"><span class="dot"></span></button>`).join('\n      ')}
    </div>
    <div class="bar-status">${barIcon(BAR_ICON_PATHS.check)}<span class="status-text"></span></div>
  </div>`;

/** Helpers every part of the page script uses. */
const PAGE_HELPERS_SCRIPT = `
      // ---- Helpers --------------------------------------------------------------
      function postToApp(message) {
        if (window.ReactNativeWebView) window.ReactNativeWebView.postMessage(JSON.stringify(message));
      }

      function elementOf(node) {
        return node && node.nodeType === 3 ? node.parentElement : node;
      }

      function normalizeWs(s) { return String(s || '').replace(/\\s+/g, ' ').trim(); }

      // The blocks of the article. Their edges count as white space when the
      // article text is searched, the way a selection that crosses them reads.
      const TEXT_BLOCKS = 'p, h3, cite, aside, blockquote, .deco-quote, .word-term';

      // Words compared the way RN compares them (src/lib/reader-words.ts).
${READER_WORDS_PAGE_JS}`;

/** The highlights: the diff protocol that reports every change to RN, the
 *  heal of stored highlights whose text moved, undo, and the remove and
 *  recolour of tap-to-edit. */
const HIGHLIGHTS_SCRIPT = `
      // ---- Highlights -----------------------------------------------------------
      // Build a single-highlight serialized string matching rangy's format:
      //   "start$end$id$className$containerElementId"
      // This is the same shape stored in highlight.serializedRange, so RN-side
      // we can compare strings directly.
      function getRangySerial(hl) {
        if (!hl) return '';
        var cr = hl.characterRange;
        var cid = hl.containerElementId || '';
        return cr.start + '$' + cr.end + '$' + hl.id + '$' + hl.classApplier.className + '$' + cid;
      }

      // ---- Document-is-truth protocol -------------------------------------
      // Every mutation (create, remove, recolor, undo) is reported to RN as
      // the DIFF between the highlighter's state before and after: rangy's
      // exclusive mode merges same-color neighbours and trims other-color
      // neighbours, so the set of live highlights can change in ways the
      // single "new highlight" never captured. RN reconciles its store from
      // this diff, so what is stored always matches what is on the page.
      function colorOf(hl) {
        return String(hl.classApplier.className).replace('rangy-highlight-', '');
      }

      // Serial + object only; text is read lazily for the few highlights
      // that actually changed (a removed highlight's range still resolves
      // against the document after unapply, so its text stays readable).
      function snapshotHighlights() {
        var out = [];
        var hs = (window.rangyHighlighter && window.rangyHighlighter.highlights) || [];
        for (var i = 0; i < hs.length; i++) out.push({ serial: getRangySerial(hs[i]), hl: hs[i] });
        return out;
      }

      // A serial is start$end$id$class$container. The id is per page: a
      // highlight restored on a rebuilt page gets a new one, so a highlight
      // is found by where it is and what it is.
      function serialPosition(serial) {
        var parts = String(serial || '').split('$');
        return [parts[0], parts[1], parts[3], parts[4] || ''].join('$');
      }
      function findBySerial(serial) {
        var hs = (window.rangyHighlighter && window.rangyHighlighter.highlights) || [];
        var wanted = serialPosition(serial);
        for (var i = 0; i < hs.length; i++) {
          if (serialPosition(getRangySerial(hs[i])) === wanted) return hs[i];
        }
        return null;
      }

      function describe(entry, withContext) {
        var text = '';
        try { text = entry.hl.getText(); } catch (_) {}
        var row = { serial: entry.serial, text: text, color: colorOf(entry.hl) };
        if (withContext) row.context = contextFor(entry.hl, text);
        return row;
      }

      function contextFor(hl, text) {
        try {
          var els = hl.getHighlightElements();
          var parent = els && els[0] && els[0].parentElement;
          // The paragraph, not a quotation or emphasis around the mark.
          var block = parent && (parent.closest(TEXT_BLOCKS) || parent);
          var t = (block && block.textContent) || '';
          var idx = t.indexOf(text);
          if (idx < 0) return t.substring(0, 150);
          return t.substring(Math.max(0, idx - 50), idx + text.length + 50);
        } catch (_) {
          return '';
        }
      }

      // keepSerials: spans unapplied from the page whose records must stay
      // in the store (a lost highlight waiting for its text to come back).
      function postHighlightsChanged(reason, before, primarySerial, silent, keepSerials) {
        var after = snapshotHighlights();
        var keep = {};
        (keepSerials || []).forEach(function(k) { keep[k] = true; });
        var beforeBySerial = {};
        var afterBySerial = {};
        before.forEach(function(h) { beforeBySerial[h.serial] = h; });
        after.forEach(function(h) { afterBySerial[h.serial] = h; });
        var removed = [];
        var added = [];
        before.forEach(function(h) { if (!afterBySerial[h.serial] && !keep[h.serial]) removed.push(describe(h, false)); });
        after.forEach(function(h) { if (!beforeBySerial[h.serial]) added.push(describe(h, true)); });
        postToApp({
          type: 'HIGHLIGHTS_CHANGED',
          // Which document changed, so a message still in flight from a
          // replaced document is not saved under the one that replaced it.
          docId: document.documentElement.getAttribute('data-doc-id'),
          reason: reason,
          removed: removed,
          added: added,
          primarySerial: primarySerial || '',
          silent: !!silent
        });
      }

      // Re-apply a serialized highlight through rangy's character-range API.
      // (deserialize() REPLACES the whole highlight set, so it cannot be used
      // to put one highlight back.)
      function restoreSerial(serial) {
        var parts = String(serial || '').split('$');
        if (parts.length < 4 || !window.rangyHighlighter) return;
        var start = parseInt(parts[0], 10);
        var end = parseInt(parts[1], 10);
        var className = parts[3];
        var containerId = parts[4] || null;
        if (!(end > start)) return;
        var converter = window.rangyHighlighter.converter;
        var container = containerId ? document.getElementById(containerId) : document.body;
        var range = converter.characterRangeToRange(document, { start: start, end: end }, container);
        var charRange = converter.rangeToCharacterRange(range, container);
        window.rangyHighlighter.highlightCharacterRanges(className, [charRange], {
          containerElementId: containerId,
          exclusive: true
        });
      }

      // Character offsets in the article text for every occurrence of the
      // stored text; when there are several, the one whose neighbourhood
      // shares the most words with the stored context wins. The search stops
      // at the picker so a highlight can never re-anchor onto a swatch label.
      function articleTextLength() {
        var tb = document.getElementById('highlight-toolbar');
        if (!tb) return (document.body.textContent || '').length;
        var r = document.createRange();
        r.setStart(document.body, 0);
        r.setEndBefore(tb);
        return r.toString().length;
      }

      function locateStoredText(text, before) {
        var body = (document.body.textContent || '').substring(0, articleTextLength());
        var needle = normalizeWs(text);
        if (!needle) return -1;
        var hits = [];
        var from = 0;
        while (hits.length < 50) {
          var i = body.indexOf(needle, from);
          if (i < 0) break;
          hits.push(i);
          from = i + 1;
        }
        if (hits.length <= 1) return hits.length ? hits[0] : -1;
        var words = normalizeWs(before).toLowerCase().split(' ').filter(function(w) { return w.length > 3; });
        var best = hits[0], bestScore = -1;
        hits.forEach(function(i) {
          var window = body.substring(Math.max(0, i - 120), i + needle.length + 120).toLowerCase();
          var score = 0;
          words.forEach(function(w) { if (window.indexOf(w) >= 0) score++; });
          if (score > bestScore) { bestScore = score; best = i; }
        });
        return best;
      }

      // Two passes: first decide every stored highlight's fate and unapply
      // the ones that drifted, then re-anchor. Re-anchoring while stale
      // neighbours are still applied lets rangy trim them into new spans.
      function healHighlights(stored) {
        if (!window.rangyHighlighter || !stored || !stored.length) return;
        var liveByPos = {};
        window.rangyHighlighter.highlights.forEach(function(h) {
          liveByPos[h.characterRange.start + '-' + h.characterRange.end] = h;
        });
        var before = snapshotHighlights();
        var lost = [];
        var relocate = [];
        var stale = [];
        stored.forEach(function(s) {
          var parts = String(s.serial || '').split('$');
          var live = parts.length >= 2 ? liveByPos[parts[0] + '-' + parts[1]] : null;
          var liveText = '';
          if (live) { try { liveText = normalizeWs(live.getText()); } catch (_) {} }
          if (live && liveText === normalizeWs(s.text)) return;
          if (live) stale.push(live);
          var idx = locateStoredText(s.text, s.before);
          if (idx < 0) {
            // A mark on the wrong words is worse than none; the record itself
            // stays in the store for a device that still has the old text.
            lost.push(s.serial);
          } else {
            relocate.push({ idx: idx, len: normalizeWs(s.text).length, color: s.color || 'yellow', serial: s.serial });
          }
        });
        if (stale.length) { try { window.rangyHighlighter.removeHighlights(stale); } catch (_) {} }
        var healedCount = 0;
        relocate.forEach(function(r) {
          try {
            var converter = window.rangyHighlighter.converter;
            var range = converter.characterRangeToRange(document, { start: r.idx, end: r.idx + r.len }, document.body);
            var charRange = converter.rangeToCharacterRange(range, document.body);
            window.rangyHighlighter.highlightCharacterRanges('rangy-highlight-' + r.color, [charRange], { exclusive: true });
            healedCount++;
          } catch (err) {
            lost.push(r.serial);
          }
        });
        if (healedCount > 0 || stale.length > 0) postHighlightsChanged('heal', before, '', true, lost);
        if (lost.length > 0) {
          postToApp({ type: 'HIGHLIGHTS_LOST', serials: lost });
        }
      }

      // Undo from RN: given the forward change, apply its inverse and report
      // the resulting diff silently (no second toast).
      window.__unfoldApplyInverse = function(change) {
        if (!window.rangyHighlighter) return;
        var before = snapshotHighlights();
        try {
          var toRemove = [];
          ((change && change.added) || []).forEach(function(a) {
            var hl = findBySerial(a.serial);
            if (hl) toRemove.push(hl);
          });
          if (toRemove.length) window.rangyHighlighter.removeHighlights(toRemove);
          ((change && change.removed) || []).forEach(function(r) { restoreSerial(r.serial); });
        } catch (err) {
          console.log('Undo failed:', err);
        }
        closeBar(false);
        postHighlightsChanged(change && change.reason === 'replay' ? 'replay' : 'undo', before, '', true);
      };

      // Tap-to-edit's X: remove the highlight the mark belongs to.
      function removeHighlight(mark) {
        var before = snapshotHighlights();

        try {
          if (window.rangyHighlighter && window.rangyHighlighter.getHighlightForElement) {
            var rangyHl = window.rangyHighlighter.getHighlightForElement(mark);
            if (rangyHl) {
              window.rangyHighlighter.removeHighlights([rangyHl]);
            } else {
              // Fallback: manually unwrap the mark
              const parent = mark.parentNode;
              if (parent) {
                while (mark.firstChild) {
                  parent.insertBefore(mark.firstChild, mark);
                }
                parent.removeChild(mark);
                parent.normalize && parent.normalize();
              }
            }
          }
        } catch (err) {}

        postToApp({ type: 'HAPTIC_IMPACT' });
        postHighlightsChanged('remove', before, '', false);
      }

      // Change the color of an existing highlight in place. Uses rangy's own
      // character-range API so we don't hold onto a DOM Range that gets
      // detached when the mark is unwrapped.
      function recolorHighlight(mark, newColor) {
        if (!window.rangyHighlighter) return;
        var before = snapshotHighlights();
        var primarySerial = '';
        try {
          var rangyHl = window.rangyHighlighter.getHighlightForElement(mark);
          if (rangyHl) {
            var charRange = rangyHl.characterRange;
            var containerElementId = rangyHl.containerElementId;
            window.rangyHighlighter.removeHighlights([rangyHl]);
            var created = window.rangyHighlighter.highlightCharacterRanges(
              'rangy-highlight-' + newColor,
              [charRange],
              { containerElementId: containerElementId, exclusive: true }
            );
            if (created && created.length) primarySerial = getRangySerial(created[created.length - 1]);
          }
        } catch (err) {}

        postToApp({ type: 'HAPTIC_IMPACT' });
        postHighlightsChanged('recolor', before, primarySerial, false);
      }
`;

/** The selection bar: Highlight, Bookmark, Share, Copy, the colour step,
 *  tap-to-edit, and the short confirmation. */
const SELECTION_BAR_SCRIPT = `
      // ---- Selection bar ------------------------------------------------------
      // iOS: the system edit menu and Writing Tools are off (suppressMenuItems
      // 'all'), so every selection gesture (long press, handle drag) ends here
      // and the page shows its own bar: Highlight, Bookmark, Share, Copy.
      // Android keeps a native menu with the same four keys; RN hands the
      // chosen key to __unfoldSelectionAction and the page runs the same path,
      // without the in-page action bar.
      //
      // IMPORTANT: this WebView is not the scroller. RN sizes it to the whole
      // article and the parent ScrollView scrolls it, so window.innerHeight is
      // the article height and the page cannot tell which part is on screen.
      // RN measures that band for each new anchor of the bar (SELECTION_ACTIVE,
      // answered by __unfoldSetViewport with the id of the request): the
      // reader may have scrolled since the last one. Until it answers, the
      // article edges stand in.
      const SHOW_SELECTION_BAR = ${JSON.stringify(!IS_ANDROID)};
      const BAR_GAP = 14;      // clears the knobs of the selection handles
      const BAR_MARGIN = 8;
      const TAP_SLOP = ${TAP_SLOP_PX};     // how far a finger can drift and still tap
      const TAP_MAX_MS = ${TAP_MAX_MS}; // how long a tap can last
      // Lexical names: a var named toolbar would collide with window.toolbar.
      const toolbar = document.getElementById('highlight-toolbar');
      const statusText = toolbar.querySelector('.status-text');
      const colorButtons = Array.prototype.slice.call(toolbar.querySelectorAll('.color-btn'));
      let barMode = '';        // '' | 'actions' | 'colors' | 'edit' | 'status'
      let shownMode = '';      // the mode and remove colour the bar markup shows
      let barSnap = null;      // { text, raw, range } the open bar acts on
      let liveRange = null;    // Android: the last selected range the page saw
      let viewport = null;     // { top, bottom }: the visible band, in page px
      let viewportAnchor = null; // the selection range or mark that band is for
      let viewportRequest = 0; // the id of the latest SELECTION_ACTIVE
      let barTouchUntil = 0;   // a collapse before this time came from the bar (a tap, a focus move)
      let ownSelectionUntil = 0; // a change before this time is our selectRange()
      let pendingRequest = 0;  // the SELECTION_ACTION waiting for RN to confirm
      let nextRequestId = 0;
      let editing = null;      // tap-to-edit: { mark, color } of the highlight
      let settleTimer = 0;
      let revealTimer = 0;
      let statusTimer = 0;
      let confirmTimer = 0;
      let screenReaderOn = false; // RN: VoiceOver or TalkBack is on
      let focusOnReveal = false;  // move focus into the bar when it shows

      function isInsideBar(node) {
        var el = elementOf(node);
        return !!(el && el.closest && el.closest('#highlight-toolbar'));
      }

      // The text nodes the range touches, from its start to its end.
      function textNodesIn(range) {
        var root = range.commonAncestorContainer;
        if (root.nodeType === 3) return [root];
        var walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
        var first = range.startContainer;
        if (first.nodeType === 3) walker.currentNode = first;
        var nodes = [];
        for (var n = first.nodeType === 3 ? first : walker.nextNode(); n; n = walker.nextNode()) {
          if (range.intersectsNode(n)) nodes.push(n);
          else if (nodes.length) break;
          if (n === range.endContainer) break;
        }
        return nodes;
      }

      // The first point of the range before a character that is not white
      // space, or (fromEnd) the last point after one; null when there is none.
      function edgeOf(range, nodes, fromEnd) {
        for (var i = 0; i < nodes.length; i++) {
          var node = nodes[fromEnd ? nodes.length - 1 - i : i];
          var from = node === range.startContainer ? range.startOffset : 0;
          var to = node === range.endContainer ? range.endOffset : node.nodeValue.length;
          for (var k = 0; k < to - from; k++) {
            var at = fromEnd ? to - 1 - k : from + k;
            if (!/\\s/.test(node.nodeValue.charAt(at))) return { node: node, offset: fromEnd ? at + 1 : at };
          }
        }
        return null;
      }

      // The range without the white space at its ends. A long press or a
      // handle drag can start the selection on the space before a word (at
      // the end of the previous line); a highlight must not paint it, and
      // the bar centres on the words.
      function trimRange(range) {
        try {
          var nodes = textNodesIn(range);
          var start = edgeOf(range, nodes, false);
          var end = edgeOf(range, nodes, true);
          if (!start || !end) return range;
          var trimmed = document.createRange();
          trimmed.setStart(start.node, start.offset);
          trimmed.setEnd(end.node, end.offset);
          return trimmed.collapsed ? range : trimmed;
        } catch (_) {
          return range;
        }
      }

      // The live selection as a cloned range, or null when it is empty or
      // starts inside the bar. A range that runs on into the bar stops
      // before it, so a highlight never wraps the bar's own words.
      function selectedRange(selection) {
        if (!selection || !selection.rangeCount || selection.isCollapsed) return null;
        var range = selection.getRangeAt(0).cloneRange();
        if (isInsideBar(range.startContainer)) return null;
        if (range.intersectsNode(toolbar)) range.setEndBefore(toolbar);
        return range;
      }

      // The pull quote repeats a line of the day between two paragraphs. It
      // is not part of the teaching, so a selection that crosses it leaves it
      // out: the range in pieces around each pull quote it touches.
      function withoutPullQuotes(range) {
        var pieces = [];
        var rest = range.cloneRange();
        var quotes = document.querySelectorAll('.pull-quote');
        for (var i = 0; i < quotes.length && rest; i++) {
          if (!rest.intersectsNode(quotes[i])) continue;
          var quote = document.createRange();
          quote.selectNode(quotes[i]);
          if (rest.compareBoundaryPoints(Range.START_TO_START, quote) < 0) {
            var before = rest.cloneRange();
            if (before.compareBoundaryPoints(Range.START_TO_END, quote) > 0) before.setEndBefore(quotes[i]);
            if (!before.collapsed) pieces.push(before);
          }
          if (rest.compareBoundaryPoints(Range.END_TO_END, quote) <= 0) rest = null;
          else if (rest.compareBoundaryPoints(Range.END_TO_START, quote) < 0) rest.setStartAfter(quotes[i]);
        }
        if (rest && !rest.collapsed) pieces.push(rest);
        return pieces;
      }

      // The words of the pieces, one block per paragraph, the way a
      // selection reads them.
      function textOfPieces(pieces) {
        var blocks = [];
        var lastBlock = null;
        pieces.forEach(function(piece) {
          textNodesIn(piece).forEach(function(node) {
            var from = node === piece.startContainer ? piece.startOffset : 0;
            var to = node === piece.endContainer ? piece.endOffset : node.nodeValue.length;
            var el = elementOf(node);
            var block = el.closest(TEXT_BLOCKS) || el;
            if (block !== lastBlock) blocks.push('');
            lastBlock = block;
            blocks[blocks.length - 1] += node.nodeValue.substring(from, to);
          });
        });
        return blocks.map(normalizeWs).filter(Boolean).join('\\n\\n');
      }

      // { text, raw, range } for a range and its words, or null when the
      // words are only white space. raw is the engine's text of the range,
      // unless the range crosses a pull quote.
      function snapOf(range, raw) {
        var pieces = withoutPullQuotes(range);
        if (!pieces.length) return null;
        if (pieces.length > 1 || !sameRange(pieces[0], range)) {
          raw = textOfPieces(pieces);
          var last = pieces[pieces.length - 1];
          range = pieces[0].cloneRange();
          range.setEnd(last.endContainer, last.endOffset);
        }
        raw = String(raw || '').trim();
        var text = normalizeWs(raw);
        return text ? { text: text, raw: raw, range: trimRange(range) } : null;
      }

      // The live selection as { text, raw, range }. raw keeps the engine's
      // paragraph breaks unless the selection ran on into the bar.
      function readSelection() {
        var selection = window.getSelection();
        var range = selectedRange(selection);
        if (!range) return null;
        var clipped = range.compareBoundaryPoints(Range.END_TO_END, selection.getRangeAt(0)) !== 0;
        return snapOf(range, clipped ? range.toString() : selection.toString());
      }

      function sameRange(a, b) {
        if (!a || !b) return false;
        try {
          return a.compareBoundaryPoints(Range.START_TO_START, b) === 0
            && a.compareBoundaryPoints(Range.END_TO_END, b) === 0;
        } catch (_) {
          return false;
        }
      }

      function selectRange(range) {
        if (!range) return;
        ownSelectionUntil = Date.now() + 300;
        try {
          var selection = window.getSelection();
          selection.removeAllRanges();
          selection.addRange(range.cloneRange());
        } catch (_) {}
      }

      function clearSelection() {
        try { window.getSelection().removeAllRanges(); } catch (_) {}
      }

      function anchorRect() {
        if (barMode === 'edit') return editing ? editing.mark.getBoundingClientRect() : null;
        var range = barSnap && barSnap.range;
        if (!range || !range.getBoundingClientRect) return null;
        var rect = range.getBoundingClientRect();
        return rect && (rect.width || rect.height) ? rect : null;
      }

      // Above the selection. Below it when there is no room above inside the
      // visible band. Pinned to the top of the band when neither fits. Always
      // inside the page width.
      function placeBar() {
        var rect = anchorRect();
        if (!rect) return false;
        var scrollX = window.scrollX || window.pageXOffset || 0;
        var scrollY = window.scrollY || window.pageYOffset || 0;
        var pageWidth = document.documentElement.clientWidth || window.innerWidth || 0;
        var width = toolbar.offsetWidth;
        var height = toolbar.offsetHeight;
        var bandTop = (viewport ? Math.max(0, viewport.top) : 0) + BAR_MARGIN;
        var bandBottom = (viewport ? viewport.bottom : (document.body.scrollHeight || Infinity)) - BAR_MARGIN;
        var above = rect.top + scrollY - BAR_GAP - height;
        var below = rect.bottom + scrollY + BAR_GAP;
        var placement = 'above';
        var top = above;
        if (above < bandTop) {
          placement = below + height <= bandBottom ? 'below' : 'pinned';
          top = placement === 'below' ? below : bandTop;
        }
        var left = rect.left + scrollX + (rect.right - rect.left) / 2 - width / 2;
        left = Math.max(BAR_MARGIN, Math.min(left, pageWidth - width - BAR_MARGIN));
        toolbar.style.top = Math.round(top) + 'px';
        toolbar.style.left = Math.round(left) + 'px';
        toolbar.setAttribute('data-placement', placement);
        return true;
      }

      function setBarMode(mode) {
        barMode = mode;
        clearTimeout(statusTimer);
        var removeColor = mode === 'edit' && editing ? editing.color : '';
        if (shownMode === mode + ' ' + removeColor) return;
        shownMode = mode + ' ' + removeColor;
        toolbar.setAttribute('data-mode', mode);
        colorButtons.forEach(function(btn) {
          var removes = btn.getAttribute('data-color') === removeColor;
          btn.classList.toggle('remove-mode', removes);
          btn.setAttribute('aria-label', removes ? 'Remove highlight' : 'Highlight ' + btn.getAttribute('data-label'));
        });
      }

      function revealBar() {
        clearTimeout(revealTimer);
        revealTimer = 0;
        if (!barMode || !placeBar()) return;
        toolbar.classList.add('visible');
        if (focusOnReveal) focusBar();
      }

      // A screen reader is on: focus goes to the first button of the step the
      // bar shows. WebKit clears the selection when focus leaves it. The bar
      // acts on its own copy of the words, and that collapse must not close it.
      function focusBar() {
        focusOnReveal = false;
        var first = barMode === 'actions' ? toolbar.querySelector('.action-btn')
          : barMode === 'colors' ? toolbar.querySelector('.back-btn')
          : barMode === 'edit' ? colorButtons[0] : null;
        if (!first) return;
        barTouchUntil = Date.now() + 600;
        first.focus();
      }

      // Ask RN where the reader can see the page now. Show or move the bar
      // when it answers, or after 150ms with what the page knows. An open bar
      // stays where it is until then.
      function measureViewport() {
        viewport = null;
        clearTimeout(revealTimer);
        revealTimer = setTimeout(revealBar, 150);
        postToApp({ type: 'SELECTION_ACTIVE', requestId: ++viewportRequest });
      }

      function openBar(mode) {
        var wasOpen = !!barMode;
        var newMode = barMode !== mode;
        setBarMode(mode);
        // VoiceOver: the bar is the body's last child, after the whole article,
        // so RN says it is there, and with a screen reader on focus moves to
        // it when it shows. A confirmation says its own words.
        if ((!wasOpen || newMode) && mode !== 'status') {
          postToApp({ type: 'SELECTION_BAR', mode: mode });
          focusOnReveal = screenReaderOn;
        }
        var anchor = mode === 'edit' ? (editing && editing.mark) : (barSnap && barSnap.range);
        if (wasOpen && anchor === viewportAnchor) {
          // The same words in another mode. A reveal still to come places it.
          if (!revealTimer) revealBar();
          return;
        }
        viewportAnchor = anchor;
        measureViewport();
      }

      function closeBar(alsoClearSelection) {
        clearTimeout(revealTimer);
        revealTimer = 0;
        clearTimeout(statusTimer);
        clearTimeout(confirmTimer);
        barMode = '';
        barSnap = null;
        pendingRequest = 0;
        editing = null;
        focusOnReveal = false;
        // The contents stay until the next open, so the fade-out never swaps them.
        toolbar.classList.remove('visible');
        if (alsoClearSelection) clearSelection();
      }

      // An answer to an older request measured the page for older words or
      // an older scroll position, so it is dropped.
      window.__unfoldSetViewport = function(top, bottom, requestId) {
        if (requestId !== viewportRequest) return;
        if (typeof top === 'number' && typeof bottom === 'number' && bottom > top) {
          viewport = { top: top, bottom: bottom };
        }
        revealBar();
      };

      // An Aa, theme, or window size change reflows the page under an open
      // bar: measure again and put it back on its words.
      window.__unfoldRefreshBar = function() {
        if (barMode) measureViewport();
      };

      // RN: whether a screen reader (VoiceOver, TalkBack) is on.
      window.__unfoldSetScreenReader = function(on) {
        screenReaderOn = on === true;
      };

      let refreshFrame = 0;
      window.addEventListener('resize', function() {
        cancelAnimationFrame(refreshFrame);
        refreshFrame = requestAnimationFrame(window.__unfoldRefreshBar);
      });

      function enterEditMode(mark, color) {
        barSnap = null;
        editing = { mark: mark, color: color };
        openBar('edit');
      }

      // Scripture in the devotional text is a quotation that names its
      // passage; the document builder wraps each one in .scripture-quote.
      // A selection is Scripture when both of its ends sit in the same one,
      // or when one end sits in it and the rest is only its own citation and
      // punctuation: “For God so loved the world” (John 3:16).
      function scriptureQuoteOf(node) {
        var el = elementOf(node);
        return el && el.closest ? el.closest('.scripture-quote') : null;
      }

      // { reference, text } for a Scripture selection, or null for prose.
      // text is the words of the quotation, without the citation.
      function scriptureOf(snap) {
        var range = snap.range;
        var first = range && scriptureQuoteOf(range.startContainer);
        var last = range && scriptureQuoteOf(range.endContainer);
        var quote = first || last;
        if (!quote) return null;
        var reference = quote.getAttribute('data-ref') || '';
        if (first === last) return reference ? { reference: reference, text: snap.text } : null;
        if (first && last) return null;
        var rest = document.createRange();
        var words = range.cloneRange();
        if (quote === first) {
          rest.setStartAfter(quote);
          rest.setEnd(range.endContainer, range.endOffset);
          words.setEndAfter(quote);
        } else {
          rest.setStart(range.startContainer, range.startOffset);
          rest.setEndBefore(quote);
          words.setStartBefore(quote);
        }
        if (!/^[\\s()\\[\\].,;:\\u2014\\u2013-]*$/.test(rest.toString().replace(reference, ''))) return null;
        var text = normalizeWs(words.toString());
        return reference && text ? { reference: reference, text: text } : null;
      }

      // ---- Bar actions ---------------------------------------------------------
      function runSelectionAction(action) {
        var snap = barSnap;
        if (action === 'highlight') {
          if (!snap.range) {
            closeBar(false);
            postToApp({ type: 'HIGHLIGHT_FAILED' });
            return;
          }
          // Keep the words visibly selected while a colour is chosen (iOS).
          if (SHOW_SELECTION_BAR) selectRange(snap.range);
          openBar('colors');
          return;
        }
        var requestId = ++nextRequestId;
        var message = {
          type: 'SELECTION_ACTION',
          action: action,
          requestId: requestId,
          // Copy keeps paragraph breaks and every word selected; Bookmark and
          // Share use one line, and Scripture leaves its citation to RN.
          text: action === 'copy' ? snap.raw : snap.text
        };
        if (action !== 'copy') {
          var scripture = scriptureOf(snap);
          message.reference = scripture ? scripture.reference : '';
          if (scripture) message.text = scripture.text;
        }
        postToApp(message);
        liveRange = null;
        if (action === 'share') {
          closeBar(true);
          return;
        }
        // Bookmark and Copy: RN confirms with the words to show.
        pendingRequest = requestId;
        clearSelection();
        clearTimeout(confirmTimer);
        confirmTimer = setTimeout(function() {
          if (pendingRequest === requestId) closeBar(false);
        }, 2000);
      }

      function createHighlight(color) {
        var snap = barSnap;
        if (!snap || !snap.range) {
          closeBar(true);
          return;
        }
        var before = snapshotHighlights();
        var primarySerial = '';
        if (window.rangyHighlighter) {
          postToApp({ type: 'HAPTIC_IMPACT' });
          try {
            // Returns the highlights that were newly applied: the one the user
            // asked for, plus any other-color neighbours rangy trimmed. The
            // user's own is the one covering the selection, i.e. the last.
            var created;
            var pieces = withoutPullQuotes(snap.range);
            if (pieces.length > 1) {
              // Words on both sides of a pull quote: one highlight per side.
              var converter = window.rangyHighlighter.converter;
              created = window.rangyHighlighter.highlightCharacterRanges('rangy-highlight-' + color, pieces.map(function(piece) {
                // The converter reads rangy's own ranges.
                var own = rangy.createRange();
                own.setStart(piece.startContainer, piece.startOffset);
                own.setEnd(piece.endContainer, piece.endOffset);
                return converter.rangeToCharacterRange(own, document.body);
              }), { exclusive: true });
            } else {
              // The frozen range, not the live selection: the tap on the
              // colour may already have collapsed the selection.
              selectRange(snap.range);
              created = window.rangyHighlighter.highlightSelection('rangy-highlight-' + color, { exclusive: true });
            }
            if (created && created.length) primarySerial = getRangySerial(created[created.length - 1]);
          } catch (err) {
            console.log('Highlight failed:', err);
          }
        }
        liveRange = null;
        closeBar(true);
        if (!primarySerial) {
          // Nothing landed on the page, so nothing goes in the store.
          postToApp({ type: 'HIGHLIGHT_FAILED' });
          return;
        }
        postHighlightsChanged('create', before, primarySerial, false);
      }

      // Edit mode: the full colour row with an X on the current colour.
      // Tapping the X removes the highlight; another colour recolours it.
      function applyColor(color) {
        if (barMode === 'edit') {
          var mark = editing.mark;
          var removes = color === editing.color;
          closeBar(false);
          if (removes) removeHighlight(mark);
          else recolorHighlight(mark, color);
          return;
        }
        if (barMode === 'colors') createHighlight(color);
      }

      function activateBarButton(btn) {
        var color = btn.getAttribute('data-color');
        var action = btn.getAttribute('data-action');
        if (color) applyColor(color);
        // Back shows only in the colour step, which always has a selection.
        // Android has no action bar to go back to (its menu is native), so
        // there Back closes the bar.
        else if (action === 'back' && SHOW_SELECTION_BAR) openBar('actions');
        else if (action === 'back') closeBar(true);
        else if (action && pendingRequest === 0) runSelectionAction(action);
      }

      // Whether two texts hold the same words. White space does not count:
      // the native menu reads a line break between paragraphs, and a range
      // reads only its text nodes.
      function sameWords(a, b) {
        return String(a || '').replace(/\\s+/g, '') === String(b || '').replace(/\\s+/g, '');
      }

      // Android: RN sends the key of the native menu item. The menu has
      // usually collapsed the selection by now, so the last selected range
      // stands in, read with the menu's own text (it keeps the paragraph
      // breaks for Copy), but only when it holds the menu's words: Android
      // can clear a newer selection before the page sees it. Then the live
      // selection. With neither, nothing runs.
      window.__unfoldSelectionAction = function(action, nativeText) {
        var snap = liveRange && sameWords(liveRange.toString(), nativeText)
          ? snapOf(liveRange, nativeText)
          : readSelection();
        if (!snap) {
          closeBar(false);
          return;
        }
        editing = null;
        barSnap = snap;
        runSelectionAction(action);
      };

      // RN's answer to a Bookmark or Copy: the words to show, or '' to close.
      window.__unfoldSelectionConfirm = function(requestId, message) {
        if (!requestId || requestId !== pendingRequest) return;
        pendingRequest = 0;
        clearTimeout(confirmTimer);
        if (!message) {
          closeBar(false);
          return;
        }
        statusText.textContent = String(message);
        openBar('status');
        statusTimer = setTimeout(function() { closeBar(false); }, 1400);
      };

      // ---- Selection tracking ----------------------------------------------------
      // A new selection always leaves highlight edit mode, a colour choice
      // for an older selection, and a confirmation still on screen.
      function onSelectionSettled() {
        if (SHOW_SELECTION_BAR) {
          var snap = readSelection();
          if (snap) {
            // The same selection, or our own re-selection of it (the engine
            // may move its boundaries without changing the words). After a
            // confirmation the words were cleared, so selecting them again
            // is a new selection.
            if (barSnap && (barMode === 'actions' || barMode === 'colors') && (sameRange(snap.range, barSnap.range)
              || (Date.now() < ownSelectionUntil && snap.text === barSnap.text))) return;
            editing = null;
            pendingRequest = 0;
            barSnap = snap;
            openBar('actions');
            return;
          }
        } else {
          // Android: keep the range for the native menu keys. Its words are
          // read and trimmed only when a key arrives.
          var range = selectedRange(window.getSelection());
          if (range && /\\S/.test(range.toString())) {
            liveRange = range;
            if (barSnap && sameRange(trimRange(range), barSnap.range)) return;
            editing = null;
            pendingRequest = 0;
            if (barMode) closeBar(false);
            return;
          }
        }
        // Empty selection. On iOS a tap on the bar collapses the selection;
        // that must not close the bar the tap is using.
        if (Date.now() < barTouchUntil) return;
        if (barMode === 'actions') closeBar(false);
      }

      function scheduleSelectionCheck(delay) {
        clearTimeout(settleTimer);
        settleTimer = setTimeout(onSelectionSettled, delay);
      }

      document.addEventListener('selectionchange', function() {
        scheduleSelectionCheck(60);
      });

      // Backup for a gesture that ends without a late selectionchange.
      document.addEventListener('touchend', function() {
        scheduleSelectionCheck(150);
      });

      function movedPast(touch, x, y) {
        return !!touch && (Math.abs(touch.clientX - x) > TAP_SLOP || Math.abs(touch.clientY - y) > TAP_SLOP);
      }

      // ---- Bar buttons -----------------------------------------------------------
      // A tap runs on touchend. The bar claims its touches (preventDefault on
      // touchstart): otherwise WebKit's own selection gestures take a tap that
      // lands while words are selected, clear the selection, hold back the
      // touchend until the next touch, and sometimes send no click, so the
      // tap did nothing. click covers VoiceOver and pointer input. A click
      // that trails a handled touch on the same button is the same tap, so it
      // does not run again, and a click ends the press it handled, so a late
      // touchend cannot run the button a second time.
      let press = null;        // { btn, x, y }: the button a touch started on
      let lastTouchTap = { btn: null, at: 0 };

      // The touch is claimed, so WebKit never sets :active: .pressed shows
      // the press instead.
      function endPress() {
        if (press) press.btn.classList.remove('pressed');
        press = null;
      }

      function barButtonFor(target) {
        var el = elementOf(target);
        return el && el.closest ? el.closest('#highlight-toolbar button') : null;
      }

      toolbar.addEventListener('touchstart', function(e) {
        barTouchUntil = Date.now() + 1000;
        var touch = e.touches && e.touches[0];
        var btn = barButtonFor(e.target);
        endPress();
        press = btn ? { btn: btn, x: touch ? touch.clientX : 0, y: touch ? touch.clientY : 0 } : null;
        if (btn) btn.classList.add('pressed');
        e.stopPropagation();
        if (e.cancelable) e.preventDefault();
      });

      toolbar.addEventListener('touchmove', function(e) {
        if (press && movedPast(e.touches && e.touches[0], press.x, press.y)) endPress();
      }, { passive: true });

      toolbar.addEventListener('touchcancel', endPress);

      toolbar.addEventListener('touchend', function(e) {
        var btn = press && press.btn;
        endPress();
        barTouchUntil = Date.now() + 600;
        e.stopPropagation();
        if (!btn) return;
        // The tap is handled here, so no click follows it.
        if (e.cancelable) e.preventDefault();
        lastTouchTap = { btn: btn, at: Date.now() };
        activateBarButton(btn);
      });

      toolbar.addEventListener('click', function(e) {
        e.stopPropagation();
        var btn = barButtonFor(e.target);
        if (!btn) return;
        e.preventDefault();
        if (btn === lastTouchTap.btn && Date.now() - lastTouchTap.at < 600) return;
        endPress();
        barTouchUntil = Date.now() + 600;
        activateBarButton(btn);
      });

      // ---- Taps outside the bar ------------------------------------------------
      // A quick tap outside the open bar closes it. A long press or a drag is
      // a selection or a scroll, not a dismissal.
      let outsideTouch = null; // { x, y, at } of a touch that started outside the open bar

      document.addEventListener('touchstart', function(e) {
        var touch = e.touches && e.touches[0];
        outsideTouch = barMode && touch && !isInsideBar(e.target)
          ? { x: touch.clientX, y: touch.clientY, at: Date.now() }
          : null;
      }, { passive: true });

      document.addEventListener('touchmove', function(e) {
        if (outsideTouch && movedPast(e.touches && e.touches[0], outsideTouch.x, outsideTouch.y)) outsideTouch = null;
      }, { passive: true });

      document.addEventListener('touchend', function() {
        var touch = outsideTouch;
        outsideTouch = null;
        if (!touch || Date.now() - touch.at > TAP_MAX_MS) return;
        // Edit mode is closed by the mark-click handler below.
        if (!barMode || barMode === 'edit') return;
        if (barMode === 'actions' && readSelection()) return;
        closeBar(true);
      });

      // RN: a tap on one of the reader's own views, outside the page.
      window.__unfoldCloseBar = function() {
        if (barMode) closeBar(true);
      };

      // Tap-to-edit existing highlights. Runs in capture phase so it intercepts
      // before scripture-ref/bookmark handlers. Tapping a <mark class="highlight-*">
      // enters edit mode; tapping anywhere else (not toolbar, not mark) dismisses.
      document.addEventListener('click', function(e) {
        if (isInsideBar(e.target)) return;

        // Don't interfere mid-selection
        var sel = window.getSelection();
        if (sel && sel.toString().trim().length > 0) return;

        var mark = e.target.closest('mark[class*="highlight-"]');
        if (mark) {
          var foundColor = '';
          for (var i = 0; i < mark.classList.length; i++) {
            var cls = mark.classList[i];
            if (cls.indexOf('highlight-') === 0) {
              foundColor = cls.replace('highlight-', '');
              break;
            }
          }
          if (!foundColor) return;
          e.preventDefault();
          e.stopPropagation();
          postToApp({ type: 'HAPTIC_SELECTION' });
          enterEditMode(mark, foundColor);
          return;
        }

        if (barMode === 'edit') closeBar(false);
      }, true);
`;

/** The bookmark buttons of the quote, context, and word study boxes. */
const BOX_BOOKMARKS_SCRIPT = `
      // Bookmark button handler for quotes, context boxes, and word study boxes
      window.handleBookmark = function(el) {
        var type = el.getAttribute('data-type');
        var index = el.getAttribute('data-index');
        var parent = el.parentElement;
        var text = el.getAttribute('data-bookmark-key') || '';

        if (!text && type === 'quote') {
          var p = parent.querySelector('p');
          var cite = parent.querySelector('cite');
          text = (p ? p.textContent : '') + (cite ? ' ' + cite.textContent : '');
        } else if (!text && type === 'context') {
          text = parent.querySelector('p') ? parent.querySelector('p').textContent : '';
        } else if (!text && type === 'wordstudy') {
          var term = parent.querySelector('.term');
          var meaning = parent.querySelectorAll('p');
          text = (term ? term.textContent + ': ' : '') + (meaning.length > 0 ? meaning[meaning.length - 1].textContent : '');
        }

        var isNowBookmarked = !el.classList.contains('bookmarked');
        el.classList.toggle('bookmarked');

        postToApp({
          type: 'BOOKMARK',
          contentType: type,
          text: text.trim(),
          index: parseInt(index) || 0,
          isBookmarked: isNowBookmarked
        });
      };
`;


/** Everything the document derives from the Aa font size and the theme,
 *  expressed as CSS custom properties on the root element. They are baked
 *  into the document as `<html style="…">` when it is built; afterwards an Aa
 *  or theme change only pushes new values into the live document (see
 *  pushThemeVars), so the WebView is never remounted or reloaded for either. */
interface ThemeVars {
  /** `name: value;` declarations for the baked `<html style="…">` attribute. */
  declarations: string;
  /** JSON object literal of the same name → value map, for the runtime script
   *  and for equality checks (identical values ⇒ nothing to push). */
  json: string;
}

function buildThemeVars(fontSize: FontSize, accentColor: string, isDark: boolean, fontScale: number): ThemeVars {
  const bodyFontSize = Math.round(FONT_SIZE_VALUES[fontSize].body * clampSystemFontScale(fontScale));
  const lineHeight = bodyFontSize * 1.75;
  const vars: Record<string, string> = {
    '--body-font-size': `${bodyFontSize}px`,
    '--body-line-height': `${lineHeight}px`,
    '--text': isDark ? '#E8E4DC' : '#1A1A1A',
    '--muted': isDark ? '#E8E4DC' : '#5A534E',
    '--accent': accentColor,
    '--selection-bg': `${accentColor}40`,
    '--flash-ring': `${accentColor}66`,
    '--flash-0': `${accentColor}99`,
    '--flash-55': `${accentColor}33`,
    '--flash-100': `${accentColor}00`,
    '--quote-border-top': isDark ? `${accentColor}24` : `${accentColor}2E`,
    '--quote-border-bottom': isDark ? `${accentColor}14` : `${accentColor}1F`,
    '--quote-bg': isDark ? `${accentColor}08` : `${accentColor}0F`,
    '--box-bg': isDark ? '#1F1F1F' : '#EDE8E0', // warmer, visible surface separation
    '--box-border': isDark ? 'rgba(245,240,235,0.07)' : 'rgba(0,0,0,0.06)',
    '--toolbar-bg': isDark ? '#2a2a2a' : '#ffffff',
    '--toolbar-fg': isDark ? '#E8E4DC' : '#3A3532',
    '--scripture-underline': `${accentColor}60`,
  };
  // Stroke in both themes; text keeps its own color. `currentColor`
  // rather than `inherit` — CSS-wide keywords are not valid custom-property
  // values, and `color: currentColor` behaves exactly like `color: inherit`.
  HIGHLIGHT_COLOR_NAMES.forEach((color) => {
    vars[`--hl-${color}-bg`] = highlighterStroke(highlightInk(color, isDark));
    vars[`--hl-${color}-color`] = 'currentColor';
  });
  return {
    declarations: Object.entries(vars).map(([name, value]) => `${name}: ${value};`).join(' '),
    json: JSON.stringify(vars),
  };
}

/** Runtime counterpart of the baked `<html style="…">`: overwrites the same
 *  inline custom properties on the root element, then re-reports the document
 *  height — a font-size change reflows the page and the RN-side height must
 *  follow — and puts an open selection bar back on its words. */
function buildThemeVarsScript(themeVars: ThemeVars): string {
  return `
    (function() {
      var root = document.documentElement;
      var vars = ${themeVars.json};
      Object.keys(vars).forEach(function(name) { root.style.setProperty(name, vars[name]); });
      if (window.__unfoldRefreshBar) window.__unfoldRefreshBar();
      ${WEBVIEW_COLLECT_PARAGRAPH_YS_JS}
      function reportHeight() {
        if (!window.ReactNativeWebView || !document.body) return;
        window.ReactNativeWebView.postMessage(JSON.stringify({
          type: 'HEIGHT_CHANGE',
          height: document.body.scrollHeight,
          docId: root.getAttribute('data-doc-id'),
          paragraphs: collectParagraphYs(),
          layoutGeneration: window.__unfoldLayoutGeneration || 0
        }));
      }
      reportHeight();
      setTimeout(reportHeight, 300);
    })();
    true;
  `;
}

function buildLayoutGenerationScript(generation: number): string {
  return `
    (function() {
      window.__unfoldLayoutGeneration = ${generation};
      ${WEBVIEW_COLLECT_PARAGRAPH_YS_JS}
      if (!window.ReactNativeWebView || !document.body) return;
      window.ReactNativeWebView.postMessage(JSON.stringify({
        type: 'HEIGHT_CHANGE',
        height: document.body.scrollHeight,
        docId: document.documentElement.getAttribute('data-doc-id'),
        paragraphs: collectParagraphYs(),
        layoutGeneration: window.__unfoldLayoutGeneration
      }));
    })();
    true;
  `;
}

function buildBookmarkReconcileScript(tokens: readonly string[]): string {
  return `
    (function() {
      var savedBookmarkIdentities = ${JSON.stringify(tokens)};
      document.querySelectorAll('.bookmark-btn').forEach(function(el) {
        var token = el.getAttribute('data-bookmark-token');
        el.classList.toggle('bookmarked', savedBookmarkIdentities.indexOf(token) >= 0);
      });
    })();
    true;
  `;
}

/** Sequence for `data-doc-id`: every built document gets a fresh id so a
 *  height report can be attributed to the document that sent it. The id is
 *  part of the html string, so a document is only rebuilt when its memo deps
 *  change (dev-only exception: Fast Refresh ignores memo deps, so an edit
 *  reloads the open reader document once — harmless). */
let nextDocumentId = 0;

export function DevotionalWebView({
  day,
  fontSize,
  onHighlightsChanged,
  onHighlightFailed,
  onHighlightsLost,
  commandRef,
  existingHighlights = NO_HIGHLIGHTS,
  targetHighlight,
  onTargetHighlightLocated,
  onContentLocations,
  onLayoutGenerationCommitted,
  layoutGeneration = 0,
  targetBookmark,
  onTargetBookmarkLocated,
  onTargetBookmarkMissing,
  onScriptureTap,
  devotionalId,
  devotionalTitle,
  dayNumber,
  dayTitle,
  bookmarks = NO_BOOKMARKS,
  viewportRef,
}: DevotionalWebViewProps) {
  const { colors, isDark } = useTheme();
  const readingFont = useReadingFont();
  const devotionalWebFont = useDevotionalWebFont(readingFont.body);
  const webViewRef = useRef<WebView>(null);
  const containerRef = useRef<View>(null);

  const [heightCommit, setHeightCommit] = useState({ height: 200, generation: 0 });
  const webViewHeight = heightCommit.height;

  useLayoutEffect(() => {
    if (heightCommit.generation !== layoutGeneration || layoutGeneration <= 0) return;
    onLayoutGenerationCommitted?.(layoutGeneration);
  }, [heightCommit, layoutGeneration, onLayoutGenerationCommitted]);

  // System Dynamic Type setting, layered on top of the reader's own Aa
  // choice. Dimensions' 'change' event also fires when the OS text-size
  // setting changes while the app is foregrounded, so re-read it there.
  const [fontScale, setFontScale] = useState(() => PixelRatio.getFontScale());
  useEffect(() => {
    const subscription = Dimensions.addEventListener('change', () => {
      setFontScale(PixelRatio.getFontScale());
    });
    return () => subscription.remove();
  }, []);

  const themeVars = useMemo(
    () => buildThemeVars(fontSize, colors.accent, isDark, fontScale),
    [fontSize, colors, isDark, fontScale],
  );

  const resolvedDayNumber = dayNumber ?? day.dayNumber;
  const savedBoxBookmarkTokens = useMemo(() => bookmarks
    .filter((bookmark) =>
      Boolean(devotionalId)
      && bookmark.devotionalId === devotionalId
      && bookmark.dayNumber === resolvedDayNumber,
    )
    .map(bookmarkIdentity)
    .filter((identity) => identity.kind !== 'scripture')
    .map(bookmarkIdentityToken), [bookmarks, devotionalId, resolvedDayNumber]);

  // Inject JS to report content height and apply highlights using rangy
  const injectedJavaScript = useMemo(() => {
    // Collect all individual serialized ranges to restore in a single deserialize call
    const allSerializedRanges: string[] = [];
    existingHighlights.forEach(h => {
      if (h.serializedRange) {
        allSerializedRanges.push(h.serializedRange);
      }
    });
    // What each stored highlight is supposed to say, so the document can
    // check the restored spans and re-anchor any that drifted.
    const storedHighlights = existingHighlights.map((h) => ({
      serial: h.serializedRange || '',
      text: h.highlightedText || '',
      color: h.color || 'yellow',
      before: h.contextBefore || '',
    }));
    const targetHighlightPayload = targetHighlight
      ? {
          id: targetHighlight.id,
          highlightedText: targetHighlight.highlightedText,
          serializedRange: targetHighlight.serializedRange,
          color: targetHighlight.color,
          contextBefore: targetHighlight.contextBefore,
          contextAfter: targetHighlight.contextAfter,
        }
      : null;
    // The page looks for the words alone: a Scripture phrase without the
    // ellipses it stores.
    const targetBookmarkPayload = targetBookmark
      ? { id: targetBookmark.id, words: bookmarkPageWords(targetBookmark) }
      : null;

    return `
      ${PAGE_HELPERS_SCRIPT}
      const targetHighlight = ${JSON.stringify(targetHighlightPayload)};
      const targetBookmark = ${JSON.stringify(targetBookmarkPayload)};

      // Wait for rangy to load. It is inlined in the document <head> (see
      // rangy-bundle.ts) and this script runs at document end, so the global
      // is normally already there; the poll only covers an unexpectedly slow
      // parse and keeps the old tolerant behaviour.
      function initRangy() {
        if (typeof rangy === 'undefined') {
          setTimeout(initRangy, 100);
          return;
        }

        rangy.init();

        // Create highlighter instance
        const highlighter = rangy.createHighlighter(document, 'textContent');
        
        // Add class appliers for each highlight color. Mark colors come from
        // the mark.highlight-<color> rules, which read the --hl-<color>-bg /
        // --hl-<color>-color custom properties — theme changes never touch
        // this script.
        const highlightColors = ${JSON.stringify(HIGHLIGHT_COLOR_NAMES)};

        highlightColors.forEach(color => {
          const applier = rangy.createClassApplier('rangy-highlight-' + color, {
            elementTagName: 'mark',
            elementProperties: {
              className: 'highlight-' + color
            }
          });
          highlighter.addClassApplier(applier);
        });

        // Store highlighter globally
        window.rangyHighlighter = highlighter;

        // Deserialize existing highlights — join all individual ranges into one
        // rangy serialization string and deserialize in a single call.
        // Each stored range may or may not include the "type:textContent" header;
        // we ensure exactly one header is present at the front.
        const allRanges = ${JSON.stringify(allSerializedRanges)};
        if (allRanges.length > 0) {
          var typeHeader = 'type:textContent';
          var dataEntriesSet = {};
          var dataEntries = [];
          allRanges.forEach(function(range) {
            var parts = range.split('|');
            parts.forEach(function(part) {
              if (part && !part.startsWith('type:') && !dataEntriesSet[part]) {
                dataEntriesSet[part] = true;
                dataEntries.push(part);
              }
            });
          });
          if (dataEntries.length > 0) {
            var combined = typeHeader + '|' + dataEntries.join('|');
            try {
              highlighter.deserialize(combined);
            } catch (e) {
              // Fallback: deserialize valid entries individually, then batch the survivors
              var validEntries = [];
              dataEntries.forEach(function(entry) {
                try {
                  highlighter.deserialize(typeHeader + '|' + entry);
                  validEntries.push(entry);
                } catch (e2) {}
              });
              if (validEntries.length > 0) {
                try {
                  highlighter.deserialize(typeHeader + '|' + validEntries.join('|'));
                } catch (e3) {}
              }
            }
          }
        }
        
        // Self-heal: offsets are a hint, the text is the truth. Any stored
        // highlight whose restored span no longer reads as its text (the
        // devotional was regenerated or re-pulled) is re-anchored by
        // searching for the text; one that cannot be found is reported,
        // never deleted.
        healHighlights(${JSON.stringify(storedHighlights)});

        // Report height after highlights applied
        setTimeout(reportHeight, 100);
        setTimeout(locateTargetHighlight, 150);
        setTimeout(locateTargetHighlight, 500);
        setTimeout(locateTargetHighlight, 1000);
        setTimeout(locateTargetBookmark, 150);
        setTimeout(locateTargetBookmark, 500);
        setTimeout(function() { locateTargetBookmark(true); }, 1000);
      }
      
      ${WEBVIEW_COLLECT_PARAGRAPH_YS_JS}
      function reportHeight() {
        postToApp({
          type: 'HEIGHT_CHANGE',
          height: document.body.scrollHeight,
          // Lets the RN side attribute this report to the document that sent
          // it (its first report is the "ready for injectJavaScript" signal).
          docId: document.documentElement.getAttribute('data-doc-id'),
          paragraphs: collectParagraphYs(),
          layoutGeneration: window.__unfoldLayoutGeneration || 0
        });
      }

      function normalizeText(value) {
        return String(value || '').replace(/\\s+/g, ' ').trim().toLowerCase();
      }

      function serializedEntries(value) {
        return String(value || '')
          .split('|')
          .filter(function(part) { return part && !part.startsWith('type:'); });
      }

      function getTextAroundMark(mark) {
        try {
          const beforeRange = document.createRange();
          beforeRange.setStart(document.body, 0);
          beforeRange.setEndBefore(mark);

          const afterRange = document.createRange();
          afterRange.setStartAfter(mark);
          afterRange.setEnd(document.body, document.body.childNodes.length);

          return {
            before: normalizeText(beforeRange.toString()).slice(-160),
            after: normalizeText(afterRange.toString()).slice(0, 160)
          };
        } catch (_) {
          return { before: '', after: '' };
        }
      }

      function locateHighlightPayload(targetHighlight) {
        if (!targetHighlight) return;
        const targetText = normalizeText(targetHighlight.highlightedText);
        if (!targetText) return;

        const targetColor = normalizeText(targetHighlight.color);
        const contextBefore = normalizeText(targetHighlight.contextBefore).slice(-80);
        const contextAfter = normalizeText(targetHighlight.contextAfter).slice(0, 80);
        const targetSerializedEntries = serializedEntries(targetHighlight.serializedRange);
        const marks = Array.from(document.querySelectorAll('mark'));
        let best = null;
        let bestScore = -1;

        marks.forEach(function(mark) {
          const markText = normalizeText(mark.textContent);
          if (!markText) return;

          let score = 0;
          try {
            const rangyHighlight = window.rangyHighlighter && window.rangyHighlighter.getHighlightForElement
              ? window.rangyHighlighter.getHighlightForElement(mark)
              : null;
            const markSerialized = getRangySerial(rangyHighlight);
            if (markSerialized && targetSerializedEntries.indexOf(markSerialized) >= 0) {
              score += 10000;
            }
          } catch (_) {}

          if (markText === targetText) score += 100;
          else if (markText.includes(targetText) || targetText.includes(markText)) score += 60;
          else return;

          if (targetColor && String(mark.className || '').toLowerCase().includes(targetColor)) score += 20;

          const surrounding = getTextAroundMark(mark);
          if (contextBefore && surrounding.before.includes(contextBefore)) score += 10;
          if (contextAfter && surrounding.after.includes(contextAfter)) score += 10;

          if (score > bestScore) {
            best = mark;
            bestScore = score;
          }
        });

        if (!best) {
          best = locateTextElement(targetText);
        }
        if (!best) return;
        postToApp({
          type: 'TARGET_HIGHLIGHT_LOCATED',
          highlightId: targetHighlight.id,
          y: flashElement(best),
        });
      }

      // Flashes the element and returns its y in the page.
      function flashElement(el) {
        el.classList.add('target-highlight-flash');
        setTimeout(function() {
          el.classList.remove('target-highlight-flash');
        }, 1800);
        return el.getBoundingClientRect().top + window.scrollY;
      }

      function locateTargetHighlight() {
        locateHighlightPayload(targetHighlight);
      }
      // Reader Highlights sheet: locate a highlight in the live document
      // without remounting it with a new baked target.
      window.__unfoldLocateHighlight = locateHighlightPayload;

      // The element that holds the words: the article text is searched once,
      // read the way RN reads the day's text (readerWords), and the hit is
      // mapped back to its text nodes. Words that cross blocks land on the
      // first one. skipPullQuotes: read the article the way a selection does,
      // without the pull quote.
      function locateTextInArticle(targetText, skipPullQuotes) {
        var target = readerWords(targetText);
        if (!target) return null;
        var chars = [];
        var points = [];   // for each char: [text node, offset]
        var lastBlock = null;
        var walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
        for (var node = walker.nextNode(); node; node = walker.nextNode()) {
          if (isInsideBar(node)) break; // the bar is the body's last child
          var el = elementOf(node);
          if (skipPullQuotes && el.closest('.pull-quote')) continue;
          var block = el.closest(TEXT_BLOCKS) || el;
          var value = node.nodeValue;
          for (var i = 0; i < value.length; i++) {
            var c = readerChar(value.charAt(i));
            if (block !== lastBlock && chars.length && chars[chars.length - 1] !== ' ') {
              chars.push(' ');
              points.push([node, i]);
            }
            lastBlock = block;
            if (c === ' ' && (!chars.length || chars[chars.length - 1] === ' ')) continue;
            for (var k = 0; k < c.length; k++) {
              chars.push(c.charAt(k));
              points.push([node, i]);
            }
          }
        }
        var at = chars.join('').indexOf(target);
        if (at < 0) return null;
        var start = points[at];
        var end = points[at + target.length - 1];
        var range = document.createRange();
        range.setStart(start[0], start[1]);
        range.setEnd(end[0], end[1] + 1);
        var holder = elementOf(range.commonAncestorContainer);
        if (holder !== document.body) return holder;
        var first = elementOf(start[0]);
        return first.closest(TEXT_BLOCKS) || first;
      }

      // A box bookmark can hold more than its box shows (a quote's author, a
      // word study's term): the element whose words the saved text contains.
      function locateTextElement(targetText) {
        try {
          const found = locateTextInArticle(targetText) || locateTextInArticle(targetText, true);
          if (found) return found;
          const candidates = Array.from(document.querySelectorAll('mark, blockquote, .context-box, .word-study-box, p, cite'));
          for (var i = 0; i < candidates.length; i++) {
            const el = candidates[i];
            if (isInsideBar(el)) continue;
            const text = normalizeText(el.textContent);
            if (!text) continue;
            if (text.indexOf(targetText) >= 0 || targetText.indexOf(text) >= 0) return el;
          }
          return null;
        } catch (_) {
          return null;
        }
      }

      // Three tries while the page settles. When the last one finds nothing,
      // RN is told, so it can open the passage instead.
      let targetBookmarkFound = false;
      function locateTargetBookmark(isLastTry) {
        if (!targetBookmark) return;
        const best = locateTextElement(normalizeText(targetBookmark.words));
        if (!best) {
          if (isLastTry === true && !targetBookmarkFound) {
            postToApp({ type: 'TARGET_BOOKMARK_MISSING', bookmarkId: targetBookmark.id });
          }
          return;
        }
        targetBookmarkFound = true;
        postToApp({
          type: 'TARGET_BOOKMARK_LOCATED',
          bookmarkId: targetBookmark.id,
          y: flashElement(best),
        });
      }

      // Scripture reference tap handling
      document.addEventListener('click', function(e) {
        const ref = e.target.closest('.scripture-ref');
        if (ref) {
          e.preventDefault();
          e.stopPropagation();
          postToApp({ type: 'SCRIPTURE_TAP', reference: ref.dataset.ref });
        }
      });

      // Backup height reports
      setTimeout(reportHeight, 500);
      setTimeout(reportHeight, 1000);

      // Reflow the existing document when the iPad window changes size.
      let resizeFrame = 0;
      window.addEventListener('resize', function() {
        cancelAnimationFrame(resizeFrame);
        resizeFrame = requestAnimationFrame(reportHeight);
      });
      
      ${HIGHLIGHTS_SCRIPT}
      ${SELECTION_BAR_SCRIPT}
      ${BOX_BOOKMARKS_SCRIPT}

      // ---- Start -----------------------------------------------------------------
      // Last, after every part of the script above has run. rangy is inlined in
      // the <head>, so initRangy() usually runs at once, and what it calls
      // (healHighlights, postHighlightsChanged, ...) can read the let and const
      // bindings of any part above. Read before its declaration has run, such a
      // binding throws a ReferenceError (the temporal dead zone).
      if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', initRangy);
      } else {
        initRangy();
      }
      true;
    `;
  }, [existingHighlights, targetHighlight, targetBookmark]);

  // Generate HTML with exact typography matching: everything from <head> to
  // </html>. Deliberately free of Aa / theme values (those are custom
  // properties on the <html> start tag, added by webViewDocument below) so
  // this markup only changes with the content or the reading font family.
  const documentMarkup = useMemo(() => {
    const webFont = devotionalWebFont?.family ?? webFontNameFor(readingFont.body);
    const readingFontCss = devotionalWebFont?.css ?? '';
    const strokeFit = HIGHLIGHT_STROKE_FIT[webFont] ?? HIGHLIGHT_STROKE_FIT.Georgia;
    const uiFontStack = "-apple-system, BlinkMacSystemFont, 'Helvetica Neue', Arial, sans-serif";
    const displayFontStack = "'PP Editorial New', Georgia, serif";

    const bodyText = day.bodyText || '';

    const paragraphs = bodyText
      .split(/\n\n+/)
      .map(p => p.trim())
      .filter(p => p.length > 0);

    // Render a single paragraph, handling --- dividers and standalone bold headers
    const renderParagraph = (p: string, isFirst = false): string => {
      // Horizontal rule
      if (/^-{3,}$/.test(p)) return '<hr>';
      // Full-paragraph bold = study method section header (e.g. **LECTIO — Read**)
      const headerMatch = p.match(/^\*\*([^*]+)\*\*$/);
      if (headerMatch) {
        return `<p class="section-header">${escapeHtml(headerMatch[1])}</p>`;
      }
      const inner = renderDevotionalInline(p, day);
      return isFirst ? `<p class="first-paragraph">${inner}</p>` : `<p>${inner}</p>`;
    };

    // Pull quote: surface the day's quotableLine inside the teaching, after
    // the second paragraph — deep enough to land on a reader already inside
    // the text, early enough to carry the rest of the reading. Only rendered
    // when the body is long enough to hold it (4+ paragraphs), and skipped
    // for method-structured days whose second paragraph is a section header.
    const pullQuoteLine = (day.quotableLine || '').trim();
    const pullQuoteIndex =
      pullQuoteLine.length > 0 &&
      paragraphs.length >= 4 &&
      !/^\*\*([^*]+)\*\*$/.test(paragraphs[1]) &&
      !/^-{3,}$/.test(paragraphs[1])
        ? 1
        : -1;
    const pullQuoteHtml = `<aside class="pull-quote" aria-hidden="true">${escapeHtml(pullQuoteLine)}</aside>`;

    const bodyHtml = paragraphs
      .map((p, i) => renderParagraph(p, i === 0) + (i === pullQuoteIndex ? pullQuoteHtml : ''))
      .join('');

    // Divider between body paragraphs and quotes
    const bodyToQuoteDivider = (day.quotes?.length)
      ? '<div class="section-divider"><span class="divider-dots">&middot;&ensp;&middot;&ensp;&middot;</span></div>'
      : '';

    const boxBookmarkAttributes = (kind: BoxBookmarkKind, key: string) =>
      `data-bookmark-kind="${kind}" data-bookmark-key="${escapeHtml(key)}" data-bookmark-token="${escapeHtml(bookmarkIdentityToken({ kind, key }))}"`;

    const quotesHtml = day.quotes?.length
      ? day.quotes.map((q, i) => {
        const bookmarkKey = `${stripOuterQuotes(q.text)} —\u2009${q.author}`;
        return `
        <blockquote>
          <div class="bookmark-btn" data-type="quote" data-index="${i}" ${boxBookmarkAttributes('quote', bookmarkKey)} onclick="handleBookmark(this)">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z"/>
            </svg>
          </div>
          <span class="deco-quote">\u201C</span>
          <p>${escapeHtml(stripOuterQuotes(q.text))}</p>
          <cite>\u2014\u2009${escapeHtml(q.author)}</cite>
        </blockquote>
      `;
      }).join('')
      : '';

    const contextHtml = day.contextNote
      ? `
        <div class="context-box">
          <div class="bookmark-btn" data-type="context" data-index="0" ${boxBookmarkAttributes('context', day.contextNote)} onclick="handleBookmark(this)">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z"/>
            </svg>
          </div>
          <h3>Historical Context</h3>
          <p>${escapeHtml(day.contextNote)}</p>
        </div>
      `
      : '';

    const wordStudy = normalizeWordStudy(day.wordStudy);
    const wordStudyBookmarkKey = typeof wordStudy === 'string'
      ? wordStudy
      : isStructuredWordStudy(wordStudy)
        ? `${wordStudy.term}: ${wordStudy.meaning}`
        : '';
    const wordStudyHtml = typeof wordStudy === 'string'
      ? `
        <div class="word-study-box">
          <div class="bookmark-btn" data-type="wordstudy" data-index="0" ${boxBookmarkAttributes('word-study', wordStudyBookmarkKey)} onclick="handleBookmark(this)">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z"/>
            </svg>
          </div>
          <h3>Word Study</h3>
          <p>${escapeHtml(wordStudy)}</p>
        </div>
      `
      : isStructuredWordStudy(wordStudy)
      ? `
        <div class="word-study-box">
          <div class="bookmark-btn" data-type="wordstudy" data-index="0" ${boxBookmarkAttributes('word-study', wordStudyBookmarkKey)} onclick="handleBookmark(this)">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z"/>
            </svg>
          </div>
          <h3>Word Study</h3>
          <div class="word-term">
            <span class="term">${escapeHtml(wordStudy.term)}</span>
            <span class="original">(${escapeHtml(wordStudy.original)})</span>
          </div>
          <p>${escapeHtml(wordStudy.meaning)}</p>
        </div>
      `
      : '';

    return `
<head>
  <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no">
  <!-- Rangy 1.3.0 (core + classapplier + highlighter) for robust text highlighting, inlined from
       rangy-bundle.ts so saved highlights restore offline. -->
  <script>${RANGY_BUNDLE}</script>
  
  <style>
    /* Aa font size + theme live in custom properties on the <html> element
       (baked into its style attribute, updated in place by pushThemeVars() —
       changing either never reloads the document). Every size or color below
       that depends on the font size or theme must go through one of them. */

    @font-face {
      font-family: 'PP Editorial New';
      src: url(data:font/woff2;base64,${DISPLAY_SERIF_WOFF2_BASE64}) format('woff2');
      font-weight: 400;
      font-style: normal;
      font-display: swap;
    }

    ${readingFontCss}

    * {
      margin: 0;
      padding: 0;
      box-sizing: border-box;
      -webkit-tap-highlight-color: transparent;
    }

    body {
      font-family: '${webFont}', Georgia, serif;
      font-size: var(--body-font-size);
      line-height: var(--body-line-height);
      color: var(--text);
      background: transparent;
      padding: 0 ${CONTENT_PADDING}px 24px;
      max-width: 100%;
      -webkit-user-select: text;
      user-select: text;
    }
    
    /* Staggered dissolve for body content. Long, soft fade — 750ms with a
       gentle cubic-bezier ease-out so text materializes rather than slides.
       Small translateY (6px) keeps it a true fade with just a whisper of
       motion. Transform+opacity only so the compositor handles it on the
       GPU and the JS thread stays free. */
    @keyframes fadeInUp {
      from {
        opacity: 0;
        transform: translateY(6px);
      }
      to {
        opacity: 1;
        transform: translateY(0);
      }
    }

    p, blockquote, .context-box, .word-study-box, .section-divider {
      opacity: 1;
      animation: none;
    }

    /* 90ms stagger, capped: only what's plausibly on the first screen gets a
       deliberate sequence; everything below the fold enters together so the
       tail never sits invisible past ~560ms (audit #9 — the old ladder ran
       to 1860ms on long devotionals). */
    /* nth-of-type, not nth-child: the pull-quote <aside> and <hr> dividers
       are interleaved siblings and would shift every later paragraph's slot */
    @media (prefers-reduced-motion: no-preference) {
      p, blockquote, .context-box, .word-study-box {
        opacity: 0;
        animation: fadeInUp 750ms cubic-bezier(0.22, 1, 0.36, 1) forwards;
        will-change: opacity, transform;
      }

      p:nth-of-type(1)  { animation-delay:   60ms; }
      p:nth-of-type(2)  { animation-delay:  150ms; }
      p:nth-of-type(3)  { animation-delay:  240ms; }
      p:nth-of-type(4)  { animation-delay:  330ms; }
      p:nth-of-type(5)  { animation-delay:  420ms; }
      p:nth-of-type(6)  { animation-delay:  510ms; }
      p:nth-of-type(n+7) { animation-delay:  560ms; }

      aside.pull-quote { animation-delay: 240ms; }
      blockquote     { animation-delay: 560ms; }
      .context-box   { animation-delay: 560ms; }
      .word-study-box { animation-delay: 560ms; }
      .section-divider {
        opacity: 0;
        animation: fadeInUp 0.5s ease-out forwards;
        animation-delay: 0.35s;
      }
    }
    
    /* Selection styling. Keep the text selectable (no touch-callout: none on
       the text) so WKWebView still makes a real selection. The system edit
       menu is off natively; the selection bar below takes its place. */
    ::selection {
      background: var(--selection-bg);
    }
    
    /* Selectable devotional text */
    p, span, div, mark {
      -webkit-user-select: text;
      user-select: text;
    }
    
    /* Highlighter stroke. The band is a background image sized to the
       glyphs rather than to the font's inline box. Source Serif 4's box
       reaches 1.04em above the baseline while its tallest letters stop at
       0.75em and descenders end 0.24em below, so the band starts 0.24em
       down and runs 1.09em: ~0.05em of ink above ascenders and below
       descenders, centred on the letters instead of floating high.
       Uneven corners and cloned box-decoration make a wrapped highlight read
       as one felt-tip sweep with rounded ends on every line. */
    mark {
      color: inherit;
      padding: 0 0.14em;
      margin: 0 -0.14em;
      border-radius: 0.55em 0.3em 0.5em 0.35em;
      -webkit-box-decoration-break: clone;
      box-decoration-break: clone;
      background-color: transparent;
      background-repeat: no-repeat;
      background-size: 100% ${strokeFit.height}em;
      background-position: 0 ${strokeFit.top}em;
    }
    
    mark.highlight-yellow { background-image: var(--hl-yellow-bg); color: var(--hl-yellow-color); }
    mark.highlight-green { background-image: var(--hl-green-bg); color: var(--hl-green-color); }
    mark.highlight-blue { background-image: var(--hl-blue-bg); color: var(--hl-blue-color); }
    mark.highlight-purple { background-image: var(--hl-purple-bg); color: var(--hl-purple-color); }
    mark.highlight-red { background-image: var(--hl-red-bg); color: var(--hl-red-color); }

    .target-highlight-flash {
      animation: targetHighlightFlash 1.8s ease-out;
      box-shadow: 0 0 0 3px var(--flash-ring);
    }

    @keyframes targetHighlightFlash {
      0% { box-shadow: 0 0 0 4px var(--flash-0); }
      55% { box-shadow: 0 0 0 8px var(--flash-55); }
      100% { box-shadow: 0 0 0 0 var(--flash-100); }
    }
    
    /* Body text -- generous paragraph spacing */
    p {
      margin-bottom: calc(var(--body-line-height) * 0.95);
      font-family: '${webFont}', Georgia, serif;
    }

    p.first-paragraph {
      margin-top: 8px;
    }

    /* The floating toolbar follows the final content block. */
    body > :nth-last-child(2) {
      margin-bottom: 0;
    }


    /* Owner-approved upright emphasis retains semantic markup and visible weight. */
    .devotional-emphasis { font-style: normal; font-weight: 600; }

    /* Horizontal rule from --- markdown */
    hr {
      border: none;
      border-top: 1px solid var(--muted);
      opacity: 0.25;
      margin: 28px 0;
    }

    /* Pull quote — the day's quotable line, set inside the teaching */
    aside.pull-quote {
      font-family: ${displayFontStack};
      font-size: calc(var(--body-font-size) * 1.05);
      line-height: 1.5;
      font-style: normal;
      color: var(--accent);
      text-align: center;
      margin: calc(var(--body-line-height) * 1.4) 8px;
      padding: 0 8px;
      /* Not part of the teaching: a selection passes over it (see
         withoutPullQuotes in the page script). */
      -webkit-user-select: none;
      user-select: none;
    }

    /* Study method headers — standalone **BOLD** paragraphs */
    p.section-header {
      font-family: ${uiFontStack};
      font-size: calc(var(--body-font-size) * 0.85);
      font-weight: 600;
      letter-spacing: 0;
      text-transform: none;
      color: var(--muted);
      margin-top: calc(var(--body-line-height) * 1.2);
      margin-bottom: calc(var(--body-line-height) * 0.4);
    }

    /* Section divider -- centered dots */
    .section-divider {
      text-align: center;
      margin: 36px 0 32px;
    }

    .divider-dots {
      font-size: 14px;
      color: var(--muted);
      opacity: 0.35;
      letter-spacing: 4px;
    }

    /* Quotes -- editorial frame with oversized decorative mark */
    blockquote {
      margin: 32px 0 28px;
      padding: 24px 8px 20px;
      border-top: 1px solid var(--quote-border-top);
      border-bottom: 1px solid var(--quote-border-bottom);
      position: relative;
      background: var(--quote-bg);
    }

    /* Large decorative opening quote mark */
    .deco-quote {
      display: block;
      font-family: ${displayFontStack};
      font-size: 57px;
      line-height: 28px;
      color: var(--accent);
      opacity: 0.12;
      margin-bottom: 8px;
      margin-left: -4px;
      font-weight: 400;
    }

    blockquote p {
      font-style: normal;
      margin-bottom: 14px;
      line-height: calc(var(--body-line-height) * 1.05);
      padding-left: 2px;
    }

    blockquote cite {
      font-family: ${uiFontStack};
      font-size: 12px;
      color: var(--muted);
      font-style: normal;
      letter-spacing: 0;
      text-transform: none;
      display: block;
      padding-left: 2px;
    }
    
    /* Context box */
    .context-box, .word-study-box {
      margin-top: 44px;
      background: var(--box-bg);
      border: 1px solid var(--box-border);
      border-radius: 16px;
      padding: 22px;
      position: relative;
    }
    
    h3 {
      font-family: ${uiFontStack};
      font-size: 13px;
      color: var(--muted);
      letter-spacing: 0;
      text-transform: none;
      margin-bottom: 14px;
      font-weight: 600;
    }
    
    .context-box p, .word-study-box p {
      font-size: calc(var(--body-font-size) - 1px);
      line-height: calc(var(--body-line-height) * 0.97);
      color: var(--muted);
      margin: 0;
    }
    
    .word-term {
      margin-bottom: 10px;
    }
    
    .term {
      font-family: Georgia, serif;
      font-size: calc(var(--body-font-size) + 4px);
      color: var(--text);
      font-weight: 400;
    }
    
    .original {
      font-style: normal;
      font-size: calc(var(--body-font-size) - 2px);
      color: var(--accent);
      margin-left: 12px;
    }

    /* Bookmark button on quotes, context, and word study boxes */
    .bookmark-btn {
      position: absolute;
      top: 8px;
      right: 8px;
      width: 32px;
      height: 32px;
      display: flex;
      align-items: center;
      justify-content: center;
      cursor: pointer;
      opacity: 0.4;
      transition: opacity 0.2s;
      z-index: 10;
      -webkit-tap-highlight-color: transparent;
    }
    .bookmark-btn:active { opacity: 0.8; }
    .bookmark-btn.bookmarked { opacity: 1; }
    .bookmark-btn svg { width: 18px; height: 18px; }
    .bookmark-btn.bookmarked svg {
      fill: var(--accent);
      stroke: var(--accent);
    }

    /* Selection bar. One element in four modes (data-mode): the actions, the
       colour step (Back + the five colour dots), tap-to-edit (the dots
       without Back), and a short confirmation. It is the body's last child,
       after the article, so its words never shift a highlight offset. */
    #highlight-toolbar {
      position: absolute;
      top: 0;
      left: 0;
      z-index: 10000;
      display: flex;
      align-items: center;
      max-width: calc(100vw - 16px);
      padding: 6px;
      border-radius: 24px;
      background: var(--toolbar-bg);
      color: var(--toolbar-fg);
      box-shadow: 0 4px 20px rgba(0,0,0,0.3);
      font-family: -apple-system, system-ui, sans-serif;
      opacity: 0;
      visibility: hidden;
      pointer-events: none;
      transform: translateY(4px);
      transition: opacity 160ms ease-out, transform 160ms ease-out, visibility 0s linear 160ms;
      -webkit-touch-callout: none !important;
      -webkit-user-select: none;
      user-select: none;
    }

    #highlight-toolbar.visible {
      opacity: 1;
      visibility: visible;
      pointer-events: auto;
      transform: translateY(0);
      transition: opacity 160ms ease-out, transform 160ms ease-out, visibility 0s;
    }

    /* Reduced motion: the bar fades in place, without movement. */
    @media (prefers-reduced-motion: reduce) {
      #highlight-toolbar,
      #highlight-toolbar.visible {
        transform: none;
      }
    }

    #highlight-toolbar .bar-group,
    #highlight-toolbar .bar-status {
      display: none;
      align-items: center;
    }
    #highlight-toolbar .bar-group { gap: 2px; }
    #highlight-toolbar[data-mode="actions"] .bar-actions,
    #highlight-toolbar[data-mode="colors"] .bar-colors,
    #highlight-toolbar[data-mode="edit"] .bar-colors,
    #highlight-toolbar[data-mode="status"] .bar-status {
      display: flex;
    }
    /* Tap-to-edit has no actions to go back to. */
    #highlight-toolbar[data-mode="edit"] .back-btn { display: none; }

    #highlight-toolbar button {
      margin: 0;
      padding: 0;
      border: 0;
      background: none;
      color: inherit;
      font: inherit;
      cursor: pointer;
      outline: none;
      -webkit-appearance: none;
      appearance: none;
      -webkit-touch-callout: none !important;
      -webkit-user-select: none;
      user-select: none;
      touch-action: manipulation;
      /* Every hit target is at least 44 x 44 pt. */
      min-height: 48px;
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
    }
    #highlight-toolbar button:focus-visible {
      box-shadow: inset 0 0 0 2px var(--accent);
    }
    #highlight-toolbar .lbl {
      font-size: 11px;
      line-height: 1;
      white-space: nowrap;
      pointer-events: none;
    }

    .action-btn,
    .back-btn {
      gap: 4px;
      border-radius: 18px;
    }
    .action-btn { min-width: 60px; }
    .back-btn { width: 44px; }
    .action-btn:active,
    .action-btn.pressed,
    .back-btn:active,
    .back-btn.pressed { background: var(--selection-bg); }
    .action-btn svg,
    .back-btn svg {
      width: 22px;
      height: 22px;
      fill: currentColor;
      pointer-events: none;
    }
    .back-btn svg { width: 20px; height: 20px; }

    #highlight-toolbar .bar-status {
      gap: 8px;
      min-height: 48px;
      padding: 0 12px 0 10px;
      font-size: 14px;
      line-height: 1.2;
      white-space: nowrap;
    }
    .bar-status svg {
      flex: none;
      width: 18px;
      height: 18px;
      fill: var(--accent);
    }

    /* Each swatch is a colour dot in a 44pt hit target. Its aria-label
       names the colour with the label My Library uses. */
    .color-btn {
      min-width: 44px;
    }
    .color-btn .dot {
      width: 28px;
      height: 28px;
      border-radius: 14px;
      border: 2.5px solid transparent;
      transition: transform 0.15s ease, border-color 0.15s ease, box-shadow 0.15s ease;
      pointer-events: none;
    }
    .color-btn:active .dot,
    .color-btn.pressed .dot {
      transform: scale(0.96);
      border-color: rgba(255,255,255,0.9);
      box-shadow: 0 0 0 2px rgba(255,255,255,0.3);
    }

    .color-btn.yellow .dot { background: linear-gradient(135deg, #FFE066, #FFD43B); }
    .color-btn.green .dot { background: linear-gradient(135deg, #69DB7C, #51CF66); }
    .color-btn.blue .dot { background: linear-gradient(135deg, #74C0FC, #4DABF7); }
    .color-btn.purple .dot { background: linear-gradient(135deg, #E599F7, #DA77F2); }
    .color-btn.red .dot { background: linear-gradient(135deg, #FF8787, #FF6B6B); }

    /* Edit mode: tapping an existing highlight shows the colour step with an
       X on the current colour. The X removes the highlight; another colour
       recolours it. */
    .color-btn.remove-mode .dot {
      position: relative;
    }
    .color-btn.remove-mode .dot::after {
      content: '×';
      position: absolute;
      top: 50%;
      left: 50%;
      transform: translate(-50%, -50%);
      font-size: 22px;
      font-weight: 600;
      color: rgba(0, 0, 0, 0.75);
      line-height: 1;
      pointer-events: none;
    }

    /* Scripture reference links */
    .scripture-ref {
      color: var(--accent);
      text-decoration: underline;
      text-decoration-color: var(--scripture-underline);
      text-underline-offset: 3px;
      cursor: pointer;
      -webkit-user-select: none;
      user-select: none;
    }
  </style>
</head>
<body>
  ${bodyHtml}
  ${bodyToQuoteDivider}
  ${quotesHtml}
  ${contextHtml}
  ${wordStudyHtml}
  ${SELECTION_BAR_HTML}
</body>
</html>
    `;
  }, [day, devotionalWebFont, readingFont.body]);

  // Remount only for a different day or a new My Library landing target.
  // Aa font size and theme are deliberately NOT part of the key: they are
  // pushed into the live document (pushThemeVars) so the reader keeps its
  // scroll position, restored highlights and any open selection. The target
  // ids stay because the injected locators close over their baked payloads
  // and only ever post a `y` — there is no scroll-to-target function in the
  // page to call with a new id, so a new target still needs a fresh document.
  const webViewTargetKey = useMemo(() => [
    'devotional-webview',
    day.dayNumber,
    targetHighlight?.id ?? 'no-highlight',
    targetBookmark?.id ?? 'no-bookmark',
  ].join(':'), [day.dayNumber, targetHighlight?.id, targetBookmark?.id]);

  // The WebView `source`: the markup above with a per-document id and the
  // Aa / theme custom properties baked onto the <html> start tag.
  // NOTE: this memo returns the `source` object itself (not just the HTML
  // string) so an unrelated parent re-render can't hand the WebView a fresh
  // `{ html }` identity and force a full document reload. Both deps are
  // strings, so a same-content `day` replacement (e.g. Complete Day marking
  // it read) rebuilds identical markup and keeps this exact source.
  // themeVars is read here only to bake the initial values and is
  // deliberately NOT a dependency: an Aa or theme change must leave this
  // source (and the loaded document) untouched — the new values are pushed
  // into the live document by pushThemeVars below. webViewTargetKey IS one:
  // a remount loads the document from scratch, so it bakes the current values
  // instead of replaying stale ones and catching up with an inject.
  const webViewDocument = useMemo(() => {
    const docId = String(++nextDocumentId);
    const html = `
<!DOCTYPE html>
<html data-doc-id="${docId}" style="${escapeHtml(themeVars.declarations)}">${documentMarkup}`;
    // The page's content for this series and day: every font value sits in
    // <head>, so the markup from </head> on changes only with what the reader
    // sees. The series and day keep two days with the same words apart.
    const content = `${devotionalId ?? ''}#${day.dayNumber}\n${documentMarkup.slice(documentMarkup.indexOf('</head>'))}`;
    return { docId, content, bakedThemeJson: themeVars.json, source: { html } };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- see the note above: themeVars excluded on purpose, webViewTargetKey and devotionalId included on purpose
  }, [documentMarkup, webViewTargetKey, devotionalId]);

  // "Live document" = the document currently loaded in the mounted WebView,
  // identified by mount key + docId. Its first HEIGHT_CHANGE (echoing the
  // docId baked into <html data-doc-id>) is the ready signal for
  // injectJavaScript; until then the baked <html style> is the source of
  // truth. appliedJson tracks the values the document is showing so that an
  // unchanged theme is never pushed twice.
  const liveDocToken = `${webViewTargetKey}|${webViewDocument.docId}`;
  // The document on screen now, for commands that must not reach a newer one.
  const liveDocIdRef = useRef(webViewDocument.docId);
  liveDocIdRef.current = webViewDocument.docId;
  const liveDocTokenRef = useRef(liveDocToken);
  liveDocTokenRef.current = liveDocToken;
  // Which content each document of this mount showed. A reading-font change
  // rebuilds the page under a new docId over the same content, so an Undo
  // from the old page still applies; new content for the day blocks it. Each
  // distinct content is kept once, so every document of the mount stays known.
  const contentNumbersRef = useRef(new Map<string, number>());
  const docContentRef = useRef(new Map<string, number>());
  if (!docContentRef.current.has(webViewDocument.docId)) {
    const contents = contentNumbersRef.current;
    if (!contents.has(webViewDocument.content)) contents.set(webViewDocument.content, contents.size);
    docContentRef.current.set(webViewDocument.docId, contents.get(webViewDocument.content)!);
  }
  const showsSameContent = useCallback((docId: string) => {
    const docContent = docContentRef.current;
    return docId === liveDocIdRef.current
      || (docContent.has(docId) && docContent.get(docId) === docContent.get(liveDocIdRef.current));
  }, []);
  // Highlight changes for the live page, in order, while no page is ready (a
  // font still loading unmounts it): an Undo, or a change an older page with
  // the same content posted. Each waits for the next page's first report.
  const pendingPageChangesRef = useRef<PageChange[]>([]);
  const liveDocRef = useRef<{
    token: string;
    appliedJson: string;
    appliedBookmarkTokensJson: string;
    appliedScreenReader: boolean;
  } | null>(null);

  const pushThemeVars = useCallback((vars: ThemeVars) => {
    const live = liveDocRef.current;
    if (!live || live.token !== liveDocToken) return; // document not ready yet
    if (live.appliedJson === vars.json) return; // already showing these values
    const webView = webViewRef.current;
    if (!webView) return;
    webView.injectJavaScript(buildThemeVarsScript(vars));
    live.appliedJson = vars.json;
  }, [liveDocToken]);

  const pushBookmarkTokens = useCallback((tokens: readonly string[]) => {
    const live = liveDocRef.current;
    if (!live || live.token !== liveDocToken) return;
    const tokensJson = JSON.stringify(tokens);
    if (live.appliedBookmarkTokensJson === tokensJson) return;
    const webView = webViewRef.current;
    if (!webView) return;
    webView.injectJavaScript(buildBookmarkReconcileScript(tokens));
    live.appliedBookmarkTokensJson = tokensJson;
  }, [liveDocToken]);

  // Aa / theme change while mounted: update the live document in place.
  // Before the document is ready this is a no-op; the ready handler below
  // applies the then-current values once.
  useEffect(() => {
    pushThemeVars(themeVars);
  }, [themeVars, pushThemeVars]);

  useEffect(() => {
    pushBookmarkTokens(savedBoxBookmarkTokens);
  }, [pushBookmarkTokens, savedBoxBookmarkTokens]);

  useEffect(() => {
    if (layoutGeneration <= 0) return;
    const live = liveDocRef.current;
    if (!live || live.token !== liveDocToken) return;
    webViewRef.current?.injectJavaScript(buildLayoutGenerationScript(layoutGeneration));
  }, [layoutGeneration, liveDocToken]);

  // Calls a function the page put on window, with JSON-encoded arguments.
  const callPage = useCallback((name: string, ...args: unknown[]) => {
    webViewRef.current?.injectJavaScript(
      `window.${name} && window.${name}(${args.map((arg) => JSON.stringify(arg)).join(', ')}); true;`,
    );
  }, []);

  // VoiceOver or TalkBack: the page moves focus into the selection bar when it
  // opens. A page starts with no screen reader, so nothing is sent while none is on.
  const screenReaderOn = useScreenReaderEnabled();
  const pushScreenReader = useCallback((on: boolean) => {
    const live = liveDocRef.current;
    if (!live || live.token !== liveDocToken) return;
    if (live.appliedScreenReader === on) return;
    live.appliedScreenReader = on;
    callPage('__unfoldSetScreenReader', on);
  }, [callPage, liveDocToken]);

  useEffect(() => {
    pushScreenReader(screenReaderOn);
  }, [pushScreenReader, screenReaderOn]);

  // Android: a key from the native selection menu runs the same page path as
  // the matching button of the iOS bar.
  const handleAndroidMenuSelection = useCallback((event: { nativeEvent: { key: string; selectedText: string } }) => {
    const { key, selectedText } = event.nativeEvent;
    callPage('__unfoldSelectionAction', key, selectedText || '');
  }, [callPage]);

  // The page cannot see which part of it is on screen: the WebView is sized
  // to the whole article and the parent ScrollView scrolls it. When the bar
  // opens, answer with the visible band in page coordinates so the bar can
  // move below a selection that has no room above, and with the id of the
  // request, so the page can drop an answer to an older one. Both frames
  // are measured at once; the answer goes when both are in.
  const measureSelectionViewport = useCallback((requestId: number) => {
    const container = containerRef.current;
    if (!container) return;
    const viewport = viewportRef?.current;
    let page: { top: number; height: number } | null = null;
    let band: { top: number; bottom: number } | null = viewport ? null : { top: 0, bottom: Dimensions.get('window').height };
    const send = () => {
      if (!page || !band) return;
      callPage(
        '__unfoldSetViewport',
        Math.max(0, Math.round(band.top - page.top)),
        Math.min(Math.round(page.height), Math.round(band.bottom - page.top)),
        requestId,
      );
    };
    container.measureInWindow((_x, top, _width, height) => {
      page = { top, height };
      send();
    });
    viewport?.measureInWindow((_x, top, _width, height) => {
      band = { top, bottom: top + height };
      send();
    });
  }, [callPage, viewportRef]);

  // Bookmark and Copy end with a short confirmation in the bar ('' closes it).
  const confirmSelectionAction = useCallback((requestId: number, message: string) => {
    callPage('__unfoldSelectionConfirm', requestId, message);
  }, [callPage]);

  // Undoes `change` on the live page when that page shows the same content.
  // The page then posts the result as a silent change, which the reader saves.
  const sendInverseToLivePage = useCallback((change: PageChange) => {
    if (!showsSameContent(change.docId)) return;
    // A change from the page on screen proves that page runs its scripts.
    const pageReady = Boolean(webViewRef.current) && (
      change.docId === liveDocIdRef.current || liveDocRef.current?.token === liveDocTokenRef.current
    );
    if (!pageReady) {
      pendingPageChangesRef.current.push(change);
      return;
    }
    callPage('__unfoldApplyInverse', { added: change.added, removed: change.removed, reason: change.reason });
  }, [callPage, showsSameContent]);

  useEffect(() => {
    if (!commandRef) return;
    commandRef.current = {
      applyInverse: (change) => {
        sendInverseToLivePage(change);
      },
      scrollToHighlight: (highlight) => {
        callPage('__unfoldLocateHighlight', {
          id: highlight.id,
          highlightedText: highlight.highlightedText,
          serializedRange: highlight.serializedRange,
          color: highlight.color,
          contextBefore: highlight.contextBefore,
          contextAfter: highlight.contextAfter,
        });
      },
      refreshSelectionBar: () => {
        callPage('__unfoldRefreshBar');
      },
      closeSelectionBar: () => {
        callPage('__unfoldCloseBar');
      },
    };
    return () => {
      commandRef.current = null;
    };
  }, [callPage, commandRef, sendInverseToLivePage]);

  const seriesTitleFor = (devotionals: readonly { id: string; title: string }[]) =>
    devotionalTitle || devotionals.find((d) => d.id === devotionalId)?.title || '';

  // Box bookmarks and selection bookmarks for this day. Scripture stores its
  // own reference (its key) and its words between ellipses. Any other kind
  // stores the reference that brings the kind back after a sync, and its
  // words. The store drops a bookmark it already holds.
  const saveDayBookmark = (kind: BookmarkKind, key: string, text: string) => {
    if (!devotionalId) return;
    const store = useUnfoldStore.getState();
    store.addBookmark({
      devotionalId,
      devotionalTitle: seriesTitleFor(store.devotionals),
      dayNumber: resolvedDayNumber,
      dayTitle: dayTitle || day.title || '',
      kind,
      key,
      scriptureReference: kind === 'scripture' ? key : storedReferenceFor(kind),
      scriptureText: kind === 'scripture' ? storedScripturePhrase(text) : text,
      quotedText: text,
    });
  };

  // Bookmark, Share, and Copy from the iOS bar or the Android menu. The page
  // sends Bookmark and Share text with its white space already collapsed.
  const handleSelectionAction = ({ action, text, reference, requestId }: SelectionActionMessage) => {
    switch (action) {
      case 'copy': {
        const plain = text.trim();
        if (!plain) {
          confirmSelectionAction(requestId, '');
          return;
        }
        // copyText, not useCopyConfirmation: the bar shows the confirmation,
        // so a copy does not render the reader again.
        void copyText(plain).then((copied) => {
          if (copied) AccessibilityInfo.announceForAccessibility(COPIED_MESSAGE);
          confirmSelectionAction(requestId, copied ? COPIED_MESSAGE : '');
        });
        return;
      }
      case 'share': {
        const message = formatSelectionShareText({
          text,
          scriptureReference: reference,
          seriesTitle: seriesTitleFor(useUnfoldStore.getState().devotionals),
          dayNumber: resolvedDayNumber,
          dayTitle: dayTitle || day.title,
        });
        // The link is in the message, so no url (it would share twice).
        if (message) Share.share({ message }).catch((error) => logger.warn('Share failed:', error));
        return;
      }
      case 'bookmark': {
        // A Scripture phrase keeps only its words: the quote marks it carries
        // and any ellipsis at its ends stay out of the ellipses it is stored in.
        const words = reference ? unwrapQuotes(text).replace(/^\u2026+|\u2026+$/g, '').trim() : text;
        if (!words || !devotionalId) {
          confirmSelectionAction(requestId, '');
          return;
        }
        // Prose is its own words. A Scripture passage is its reference, so it
        // is saved at most once.
        const kind: BookmarkKind = reference ? 'scripture' : 'excerpt';
        const key = reference || words;
        const exists = findBookmarkByIdentity(useUnfoldStore.getState().bookmarks, {
          devotionalId,
          dayNumber: resolvedDayNumber,
          kind,
          key,
        });
        if (!exists) saveDayBookmark(kind, key, words);
        const message = exists ? BOOKMARK_EXISTS_MESSAGE : BOOKMARK_SAVED_MESSAGE;
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
        AccessibilityInfo.announceForAccessibility(message);
        confirmSelectionAction(requestId, message);
      }
    }
  };

  const handleMessage = (event: any) => {
    try {
      const data = JSON.parse(event.nativeEvent.data);
      if (data.type === 'HIGHLIGHTS_CHANGED' && onHighlightsChanged) {
        // A change still in flight from the previous document (same-key
        // source swap) belongs to a page no longer open. With new content its
        // ranges no longer fit, so it is dropped. Over the same content (a
        // font switch) the reader's change still counts: it is replayed onto
        // the live page, which posts it back to be saved.
        if (data.docId !== webViewDocument.docId) {
          if (typeof data.docId === 'string') {
            sendInverseToLivePage({
              added: Array.isArray(data.removed) ? data.removed : [],
              removed: Array.isArray(data.added) ? data.added : [],
              docId: data.docId,
              reason: 'replay',
            });
          }
          return;
        }
        onHighlightsChanged({
          reason: data.reason,
          removed: Array.isArray(data.removed) ? data.removed : [],
          added: Array.isArray(data.added) ? data.added : [],
          primarySerial: typeof data.primarySerial === 'string' ? data.primarySerial : '',
          silent: !!data.silent,
          docId: data.docId,
        });
      } else if (data.type === 'HIGHLIGHT_FAILED') {
        onHighlightFailed?.();
      } else if (data.type === 'HIGHLIGHTS_LOST') {
        onHighlightsLost?.(Array.isArray(data.serials) ? data.serials : []);
      } else if (data.type === 'SCRIPTURE_TAP' && onScriptureTap) {
        onScriptureTap(data.reference);
      } else if (data.type === 'HEIGHT_CHANGE') {
        // A report still in flight from the previous document (same-key
        // source swap) must not size the new one, even for a frame.
        if (data.docId !== webViewDocument.docId) return;
        const reportGeneration = parseWebViewLayoutGeneration(data.layoutGeneration);
        const isFirstDocumentReport = liveDocRef.current?.token !== liveDocToken;
        if (
          reportGeneration === layoutGeneration
          || (reportGeneration === 0 && isFirstDocumentReport)
        ) {
          setHeightCommit({
            height: Math.max(data.height, 1),
            generation: reportGeneration,
          });
        }
        if (reportGeneration === layoutGeneration) {
          onContentLocations?.(
            parseWebViewParagraphYs(data.paragraphs),
            reportGeneration,
          );
        }
        // First report from the current document ⇒ it is ready for
        // injectJavaScript. It rendered with the baked values; catch it up
        // with anything that changed while it was loading (usually nothing).
        if (isFirstDocumentReport) {
          liveDocRef.current = {
            token: liveDocToken,
            appliedJson: webViewDocument.bakedThemeJson,
            appliedBookmarkTokensJson: savedBoxBookmarkTokens.length > 0 ? '' : '[]',
            appliedScreenReader: false,
          };
          pushThemeVars(themeVars);
          pushBookmarkTokens(savedBoxBookmarkTokens);
          pushScreenReader(screenReaderOn);
          const pendingChanges = pendingPageChangesRef.current;
          pendingPageChangesRef.current = [];
          for (const change of pendingChanges) {
            if (showsSameContent(change.docId)) {
              callPage('__unfoldApplyInverse', { added: change.added, removed: change.removed, reason: change.reason });
            }
          }
          if (layoutGeneration > 0) {
            webViewRef.current?.injectJavaScript(buildLayoutGenerationScript(layoutGeneration));
          }
        }
      } else if (data.type === 'TARGET_HIGHLIGHT_LOCATED' && onTargetHighlightLocated) {
        onTargetHighlightLocated(Math.max(0, Number(data.y) || 0));
      } else if (data.type === 'TARGET_BOOKMARK_LOCATED' && onTargetBookmarkLocated) {
        onTargetBookmarkLocated(Math.max(0, Number(data.y) || 0));
      } else if (data.type === 'TARGET_BOOKMARK_MISSING') {
        onTargetBookmarkMissing?.();
      } else if (data.type === 'SELECTION_ACTIVE') {
        measureSelectionViewport(typeof data.requestId === 'number' ? data.requestId : 0);
      } else if (data.type === 'SELECTION_BAR') {
        const mode: unknown = data.mode;
        if (isAnnouncedBarMode(mode)) AccessibilityInfo.announceForAccessibility(SELECTION_BAR_ANNOUNCEMENTS[mode]);
      } else if (data.type === 'SELECTION_ACTION') {
        const message = parseSelectionAction(data);
        if (message) handleSelectionAction(message);
      } else if (data.type === 'HAPTIC_SELECTION') {
        Haptics.selectionAsync();
      } else if (data.type === 'HAPTIC_IMPACT') {
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      } else if (data.type === 'BOOKMARK') {
        // A box bookmark toggles: the store, not the page, says whether it is saved.
        const kind = bookmarkKindFromBoxType(data.contentType);
        const text = typeof data.text === 'string' ? data.text : '';
        if (!kind || !devotionalId) return;
        const store = useUnfoldStore.getState();
        const existing = findBookmarkByIdentity(store.bookmarks, { devotionalId, dayNumber: resolvedDayNumber, kind, key: text });
        if (existing) store.removeBookmark(existing.id);
        else saveDayBookmark(kind, text, text);
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      }
    } catch (e) {
      logger.error('WebView message parse error:', e);
    }
  };

  // Prepare only the active family's local faces before mounting the document.
  // This avoids a Georgia-to-custom-font reflow that would invalidate Rangy
  // offsets and the reader's initial height measurement.
  if (!devotionalWebFont) {
    return <View style={[styles.container, { height: webViewHeight }]} />;
  }

  return (
    // cssInterop off: through NativeWind's interop the ref never attaches,
    // and the selection bar needs this view's window frame.
    <View ref={containerRef} cssInterop={false} collapsable={false} style={styles.container}>
      <WebView
        key={webViewTargetKey}
        testID={webViewTargetKey}
        ref={webViewRef}
        source={webViewDocument.source}
        containerStyle={{ height: webViewHeight, flex: 0 }}
        style={[styles.webview, { height: webViewHeight }]}
        scrollEnabled={false}
        showsVerticalScrollIndicator={false}
        onMessage={handleMessage}
        menuItems={IS_ANDROID ? SELECTION_ACTIONS : undefined}
        onCustomMenuSelection={IS_ANDROID ? handleAndroidMenuSelection : undefined}
        suppressMenuItems={IS_ANDROID ? undefined : IOS_SUPPRESS_MENU_ITEMS}
        originWhitelist={['about:blank', 'data:']}
        injectedJavaScript={injectedJavaScript}
        androidLayerType="hardware"
        cacheEnabled={true}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    // Expand around the HTML body's padding while following the parent measure.
    marginHorizontal: -CONTENT_PADDING,
  },
  webview: {
    width: '100%',
    backgroundColor: 'transparent',
  },
});
