import React from 'react';
import { PixelRatio } from 'react-native';

import { DevotionalWebView } from '../DevotionalWebView';
import { RANGY_BUNDLE } from '../rangy-bundle';
import type { Bookmark, DevotionalDay, Highlight } from '@/lib/store';

// eslint-disable-next-line @typescript-eslint/no-require-imports
const renderer = require('react-test-renderer');
const { act } = renderer;

let mockIsDark = false;
const mockInjectJavaScript = jest.fn();

// Host 'WebView' element (so findByType('WebView') keeps working) wrapped in a
// forwardRef that exposes the one imperative method the component uses.
jest.mock('react-native-webview', () => {
  const ReactActual = jest.requireActual('react');
  const WebView = ReactActual.forwardRef((props: any, ref: any) => {
    ReactActual.useImperativeHandle(ref, () => ({
      injectJavaScript: (script: string) => mockInjectJavaScript(script),
    }));
    return ReactActual.createElement('WebView', props);
  });
  return { WebView };
});

jest.mock('expo-haptics', () => ({
  ImpactFeedbackStyle: { Light: 'Light' },
  selectionAsync: jest.fn(),
  impactAsync: jest.fn(),
}));

// The RN jest environment's Dimensions.get('window') has no `fontScale`, so
// PixelRatio.getFontScale() falls back to the device pixel ratio instead —
// a much larger number than any real system text-size setting. Pin it to a
// neutral 1 so these tests exercise the reader's own Aa sizing, not that
// fallback.
jest.spyOn(PixelRatio, 'getFontScale').mockReturnValue(1);


jest.mock('@/lib/theme', () => ({
  useTheme: () => ({
    colors: {
      accent: '#C8A55C',
    },
    isDark: mockIsDark,
  }),
}));

jest.mock('@/lib/useReadingFont', () => ({
  useReadingFont: () => ({ body: 'SourceSerifPro_400Regular' }),
}));

jest.mock('@/lib/store', () => ({
  FONT_SIZE_VALUES: {
    small: { body: 15 },
    medium: { body: 18 },
    large: { body: 20 },
  },
  useUnfoldStore: { getState: jest.fn(() => ({ devotionals: [], addBookmark: jest.fn(), bookmarks: [], removeBookmark: jest.fn() })) },
}));

jest.mock('@/lib/logger', () => ({
  logger: { error: jest.fn(), warn: jest.fn(), log: jest.fn() },
}));

const day: DevotionalDay = {
  dayNumber: 1,
  title: 'A Quiet Path',
  scriptureReference: 'Psalm 23:1',
  scriptureText: 'The Lord is my shepherd.',
  bodyText: 'The next faithful step is enough for today. Grace meets you in the next act of trust.',
  quotableLine: 'Grace meets you in the next act of trust.',
  reflectionQuestions: [],
  isRead: true,
};

const targetHighlight: Highlight = {
  id: 'highlight-1',
  devotionalId: 'dev-1',
  devotionalTitle: 'Quiet Path Series',
  dayNumber: 1,
  dayTitle: 'A Quiet Path',
  highlightedText: 'Grace meets you',
  color: 'yellow',
  contextBefore: 'The next faithful step is enough for today.',
  contextAfter: 'in the next act of trust.',
  createdAt: '2026-05-17T00:00:00.000Z',
};

const targetBookmark: Bookmark = {
  id: 'bookmark-1',
  devotionalId: 'dev-1',
  devotionalTitle: 'Quiet Path Series',
  dayNumber: 1,
  dayTitle: 'A Quiet Path',
  scriptureReference: 'Historical Context',
  scriptureText: 'Grace meets you in the next act of trust.',
  savedAt: '2026-05-17T00:00:00.000Z',
};

function getWebViewProps(tree: any) {
  return tree.root.findByType('WebView').props;
}

/** The per-document id baked into `<html data-doc-id>`; the page echoes it
 *  in every HEIGHT_CHANGE so the component can tell which document reported. */
function getDocId(tree: any): string {
  const html = getWebViewProps(tree).source.html as string;
  const match = html.match(/<html data-doc-id="(\d+)"/);
  if (!match) throw new Error('data-doc-id missing from document');
  return match[1];
}

/** Simulates the page's HEIGHT_CHANGE message (its first one is the
 *  "document ready" signal for injectJavaScript). */
function reportHeight(tree: any, height = 900, docId: string = getDocId(tree)) {
  act(() => {
    getWebViewProps(tree).onMessage({
      nativeEvent: { data: JSON.stringify({ type: 'HEIGHT_CHANGE', height, docId }) },
    });
  });
}

