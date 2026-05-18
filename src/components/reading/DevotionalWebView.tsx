import React, { useRef, useMemo, useState } from 'react';
import { View, StyleSheet, Dimensions } from 'react-native';
import { WebView } from 'react-native-webview';
import * as Haptics from 'expo-haptics';
import { useTheme } from '@/lib/theme';
import { useReadingFont } from '@/lib/useReadingFont';
import { FONT_SIZE_VALUES, FontSize, DevotionalDay, Highlight, HighlightColor, useUnfoldStore } from '@/lib/store';
import { parseScriptureReferences } from '@/lib/scripture-parser';
import { logger } from '@/lib/logger';

interface Quote {
  text: string;
  context: string;
  serializedRange?: string;
  color?: HighlightColor;
}

interface HighlightRemovedEvent {
  text: string;
  color: HighlightColor;
  context: string;
  serializedRange?: string;
}

interface DevotionalWebViewProps {
  day: DevotionalDay;
  fontSize: FontSize;
  onQuoteSelected?: (quote: Quote) => void;
  onHighlightRemoved?: (event: HighlightRemovedEvent) => void;
  existingHighlights?: Highlight[];
  targetHighlight?: Highlight | null;
  onTargetHighlightLocated?: (y: number) => void;
  onScriptureTap?: (reference: string) => void;
  devotionalId?: string;
  devotionalTitle?: string;
  dayNumber?: number;
  dayTitle?: string;
}

const { width: SCREEN_WIDTH } = Dimensions.get('window');
const CONTENT_PADDING = 24;

// Color definitions for highlights
const HIGHLIGHT_COLORS = {
  yellow: { light: 'rgba(240, 200, 80, 0.30)', dark: 'rgba(200, 165, 92, 0.22)' },
  green: { light: 'rgba(107, 191, 123, 0.25)', dark: 'rgba(100, 200, 100, 0.18)' },
  blue: { light: 'rgba(107, 163, 214, 0.25)', dark: 'rgba(100, 150, 255, 0.18)' },
  purple: { light: 'rgba(168, 116, 192, 0.25)', dark: 'rgba(180, 100, 200, 0.18)' },
  red: { light: 'rgba(232, 112, 112, 0.25)', dark: 'rgba(255, 100, 100, 0.18)' },
};

export function DevotionalWebView({
  day,
  fontSize,
  onQuoteSelected,
  onHighlightRemoved,
  existingHighlights = [],
  targetHighlight,
  onTargetHighlightLocated,
  onScriptureTap,
  devotionalId,
  devotionalTitle,
  dayNumber,
  dayTitle,
}: DevotionalWebViewProps) {
  const { colors, isDark } = useTheme();
  const readingFont = useReadingFont();
  const webViewRef = useRef<WebView>(null);

  const [webViewHeight, setWebViewHeight] = useState(200);

  // Inject JS to report content height and apply highlights using rangy
  const injectedJavaScript = useMemo(() => {
    // Collect all individual serialized ranges to restore in a single deserialize call
    const allSerializedRanges: string[] = [];
    existingHighlights.forEach(h => {
      if (h.serializedRange) {
        allSerializedRanges.push(h.serializedRange);
      }
    });
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

    return `
      // Wait for rangy to load (loaded from CDN in HTML head)
      function initRangy() {
        if (typeof rangy === 'undefined') {
          setTimeout(initRangy, 100);
          return;
        }

        rangy.init();

        // Create highlighter instance
        const highlighter = rangy.createHighlighter(document, 'textContent');
        
        // Add class appliers for each highlight color
        const colorConfigs = ${JSON.stringify(HIGHLIGHT_COLORS)};
        const isDark = ${isDark};

        Object.keys(colorConfigs).forEach(color => {
          const bgColor = isDark ? colorConfigs[color].dark : colorConfigs[color].light;
          const applier = rangy.createClassApplier('rangy-highlight-' + color, {
            elementTagName: 'mark',
            elementProperties: {
              style: 'background: ' + bgColor + '; color: inherit; padding: 0; border-radius: 2px;',
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
        const targetHighlight = ${JSON.stringify(targetHighlightPayload)};
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
        
        // Report height after highlights applied
        setTimeout(reportHeight, 100);
        setTimeout(locateTargetHighlight, 150);
        setTimeout(locateTargetHighlight, 500);
        setTimeout(locateTargetHighlight, 1000);
      }
      
      function reportHeight() {
        const height = document.body.scrollHeight;
        window.ReactNativeWebView.postMessage(JSON.stringify({
          type: 'HEIGHT_CHANGE',
          height: height
        }));
      }

      function normalizeText(value) {
        return String(value || '').replace(/\s+/g, ' ').trim().toLowerCase();
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

      function locateTargetHighlight() {
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
          best = locateTargetTextFallback(targetText);
        }
        if (!best) return;
        best.classList.add('target-highlight-flash');
        setTimeout(function() {
          best.classList.remove('target-highlight-flash');
        }, 1800);

        const rect = best.getBoundingClientRect();
        window.ReactNativeWebView.postMessage(JSON.stringify({
          type: 'TARGET_HIGHLIGHT_LOCATED',
          highlightId: targetHighlight.id,
          y: rect.top + window.scrollY,
        }));
      }

      function locateTargetTextFallback(targetText) {
        try {
          const walker = document.createTreeWalker(
            document.body,
            NodeFilter.SHOW_TEXT,
            {
              acceptNode: function(node) {
                const text = normalizeText(node.nodeValue);
                return text && text.indexOf(targetText) >= 0
                  ? NodeFilter.FILTER_ACCEPT
                  : NodeFilter.FILTER_REJECT;
              }
            }
          );

          const node = walker.nextNode();
          return node && node.parentElement ? node.parentElement : null;
        } catch (_) {
          return null;
        }
      }
      
      // Initialize on load
      if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', initRangy);
      } else {
        initRangy();
      }
      
      // Scripture reference tap handling
      document.addEventListener('click', function(e) {
        const ref = e.target.closest('.scripture-ref');
        if (ref) {
          e.preventDefault();
          e.stopPropagation();
          window.ReactNativeWebView.postMessage(JSON.stringify({
            type: 'SCRIPTURE_TAP',
            reference: ref.dataset.ref
          }));
        }
      });

      // Backup height reports
      setTimeout(reportHeight, 500);
      setTimeout(reportHeight, 1000);
      
      // Selection handling
      let selectedText = '';
      let selectionRange = null;
      let toolbarShown = false;
      const toolbar = document.getElementById('highlight-toolbar');

      function positionToolbar() {
        const selection = window.getSelection();
        if (!selection.rangeCount) return;

        const range = selection.getRangeAt(0);
        const rect = range.getBoundingClientRect();

        // IMPORTANT: this WebView is not the scroller. It is height-sized to the
        // full devotional body and the React Native parent ScrollView scrolls it.
        // So window.innerHeight is effectively the full WebView/document height,
        // not the visible phone viewport. Parking the picker in viewport bands
        // sends it to the top/bottom of the entire article, off screen. Anchor it
        // back near the selected text, which is how the working picker behaved.
        var vh = window.innerHeight;
        var scrollY = window.scrollY || window.pageYOffset || 0;
        var nativeCalloutBelow = rect.top < vh * 0.35;

        var top;
        if (nativeCalloutBelow) {
          // Native menu tends to go below this selection; put our picker above.
          top = rect.top + scrollY - 60;
          if (top < scrollY + 10) {
            // Not enough room above; push below the selection and native menu.
            top = rect.bottom + scrollY + 90;
          }
        } else {
          // Native menu tends to go above this selection; put ours below.
          top = rect.bottom + scrollY + 20;
          if (top > scrollY + vh - 60) top = rect.top + scrollY - 60;
        }

        // Clamp inside the document, not into viewport safe bands.
        var maxTop = Math.max(10, document.body.scrollHeight - 60);
        if (top < 10) top = 10;
        if (top > maxTop) top = maxTop;

        toolbar.style.top = top + 'px';
        // Left centering handled by CSS (left:50% + margin-left)
      }

      function showToolbar() {
        if (!toolbarShown) {
          toolbarShown = true;
          // Request haptic feedback from React Native
          window.ReactNativeWebView.postMessage(JSON.stringify({
            type: 'HAPTIC_SELECTION'
          }));
        }
        toolbar.classList.add('visible');
      }

      function hideToolbar() {
        toolbarShown = false;
        // Start fade-out immediately. Clear edit-mode state atomically so
        // handlers don't see a half-dismissed state, but defer the visual
        // cleanup (remove-mode X, edit-mode class) until after the 200ms
        // fade completes so the user doesn't see the X pop off mid-fade.
        toolbar.classList.remove('visible');
        isEditMode = false;
        editingMark = null;
        editingColor = '';
        editingText = '';
        editingContext = '';
        editingSerializedRange = '';

        setTimeout(function() {
          // If the toolbar was re-shown during the fade, leave its classes alone
          if (toolbarShown) return;
          toolbar.classList.remove('edit-mode');
          document.querySelectorAll('.color-btn').forEach(function(b) {
            b.classList.remove('remove-mode');
          });
        }, 220);
      }

      // Edit-mode state (tap-to-unhighlight)
      let isEditMode = false;
      let editingMark = null;
      let editingColor = '';
      let editingText = '';
      let editingContext = '';
      // Rangy serialized range of the highlight being edited — used as the
      // canonical key for matching against the store-side highlights. More
      // reliable than text+color+context because it encodes exact char offsets.
      let editingSerializedRange = '';

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

      function positionToolbarOverEl(el) {
        if (!el) return;
        const rect = el.getBoundingClientRect();
        let top = rect.bottom + 12;
        if (top > window.innerHeight - 60) top = rect.top - 60;
        if (top < 10) top = 10;
        toolbar.style.top = top + 'px';
      }

      function enterEditMode(markEl, color) {
        isEditMode = true;
        editingMark = markEl;
        editingColor = color;
        editingText = markEl.textContent || '';
        // Capture the rangy serialized form of this highlight for canonical
        // matching against the store on the RN side.
        try {
          var rangyHl = window.rangyHighlighter && window.rangyHighlighter.getHighlightForElement
            ? window.rangyHighlighter.getHighlightForElement(markEl)
            : null;
          editingSerializedRange = getRangySerial(rangyHl);
        } catch (_) {
          editingSerializedRange = '';
        }
        // Capture ~100 chars of parent context around the mark as a fallback
        // tiebreaker for store-side matching when serializedRange is missing.
        const parent = markEl.parentElement;
        const parentText = (parent && parent.textContent) || '';
        const markStart = parentText.indexOf(editingText);
        if (markStart >= 0) {
          const ctxStart = Math.max(0, markStart - 50);
          const ctxEnd = Math.min(parentText.length, markStart + editingText.length + 50);
          editingContext = parentText.substring(ctxStart, ctxEnd);
        } else {
          editingContext = editingText.substring(0, 100);
        }

        // Mark matching color button, hide others via .edit-mode class
        document.querySelectorAll('.color-btn').forEach(function(b) {
          b.classList.remove('remove-mode');
        });
        const matchBtn = toolbar.querySelector('.color-btn[data-color="' + color + '"]');
        if (matchBtn) matchBtn.classList.add('remove-mode');
        toolbar.classList.add('edit-mode');

        positionToolbarOverEl(markEl);
        showToolbar();
      }

      function removeEditHighlight() {
        if (!editingMark) return;
        const removedText = editingText;
        const removedColor = editingColor;
        const removedContext = editingContext;
        const removedSerializedRange = editingSerializedRange;

        try {
          if (window.rangyHighlighter && window.rangyHighlighter.getHighlightForElement) {
            var rangyHl = window.rangyHighlighter.getHighlightForElement(editingMark);
            if (rangyHl) {
              window.rangyHighlighter.removeHighlights([rangyHl]);
            } else {
              // Fallback: manually unwrap the mark
              const parent = editingMark.parentNode;
              if (parent) {
                while (editingMark.firstChild) {
                  parent.insertBefore(editingMark.firstChild, editingMark);
                }
                parent.removeChild(editingMark);
                parent.normalize && parent.normalize();
              }
            }
          }
        } catch (err) {}

        window.ReactNativeWebView.postMessage(JSON.stringify({ type: 'HAPTIC_IMPACT' }));
        window.ReactNativeWebView.postMessage(JSON.stringify({
          type: 'HIGHLIGHT_REMOVED',
          text: removedText,
          color: removedColor,
          context: removedContext,
          serializedRange: removedSerializedRange
        }));

        hideToolbar();
      }

      // Change the color of an existing highlight in place. Uses rangy's own
      // character-range API so we don't hold onto a DOM Range that gets
      // detached when the mark is unwrapped.
      function recolorEditHighlight(newColor) {
        if (!editingMark || !window.rangyHighlighter) return;
        const removedText = editingText;
        const removedColor = editingColor;
        const removedContext = editingContext;
        const removedSerializedRange = editingSerializedRange;

        var serializedHighlight = '';
        try {
          var rangyHl = window.rangyHighlighter.getHighlightForElement(editingMark);
          if (rangyHl) {
            var charRange = rangyHl.characterRange;
            var containerElementId = rangyHl.containerElementId;

            // Remove the old highlight
            window.rangyHighlighter.removeHighlights([rangyHl]);

            // Re-highlight the same character range with the new color
            var beforeSerialized = '';
            try { beforeSerialized = window.rangyHighlighter.serialize(); } catch(_) {}

            window.rangyHighlighter.highlightCharacterRanges(
              'rangy-highlight-' + newColor,
              [charRange],
              { containerElementId: containerElementId, exclusive: true }
            );

            var afterSerialized = window.rangyHighlighter.serialize();
            if (beforeSerialized) {
              var beforeParts = beforeSerialized.split('|');
              var afterParts = afterSerialized.split('|');
              var newParts = afterParts.slice(beforeParts.length);
              serializedHighlight = newParts.length > 0 ? newParts.join('|') : afterSerialized;
            } else {
              serializedHighlight = afterSerialized;
            }
          }
        } catch (err) {}

        window.ReactNativeWebView.postMessage(JSON.stringify({ type: 'HAPTIC_IMPACT' }));
        // Remove the old highlight from the store
        window.ReactNativeWebView.postMessage(JSON.stringify({
          type: 'HIGHLIGHT_REMOVED',
          text: removedText,
          color: removedColor,
          context: removedContext,
          serializedRange: removedSerializedRange
        }));
        // Add the new highlight to the store
        window.ReactNativeWebView.postMessage(JSON.stringify({
          type: 'QUOTE_SELECTED',
          text: removedText,
          context: removedContext,
          highlightApplied: true,
          serializedRange: serializedHighlight,
          color: newColor
        }));

        hideToolbar();
      }

      function checkSelection() {
        // Edit mode is a tap-driven flow, not a selection-driven one.
        // Selection will be empty while the edit toolbar is up, and we
        // don't want this function to race with enterEditMode() and hide
        // the toolbar out from under the user.
        if (isEditMode) return;

        const selection = window.getSelection();
        const newText = selection ? selection.toString().trim() : '';

        if (newText.length > 5 && newText !== selectedText) {
          selectedText = newText;
          try {
            selectionRange = selection.getRangeAt(0).cloneRange();
          } catch(e) {
            selectionRange = null;
          }
          positionToolbar();
          showToolbar();
        } else if (newText.length <= 5) {
          selectedText = '';
          hideToolbar();
        }
      }

      // Listen for selection changes (primary mechanism on iOS)
      document.addEventListener('selectionchange', function() {
        setTimeout(checkSelection, 50);
      });

      // Backup: also check on touchend
      document.addEventListener('touchend', function() {
        setTimeout(checkSelection, 150);
      });

      // Prevent toolbar touches from clearing the selection.
      // Use pointer-events CSS + touchstart only on the toolbar container
      // (not preventDefault which kills child touchend on iOS WebViews).
      toolbar.addEventListener('touchstart', function(e) {
        e.stopPropagation();
      }, { passive: true });

      // Handle color button taps via BOTH touchend and click for reliability.
      // On iOS WebViews, touchend can be swallowed when the native selection
      // callout is present, so we also listen for click as a fallback.
      //
      // CRITICAL: We snapshot the selection at touchstart time into btn._snap.
      // Reason: when the user taps a color button on iOS, the native callout
      // dismisses the text selection, which fires selectionchange, which calls
      // checkSelection() ~50ms later and clears selectedText + hides toolbar.
      // If click fires AFTER that clear (common on iOS WKWebView, 100-200ms
      // after touchstart), handleColorTap would see empty selectedText and
      // silently return. The snapshot keeps the text+range frozen for the
      // duration of the tap sequence.
      function handleColorTap(btn, e) {
        // Safe event suppression — e may be a passive touchstart event
        // where preventDefault() throws, so wrap in try/catch.
        try { e.preventDefault(); } catch(_) {}
        try { e.stopPropagation(); } catch(_) {}

        var color = btn.dataset.color;

        // Edit mode: full color menu is visible with an X on the current color.
        // Tapping the X (same color as current) removes the highlight.
        // Tapping any other color recolors the highlight in place.
        if (isEditMode) {
          if (color === editingColor) {
            removeEditHighlight();
          } else {
            recolorEditHighlight(color);
          }
          btn._snap = null;
          return;
        }

        var snap = btn._snap;
        var snapText = (snap && snap.text) || selectedText;
        var snapRange = (snap && snap.range) || selectionRange;

        if (!snapText || !window.rangyHighlighter) {
          return;
        }

        // Haptic feedback for color tap
        window.ReactNativeWebView.postMessage(JSON.stringify({
          type: 'HAPTIC_IMPACT'
        }));

        var context = '';
        if (snapRange) {
          var container = snapRange.commonAncestorContainer;
          var element = container.nodeType === 3 ? container.parentElement : container;
          context = element && element.textContent ? element.textContent.substring(0, 150) : '';
        }

        var highlightApplied = false;
        var serializedHighlight = '';

        try {
          var selection = window.getSelection();
          if (snapRange) {
            selection.removeAllRanges();
            selection.addRange(snapRange);
          }

          // Capture serialization BEFORE to extract only the new highlight
          var beforeSerialized = '';
          try { beforeSerialized = window.rangyHighlighter.serialize(); } catch(_) {}

          window.rangyHighlighter.highlightSelection('rangy-highlight-' + color, { exclusive: true });
          highlightApplied = true;

          // Extract only the newly added highlight entry from serialization
          // rangy serializes all highlights as pipe-separated entries
          var afterSerialized = window.rangyHighlighter.serialize();
          if (beforeSerialized) {
            // New entries are appended after existing ones
            var beforeParts = beforeSerialized.split('|');
            var afterParts = afterSerialized.split('|');
            var newParts = afterParts.slice(beforeParts.length);
            serializedHighlight = newParts.length > 0 ? newParts.join('|') : afterSerialized;
          } else {
            serializedHighlight = afterSerialized;
          }
        } catch (err) {
          console.log('Highlight failed:', err);
        }

        window.ReactNativeWebView.postMessage(JSON.stringify({
          type: 'QUOTE_SELECTED',
          text: snapText,
          context: context,
          highlightApplied: highlightApplied,
          serializedRange: serializedHighlight,
          color: color
        }));

        window.getSelection().removeAllRanges();
        hideToolbar();
        selectedText = '';
        btn._snap = null;
      }

      document.querySelectorAll('.color-btn').forEach(function(btn) {
        var handled = false;

        // touchstart: stop propagation to keep selection alive, but do NOT
        // preventDefault — that kills the click event which is our primary
        // handler on iOS WKWebView. Snapshot the current selection so it
        // survives iOS callout dismissal before click fires.
        btn.addEventListener('touchstart', function(e) {
          e.stopPropagation();
          handled = false;
          btn._snap = { text: selectedText, range: selectionRange };
          // Ultimate fallback: if neither touchend nor click fires within
          // 200ms, trigger handleColorTap directly using the snapshot.
          setTimeout(function() {
            if (!handled && btn._snap && btn._snap.text) {
              handled = true;
              handleColorTap(btn, e);
            }
          }, 200);
        }, { passive: true });

        btn.addEventListener('touchend', function(e) {
          if (!handled) {
            handled = true;
            handleColorTap(btn, e);
          }
        });

        // click is the PRIMARY handler — most reliable on iOS WKWebView
        // since touchend can be swallowed by native selection callout dismissal.
        btn.addEventListener('click', function(e) {
          if (!handled) {
            handled = true;
            handleColorTap(btn, e);
          }
        });
      });

      // Hide toolbar when tapping elsewhere
      document.addEventListener('touchend', function(e) {
        if (!e.target.closest('#highlight-toolbar')) {
          setTimeout(function() {
            // Edit mode is dismissed by the mark-click handler (tap outside marks).
            // Don't let the idle-selection check race with it.
            if (isEditMode) return;
            var selection = window.getSelection();
            if (!selection || !selection.toString().trim()) {
              hideToolbar();
              selectedText = '';
            }
          }, 200);
        }
      });

      // Tap-to-edit existing highlights. Runs in capture phase so it intercepts
      // before scripture-ref/bookmark handlers. Tapping a <mark class="highlight-*">
      // enters edit mode; tapping anywhere else (not toolbar, not mark) dismisses.
      document.addEventListener('click', function(e) {
        if (e.target.closest('#highlight-toolbar')) return;

        // Don't interfere mid-selection
        var sel = window.getSelection();
        if (sel && sel.toString().trim().length > 5) return;

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
          window.ReactNativeWebView.postMessage(JSON.stringify({ type: 'HAPTIC_SELECTION' }));
          enterEditMode(mark, foundColor);
          return;
        }

        if (isEditMode) {
          hideToolbar();
        }
      }, true);

      // Bookmark button handler for quotes, context boxes, and word study boxes
      window.handleBookmark = function(el) {
        var type = el.getAttribute('data-type');
        var index = el.getAttribute('data-index');
        var parent = el.parentElement;
        var text = '';

        if (type === 'quote') {
          var p = parent.querySelector('p');
          var cite = parent.querySelector('cite');
          text = (p ? p.textContent : '') + (cite ? ' ' + cite.textContent : '');
        } else if (type === 'context') {
          text = parent.querySelector('p') ? parent.querySelector('p').textContent : '';
        } else if (type === 'wordstudy') {
          var term = parent.querySelector('.term');
          var meaning = parent.querySelectorAll('p');
          text = (term ? term.textContent + ': ' : '') + (meaning.length > 0 ? meaning[meaning.length - 1].textContent : '');
        }

        var isNowBookmarked = !el.classList.contains('bookmarked');
        el.classList.toggle('bookmarked');

        window.ReactNativeWebView.postMessage(JSON.stringify({
          type: 'BOOKMARK',
          contentType: type,
          text: text.trim(),
          index: parseInt(index) || 0,
          isBookmarked: isNowBookmarked
        }));
      };

      true;
    `;
  }, [existingHighlights, isDark, targetHighlight]);

  // Generate HTML with exact typography matching
  const htmlContent = useMemo(() => {
    const fontSizes = FONT_SIZE_VALUES[fontSize];
    const bodyFontSize = fontSizes.body;
    const lineHeight = bodyFontSize * 1.75;

    const getWebFontName = (nativeFont: string) => {
      const fontMap: Record<string, string> = {
        'SourceSerifPro_400Regular': 'Source Serif 4',
        'EBGaramond_400Regular': 'EB Garamond',
        'Lora_400Regular': 'Lora',
        'Inter_400Regular': 'Inter',
        'CrimsonText_400Regular': 'Crimson Text',
        'Merriweather_400Regular': 'Merriweather',
      };
      return fontMap[readingFont.body] || 'Georgia';
    };

    const webFont = getWebFontName(readingFont.body);
    const bodyColor = isDark ? '#E8E4DC' : '#1A1A1A';
    const mutedColor = isDark ? '#E8E4DC' : '#5A534E';
    const accentColor = colors.accent;
    const inputBg = isDark ? '#1F1F1F' : '#EDE8E0';     // warmer, visible surface separation

    const bodyText = day.bodyText || '';

    const paragraphs = bodyText
      .split(/\n\n+/)
      .map(p => p.trim())
      .filter(p => p.length > 0);

    // Escape HTML and wrap scripture references in tappable spans
    const escapeAndLinkScripture = (text: string): string => {
      const refs = parseScriptureReferences(text);
      if (refs.length === 0) return escapeHtml(text);

      let result = '';
      let lastIdx = 0;
      for (const ref of refs) {
        result += escapeHtml(text.substring(lastIdx, ref.startIndex));
        result += `<span class="scripture-ref" data-ref="${escapeHtml(ref.reference)}">${escapeHtml(ref.reference)}</span>`;
        lastIdx = ref.endIndex;
      }
      result += escapeHtml(text.substring(lastIdx));
      return result;
    };

    // Convert inline markdown to HTML — runs AFTER escapeAndLinkScripture
    // because `*` is not an HTML special char and survives escaping unchanged.
    const applyInlineMarkdown = (escaped: string): string => escaped
      .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
      .replace(/\*([^*]+)\*/g, '<em>$1</em>');

    // Render a single paragraph, handling --- dividers and standalone bold headers
    const renderParagraph = (p: string, isFirst = false): string => {
      // Horizontal rule
      if (/^-{3,}$/.test(p)) return '<hr>';
      // Full-paragraph bold = study method section header (e.g. **LECTIO — Read**)
      const headerMatch = p.match(/^\*\*([^*]+)\*\*$/);
      if (headerMatch) {
        return `<p class="section-header">${escapeHtml(headerMatch[1])}</p>`;
      }
      const inner = applyInlineMarkdown(escapeAndLinkScripture(p));
      return isFirst ? `<p class="first-paragraph">${inner}</p>` : `<p>${inner}</p>`;
    };

    const bodyHtml = paragraphs.map((p, i) => renderParagraph(p, i === 0)).join('');

    // Divider between body paragraphs and quotes
    const bodyToQuoteDivider = (day.quotes?.length)
      ? '<div class="section-divider"><span class="divider-dots">&middot;&ensp;&middot;&ensp;&middot;</span></div>'
      : '';

    const quotesHtml = day.quotes?.length
      ? day.quotes.map((q, i) => `
        <blockquote>
          <div class="bookmark-btn" data-type="quote" data-index="${i}" onclick="handleBookmark(this)">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z"/>
            </svg>
          </div>
          <span class="deco-quote">\u201C</span>
          <p>${escapeHtml(q.text)}</p>
          <cite>\u2014\u2009${escapeHtml(q.author)}</cite>
        </blockquote>
      `).join('')
      : '';

    const contextHtml = day.contextNote
      ? `
        <div class="context-box">
          <div class="bookmark-btn" data-type="context" data-index="0" onclick="handleBookmark(this)">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z"/>
            </svg>
          </div>
          <h3>Historical Context</h3>
          <p>${escapeHtml(day.contextNote)}</p>
        </div>
      `
      : '';

    const wordStudyHtml = day.wordStudy
      ? `
        <div class="word-study-box">
          <div class="bookmark-btn" data-type="wordstudy" data-index="0" onclick="handleBookmark(this)">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z"/>
            </svg>
          </div>
          <h3>Word Study</h3>
          <div class="word-term">
            <span class="term">${escapeHtml(day.wordStudy.term)}</span>
            <span class="original">(${escapeHtml(day.wordStudy.original)})</span>
          </div>
          <p>${escapeHtml(day.wordStudy.meaning)}</p>
        </div>
      `
      : '';

    return `
<!DOCTYPE html>
<html>
<head>
  <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no">
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=Gupter:wght@400;500;700&family=${encodeURIComponent(webFont)}:ital,wght@0,400;0,600;1,400&family=Inter:wght@400;500&display=swap" rel="stylesheet">
  <!-- Rangy for robust text highlighting — load from CDN. Inlined fallback was overwriting the CDN-loaded global every run, breaking deserialize. -->
  <script src="https://cdn.jsdelivr.net/npm/rangy@1.3.0/lib/rangy-core.min.js"></script>
  <script src="https://cdn.jsdelivr.net/npm/rangy@1.3.0/lib/rangy-classapplier.min.js"></script>
  <script src="https://cdn.jsdelivr.net/npm/rangy@1.3.0/lib/rangy-highlighter.min.js"></script>
  
  <style>
    * {
      margin: 0;
      padding: 0;
      box-sizing: border-box;
      -webkit-tap-highlight-color: transparent;
    }

    body {
      font-family: '${webFont}', Georgia, serif;
      font-size: ${bodyFontSize}px;
      line-height: ${lineHeight}px;
      color: ${bodyColor};
      background: transparent;
      padding: 0 ${CONTENT_PADDING}px 60px;
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

    p, blockquote, .context-box, .word-study-box {
      opacity: 0;
      animation: fadeInUp 750ms cubic-bezier(0.22, 1, 0.36, 1) forwards;
      will-change: opacity, transform;
    }

    /* 90ms stagger — slow enough to read as a deliberate sequence without
       dragging the last paragraph too far past the first. */
    p:nth-child(1)  { animation-delay:   60ms; }
    p:nth-child(2)  { animation-delay:  150ms; }
    p:nth-child(3)  { animation-delay:  240ms; }
    p:nth-child(4)  { animation-delay:  330ms; }
    p:nth-child(5)  { animation-delay:  420ms; }
    p:nth-child(6)  { animation-delay:  510ms; }
    p:nth-child(7)  { animation-delay:  600ms; }
    p:nth-child(8)  { animation-delay:  690ms; }
    p:nth-child(9)  { animation-delay:  780ms; }
    p:nth-child(10) { animation-delay:  870ms; }
    p:nth-child(11) { animation-delay:  960ms; }
    p:nth-child(12) { animation-delay: 1050ms; }
    p:nth-child(13) { animation-delay: 1140ms; }
    p:nth-child(14) { animation-delay: 1230ms; }
    p:nth-child(15) { animation-delay: 1320ms; }
    p:nth-child(16) { animation-delay: 1410ms; }
    p:nth-child(17) { animation-delay: 1500ms; }
    p:nth-child(18) { animation-delay: 1590ms; }
    p:nth-child(19) { animation-delay: 1680ms; }
    p:nth-child(20) { animation-delay: 1770ms; }
    p:nth-child(n+21) { animation-delay: 1860ms; }

    blockquote     { animation-delay: 600ms; }
    .context-box   { animation-delay: 690ms; }
    .word-study-box { animation-delay: 690ms; }
    
    /* Selection styling. Keep iOS text callout available so WKWebView still
       creates a real text selection; the custom highlight picker is positioned
       away from the native menu instead of disabling selection globally. */
    ::selection {
      background: ${accentColor}40;
    }
    
    /* Selectable devotional text */
    p, span, div, mark {
      -webkit-user-select: text;
      user-select: text;
    }
    
    /* Highlight colors */
    mark {
      color: inherit;
      padding: 0;
      border-radius: 2px;
    }
    
    mark.highlight-yellow { background: ${HIGHLIGHT_COLORS.yellow[isDark ? 'dark' : 'light']}; }
    mark.highlight-green { background: ${HIGHLIGHT_COLORS.green[isDark ? 'dark' : 'light']}; }
    mark.highlight-blue { background: ${HIGHLIGHT_COLORS.blue[isDark ? 'dark' : 'light']}; }
    mark.highlight-purple { background: ${HIGHLIGHT_COLORS.purple[isDark ? 'dark' : 'light']}; }
    mark.highlight-red { background: ${HIGHLIGHT_COLORS.red[isDark ? 'dark' : 'light']}; }

    .target-highlight-flash {
      animation: targetHighlightFlash 1.8s ease-out;
      box-shadow: 0 0 0 3px ${accentColor}66;
    }

    @keyframes targetHighlightFlash {
      0% { box-shadow: 0 0 0 4px ${accentColor}99; }
      55% { box-shadow: 0 0 0 8px ${accentColor}33; }
      100% { box-shadow: 0 0 0 0 ${accentColor}00; }
    }
    
    /* Body text -- generous paragraph spacing */
    p {
      margin-bottom: ${lineHeight * 0.95}px;
      font-family: '${webFont}', Georgia, serif;
    }

    p.first-paragraph {
      margin-top: 8px;
    }


    /* Horizontal rule from --- markdown */
    hr {
      border: none;
      border-top: 1px solid ${mutedColor};
      opacity: 0.25;
      margin: 28px 0;
    }

    /* Study method headers — standalone **BOLD** paragraphs */
    p.section-header {
      font-family: 'Inter', sans-serif;
      font-size: ${bodyFontSize * 0.72}px;
      font-weight: 600;
      letter-spacing: 1.2px;
      text-transform: uppercase;
      color: ${accentColor};
      margin-top: ${lineHeight * 1.2}px;
      margin-bottom: ${lineHeight * 0.4}px;
    }

    /* Section divider -- centered dots */
    .section-divider {
      text-align: center;
      margin: 36px 0 32px;
      opacity: 0;
      animation: fadeInUp 0.5s ease-out forwards;
      animation-delay: 0.35s;
    }

    .divider-dots {
      font-size: 14px;
      color: ${mutedColor};
      opacity: 0.35;
      letter-spacing: 4px;
    }

    /* Quotes -- elevated with oversized decorative mark */
    blockquote {
      margin: 32px 0 28px;
      padding: 24px 22px 20px;
      border-left: 2px solid ${accentColor};
      position: relative;
      background: ${isDark ? `${accentColor}08` : `${accentColor}0F`};
      border-radius: 0 8px 8px 0;
    }

    /* Large decorative opening quote mark */
    .deco-quote {
      display: block;
      font-family: Georgia, 'Times New Roman', serif;
      font-size: 64px;
      line-height: 28px;
      color: ${accentColor};
      opacity: 0.12;
      margin-bottom: 8px;
      margin-left: -4px;
      font-weight: 400;
    }

    blockquote p {
      font-style: italic;
      margin-bottom: 14px;
      line-height: ${lineHeight * 1.05}px;
      padding-left: 2px;
    }

    blockquote cite {
      font-family: 'Inter', sans-serif;
      font-size: 12px;
      color: ${mutedColor};
      font-style: normal;
      letter-spacing: 0.8px;
      text-transform: uppercase;
      display: block;
      padding-left: 2px;
    }
    
    /* Context box */
    .context-box, .word-study-box {
      margin-top: 44px;
      background: ${inputBg};
      border-radius: 16px;
      padding: 22px;
      position: relative;
    }
    
    h3 {
      font-family: 'Inter', sans-serif;
      font-size: 11px;
      color: ${accentColor};
      letter-spacing: 1.2px;
      text-transform: uppercase;
      margin-bottom: 14px;
      font-weight: 500;
    }
    
    .context-box p, .word-study-box p {
      font-size: ${bodyFontSize - 1}px;
      line-height: ${lineHeight * 0.97}px;
      color: ${mutedColor};
      margin: 0;
    }
    
    .word-term {
      margin-bottom: 10px;
    }
    
    .term {
      font-family: Georgia, serif;
      font-size: ${bodyFontSize + 4}px;
      color: ${bodyColor};
      font-weight: 400;
    }
    
    .original {
      font-style: italic;
      font-size: ${bodyFontSize - 2}px;
      color: ${accentColor};
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
      fill: ${accentColor};
      stroke: ${accentColor};
    }

    /* Highlight toolbar */
    #highlight-toolbar {
      position: absolute;
      background: ${isDark ? '#2a2a2a' : '#ffffff'};
      border-radius: 24px;
      padding: 8px 12px;
      display: flex;
      gap: 8px;
      box-shadow: 0 4px 20px rgba(0,0,0,0.3);
      z-index: 10000;
      opacity: 0;
      pointer-events: none;
      transition: opacity 0.2s, transform 0.2s;
      transform: translateY(10px);
      left: 50%;
      margin-left: -100px;
      -webkit-touch-callout: none !important;
      -webkit-user-select: none;
      user-select: none;
    }
    
    #highlight-toolbar.visible {
      opacity: 1;
      pointer-events: auto;
      transform: translateY(0);
    }
    
    .color-btn {
      width: 32px;
      height: 32px;
      border-radius: 16px;
      border: 2.5px solid transparent;
      cursor: pointer;
      transition: transform 0.15s ease, border-color 0.15s ease, box-shadow 0.15s ease;
      -webkit-touch-callout: none !important;
      -webkit-user-select: none;
      user-select: none;
      outline: none;
      -webkit-appearance: none;
    }

    .color-btn:active {
      transform: scale(0.9);
      border-color: rgba(255,255,255,0.9);
      box-shadow: 0 0 0 2px rgba(255,255,255,0.3);
    }
    
    .color-btn.yellow { background: linear-gradient(135deg, #FFE066, #FFD43B); }
    .color-btn.green { background: linear-gradient(135deg, #69DB7C, #51CF66); }
    .color-btn.blue { background: linear-gradient(135deg, #74C0FC, #4DABF7); }
    .color-btn.purple { background: linear-gradient(135deg, #E599F7, #DA77F2); }
    .color-btn.red { background: linear-gradient(135deg, #FF8787, #FF6B6B); }

    /* Edit mode — tapping an existing highlight shows the full color menu
       with an X on the current color. Tapping the X removes the highlight;
       tapping a different color changes it to that color. */
    .color-btn.remove-mode {
      position: relative;
    }
    .color-btn.remove-mode::after {
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
      color: ${accentColor};
      text-decoration: underline;
      text-decoration-color: ${accentColor}60;
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
  
  <!-- Highlight color toolbar -->
  <div id="highlight-toolbar">
    <button class="color-btn yellow" data-color="yellow" aria-label="Highlight yellow"></button>
    <button class="color-btn green" data-color="green" aria-label="Highlight green"></button>
    <button class="color-btn blue" data-color="blue" aria-label="Highlight blue"></button>
    <button class="color-btn purple" data-color="purple" aria-label="Highlight purple"></button>
    <button class="color-btn red" data-color="red" aria-label="Highlight red"></button>
  </div>
</body>
</html>
    `;
  }, [day, fontSize, colors, isDark, readingFont]);

  const handleMessage = (event: any) => {
    try {
      const data = JSON.parse(event.nativeEvent.data);
      if (data.type === 'QUOTE_SELECTED' && onQuoteSelected) {
        onQuoteSelected({
          text: data.text,
          context: data.context,
          serializedRange: data.serializedRange,
          color: data.color,
        });
      } else if (data.type === 'HIGHLIGHT_REMOVED' && onHighlightRemoved) {
        onHighlightRemoved({
          text: data.text,
          color: data.color as HighlightColor,
          context: data.context,
          serializedRange: data.serializedRange,
        });
      } else if (data.type === 'SCRIPTURE_TAP' && onScriptureTap) {
        onScriptureTap(data.reference);
      } else if (data.type === 'HEIGHT_CHANGE') {
        setWebViewHeight(Math.max(data.height, 200));
      } else if (data.type === 'TARGET_HIGHLIGHT_LOCATED' && onTargetHighlightLocated) {
        onTargetHighlightLocated(Math.max(0, Number(data.y) || 0));
      } else if (data.type === 'HAPTIC_SELECTION') {
        Haptics.selectionAsync();
      } else if (data.type === 'HAPTIC_IMPACT') {
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      } else if (data.type === 'BOOKMARK') {
        const { contentType, text, isBookmarked: nowBookmarked } = data;
        const store = useUnfoldStore.getState();
        const resolvedDayNumber = dayNumber ?? day.dayNumber;
        if (nowBookmarked && devotionalId) {
          const labelMap: Record<string, string> = {
            quote: 'Quote',
            context: 'Historical Context',
            wordstudy: 'Word Study',
          };
          // Look up series title from store if not provided via props
          const seriesTitle =
            devotionalTitle ||
            store.devotionals.find((d) => d.id === devotionalId)?.title ||
            '';
          store.addBookmark({
            devotionalId,
            devotionalTitle: seriesTitle,
            dayNumber: resolvedDayNumber,
            dayTitle: dayTitle || day.title || '',
            scriptureReference: labelMap[contentType] || contentType,
            scriptureText: text,
            quotedText: text,
            updatedAt: new Date().toISOString(),
          });
        } else if (!nowBookmarked && devotionalId) {
          // Find and remove the matching bookmark
          const existing = store.bookmarks.find(
            (b) =>
              b.devotionalId === devotionalId &&
              b.dayNumber === resolvedDayNumber &&
              b.scriptureText === text
          );
          if (existing) {
            store.removeBookmark(existing.id);
          }
        }
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      }
    } catch (e) {
      logger.error('WebView message parse error:', e);
    }
  };

  return (
    <View style={styles.container}>
      <WebView
        ref={webViewRef}
        source={{ html: htmlContent }}
        style={[styles.webview, { height: webViewHeight }]}
        scrollEnabled={false}
        showsVerticalScrollIndicator={false}
        onMessage={handleMessage}
        originWhitelist={['about:blank', 'data:']}
        injectedJavaScript={injectedJavaScript}
        androidLayerType="hardware"
        cacheEnabled={true}
      />
    </View>
  );
}

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

const styles = StyleSheet.create({
  container: {
    width: SCREEN_WIDTH,
    marginLeft: -CONTENT_PADDING,
  },
  webview: {
    width: SCREEN_WIDTH,
    backgroundColor: 'transparent',
  },
});