describe('DevotionalWebView highlight interactions', () => {
  beforeEach(() => {
    mockIsDark = false;
    mockInjectJavaScript.mockClear();
  });

  it('refreshes injected highlight-location script when targetHighlight appears after route state settles', () => {
    let tree: any;
    act(() => {
      tree = renderer.create(
        <DevotionalWebView day={day} fontSize="medium" targetHighlight={null} existingHighlights={[targetHighlight]} />,
      );
    });

    expect(getWebViewProps(tree).injectedJavaScript).not.toContain('highlight-1');

    act(() => {
      tree.update(
        <DevotionalWebView day={day} fontSize="medium" targetHighlight={targetHighlight} existingHighlights={[targetHighlight]} />,
      );
    });

    expect(getWebViewProps(tree).injectedJavaScript).toContain('highlight-1');
  });

  it('keeps text callouts available so iOS selection can surface the custom highlight picker', () => {
    let tree: any;
    act(() => {
      tree = renderer.create(
        <DevotionalWebView day={day} fontSize="medium" targetHighlight={targetHighlight} existingHighlights={[targetHighlight]} />,
      );
    });

    const html = getWebViewProps(tree).source.html as string;
    expect(html).not.toMatch(/\*\s*\{[^}]*-webkit-touch-callout:\s*none/);
    expect(html).not.toMatch(/p, span, div, mark\s*\{[^}]*-webkit-touch-callout:\s*none/);
    expect(html).toContain('-webkit-user-select: text;');
    expect(html).toMatch(/#highlight-toolbar\s*\{[^}]*-webkit-touch-callout:\s*none/);
  });

  it('anchors the custom picker near the selected text instead of the WebView document edges', () => {
    let tree: any;
    act(() => {
      tree = renderer.create(
        <DevotionalWebView day={day} fontSize="medium" targetHighlight={targetHighlight} existingHighlights={[targetHighlight]} />,
      );
    });

    const html = getWebViewProps(tree).source.html as string;
    const script = getWebViewProps(tree).injectedJavaScript as string;

    // The WebView is height-sized to the article while the RN parent scrolls.
    // A fixed viewport-band toolbar parks at the top/bottom of the entire
    // document, which is off-screen after the user scrolls into the article.
    expect(html).toMatch(/#highlight-toolbar\s*\{[^}]*position:\s*absolute/);
    expect(script).toContain('top = rect.top + scrollY - 60;');
    expect(script).toContain('top = rect.bottom + scrollY + 20;');
    expect(script).not.toContain('top = vh - toolbarHeight - safeInset;');
    expect(script).not.toContain('top = safeInset;');
  });

  it('keeps target payloads in locator scope so delayed My Library landing callbacks can see them', () => {
    let tree: any;
    act(() => {
      tree = renderer.create(
        <DevotionalWebView day={day} fontSize="medium" targetHighlight={targetHighlight} targetBookmark={targetBookmark} existingHighlights={[]} />,
      );
    });

    const script = getWebViewProps(tree).injectedJavaScript as string;
    const initIndex = script.indexOf('function initRangy()');
    const targetHighlightIndex = script.indexOf('const targetHighlight =');
    const targetBookmarkIndex = script.indexOf('const targetBookmark =');
    const locatorIndex = script.indexOf('function locateTargetHighlight()');

    expect(targetHighlightIndex).toBeGreaterThanOrEqual(0);
    expect(targetBookmarkIndex).toBeGreaterThanOrEqual(0);
    expect(initIndex).toBeGreaterThanOrEqual(0);
    expect(locatorIndex).toBeGreaterThan(initIndex);
    expect(targetHighlightIndex).toBeLessThan(initIndex);
    expect(targetBookmarkIndex).toBeLessThan(initIndex);
  });

  it('remounts the WebView when My Library target ids change so the injected locator reruns', () => {
    let tree: any;
    act(() => {
      tree = renderer.create(
        <DevotionalWebView day={day} fontSize="medium" targetHighlight={null} targetBookmark={null} existingHighlights={[]} />,
      );
    });

    const initialWebView = tree.root.findByType('WebView');
    const initialTestID = initialWebView.props.testID;

    act(() => {
      tree.update(
        <DevotionalWebView day={day} fontSize="medium" targetHighlight={targetHighlight} targetBookmark={targetBookmark} existingHighlights={[]} />,
      );
    });

    const targetedWebView = tree.root.findByType('WebView');
    expect(targetedWebView.props.testID).toContain('highlight-1');
    expect(targetedWebView.props.testID).toContain('bookmark-1');
    expect(targetedWebView.props.testID).not.toBe(initialTestID);
  });

  it('falls back to locating saved highlight text when no restored mark is available', () => {
    let tree: any;
    act(() => {
      tree = renderer.create(
        <DevotionalWebView day={day} fontSize="medium" targetHighlight={targetHighlight} existingHighlights={[]} />,
      );
    });

    const script = getWebViewProps(tree).injectedJavaScript as string;
    expect(script).toContain('function locateTargetTextFallback(targetText)');
    expect(script).toContain('best = locateTargetTextFallback(targetText);');
    expect(script).toContain("type: 'TARGET_HIGHLIGHT_LOCATED'");
    expect(script).toContain('Grace meets you');
  });

  it('uses Bible-style saved highlights in light mode with a marker background', () => {
    mockIsDark = false;

    let tree: any;
    act(() => {
      tree = renderer.create(
        <DevotionalWebView day={day} fontSize="medium" targetHighlight={targetHighlight} existingHighlights={[targetHighlight]} />,
      );
    });

    const html = getWebViewProps(tree).source.html as string;
    const script = getWebViewProps(tree).injectedJavaScript as string;

    expect(html).toContain('--hl-yellow-bg: rgba(255, 245, 112, 0.58);');
    expect(html).toContain('--hl-yellow-color: currentColor;');
    expect(html).toContain('mark.highlight-yellow { background: var(--hl-yellow-bg); color: var(--hl-yellow-color); }');
    expect(script).toContain("style: 'background: var(--hl-' + color + '-bg); color: var(--hl-' + color + '-color);");
    expect(script).not.toContain('const isDark =');
  });

  it('uses Bible-style saved highlights in dark mode with vibrant text instead of a block', () => {
    mockIsDark = true;

    let tree: any;
    act(() => {
      tree = renderer.create(
        <DevotionalWebView day={day} fontSize="medium" targetHighlight={targetHighlight} existingHighlights={[targetHighlight]} />,
      );
    });

    const html = getWebViewProps(tree).source.html as string;
    const script = getWebViewProps(tree).injectedJavaScript as string;

    expect(html).toContain('--hl-yellow-bg: transparent;');
    expect(html).toContain('--hl-yellow-color: #FFE86A;');
    expect(html).toContain('mark.highlight-yellow { background: var(--hl-yellow-bg); color: var(--hl-yellow-color); }');
    expect(script).toContain("style: 'background: var(--hl-' + color + '-bg); color: var(--hl-' + color + '-color);");
    expect(script).not.toContain("dark: 'rgba(200, 165, 92, 0.22)'");
  });

  it('uses editorial quote framing without side stripes or hardcoded Inter UI labels', () => {
    let tree: any;
    act(() => {
      tree = renderer.create(
        <DevotionalWebView
          day={{
            ...day,
            quotes: [{ text: 'Faith waits quietly.', author: 'A. Witness' }],
            contextNote: 'This is context.',
          }}
          fontSize="medium"
        />,
      );
    });

    const html = getWebViewProps(tree).source.html as string;
    expect(html).not.toContain('border-left:');
    expect(html).toContain('border-top: 1px solid');
    expect(html).toContain('border-bottom: 1px solid');
    expect(html).not.toContain("font-family: 'Inter', sans-serif;");
    expect(html).not.toContain('family=Inter');
    expect(html).toContain("-apple-system, BlinkMacSystemFont, 'Helvetica Neue', Arial, sans-serif");
  });

  it('renders and escapes the backend string word-study contract without crashing', () => {
    const stringWordStudy = 'The <Greek> word & "burden\'s" meaning.';
    const escapedWordStudy = 'The &lt;Greek&gt; word &amp; &quot;burden&#039;s&quot; meaning.';
    let tree: any;

    act(() => {
      tree = renderer.create(
        <DevotionalWebView
          day={{
            ...day,
            wordStudy: stringWordStudy,
          }}
          fontSize="medium"
        />,
      );
    });

    const html = getWebViewProps(tree).source.html as string;
    expect(html).toContain('<h3>Word Study</h3>');
    expect(html).toContain(escapedWordStudy);
    expect(html).not.toContain(stringWordStudy);
  });

  it('locates a target bookmark by saved text and reports its document position', () => {
    let tree: any;
    act(() => {
      tree = renderer.create(
        <DevotionalWebView day={day} fontSize="medium" targetBookmark={targetBookmark} />,
      );
    });

    const script = getWebViewProps(tree).injectedJavaScript as string;

    expect(script).toContain('const targetBookmark = {"id":"bookmark-1"');
    expect(script).toContain('function locateTargetBookmark()');
    expect(script).toContain('best = locateTargetTextFallback(targetText);');
    expect(script).toContain("type: 'TARGET_BOOKMARK_LOCATED'");
    expect(script).toContain('Grace meets you in the next act of trust.');
  });
});

describe('DevotionalWebView Aa / theme updates without remounting', () => {
  beforeEach(() => {
    mockIsDark = false;
    mockInjectJavaScript.mockClear();
  });

  it('keeps the same WebView instance and document across Aa and theme changes, but remounts for a new day', () => {
    mockIsDark = true;
    let tree: any;
    act(() => {
      tree = renderer.create(<DevotionalWebView day={day} fontSize="medium" />);
    });
    const initialInstance = tree.root.findByType('WebView');
    const initialKey = initialInstance.props.testID;
    const initialSource = initialInstance.props.source;
    expect(initialKey).not.toContain('medium');
    expect(initialKey).not.toContain('dark');

    act(() => {
      tree.update(<DevotionalWebView day={day} fontSize="large" />);
    });
    expect(tree.root.findByType('WebView')).toBe(initialInstance);
    expect(getWebViewProps(tree).testID).toBe(initialKey);
    expect(getWebViewProps(tree).source).toBe(initialSource);

    mockIsDark = false;
    act(() => {
      tree.update(<DevotionalWebView day={day} fontSize="large" />);
    });
    expect(tree.root.findByType('WebView')).toBe(initialInstance);
    expect(getWebViewProps(tree).testID).toBe(initialKey);
    expect(getWebViewProps(tree).source).toBe(initialSource);

    act(() => {
      tree.update(<DevotionalWebView day={{ ...day, dayNumber: 2 }} fontSize="large" />);
    });
    expect(tree.root.findByType('WebView')).not.toBe(initialInstance);
    expect(getWebViewProps(tree).testID).not.toBe(initialKey);
    expect(getWebViewProps(tree).testID).toContain(':2:');
    expect(getWebViewProps(tree).source).not.toBe(initialSource);
  });

  it('drives font size and theme colors through custom properties on <html> instead of baked values', () => {
    mockIsDark = true;
    let tree: any;
    act(() => {
      tree = renderer.create(<DevotionalWebView day={day} fontSize="medium" />);
    });

    const html = getWebViewProps(tree).source.html as string;
    const rootTag = html.match(/<html data-doc-id="\d+" style="([^"]*)">/);
    expect(rootTag).not.toBeNull();
    const rootStyle = rootTag![1];
    expect(rootStyle).toContain('--body-font-size: 18px;');
    expect(rootStyle).toContain('--body-line-height: 31.5px;');
    expect(rootStyle).toContain('--text: #E8E4DC;');
    expect(rootStyle).toContain('--accent: #C8A55C;');
    expect(rootStyle).toContain('--toolbar-bg: #2a2a2a;');
    expect(html).toMatch(/\n\s*body\s*\{[^}]*font-size: var\(--body-font-size\);/);
    expect(html).toMatch(/\n\s*body\s*\{[^}]*line-height: var\(--body-line-height\);/);
    expect(html).toMatch(/\n\s*body\s*\{[^}]*color: var\(--text\);/);
    expect(html).toMatch(/#highlight-toolbar\s*\{[^}]*background: var\(--toolbar-bg\);/);

    // Nothing past the <html> start tag may still bake a size or theme color
    // (skip the base64 display font, which can contain any substring).
    const afterRoot = html.slice(html.indexOf('font-display: swap;'));
    expect(afterRoot).toContain('</style>');
    expect(afterRoot).not.toContain('font-size: 18px');
    expect(afterRoot).not.toContain('31.5px');
    expect(afterRoot).not.toContain('#E8E4DC');
    expect(afterRoot).not.toContain('#C8A55C');
    expect(afterRoot).not.toContain('#2a2a2a');
    expect(afterRoot).not.toContain('#FFE86A');
  });

  it('keeps the exact source when the day object is replaced with identical content (e.g. marked read)', () => {
    let tree: any;
    act(() => {
      tree = renderer.create(<DevotionalWebView day={{ ...day, isRead: false }} fontSize="medium" />);
    });
    const source = getWebViewProps(tree).source;
    const docId = getDocId(tree);
    reportHeight(tree);

    // Complete Day: the store hands the reader a new `day` object with the
    // same content. Same markup ⇒ same source object, same document id, and
    // nothing to inject — the loaded document is not touched at all.
    act(() => {
      tree.update(<DevotionalWebView day={{ ...day, isRead: true }} fontSize="medium" />);
    });
    expect(getWebViewProps(tree).source).toBe(source);
    expect(getDocId(tree)).toBe(docId);
    expect(mockInjectJavaScript).not.toHaveBeenCalled();

    // Different content for the same day is a new document (a native in-place
    // reload, not a remount), baked with the current Aa / theme — so there is
    // still nothing to inject.
    const initialKey = getWebViewProps(tree).testID;
    act(() => {
      tree.update(<DevotionalWebView day={{ ...day, bodyText: 'Revised teaching.' }} fontSize="large" />);
    });
    expect(getWebViewProps(tree).testID).toBe(initialKey);
    expect(getWebViewProps(tree).source).not.toBe(source);
    expect(getDocId(tree)).not.toBe(docId);
    expect(getWebViewProps(tree).source.html).toContain('Revised teaching.');
    expect(getWebViewProps(tree).source.html).toContain('--body-font-size: 20px;');
    expect(mockInjectJavaScript).not.toHaveBeenCalled();
  });

  it('pushes a new font size into the live document with injectJavaScript and re-measures, without reloading', () => {
    let tree: any;
    act(() => {
      tree = renderer.create(<DevotionalWebView day={day} fontSize="medium" />);
    });
    const source = getWebViewProps(tree).source;

    // Cold mount: the document rendered with the baked values, so the ready
    // signal has nothing to push.
    reportHeight(tree, 900);
    expect(getWebViewProps(tree).style).toEqual(expect.arrayContaining([{ height: 900 }]));
    expect(mockInjectJavaScript).not.toHaveBeenCalled();

    act(() => {
      tree.update(<DevotionalWebView day={day} fontSize="large" />);
    });

    expect(mockInjectJavaScript).toHaveBeenCalledTimes(1);
    const script = mockInjectJavaScript.mock.calls[0][0] as string;
    expect(script).toContain('"--body-font-size":"20px"');
    expect(script).toContain('"--body-line-height":"35px"');
    expect(script).toContain('root.style.setProperty(name, vars[name])');
    expect(script).toContain("type: 'HEIGHT_CHANGE'");
    expect(script).toContain('document.body.scrollHeight');
    expect(script).toContain("docId: root.getAttribute('data-doc-id')");

    // Same source object ⇒ no document reload; the baked block is untouched.
    expect(getWebViewProps(tree).source).toBe(source);
    expect(getWebViewProps(tree).source.html).toContain('--body-font-size: 18px;');

    // The page's re-measure after the push updates the height and nothing else.
    reportHeight(tree, 1100);
    expect(getWebViewProps(tree).style).toEqual(expect.arrayContaining([{ height: 1100 }]));
    expect(mockInjectJavaScript).toHaveBeenCalledTimes(1);
  });

  it('pushes the new palette when the theme flips and skips re-renders that change nothing', () => {
    mockIsDark = true;
    let tree: any;
    act(() => {
      tree = renderer.create(<DevotionalWebView day={day} fontSize="medium" existingHighlights={[targetHighlight]} />);
    });
    reportHeight(tree);
    expect(mockInjectJavaScript).not.toHaveBeenCalled();

    mockIsDark = false;
    act(() => {
      tree.update(<DevotionalWebView day={day} fontSize="medium" existingHighlights={[targetHighlight]} />);
    });

    expect(mockInjectJavaScript).toHaveBeenCalledTimes(1);
    const script = mockInjectJavaScript.mock.calls[0][0] as string;
    expect(script).toContain('"--text":"#1A1A1A"');
    expect(script).toContain('"--muted":"#5A534E"');
    expect(script).toContain('"--toolbar-bg":"#ffffff"');
    expect(script).toContain('"--hl-yellow-bg":"rgba(255, 245, 112, 0.58)"');
    expect(script).toContain('"--hl-yellow-color":"currentColor"');
    expect(script).toContain('"--body-font-size":"18px"');

    // The mock theme hands out a fresh `colors` object every render; an
    // unchanged palette must not be pushed again.
    act(() => {
      tree.update(<DevotionalWebView day={day} fontSize="medium" existingHighlights={[targetHighlight]} />);
    });
    expect(mockInjectJavaScript).toHaveBeenCalledTimes(1);
  });

  it("waits for the document's own first height report before injecting, then applies the latest values once", () => {
    let tree: any;
    act(() => {
      tree = renderer.create(<DevotionalWebView day={day} fontSize="medium" />);
    });

    // Aa change while the document is still loading: nothing to inject into yet.
    act(() => {
      tree.update(<DevotionalWebView day={day} fontSize="large" />);
    });
    expect(mockInjectJavaScript).not.toHaveBeenCalled();

    // A late report from a document that is no longer current is not a ready signal.
    reportHeight(tree, 900, 'stale-doc');
    expect(mockInjectJavaScript).not.toHaveBeenCalled();

    // The current document's first report: catch it up with the pending Aa change.
    reportHeight(tree, 900);
    expect(mockInjectJavaScript).toHaveBeenCalledTimes(1);
    expect(mockInjectJavaScript.mock.calls[0][0]).toContain('"--body-font-size":"20px"');

    // Subsequent reports never re-apply.
    reportHeight(tree, 950);
    expect(mockInjectJavaScript).toHaveBeenCalledTimes(1);
  });

  it('bakes the current Aa and theme into a new day’s document instead of injecting into it', () => {
    let tree: any;
    act(() => {
      tree = renderer.create(<DevotionalWebView day={day} fontSize="medium" />);
    });
    reportHeight(tree);
    act(() => {
      tree.update(<DevotionalWebView day={day} fontSize="large" />);
    });
    expect(mockInjectJavaScript).toHaveBeenCalledTimes(1);

    const nextDay = { ...day, dayNumber: 2 };
    act(() => {
      tree.update(<DevotionalWebView day={nextDay} fontSize="large" />);
    });
    expect(getWebViewProps(tree).source.html).toContain('--body-font-size: 20px;');
    expect(mockInjectJavaScript).toHaveBeenCalledTimes(1);

    reportHeight(tree);
    expect(mockInjectJavaScript).toHaveBeenCalledTimes(1);
  });

  it('ignores a height report that belongs to a previous document', () => {
    let tree: any;
    act(() => {
      tree = renderer.create(<DevotionalWebView day={day} fontSize="medium" />);
    });
    const docId = getDocId(tree);
    // A report from a document that is no longer mounted (same-key source
    // swap with one still in flight) must not size the current one.
    reportHeight(tree, 1500, String(Number(docId) - 1));
    expect(getWebViewProps(tree).style).toEqual(expect.arrayContaining([{ height: 200 }]));
    expect(mockInjectJavaScript).not.toHaveBeenCalled();

    reportHeight(tree, 900);
    expect(getWebViewProps(tree).style).toEqual(expect.arrayContaining([{ height: 900 }]));
  });

  it('inlines rangy in the document head instead of loading it from the CDN', () => {
    let tree: any;
    act(() => {
      tree = renderer.create(<DevotionalWebView day={day} fontSize="medium" />);
    });

    const html = getWebViewProps(tree).source.html as string;
    expect(html).toContain(`<script>${RANGY_BUNDLE}</script>`);
    expect(html).not.toContain('cdn.jsdelivr.net');
    expect(html).not.toMatch(/<script\s+src=/);
    // Ahead of the Google Fonts stylesheet so an offline font request can't delay it.
    expect(html.indexOf('<script>')).toBeLessThan(html.indexOf('fonts.googleapis.com/css2'));

    expect(RANGY_BUNDLE).toContain('Original file: /npm/rangy@1.3.0/lib/rangy-core.js');
    expect(RANGY_BUNDLE).toContain('Original file: /npm/rangy@1.3.0/lib/rangy-classapplier.js');
    expect(RANGY_BUNDLE).toContain('Original file: /npm/rangy@1.3.0/lib/rangy-highlighter.js');
    expect(RANGY_BUNDLE.indexOf('rangy-core.js')).toBeLessThan(RANGY_BUNDLE.indexOf('rangy-classapplier.js'));
    expect(RANGY_BUNDLE.indexOf('rangy-classapplier.js')).toBeLessThan(RANGY_BUNDLE.indexOf('rangy-highlighter.js'));
    // Safe to interpolate into the template literal and inline in <script>.
    expect(RANGY_BUNDLE).not.toMatch(/`|\$\{|<\/script/i);
  });
});
