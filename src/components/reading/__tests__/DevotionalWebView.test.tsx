import React from 'react';
import * as ReactNative from 'react-native';
import { AccessibilityInfo, PixelRatio, Platform, Share } from 'react-native';

import { DevotionalWebView } from '../DevotionalWebView';
import { RANGY_BUNDLE } from '../rangy-bundle';
import type { Bookmark, DevotionalDay, Highlight } from '@/lib/store';
import { bookmarkIdentityToken, storedReferenceFor } from '@/lib/bookmark-identity';
import { textContainsWords } from '@/lib/reader-words';

// eslint-disable-next-line @typescript-eslint/no-require-imports
const renderer = require('react-test-renderer');
const { act } = renderer;

let mockIsDark = false;
const mockInjectJavaScript = jest.fn();
const mockAddBookmark = jest.fn();
const mockRemoveBookmark = jest.fn();
let mockBookmarks: Bookmark[] = [];
let mockDevotionalWebFont: { family: string; css: string } | null = {
  family: 'Source Serif 4',
  css: "@font-face { font-family: 'Source Serif 4'; src: url(data:font/woff2;base64,LOCAL); }",
};

// Host 'WebView' element (so findByType('WebView') keeps working) wrapped in a
// forwardRef that exposes the one imperative method the component uses.
jest.mock('react-native-webview', () => {
  // require, not requireActual: an Android copy of the reader (loadAndroidWebView)
  // must share this file's React.
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const ReactActual = require('react');
  const WebView = ReactActual.forwardRef((props: any, ref: any) => {
    ReactActual.useImperativeHandle(ref, () => ({
      injectJavaScript: (script: string) => mockInjectJavaScript(script),
    }));
    return ReactActual.createElement('WebView', props);
  });
  return { WebView };
});

jest.mock('expo-clipboard', () => ({ setStringAsync: jest.fn(() => Promise.resolve(true)) }));

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

jest.mock('@/lib/devotional-web-fonts', () => ({
  useDevotionalWebFont: () => mockDevotionalWebFont,
}));

jest.mock('@/lib/store', () => ({
  HIGHLIGHT_COLOR_LABELS: { yellow: 'General', green: 'Growth', blue: 'Prayer', purple: 'Questions', red: 'Important' },
  FONT_SIZE_VALUES: {
    small: { body: 15 },
    medium: { body: 18 },
    large: { body: 20 },
  },
  useUnfoldStore: { getState: jest.fn(() => ({ devotionals: [], addBookmark: mockAddBookmark, bookmarks: mockBookmarks, removeBookmark: mockRemoveBookmark })) },
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

function bookmarkElement(token: string) {
  const classes = new Set<string>();
  return {
    getAttribute: (name: string) => name === 'data-bookmark-token' ? token : null,
    classList: {
      contains: (name: string) => classes.has(name),
      toggle: (name: string, force?: boolean) => {
        const add = force ?? !classes.has(name);
        if (add) classes.add(name);
        else classes.delete(name);
      },
    },
  };
}

function executeBookmarkReconcile(script: string, elements: ReturnType<typeof bookmarkElement>[]) {
  const document = { querySelectorAll: jest.fn(() => elements) };
  new Function('document', script)(document);
  expect(document.querySelectorAll).toHaveBeenCalledWith('.bookmark-btn');
}

const originalPlatform = Platform.OS;
function setPlatform(os: typeof Platform.OS) {
  Object.defineProperty(Platform, 'OS', { configurable: true, value: os });
}

afterEach(() => {
  setPlatform(originalPlatform);
});

/** DevotionalWebView as Android loads it: the module reads the platform once,
 *  when it loads. The copy shares this file's React and React Native. */
function loadAndroidWebView(): typeof DevotionalWebView {
  let component!: typeof DevotionalWebView;
  jest.isolateModules(() => {
    jest.doMock('react', () => React);
    jest.doMock('react-native', () => ReactNative);
    setPlatform('android');
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    component = require('../DevotionalWebView').DevotionalWebView;
  });
  setPlatform(originalPlatform);
  return component;
}

describe('DevotionalWebView highlight interactions', () => {
  beforeEach(() => {
    mockIsDark = false;
    mockInjectJavaScript.mockClear();
    mockDevotionalWebFont = {
      family: 'Source Serif 4',
      css: "@font-face { font-family: 'Source Serif 4'; src: url(data:font/woff2;base64,LOCAL); }",
    };
    mockBookmarks = [];
    mockAddBookmark.mockClear();
    mockRemoveBookmark.mockClear();
  });

  it('restores, updates, and clears every matching control in the mounted document', () => {
    const quoteKey = 'Grace "carries" \\ you. —\u2009Micah';
    const boxDay = {
      ...day,
      quotes: [
        { text: 'Grace "carries" \\ you.', author: 'Micah' },
        { text: 'Grace "carries" \\ you.', author: 'Micah' },
      ],
      contextNote: 'Rome governed the region.',
      wordStudy: 'Agape means self-giving love.',
    };
    const quoteBookmark = {
      ...targetBookmark,
      id: 'quote-bookmark',
      scriptureReference: 'Quote',
      scriptureText: quoteKey,
    };
    mockBookmarks = [quoteBookmark];

    let tree: any;
    act(() => {
      tree = renderer.create(
        <DevotionalWebView
          day={boxDay}
          fontSize="medium"
          devotionalId="dev-1"
          dayNumber={1}
          bookmarks={mockBookmarks}
        />,
      );
    });

    reportHeight(tree);
    const quoteToken = bookmarkIdentityToken({ kind: 'quote', key: quoteKey });
    const controls = [
      bookmarkElement(quoteToken),
      bookmarkElement(quoteToken),
      bookmarkElement(bookmarkIdentityToken({ kind: 'context', key: 'Rome governed the region.' })),
    ];
    executeBookmarkReconcile(mockInjectJavaScript.mock.calls.at(-1)![0], controls);
    expect(controls[0].classList.contains('bookmarked')).toBe(true);
    expect(controls[1].classList.contains('bookmarked')).toBe(true);
    expect(controls[2].classList.contains('bookmarked')).toBe(false);

    mockBookmarks = [];
    act(() => {
      tree.update(
        <DevotionalWebView
          day={boxDay}
          fontSize="medium"
          devotionalId="dev-1"
          dayNumber={1}
          bookmarks={mockBookmarks}
        />,
      );
    });
    executeBookmarkReconcile(mockInjectJavaScript.mock.calls.at(-1)![0], controls);
    expect(controls[0].classList.contains('bookmarked')).toBe(false);
    expect(controls[1].classList.contains('bookmarked')).toBe(false);
  });

  it('applies token changes made before readiness and after repeated readiness reports', () => {
    const contextBookmark = {
      ...targetBookmark,
      id: 'context-bookmark',
      scriptureReference: 'Historical Context',
      scriptureText: 'Rome governed the region.',
    };
    const boxDay = { ...day, contextNote: 'Rome governed the region.' };
    let tree: any;
    act(() => {
      tree = renderer.create(
        <DevotionalWebView
          day={boxDay}
          fontSize="medium"
          devotionalId="dev-1"
          dayNumber={1}
          bookmarks={[]}
        />,
      );
    });

    act(() => {
      tree.update(
        <DevotionalWebView
          day={boxDay}
          fontSize="medium"
          devotionalId="dev-1"
          dayNumber={1}
          bookmarks={[contextBookmark]}
        />,
      );
    });
    expect(mockInjectJavaScript).toHaveBeenCalledTimes(0);

    reportHeight(tree, 900);
    expect(mockInjectJavaScript).toHaveBeenCalledTimes(1);
    const control = bookmarkElement('["context","Rome governed the region."]');
    executeBookmarkReconcile(mockInjectJavaScript.mock.calls[0][0], [control]);
    expect(control.classList.contains('bookmarked')).toBe(true);

    reportHeight(tree, 950);
    expect(mockInjectJavaScript).toHaveBeenCalledTimes(1);

    act(() => {
      tree.update(
        <DevotionalWebView
          day={boxDay}
          fontSize="medium"
          devotionalId="dev-1"
          dayNumber={1}
          bookmarks={[]}
        />,
      );
    });
    expect(mockInjectJavaScript).toHaveBeenCalledTimes(2);
    executeBookmarkReconcile(mockInjectJavaScript.mock.calls[1][0], [control]);
    expect(control.classList.contains('bookmarked')).toBe(false);
  });

  it('decides a box toggle from current store identity instead of the DOM class', () => {
    const contextBookmark = {
      ...targetBookmark,
      id: 'context-bookmark',
      scriptureReference: 'Historical Context',
      scriptureText: 'Rome governed the region.',
    };
    mockBookmarks = [contextBookmark];
    let tree: any;
    act(() => {
      tree = renderer.create(
        <DevotionalWebView
          day={{ ...day, contextNote: 'Rome governed the region.' }}
          fontSize="medium"
          devotionalId="dev-1"
          dayNumber={1}
          bookmarks={mockBookmarks}
        />,
      );
    });

    act(() => {
      getWebViewProps(tree).onMessage({ nativeEvent: { data: JSON.stringify({
        type: 'BOOKMARK',
        contentType: 'context',
        text: 'Rome governed the region.',
        isBookmarked: true,
      }) } });
    });

    expect(mockRemoveBookmark).toHaveBeenCalledWith('context-bookmark');
    expect(mockAddBookmark).not.toHaveBeenCalled();

    mockRemoveBookmark.mockClear();
    mockBookmarks = [];
    act(() => {
      getWebViewProps(tree).onMessage({ nativeEvent: { data: JSON.stringify({
        type: 'BOOKMARK',
        contentType: 'context',
        text: 'Rome governed the region.',
        isBookmarked: false,
      }) } });
    });
    expect(mockAddBookmark).toHaveBeenCalledWith(expect.objectContaining({
      kind: 'context',
      key: 'Rome governed the region.',
    }));
    expect(mockRemoveBookmark).not.toHaveBeenCalled();
  });

  it('reserves the initial reader height while the selected local font is pending', () => {
    mockDevotionalWebFont = null;
    let tree: any;
    act(() => {
      tree = renderer.create(<DevotionalWebView day={day} fontSize="medium" />);
    });
    expect(tree.root.findByType('View').props.style).toEqual(expect.arrayContaining([{ height: 200 }]));
    expect(tree.root.findAllByType('WebView')).toHaveLength(0);
  });

  it('fits highlights to the displayed fallback when the selected font fails to load', () => {
    mockDevotionalWebFont = { family: 'Georgia', css: '' };
    let tree: any;
    act(() => {
      tree = renderer.create(<DevotionalWebView day={day} fontSize="medium" />);
    });
    const html = getWebViewProps(tree).source.html as string;
    expect(html).toContain("font-family: 'Georgia'");
    expect(html).toContain('background-size: 100% 1.1em');
    expect(html).toContain('background-position: 0 0.2em');
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

  it('keeps the text selectable and the selection bar free of the iOS callout', () => {
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
    expect(script).toContain("type: 'TARGET_HIGHLIGHT_LOCATED'");
    expect(script).toContain('Grace meets you');
  });

  it('paints a felt-tip stroke behind saved highlights in light mode', () => {
    mockIsDark = false;

    let tree: any;
    act(() => {
      tree = renderer.create(
        <DevotionalWebView day={day} fontSize="medium" targetHighlight={targetHighlight} existingHighlights={[targetHighlight]} />,
      );
    });

    const html = getWebViewProps(tree).source.html as string;
    const script = getWebViewProps(tree).injectedJavaScript as string;

    expect(html).toContain('--hl-yellow-bg: linear-gradient(100deg, rgba(255, 236, 80, 0.34), rgba(255, 236, 80, 0.72) 12%, rgba(255, 236, 80, 0.63) 88%, rgba(255, 236, 80, 0.30));');
    expect(html).toContain('--hl-yellow-color: currentColor;');
    expect(html).toContain('mark.highlight-yellow { background-image: var(--hl-yellow-bg); color: var(--hl-yellow-color); }');
    // Colour comes from the stylesheet rule alone; no inline style to fight it.
    expect(script).not.toContain("style: 'background: var(--hl-'");
    expect(script).not.toContain('const isDark =');
  });

  it('paints the same stroke in dark mode too, never colored text', () => {
    mockIsDark = true;

    let tree: any;
    act(() => {
      tree = renderer.create(
        <DevotionalWebView day={day} fontSize="medium" targetHighlight={targetHighlight} existingHighlights={[targetHighlight]} />,
      );
    });

    const html = getWebViewProps(tree).source.html as string;
    const script = getWebViewProps(tree).injectedJavaScript as string;

    expect(html).toContain('--hl-yellow-bg: linear-gradient(100deg, rgba(255, 232, 106, 0.16), rgba(255, 232, 106, 0.34) 12%, rgba(255, 232, 106, 0.30) 88%, rgba(255, 232, 106, 0.14));');
    expect(html).toContain('--hl-yellow-color: currentColor;');
    expect(html).toContain('mark.highlight-yellow { background-image: var(--hl-yellow-bg); color: var(--hl-yellow-color); }');
    // The stroke is sized to the glyphs, not the inline box, and keeps its
    // felt-tip corners on every wrapped line.
    expect(html).toContain('border-radius: 0.55em 0.3em 0.5em 0.35em;');
    expect(html).toContain('box-decoration-break: clone;');
    expect(script).not.toContain('padding: 0; border-radius: 2px;');
  });

  it('re-anchors restored highlights by their text and reports the ones it cannot find', () => {
    const onHighlightsLost = jest.fn();
    let tree: any;
    act(() => {
      tree = renderer.create(
        <DevotionalWebView day={day} fontSize="medium" existingHighlights={[targetHighlight]} onHighlightsLost={onHighlightsLost} />,
      );
    });
    const props = getWebViewProps(tree);
    const script = props.injectedJavaScript as string;

    // The document gets the text each stored span must read, runs the heal
    // pass after deserialize, and reports a silent diff for re-anchored spans.
    expect(script).toContain('"text":"Grace meets you","color":"yellow","before":"The next faithful step is enough for today."');
    expect(script.indexOf('healHighlights(')).toBeGreaterThan(script.indexOf('highlighter.deserialize(combined)'));
    expect(script).toContain("postHighlightsChanged('heal', before, '', true, lost)");
    expect(script).toContain("type: 'HIGHLIGHTS_LOST'");

    act(() => {
      props.onMessage({ nativeEvent: { data: JSON.stringify({ type: 'HIGHLIGHTS_LOST', serials: ['1$5$1$rangy-highlight-yellow$'] }) } });
    });
    expect(onHighlightsLost).toHaveBeenCalledWith(['1$5$1$rangy-highlight-yellow$']);
  });

  it('fits the stroke to the reading face in use', () => {
    let tree: any;
    act(() => {
      tree = renderer.create(<DevotionalWebView day={day} fontSize="medium" />);
    });
    const html = getWebViewProps(tree).source.html as string;
    // Source Serif 4 is the mocked reading font.
    expect(html).toContain('background-size: 100% 1.09em;');
    expect(html).toContain('background-position: 0 0.24em;');
  });

  it('names every colour swatch for VoiceOver with the label My Library uses, and writes no visible label', () => {
    let tree: any;
    act(() => {
      tree = renderer.create(<DevotionalWebView day={day} fontSize="medium" />);
    });
    const html = getWebViewProps(tree).source.html as string;
    for (const label of ['General', 'Growth', 'Prayer', 'Questions', 'Important']) {
      expect(html).toContain(`aria-label="Highlight ${label}"`);
    }
    expect(html).not.toContain('<span class="lbl"><span>');
    expect(html).not.toContain("content: 'Remove'");
  });

  it('turns the iOS system edit menu off and passes no custom menu', () => {
    let tree: any;
    act(() => {
      tree = renderer.create(<DevotionalWebView day={day} fontSize="medium" />);
    });
    const props = getWebViewProps(tree);

    // 'all' (the react-native-webview patch) removes the system actions, the
    // Look Up group, and Writing Tools. menuItems would bring back the
    // long-press-only native menu, so there are none.
    expect(props.suppressMenuItems).toEqual(['all']);
    expect(props.menuItems).toBeUndefined();
    expect(props.onCustomMenuSelection).toBeUndefined();
  });

  it('keeps a native Android menu with the same four actions and hands each key to the page', () => {
    const AndroidWebView = loadAndroidWebView();
    let tree: any;
    act(() => {
      tree = renderer.create(<AndroidWebView day={day} fontSize="medium" />);
    });
    const props = getWebViewProps(tree);

    expect(props.menuItems).toEqual([
      { label: 'Highlight', key: 'highlight' },
      { label: 'Bookmark', key: 'bookmark' },
      { label: 'Share', key: 'share' },
      { label: 'Copy', key: 'copy' },
    ]);
    expect(props.suppressMenuItems).toBeUndefined();

    for (const key of ['highlight', 'bookmark', 'share', 'copy']) {
      mockInjectJavaScript.mockClear();
      act(() => {
        props.onCustomMenuSelection({ nativeEvent: { label: key, key, selectedText: 'grace "upon" grace' } });
      });
      expect(mockInjectJavaScript).toHaveBeenCalledTimes(1);
      expect(mockInjectJavaScript.mock.calls[0][0]).toBe(
        `window.__unfoldSelectionAction && window.__unfoldSelectionAction("${key}", "grace \\"upon\\" grace"); true;`,
      );
    }
  });

  it('reports document diffs, failures, and replays undo through the command ref', () => {
    const onHighlightsChanged = jest.fn();
    const onHighlightFailed = jest.fn();
    const commandRef = { current: null as any };
    let tree: any;
    act(() => {
      tree = renderer.create(
        <DevotionalWebView
          day={day}
          fontSize="medium"
          onHighlightsChanged={onHighlightsChanged}
          onHighlightFailed={onHighlightFailed}
          commandRef={commandRef}
        />,
      );
    });
    const props = getWebViewProps(tree);
    const script = props.injectedJavaScript as string;

    // Create, remove, recolor and undo all go through one diff protocol.
    expect(script).toContain("postHighlightsChanged('create', before, primarySerial, false)");
    expect(script).toContain("postHighlightsChanged('remove', before, '', false)");
    expect(script).toContain("postHighlightsChanged('recolor', before, primarySerial, false)");
    expect(script).toContain("postHighlightsChanged('undo', before, '', true)");
    // Nothing applied on the page ⇒ nothing stored: a failure is reported instead.
    expect(script).toContain("type: 'HIGHLIGHT_FAILED'");
    expect(script).not.toContain("type: 'QUOTE_SELECTED'");

    const added = [{ serial: '10$20$1$rangy-highlight-yellow$', text: 'grace upon', color: 'yellow', context: 'x' }];
    act(() => {
      props.onMessage({ nativeEvent: { data: JSON.stringify({ type: 'HIGHLIGHTS_CHANGED', docId: getDocId(tree), reason: 'create', added, removed: [], primarySerial: added[0].serial, silent: false }) } });
      props.onMessage({ nativeEvent: { data: JSON.stringify({ type: 'HIGHLIGHT_FAILED' }) } });
    });
    expect(onHighlightsChanged).toHaveBeenCalledWith({ reason: 'create', added, removed: [], primarySerial: added[0].serial, silent: false, docId: getDocId(tree) });
    expect(onHighlightFailed).toHaveBeenCalledTimes(1);

    mockInjectJavaScript.mockClear();
    act(() => {
      commandRef.current.applyInverse({ added, removed: [], docId: getDocId(tree) });
    });
    expect(mockInjectJavaScript.mock.calls[0][0]).toContain('__unfoldApplyInverse(');
    expect(mockInjectJavaScript.mock.calls[0][0]).toContain('10$20$1$rangy-highlight-yellow$');

    // Reader Highlights sheet: locate a stored highlight in the live document
    // through the page's locator, never by remounting with a new baked target.
    expect(script).toContain('window.__unfoldLocateHighlight = locateHighlightPayload;');
    mockInjectJavaScript.mockClear();
    act(() => {
      commandRef.current.scrollToHighlight({
        id: 'h-9',
        highlightedText: 'grace upon grace',
        serializedRange: '10$20$1$rangy-highlight-yellow$',
        color: 'yellow',
      });
    });
    expect(mockInjectJavaScript.mock.calls[0][0]).toContain('__unfoldLocateHighlight(');
    expect(mockInjectJavaScript.mock.calls[0][0]).toContain('"id":"h-9"');
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
    expect(html).toContain('prefers-reduced-motion: no-preference');
    expect(html).not.toContain('text-transform: uppercase');
    expect(html).toContain('p.section-header');
    expect(html).toContain('color: var(--muted)');
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

  it('drops a highlight change still in flight from a document the page replaced', () => {
    const onHighlightsChanged = jest.fn();
    let tree: any;
    act(() => {
      tree = renderer.create(<DevotionalWebView day={day} fontSize="medium" onHighlightsChanged={onHighlightsChanged} />);
    });
    const script = getWebViewProps(tree).injectedJavaScript as string;
    expect(script).toMatch(/type: 'HIGHLIGHTS_CHANGED',[\s\S]{0,200}docId: document\.documentElement\.getAttribute\('data-doc-id'\)/);
    const oldDocId = getDocId(tree);

    // New content for the same day reloads the WebView in place.
    act(() => {
      tree.update(<DevotionalWebView day={{ ...day, bodyText: 'Revised teaching.' }} fontSize="medium" onHighlightsChanged={onHighlightsChanged} />);
    });
    const added = [{ serial: '10$20$1$rangy-highlight-yellow$', text: 'grace upon', color: 'yellow', context: 'x' }];
    const change = (docId: string) => ({
      nativeEvent: { data: JSON.stringify({ type: 'HIGHLIGHTS_CHANGED', docId, reason: 'remove', added: [], removed: added, primarySerial: '', silent: false }) },
    });
    act(() => {
      getWebViewProps(tree).onMessage(change(oldDocId));
    });
    expect(onHighlightsChanged).not.toHaveBeenCalled();

    act(() => {
      getWebViewProps(tree).onMessage(change(getDocId(tree)));
    });
    expect(onHighlightsChanged).toHaveBeenCalledTimes(1);
  });

  // 2026-10-09 release audit: an Undo still on screen replays by character
  // position, so new text for the same day must not take it.
  it('drops an Undo whose document new text for the day replaced', () => {
    const commandRef = { current: null as any };
    let tree: any;
    act(() => {
      tree = renderer.create(<DevotionalWebView day={day} fontSize="medium" commandRef={commandRef} />);
    });
    reportHeight(tree);
    const oldDocId = getDocId(tree);
    act(() => {
      tree.update(<DevotionalWebView day={{ ...day, bodyText: 'Revised teaching.' }} fontSize="medium" commandRef={commandRef} />);
    });
    reportHeight(tree);
    const removed = [{ serial: '10$20$1$rangy-highlight-yellow$', text: 'grace upon', color: 'yellow', context: 'x' }];
    const inverseCalls = () => mockInjectJavaScript.mock.calls.filter(([script]) => String(script).includes('__unfoldApplyInverse('));

    mockInjectJavaScript.mockClear();
    act(() => { commandRef.current.applyInverse({ added: [], removed, docId: oldDocId }); });
    expect(inverseCalls()).toHaveLength(0);

    act(() => { commandRef.current.applyInverse({ added: [], removed, docId: getDocId(tree) }); });
    expect(inverseCalls()).toHaveLength(1);
  });

  it('replays an Undo across a reading-font reload of the same text', () => {
    const commandRef = { current: null as any };
    let tree: any;
    act(() => {
      tree = renderer.create(<DevotionalWebView day={day} fontSize="medium" commandRef={commandRef} />);
    });
    reportHeight(tree);
    const oldDocId = getDocId(tree);
    // Aa picks another reading font: the page rebuilds over the same text.
    const savedFont = mockDevotionalWebFont;
    mockDevotionalWebFont = { family: 'Lora', css: '' };
    try {
      act(() => {
        tree.update(<DevotionalWebView day={{ ...day }} fontSize="medium" commandRef={commandRef} />);
      });
    } finally {
      mockDevotionalWebFont = savedFont;
    }
    reportHeight(tree);
    expect(getDocId(tree)).not.toBe(oldDocId);
    const removed = [{ serial: '10$20$1$rangy-highlight-yellow$', text: 'grace upon', color: 'yellow', context: 'x' }];

    mockInjectJavaScript.mockClear();
    act(() => { commandRef.current.applyInverse({ added: [], removed, docId: oldDocId }); });
    expect(mockInjectJavaScript.mock.calls.filter(([script]) => String(script).includes('__unfoldApplyInverse('))).toHaveLength(1);
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
    expect(script).toContain('documentRelativeOffsetTop');
    expect(script).not.toContain('nodes[i].offsetTop');

    // Same source object ⇒ no document reload; the baked block is untouched.
    expect(getWebViewProps(tree).source).toBe(source);
    expect(getWebViewProps(tree).source.html).toContain('--body-font-size: 18px;');

    // The page's re-measure after the push updates the height and nothing else.
    reportHeight(tree, 1100);
    expect(getWebViewProps(tree).style).toEqual(expect.arrayContaining([{ height: 1100 }]));
    expect(mockInjectJavaScript).toHaveBeenCalledTimes(1);
  });

  it('reports paragraph locations with height so a resize can restore the same teaching block', () => {
    const onContentLocations = jest.fn();
    let tree: any;
    act(() => {
      tree = renderer.create(
        <DevotionalWebView day={day} fontSize="medium" onContentLocations={onContentLocations} />,
      );
    });

    const script = getWebViewProps(tree).injectedJavaScript as string;
    expect(script).toContain('collectParagraphYs');
    expect(script).toContain("paragraphs: collectParagraphYs()");
    expect(script).toContain('documentRelativeOffsetTop');
    expect(script).toContain('node.offsetParent');
    expect(script).not.toContain('nodes[i].offsetTop');
    expect(getWebViewProps(tree).source.html).not.toContain('key={');

    act(() => {
      getWebViewProps(tree).onMessage({
        nativeEvent: {
          data: JSON.stringify({
            type: 'HEIGHT_CHANGE',
            height: 980,
            docId: getDocId(tree),
            paragraphs: [0, 140, 360],
          }),
        },
      });
    });

    expect(onContentLocations).toHaveBeenCalledWith([0, 140, 360], 0);
    const source = getWebViewProps(tree).source;
    act(() => {
      tree.update(
        <DevotionalWebView day={day} fontSize="large" onContentLocations={onContentLocations} />,
      );
    });
    expect(getWebViewProps(tree).source).toBe(source);
  });

  it('echoes the current layout generation without reloading the document', () => {
    const onContentLocations = jest.fn();
    const onLayoutGenerationCommitted = jest.fn();
    let tree: any;
    act(() => {
      tree = renderer.create(
        <DevotionalWebView
          day={day}
          fontSize="medium"
          layoutGeneration={2}
          onContentLocations={onContentLocations}
          onLayoutGenerationCommitted={onLayoutGenerationCommitted}
        />,
      );
    });

    const script = getWebViewProps(tree).injectedJavaScript as string;
    expect(script).toContain('layoutGeneration: window.__unfoldLayoutGeneration || 0');
    const source = getWebViewProps(tree).source;

    act(() => {
      getWebViewProps(tree).onMessage({
        nativeEvent: {
          data: JSON.stringify({
            type: 'HEIGHT_CHANGE',
            height: 980,
            docId: getDocId(tree),
            paragraphs: [0, 140, 360],
            layoutGeneration: 2,
          }),
        },
      });
    });
    expect(onContentLocations).toHaveBeenCalledWith([0, 140, 360], 2);
    expect(onLayoutGenerationCommitted).toHaveBeenCalledWith(2);

    mockInjectJavaScript.mockClear();
    act(() => {
      tree.update(
        <DevotionalWebView
          day={day}
          fontSize="medium"
          layoutGeneration={3}
          onContentLocations={onContentLocations}
          onLayoutGenerationCommitted={onLayoutGenerationCommitted}
        />,
      );
    });
    expect(getWebViewProps(tree).source).toBe(source);
    expect(mockInjectJavaScript.mock.calls.some(([injected]) => (
      String(injected).includes('window.__unfoldLayoutGeneration = 3')
      && String(injected).includes('documentRelativeOffsetTop')
    ))).toBe(true);

    act(() => {
      getWebViewProps(tree).onMessage({
        nativeEvent: {
          data: JSON.stringify({
            type: 'HEIGHT_CHANGE',
            height: 980,
            docId: getDocId(tree),
            paragraphs: [0, 140, 360],
            layoutGeneration: 2,
          }),
        },
      });
    });
    expect(onContentLocations).toHaveBeenCalledTimes(1);
    expect(onLayoutGenerationCommitted).toHaveBeenCalledTimes(1);
  });

  it('commits only the current generation when height reports arrive out of order', () => {
    const onContentLocations = jest.fn();
    const onLayoutGenerationCommitted = jest.fn();
    let tree: any;
    act(() => {
      tree = renderer.create(
        <DevotionalWebView
          day={day}
          fontSize="medium"
          layoutGeneration={4}
          onContentLocations={onContentLocations}
          onLayoutGenerationCommitted={onLayoutGenerationCommitted}
        />,
      );
    });

    const source = getWebViewProps(tree).source;
    act(() => {
      getWebViewProps(tree).onMessage({
        nativeEvent: {
          data: JSON.stringify({
            type: 'HEIGHT_CHANGE',
            height: 700,
            docId: getDocId(tree),
            paragraphs: [0, 90],
            layoutGeneration: 3,
          }),
        },
      });
    });
    expect(onContentLocations).not.toHaveBeenCalled();
    expect(onLayoutGenerationCommitted).not.toHaveBeenCalled();
    expect(getWebViewProps(tree).style).toEqual(expect.arrayContaining([{ height: 200 }]));

    act(() => {
      getWebViewProps(tree).onMessage({
        nativeEvent: {
          data: JSON.stringify({
            type: 'HEIGHT_CHANGE',
            height: 840,
            docId: getDocId(tree),
            paragraphs: [0, 120],
            layoutGeneration: 4,
          }),
        },
      });
    });
    expect(onContentLocations).toHaveBeenCalledWith([0, 120], 4);
    expect(onLayoutGenerationCommitted).toHaveBeenCalledWith(4);
    expect(getWebViewProps(tree).source).toBe(source);
    expect(getWebViewProps(tree).style).toEqual(expect.arrayContaining([{ height: 840 }]));

    act(() => {
      getWebViewProps(tree).onMessage({
        nativeEvent: {
          data: JSON.stringify({
            type: 'HEIGHT_CHANGE',
            height: 400,
            docId: getDocId(tree),
            paragraphs: [0],
          }),
        },
      });
    });
    expect(onContentLocations).toHaveBeenCalledTimes(1);
    expect(onLayoutGenerationCommitted).toHaveBeenCalledTimes(1);
    expect(getWebViewProps(tree).style).toEqual(expect.arrayContaining([{ height: 840 }]));
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
    expect(script).toContain('"--hl-yellow-bg":"linear-gradient(100deg, rgba(255, 236, 80, 0.34), rgba(255, 236, 80, 0.72) 12%, rgba(255, 236, 80, 0.63) 88%, rgba(255, 236, 80, 0.30))"');
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

  it('fits a short reading after its first measurement and after reflow', () => {
    let tree: any;
    act(() => {
      tree = renderer.create(<DevotionalWebView day={day} fontSize="medium" />);
    });

    reportHeight(tree, 140);
    expect(getWebViewProps(tree).style).toEqual(expect.arrayContaining([{ height: 140 }]));

    reportHeight(tree, 96);
    expect(getWebViewProps(tree).style).toEqual(expect.arrayContaining([{ height: 96 }]));
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
    expect(html).toContain("font-family: 'Source Serif 4'");
    expect(html).toContain('base64,LOCAL');
    expect(html).not.toContain('fonts.googleapis.com');
    expect(html).not.toContain('fonts.gstatic.com');

    expect(RANGY_BUNDLE).toContain('Original file: /npm/rangy@1.3.0/lib/rangy-core.js');
    expect(RANGY_BUNDLE).toContain('Original file: /npm/rangy@1.3.0/lib/rangy-classapplier.js');
    expect(RANGY_BUNDLE).toContain('Original file: /npm/rangy@1.3.0/lib/rangy-highlighter.js');
    expect(RANGY_BUNDLE.indexOf('rangy-core.js')).toBeLessThan(RANGY_BUNDLE.indexOf('rangy-classapplier.js'));
    expect(RANGY_BUNDLE.indexOf('rangy-classapplier.js')).toBeLessThan(RANGY_BUNDLE.indexOf('rangy-highlighter.js'));
    // Safe to interpolate into the template literal and inline in <script>.
    expect(RANGY_BUNDLE).not.toMatch(/`|\$\{|<\/script/i);
  });
});

describe('DevotionalWebView selection actions (RN side)', () => {
  const scriptureDay: DevotionalDay = {
    ...day,
    bodyText: 'Jesus said, “Come to me, all who are weary” (Matthew 11:28). Rest is a gift.',
  };

  function renderReader(extra: Record<string, unknown> = {}) {
    let tree: any;
    act(() => {
      tree = renderer.create(
        <DevotionalWebView
          day={scriptureDay}
          fontSize="medium"
          devotionalId="dev-1"
          devotionalTitle="Quiet Path Series"
          dayNumber={1}
          dayTitle="A Quiet Path"
          {...extra}
        />,
      );
    });
    return tree;
  }

  function send(tree: any, data: Record<string, unknown>) {
    act(() => {
      getWebViewProps(tree).onMessage({ nativeEvent: { data: JSON.stringify(data) } });
    });
  }

  let shareSpy: jest.SpyInstance;
  let announceSpy: jest.SpyInstance;

  beforeEach(() => {
    mockInjectJavaScript.mockClear();
    mockAddBookmark.mockClear();
    mockBookmarks = [];
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    require('expo-haptics').impactAsync.mockClear();
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    require('expo-clipboard').setStringAsync.mockClear();
    shareSpy = jest.spyOn(Share, 'share').mockResolvedValue({ action: 'sharedAction' } as any);
    announceSpy = jest.spyOn(AccessibilityInfo, 'announceForAccessibility').mockImplementation(() => {});
  });

  afterEach(() => {
    shareSpy.mockRestore();
    announceSpy.mockRestore();
  });

  it('saves selected prose as an excerpt bookmark, with a haptic and a My library confirmation', () => {
    const tree = renderReader();
    send(tree, { type: 'SELECTION_ACTION', action: 'bookmark', requestId: 7, text: 'Rest is a gift.', reference: '' });

    const saved = {
      devotionalId: 'dev-1',
      devotionalTitle: 'Quiet Path Series',
      dayNumber: 1,
      dayTitle: 'A Quiet Path',
      kind: 'excerpt',
      key: 'Rest is a gift.',
      scriptureReference: storedReferenceFor('excerpt'),
      scriptureText: 'Rest is a gift.',
      quotedText: 'Rest is a gift.',
    };
    expect(mockAddBookmark).toHaveBeenCalledWith(saved);
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    expect(require('expo-haptics').impactAsync).toHaveBeenCalledWith('Light');
    expect(mockInjectJavaScript).toHaveBeenCalledWith(
      'window.__unfoldSelectionConfirm && window.__unfoldSelectionConfirm(7, "Saved to My library"); true;',
    );
    expect(announceSpy).toHaveBeenCalledWith('Saved to My library');

    // The same words again, as this device saved them and as a sync pull
    // rebuilds them (reference and text only): nothing new is saved, and the
    // bar says so, the way it does for a Scripture passage.
    const stored: Bookmark = { ...saved, id: 'bm-1', kind: 'excerpt', savedAt: '2026-09-30T00:00:00.000Z' };
    const pulled: Bookmark = {
      id: 'bm-pulled',
      devotionalId: 'dev-1',
      devotionalTitle: 'Quiet Path Series',
      dayNumber: 1,
      dayTitle: 'A Quiet Path',
      scriptureReference: storedReferenceFor('excerpt'),
      scriptureText: 'Rest is a gift.',
      savedAt: '2026-09-30T00:00:00.000Z',
    };
    for (const [requestId, existing] of [[8, stored], [9, pulled]] as const) {
      mockAddBookmark.mockClear();
      mockInjectJavaScript.mockClear();
      announceSpy.mockClear();
      mockBookmarks = [existing];
      send(tree, { type: 'SELECTION_ACTION', action: 'bookmark', requestId, text: 'Rest is a gift.', reference: '' });
      expect(mockAddBookmark).not.toHaveBeenCalled();
      expect(mockInjectJavaScript).toHaveBeenCalledWith(
        `window.__unfoldSelectionConfirm && window.__unfoldSelectionConfirm(${requestId}, "Already in My library"); true;`,
      );
      expect(announceSpy).toHaveBeenCalledWith('Already in My library');
    }
  });

  it('saves words inside a Scripture passage as a Scripture phrase keyed by the reference, once per passage', () => {
    const tree = renderReader();
    send(tree, { type: 'SELECTION_ACTION', action: 'bookmark', requestId: 3, text: 'Come to me', reference: 'Matthew 11:28' });

    expect(mockAddBookmark).toHaveBeenLastCalledWith(expect.objectContaining({
      kind: 'scripture',
      key: 'Matthew 11:28',
      scriptureReference: 'Matthew 11:28',
      // Sync carries only the reference and this text: the ellipses keep it
      // a phrase on another device.
      scriptureText: '…Come to me…',
      quotedText: 'Come to me',
    }));

    // The whole quotation: its quote marks and an ellipsis at its end stay out.
    send(tree, { type: 'SELECTION_ACTION', action: 'bookmark', requestId: 4, text: '“Come to me, all who are weary…”', reference: 'Matthew 11:28' });
    expect(mockAddBookmark).toHaveBeenLastCalledWith(expect.objectContaining({
      scriptureText: '…Come to me, all who are weary…',
      quotedText: 'Come to me, all who are weary',
    }));

    // The passage is already saved (for example from the passage sheet).
    mockAddBookmark.mockClear();
    mockBookmarks = [{
      id: 'bm-2',
      devotionalId: 'dev-1',
      devotionalTitle: 'Quiet Path Series',
      dayNumber: 1,
      dayTitle: 'A Quiet Path',
      kind: 'scripture',
      key: 'Matthew 11:28',
      scriptureReference: 'Matthew 11:28',
      scriptureText: 'Come to me, all who are weary and burdened.',
      savedAt: '2026-09-30T00:00:00.000Z',
    }];
    send(tree, { type: 'SELECTION_ACTION', action: 'bookmark', requestId: 5, text: 'all who are weary', reference: 'matthew 11:28' });
    expect(mockAddBookmark).not.toHaveBeenCalled();
    // Sync keeps one Scripture bookmark per passage, so the bar says so.
    expect(mockInjectJavaScript).toHaveBeenCalledWith(
      'window.__unfoldSelectionConfirm && window.__unfoldSelectionConfirm(5, "Already in My library"); true;',
    );
    expect(announceSpy).toHaveBeenCalledWith('Already in My library');
  });

  it('closes the bar without saving when the reader has no devotional', () => {
    const tree = renderReader({ devotionalId: undefined });
    send(tree, { type: 'SELECTION_ACTION', action: 'bookmark', requestId: 5, text: 'Rest', reference: '' });
    expect(mockAddBookmark).not.toHaveBeenCalled();
    expect(mockInjectJavaScript).toHaveBeenCalledWith(
      'window.__unfoldSelectionConfirm && window.__unfoldSelectionConfirm(5, ""); true;',
    );
  });

  it('shares prose and Scripture through the share sheet with the link only in the message', () => {
    const tree = renderReader();
    send(tree, { type: 'SELECTION_ACTION', action: 'share', requestId: 1, text: 'Rest is a gift.', reference: '' });
    send(tree, { type: 'SELECTION_ACTION', action: 'share', requestId: 2, text: 'Come to me', reference: 'Matthew 11:28' });

    expect(shareSpy).toHaveBeenCalledTimes(2);
    expect(shareSpy.mock.calls[0]).toEqual([{
      message: '“Rest is a gift.”\n\nExcerpt from Quiet Path Series, Day 1: A Quiet Path\nShared from Unfold · https://unfoldapp.co',
    }]);
    expect(shareSpy.mock.calls[1]).toEqual([{
      message: '“Come to me”\nMatthew 11:28\n\nShared from Unfold · https://unfoldapp.co',
    }]);
    expect(mockAddBookmark).not.toHaveBeenCalled();
  });

  it('copies the plain selected text and confirms Copied', async () => {
    const tree = renderReader();
    send(tree, { type: 'SELECTION_ACTION', action: 'copy', requestId: 9, text: 'Come to me.\n\nRest is a gift.' });
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    expect(require('expo-clipboard').setStringAsync).toHaveBeenCalledWith('Come to me.\n\nRest is a gift.');
    await act(async () => {
      await Promise.resolve();
    });
    expect(mockInjectJavaScript).toHaveBeenCalledWith(
      'window.__unfoldSelectionConfirm && window.__unfoldSelectionConfirm(9, "Copied"); true;',
    );
    expect(announceSpy).toHaveBeenCalledWith('Copied');

    // A write the clipboard refuses confirms nothing: the bar closes.
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    require('expo-clipboard').setStringAsync.mockResolvedValueOnce(false);
    send(tree, { type: 'SELECTION_ACTION', action: 'copy', requestId: 10, text: 'Rest is a gift.' });
    await act(async () => {
      await Promise.resolve();
    });
    expect(mockInjectJavaScript).toHaveBeenCalledWith(
      'window.__unfoldSelectionConfirm && window.__unfoldSelectionConfirm(10, ""); true;',
    );
    // Unmounting ends the confirmation and its timer.
    act(() => tree.unmount());
  });

  it('passes on a target bookmark the page cannot find', () => {
    const onTargetBookmarkMissing = jest.fn();
    const tree = renderReader({ onTargetBookmarkMissing });
    send(tree, { type: 'TARGET_BOOKMARK_MISSING', bookmarkId: 'bm-1' });
    expect(onTargetBookmarkMissing).toHaveBeenCalledTimes(1);
  });

  it('tells VoiceOver what the bar offers when it opens or changes step', () => {
    const tree = renderReader();
    send(tree, { type: 'SELECTION_BAR', mode: 'actions' });
    send(tree, { type: 'SELECTION_BAR', mode: 'colors' });
    send(tree, { type: 'SELECTION_BAR', mode: 'edit' });
    send(tree, { type: 'SELECTION_BAR', mode: 'status' });
    expect(announceSpy.mock.calls).toEqual([
      ['Selection actions: Highlight, Bookmark, Share, Copy'],
      ['Highlight: General, Growth, Prayer, Questions, Important'],
      ['Edit highlight: General, Growth, Prayer, Questions, Important, or remove it'],
    ]);
  });

  it('copies without rendering the reader again: the bar shows the confirmation', async () => {
    const onRender = jest.fn();
    let tree: any;
    act(() => {
      tree = renderer.create(
        <React.Profiler id="reader" onRender={onRender}>
          <DevotionalWebView day={scriptureDay} fontSize="medium" devotionalId="dev-1" dayNumber={1} />
        </React.Profiler>,
      );
    });
    await act(async () => {
      await Promise.resolve();
    });
    const renders = onRender.mock.calls.length;
    send(tree, { type: 'SELECTION_ACTION', action: 'copy', requestId: 3, text: 'Rest is a gift.' });
    await act(async () => {
      await Promise.resolve();
    });
    expect(mockInjectJavaScript).toHaveBeenCalledWith(
      'window.__unfoldSelectionConfirm && window.__unfoldSelectionConfirm(3, "Copied"); true;',
    );
    expect(onRender).toHaveBeenCalledTimes(renders);
  });

  it('ignores a bar step or an action it does not know', () => {
    const tree = renderReader();
    mockInjectJavaScript.mockClear();
    send(tree, { type: 'SELECTION_BAR', mode: 'toString' });
    send(tree, { type: 'SELECTION_ACTION', action: 'highlight', requestId: 1, text: 'Rest is a gift.' });
    send(tree, { type: 'SELECTION_ACTION', action: 'constructor', requestId: 2, text: 'Rest is a gift.' });
    expect(announceSpy).not.toHaveBeenCalled();
    expect(shareSpy).not.toHaveBeenCalled();
    expect(mockAddBookmark).not.toHaveBeenCalled();
    expect(mockInjectJavaScript).not.toHaveBeenCalled();
  });

  it('tells a ready page when a screen reader is on and when that changes, and sends nothing while none is on', async () => {
    const told = () => mockInjectJavaScript.mock.calls.map(([script]) => script as string)
      .filter((script) => script.includes('__unfoldSetScreenReader'));
    const quiet = renderReader();
    await act(async () => {
      await Promise.resolve();
    });
    reportHeight(quiet);
    expect(told()).toEqual([]);
    act(() => quiet.unmount());

    // The jest preset's own mocks: each answers the next call only.
    let changeTo: ((on: boolean) => void) | undefined;
    jest.mocked(AccessibilityInfo.isScreenReaderEnabled).mockResolvedValueOnce(true);
    jest.mocked(AccessibilityInfo.addEventListener).mockImplementationOnce(((_event: string, handler: (on: boolean) => void) => {
      changeTo = handler;
      return { remove: jest.fn() };
    }) as never);
    const tree = renderReader();
    await act(async () => {
      await Promise.resolve();
    });
    // The page is not ready before its first height report.
    expect(told()).toEqual([]);
    reportHeight(tree);
    expect(told()).toEqual(['window.__unfoldSetScreenReader && window.__unfoldSetScreenReader(true); true;']);
    act(() => changeTo?.(false));
    expect(told().at(-1)).toBe('window.__unfoldSetScreenReader && window.__unfoldSetScreenReader(false); true;');
    act(() => tree.unmount());
  });

  it('answers SELECTION_ACTIVE with the band of the page the reader can see', () => {
    const viewportRef = { current: { measureInWindow: (callback: any) => callback(0, 100, 390, 600) } };
    const tree = renderReader({ viewportRef });
    // The WebView starts 400pt above the window and is 3000pt tall.
    const container = tree.root.find((node: any) => node.props.collapsable === false && node.instance?.measureInWindow);
    container.instance.measureInWindow = (callback: any) => callback(0, -400, 390, 3000);

    // The answer carries the id of the request, so the page can drop an
    // answer to an older one.
    send(tree, { type: 'SELECTION_ACTIVE', requestId: 3 });
    expect(mockInjectJavaScript).toHaveBeenCalledWith('window.__unfoldSetViewport && window.__unfoldSetViewport(500, 1100, 3); true;');
  });
});

// ---- The page itself, run in jsdom --------------------------------------------
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { JSDOM } = require('jsdom');

interface Box { top: number; bottom: number; left: number; right: number; width: number; height: number }

/** The selection bar's size in these tests (jsdom has no layout). */
const BAR_WIDTH = 258;
const BAR_HEIGHT = 60;
const PAGE_WIDTH = 390;

function box(top: number, left: number, width = 120, height = 24): Box {
  return { top, left, width, height, bottom: top + height, right: left + width };
}

const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

interface ReaderPage {
  window: any;
  document: any;
  toolbar: any;
  messages: any[];
  geometry: { selection: Box };
}

const openPages: ReaderPage[] = [];

/** `beforeScript` runs in the page after its <head> and before the page script. */
async function openPage(tree: any, beforeScript?: (window: any) => void): Promise<ReaderPage> {
  const props = getWebViewProps(tree);
  const dom = new JSDOM(props.source.html, { runScripts: 'dangerously', pretendToBeVisual: true });
  const { window } = dom;
  const { document } = window;
  const messages: any[] = [];
  const geometry = { selection: box(400, 100) };
  window.ReactNativeWebView = { postMessage: (message: string) => messages.push(JSON.parse(message)) };
  window.Range.prototype.getBoundingClientRect = () => geometry.selection;
  Object.defineProperty(window.HTMLElement.prototype, 'offsetWidth', {
    configurable: true,
    get() { return this.id === 'highlight-toolbar' ? BAR_WIDTH : 0; },
  });
  Object.defineProperty(window.HTMLElement.prototype, 'offsetHeight', {
    configurable: true,
    get() { return this.id === 'highlight-toolbar' ? BAR_HEIGHT : 0; },
  });
  Object.defineProperty(document.documentElement, 'clientWidth', { configurable: true, value: PAGE_WIDTH });
  Object.defineProperty(document.body, 'scrollHeight', { configurable: true, value: 3000 });
  if (document.readyState !== 'complete') {
    await new Promise((resolve) => window.addEventListener('load', resolve));
  }
  beforeScript?.(window);
  window.eval(props.injectedJavaScript);
  const page = { window, document, toolbar: document.getElementById('highlight-toolbar'), messages, geometry };
  openPages.push(page);
  return page;
}

function textNodeWith(page: ReaderPage, needle: string) {
  const walker = page.document.createTreeWalker(page.document.body, page.window.NodeFilter.SHOW_TEXT);
  for (let node = walker.nextNode(); node; node = walker.nextNode()) {
    if (node.nodeValue.includes(needle) && !node.parentElement.closest('#highlight-toolbar')) return node;
  }
  throw new Error(`no text node holds "${needle}"`);
}

/** Selects the words the way a long press or a double tap would. */
async function select(page: ReaderPage, needle: string, at: Box = page.geometry.selection) {
  page.geometry.selection = at;
  const node = textNodeWith(page, needle);
  const start = node.nodeValue.indexOf(needle);
  const range = page.document.createRange();
  range.setStart(node, start);
  range.setEnd(node, start + needle.length);
  const selection = page.window.getSelection();
  selection.removeAllRanges();
  selection.addRange(range);
  page.document.dispatchEvent(new page.window.Event('selectionchange'));
  await wait(90);
}

async function collapseSelection(page: ReaderPage) {
  page.window.getSelection().removeAllRanges();
  page.document.dispatchEvent(new page.window.Event('selectionchange'));
  await wait(90);
}

function touch(page: ReaderPage, type: string, target: any) {
  const event = new page.window.Event(type, { bubbles: true, cancelable: true });
  Object.defineProperty(event, 'touches', { value: type === 'touchend' ? [] : [{ clientX: 20, clientY: 20 }] });
  target.dispatchEvent(event);
  return event;
}

/** A finger tap: touchstart, touchend, and a click unless the page took the tap. */
function tap(page: ReaderPage, target: any) {
  touch(page, 'touchstart', target);
  const end = touch(page, 'touchend', target);
  if (!end.defaultPrevented) target.dispatchEvent(new page.window.MouseEvent('click', { bubbles: true, cancelable: true }));
}

const barButton = (page: ReaderPage, selector: string) => page.toolbar.querySelector(selector);
const barMode = (page: ReaderPage) => page.toolbar.getAttribute('data-mode');
const isBarVisible = (page: ReaderPage) => page.toolbar.classList.contains('visible');
const lastMessage = (page: ReaderPage, type: string) => [...page.messages].reverse().find((message) => message.type === type);

/** RN's answer to the page's latest SELECTION_ACTIVE: the band the reader can see. */
function answerViewport(page: ReaderPage, top: number, bottom: number) {
  page.window.__unfoldSetViewport(top, bottom, lastMessage(page, 'SELECTION_ACTIVE')?.requestId);
}

async function highlightWords(page: ReaderPage, needle: string, color: string) {
  await select(page, needle);
  tap(page, barButton(page, '[data-action="highlight"]'));
  tap(page, barButton(page, `.color-btn.${color}`));
}

describe('DevotionalWebView selection bar (the page, in jsdom)', () => {
  const pageDay: DevotionalDay = {
    ...day,
    scriptureReference: 'Psalm 46:10',
    scriptureText: 'Be still, and know that I am God; I will be exalted among the nations.',
    bodyText: [
      'The next faithful step is enough for today. Grace meets you in the next act of trust.',
      'Jesus said, “Come to me, all who are weary” (Matthew 11:28). Rest is a gift. The Lord says, “Be still, and know that I am God.” Stillness is trust.',
    ].join('\n\n'),
  };

  function renderPage(extra: Record<string, unknown> = {}) {
    let tree: any;
    act(() => {
      tree = renderer.create(<DevotionalWebView day={pageDay} fontSize="medium" devotionalId="dev-1" dayNumber={1} {...extra} />);
    });
    return tree;
  }

  afterEach(() => {
    while (openPages.length) openPages.pop()?.window.close();
  });

  it('shows the bar above a new selection with Highlight, Bookmark, Share, and Copy', async () => {
    const page = await openPage(renderPage());
    await select(page, 'Grace meets you');

    // The page asks RN where the reader can see it, then shows the bar.
    expect(page.messages).toContainEqual({ type: 'SELECTION_ACTIVE', requestId: 1 });
    expect(isBarVisible(page)).toBe(false);
    answerViewport(page, 0, 3000);
    expect(isBarVisible(page)).toBe(true);
    expect(barMode(page)).toBe('actions');

    const actions = [...page.toolbar.querySelectorAll('.bar-actions button')];
    expect(actions.map((button: any) => button.getAttribute('data-action'))).toEqual(['highlight', 'bookmark', 'share', 'copy']);
    expect(actions.map((button: any) => button.textContent.trim())).toEqual(['Highlight', 'Bookmark', 'Share', 'Copy']);
    for (const button of actions as any[]) {
      expect(button.getAttribute('type')).toBe('button');
      expect(button.querySelector('svg path')?.getAttribute('d')).toBeTruthy();
    }
    expect(page.toolbar.getAttribute('role')).toBe('toolbar');

    // Above the selection box (top 400): 400 - 14 gap - 60 bar. Centred: 160 - 129.
    expect(page.toolbar.getAttribute('data-placement')).toBe('above');
    expect(page.toolbar.style.top).toBe('326px');
    expect(page.toolbar.style.left).toBe('31px');
  });

  it('shows the bar without an answer from RN after a short wait', async () => {
    const page = await openPage(renderPage());
    await select(page, 'Grace meets you');
    await wait(200);
    expect(isBarVisible(page)).toBe(true);
  });

  it('moves below a selection with no room above, stays inside the width, and follows the handles', async () => {
    const page = await openPage(renderPage());
    await select(page, 'Grace meets you', box(400, 330, 50));
    // The reader can see page y 380..1000: no room above the selection.
    answerViewport(page, 380, 1000);
    expect(page.toolbar.getAttribute('data-placement')).toBe('below');
    expect(page.toolbar.style.top).toBe('438px');
    // Centred on 355 it would overflow; it stops 8px from the right edge.
    expect(page.toolbar.style.left).toBe(`${PAGE_WIDTH - BAR_WIDTH - 8}px`);

    // A handle drag grows the selection: the bar follows it once RN has
    // measured the band for the new words.
    await select(page, 'Grace meets you in the next', box(700, 0, 300));
    answerViewport(page, 380, 1000);
    expect(page.toolbar.getAttribute('data-placement')).toBe('above');
    expect(page.toolbar.style.top).toBe('626px');
    expect(page.toolbar.style.left).toBe('21px');

    // Taller than the band: pinned to its top.
    await select(page, 'The next faithful step', box(300, 20, 300, 900));
    answerViewport(page, 380, 1000);
    expect(page.toolbar.getAttribute('data-placement')).toBe('pinned');
    expect(page.toolbar.style.top).toBe('388px');
  });

  it('measures the visible band again for each new anchor, and forgets it when the bar closes', async () => {
    const page = await openPage(renderPage());
    const measured = () => page.messages.filter((message) => message.type === 'SELECTION_ACTIVE').length;
    const click = (el: any) => el.dispatchEvent(new page.window.MouseEvent('click', { bubbles: true, cancelable: true }));

    // Tap-to-edit: the reader taps highlight A, scrolls two screens, and taps
    // highlight B just under the top of what they can see.
    await highlightWords(page, 'Grace meets you', 'yellow');
    await highlightWords(page, 'Rest is a gift.', 'green');
    const markA = page.document.querySelector('mark.highlight-yellow');
    const markB = page.document.querySelector('mark.highlight-green');
    markA.getBoundingClientRect = () => box(400, 100);
    markB.getBoundingClientRect = () => box(1230, 100);
    const start = measured();
    click(markA);
    expect(measured()).toBe(start + 1);
    answerViewport(page, 0, 800);
    expect(page.toolbar.style.top).toBe('326px');
    click(markB);
    expect(measured()).toBe(start + 2);
    answerViewport(page, 1200, 2000);
    expect(page.toolbar.getAttribute('data-placement')).toBe('below');
    expect(page.toolbar.style.top).toBe('1268px');
    click(page.document.querySelector('p'));
    expect(isBarVisible(page)).toBe(false);

    // A long press on new words while the bar is still open.
    await select(page, 'faithful step', box(400, 100));
    answerViewport(page, 0, 800);
    await select(page, 'Stillness is trust.', box(1230, 100));
    expect(measured()).toBe(start + 4);
    answerViewport(page, 1200, 2000);
    expect(page.toolbar.getAttribute('data-placement')).toBe('below');
    expect(page.toolbar.style.top).toBe('1268px');

    // Closed and opened again with no answer from RN: the article edges, not
    // the band from the earlier scroll position.
    await wait(650); // past the window in which a collapse is a bar tap's
    await collapseSelection(page);
    expect(isBarVisible(page)).toBe(false);
    await select(page, 'Grace meets you', box(400, 100));
    await wait(200);
    expect(page.toolbar.getAttribute('data-placement')).toBe('above');
    expect(page.toolbar.style.top).toBe('326px');
  });

  it('places the bar with the answer to its latest request, and ignores an older answer that arrives last', async () => {
    const page = await openPage(renderPage());
    const requests = () => page.messages.filter((message) => message.type === 'SELECTION_ACTIVE').map((message) => message.requestId);
    await select(page, 'faithful step', box(400, 100));
    // The reader scrolls two screens and selects again before RN answers.
    await select(page, 'Stillness is trust.', box(1230, 100));
    const [older, latest] = requests().slice(-2);

    page.window.__unfoldSetViewport(1200, 2000, latest);
    expect(page.toolbar.getAttribute('data-placement')).toBe('below');
    expect(page.toolbar.style.top).toBe('1268px');
    // The answer to the older request (the band two screens up) comes last.
    page.window.__unfoldSetViewport(0, 800, older);
    expect(page.toolbar.getAttribute('data-placement')).toBe('below');
    expect(page.toolbar.style.top).toBe('1268px');
    expect(latest).toBeGreaterThan(older);
  });

  it('measures again when an Aa change or a window resize reflows the page under the bar', async () => {
    const tree = renderPage();
    reportHeight(tree, 900);
    const page = await openPage(tree);
    const measured = () => page.messages.filter((message) => message.type === 'SELECTION_ACTIVE').length;
    await select(page, 'Grace meets you', box(400, 100));
    answerViewport(page, 0, 3000);
    expect(measured()).toBe(1);

    mockInjectJavaScript.mockClear();
    act(() => {
      tree.update(<DevotionalWebView day={pageDay} fontSize="large" devotionalId="dev-1" dayNumber={1} />);
    });
    const themeScript = mockInjectJavaScript.mock.calls.map(([script]) => script as string)
      .find((script) => script.includes('root.style.setProperty'));
    page.geometry.selection = box(520, 100);
    page.window.eval(themeScript);
    expect(measured()).toBe(2);
    answerViewport(page, 0, 3000);
    expect(page.toolbar.style.top).toBe('446px');

    page.window.dispatchEvent(new page.window.Event('resize'));
    await wait(60);
    expect(measured()).toBe(3);
  });

  it('places the bar again when a scroll the reader ran itself ends', async () => {
    const commandRef = { current: null as any };
    const page = await openPage(renderPage({ commandRef }));
    const measured = () => page.messages.filter((message) => message.type === 'SELECTION_ACTIVE').length;
    const refresh = () => {
      mockInjectJavaScript.mockClear();
      act(() => {
        commandRef.current.refreshSelectionBar();
      });
      expect(mockInjectJavaScript).toHaveBeenCalledWith('window.__unfoldRefreshBar && window.__unfoldRefreshBar(); true;');
      page.window.eval(mockInjectJavaScript.mock.calls[0][0]);
    };
    await select(page, 'Grace meets you', box(400, 100));
    answerViewport(page, 0, 3000);
    expect(page.toolbar.getAttribute('data-placement')).toBe('above');

    // The reflow restore after an Aa change scrolled the reader. The band it
    // can see now starts just above the words, so the bar moves below them.
    refresh();
    expect(measured()).toBe(2);
    answerViewport(page, 380, 1000);
    expect(page.toolbar.getAttribute('data-placement')).toBe('below');
    expect(page.toolbar.style.top).toBe('438px');
    expect(isBarVisible(page)).toBe(true);

    // With no bar open there is nothing to place.
    await collapseSelection(page);
    expect(isBarVisible(page)).toBe(false);
    refresh();
    expect(measured()).toBe(2);
  });

  it('turns into the five named colours and a back control on Highlight', async () => {
    const page = await openPage(renderPage());
    await select(page, 'Grace meets you');
    answerViewport(page, 0, 3000);

    tap(page, barButton(page, '[data-action="highlight"]'));
    expect(barMode(page)).toBe('colors');
    expect(isBarVisible(page)).toBe(true);
    const colours = [...page.toolbar.querySelectorAll('.bar-colors .color-btn')];
    expect(colours.map((button: any) => button.getAttribute('aria-label'))).toEqual([
      'Highlight General', 'Highlight Growth', 'Highlight Prayer', 'Highlight Questions', 'Highlight Important',
    ]);
    // The words stay selected while a colour is chosen.
    expect(page.window.getSelection().toString()).toBe('Grace meets you');

    tap(page, barButton(page, '[data-action="back"]'));
    expect(barMode(page)).toBe('actions');
    expect(isBarVisible(page)).toBe(true);
  });

  it('shows only colour dots in the colour step and in edit mode, each still named for VoiceOver', async () => {
    const page = await openPage(renderPage());
    const swatches = () => [...page.toolbar.querySelectorAll('.bar-colors .color-btn')] as any[];
    await select(page, 'Grace meets you');
    tap(page, barButton(page, '[data-action="highlight"]'));
    expect(barMode(page)).toBe('colors');
    expect(swatches().map((button) => button.textContent.trim())).toEqual(['', '', '', '', '']);
    expect(swatches().every((button) => button.querySelector('.dot'))).toBe(true);
    expect(swatches().map((button) => button.getAttribute('aria-label'))).toEqual([
      'Highlight General', 'Highlight Growth', 'Highlight Prayer', 'Highlight Questions', 'Highlight Important',
    ]);
    expect(barButton(page, '[data-action="back"]').getAttribute('aria-label')).toBe('Back');

    // Edit mode: the current colour carries the remove mark and says so.
    tap(page, barButton(page, '.color-btn.green'));
    page.document.querySelector('mark.highlight-green').dispatchEvent(new page.window.MouseEvent('click', { bubbles: true, cancelable: true }));
    expect(barMode(page)).toBe('edit');
    expect(swatches().map((button) => button.textContent.trim())).toEqual(['', '', '', '', '']);
    const green = barButton(page, '.color-btn.green');
    expect(green.classList.contains('remove-mode')).toBe(true);
    expect(green.getAttribute('aria-label')).toBe('Remove highlight');
    expect(barButton(page, '.color-btn.yellow').getAttribute('aria-label')).toBe('Highlight General');
  });

  it('applies the colour on the first tap even after the tap collapsed the selection', async () => {
    const page = await openPage(renderPage());
    await select(page, 'Grace meets you');
    tap(page, barButton(page, '[data-action="highlight"]'));

    // iOS clears the selection for the same touch that lands on the colour.
    const yellow = barButton(page, '.color-btn.yellow');
    touch(page, 'touchstart', yellow);
    await collapseSelection(page);
    expect(barMode(page)).toBe('colors');
    touch(page, 'touchend', yellow);

    const mark = page.document.querySelector('mark.highlight-yellow');
    expect(mark?.textContent).toBe('Grace meets you');
    const change = lastMessage(page, 'HIGHLIGHTS_CHANGED');
    expect(change).toMatchObject({ reason: 'create', silent: false, removed: [] });
    expect(change.added).toEqual([expect.objectContaining({ text: 'Grace meets you', color: 'yellow' })]);
    expect(change.primarySerial).toBe(change.added[0].serial);
    expect(page.messages).toContainEqual({ type: 'HAPTIC_IMPACT' });
    expect(isBarVisible(page)).toBe(false);
    expect(page.window.getSelection().toString()).toBe('');
  });

  it('keeps tap-to-edit: another colour recolours and the X removes', async () => {
    const page = await openPage(renderPage());
    await highlightWords(page, 'Grace meets you', 'yellow');

    page.document.querySelector('mark.highlight-yellow').dispatchEvent(new page.window.MouseEvent('click', { bubbles: true, cancelable: true }));
    expect(barMode(page)).toBe('edit');
    expect(barButton(page, '.color-btn.yellow').getAttribute('aria-label')).toBe('Remove highlight');
    tap(page, barButton(page, '.color-btn.green'));
    expect(page.document.querySelector('mark.highlight-green')?.textContent).toBe('Grace meets you');
    expect(lastMessage(page, 'HIGHLIGHTS_CHANGED').reason).toBe('recolor');

    page.document.querySelector('mark.highlight-green').dispatchEvent(new page.window.MouseEvent('click', { bubbles: true, cancelable: true }));
    tap(page, barButton(page, '.color-btn.green'));
    expect(page.document.querySelector('mark')).toBeNull();
    expect(lastMessage(page, 'HIGHLIGHTS_CHANGED').reason).toBe('remove');
  });

  it('leaves highlight edit mode when a new selection starts', async () => {
    const page = await openPage(renderPage());
    await highlightWords(page, 'Grace meets you', 'yellow');
    page.document.querySelector('mark.highlight-yellow').dispatchEvent(new page.window.MouseEvent('click', { bubbles: true, cancelable: true }));
    expect(barMode(page)).toBe('edit');

    await select(page, 'faithful step');
    expect(barMode(page)).toBe('actions');
    expect(page.toolbar.querySelectorAll('.remove-mode')).toHaveLength(0);

    // The colour step now makes a new highlight; the old one is untouched.
    tap(page, barButton(page, '[data-action="highlight"]'));
    tap(page, barButton(page, '.color-btn.green'));
    expect(page.document.querySelector('mark.highlight-yellow')?.textContent).toBe('Grace meets you');
    expect(page.document.querySelector('mark.highlight-green')?.textContent).toBe('faithful step');
  });

  it('sends Bookmark, Share, and Copy with the words and the Scripture passage they sit in', async () => {
    const page = await openPage(renderPage());

    // A quotation followed by its reference.
    await select(page, 'Come to me');
    tap(page, barButton(page, '[data-action="bookmark"]'));
    expect(lastMessage(page, 'SELECTION_ACTION')).toEqual({
      type: 'SELECTION_ACTION', action: 'bookmark', requestId: 1, text: 'Come to me', reference: 'Matthew 11:28',
    });
    // RN confirms; the bar shows the words, then closes.
    page.window.__unfoldSelectionConfirm(1, 'Saved to My library');
    expect(barMode(page)).toBe('status');
    expect(page.toolbar.querySelector('.status-text').textContent).toBe('Saved to My library');
    expect(page.window.getSelection().toString()).toBe('');

    // A quotation of the day's own passage.
    await select(page, 'know that I am God');
    tap(page, barButton(page, '[data-action="share"]'));
    expect(lastMessage(page, 'SELECTION_ACTION')).toMatchObject({ action: 'share', text: 'know that I am God', reference: 'Psalm 46:10' });
    expect(isBarVisible(page)).toBe(false);

    // Prose.
    await select(page, 'Rest is a gift.');
    tap(page, barButton(page, '[data-action="bookmark"]'));
    expect(lastMessage(page, 'SELECTION_ACTION')).toMatchObject({ action: 'bookmark', text: 'Rest is a gift.', reference: '' });

    await select(page, 'Stillness is trust.');
    tap(page, barButton(page, '[data-action="copy"]'));
    expect(lastMessage(page, 'SELECTION_ACTION')).toEqual({
      type: 'SELECTION_ACTION', action: 'copy', requestId: 4, text: 'Stillness is trust.',
    });
    page.window.__unfoldSelectionConfirm(4, 'Copied');
    expect(page.toolbar.querySelector('.status-text').textContent).toBe('Copied');
    await wait(1500);
    expect(isBarVisible(page)).toBe(false);
  });

  it('opens the actions again for the same words selected during a confirmation', async () => {
    const page = await openPage(renderPage());
    await select(page, 'Rest is a gift.');
    tap(page, barButton(page, '[data-action="bookmark"]'));
    page.window.__unfoldSelectionConfirm(1, 'Saved to My library');
    expect(barMode(page)).toBe('status');

    await select(page, 'Rest is a gift.');
    expect(barMode(page)).toBe('actions');
    await wait(1500);
    expect(isBarVisible(page)).toBe(true);
    expect(barMode(page)).toBe('actions');
  });

  it('asks RN to announce the bar when it opens or changes step, not for a confirmation', async () => {
    const page = await openPage(renderPage());
    const modes = () => page.messages.filter((message) => message.type === 'SELECTION_BAR').map((message) => message.mode);
    await select(page, 'Rest is a gift.');
    tap(page, barButton(page, '[data-action="highlight"]'));
    tap(page, barButton(page, '[data-action="back"]'));
    // A handle drag in the same step says nothing new.
    await select(page, 'Rest is a gift. The Lord');
    tap(page, barButton(page, '[data-action="copy"]'));
    page.window.__unfoldSelectionConfirm(1, 'Copied');
    expect(modes()).toEqual(['actions', 'colors', 'actions']);
  });

  it('shows the press on a bar button while the finger is down', async () => {
    const page = await openPage(renderPage());
    await select(page, 'Rest is a gift.');
    const share = barButton(page, '[data-action="share"]');
    touch(page, 'touchstart', share);
    expect(share.classList.contains('pressed')).toBe(true);
    touch(page, 'touchend', share);
    expect(share.classList.contains('pressed')).toBe(false);

    await select(page, 'Grace meets you');
    const copy = barButton(page, '[data-action="copy"]');
    touch(page, 'touchstart', copy);
    const move = new page.window.Event('touchmove', { bubbles: true, cancelable: true });
    Object.defineProperty(move, 'touches', { value: [{ clientX: 80, clientY: 20 }] });
    copy.dispatchEvent(move);
    expect(copy.classList.contains('pressed')).toBe(false);
    touch(page, 'touchcancel', copy);
  });

  it('stores the paragraph, not the quotation, as the context of a highlight inside Scripture', async () => {
    const page = await openPage(renderPage());
    await highlightWords(page, 'Come to me', 'blue');
    const added = lastMessage(page, 'HIGHLIGHTS_CHANGED').added;
    expect(added).toEqual([expect.objectContaining({ text: 'Come to me' })]);
    expect(added[0].context).toContain('Jesus said,');
  });

  it('leaves the pull quote out of a selection that crosses it', async () => {
    const pullQuoteDay: DevotionalDay = {
      ...pageDay,
      quotableLine: 'PULLQUOTE LINE',
      bodyText: [pageDay.bodyText, 'Third paragraph opens here.', 'A fourth paragraph ends it.'].join('\n\n'),
    };
    const render = (extra: Record<string, unknown> = {}) => {
      let tree: any;
      act(() => {
        tree = renderer.create(<DevotionalWebView day={pullQuoteDay} fontSize="medium" devotionalId="dev-1" dayNumber={1} {...extra} />);
      });
      return tree;
    };
    const page = await openPage(render());
    const aside = page.document.querySelector('aside.pull-quote');
    expect(aside.textContent).toBe('PULLQUOTE LINE');

    async function selectAcross() {
      const from = textNodeWith(page, 'Stillness is trust.');
      const to = textNodeWith(page, 'Third paragraph');
      const range = page.document.createRange();
      range.setStart(from, from.nodeValue.indexOf('Stillness'));
      range.setEnd(to, 'Third paragraph'.length);
      page.window.getSelection().removeAllRanges();
      page.window.getSelection().addRange(range);
      page.document.dispatchEvent(new page.window.Event('selectionchange'));
      await wait(90);
    }

    await selectAcross();
    tap(page, barButton(page, '[data-action="share"]'));
    expect(lastMessage(page, 'SELECTION_ACTION')).toMatchObject({ action: 'share', text: 'Stillness is trust. Third paragraph', reference: '' });

    await selectAcross();
    tap(page, barButton(page, '[data-action="copy"]'));
    expect(lastMessage(page, 'SELECTION_ACTION')).toMatchObject({ action: 'copy', text: 'Stillness is trust.\n\nThird paragraph' });
    page.window.__unfoldSelectionConfirm(lastMessage(page, 'SELECTION_ACTION').requestId, '');

    // Highlight: one mark on each side, none on the pull quote.
    await selectAcross();
    tap(page, barButton(page, '[data-action="highlight"]'));
    tap(page, barButton(page, '.color-btn.yellow'));
    expect(aside.querySelector('mark')).toBeNull();
    expect([...page.document.querySelectorAll('mark.highlight-yellow')].map((mark: any) => mark.textContent))
      .toEqual(['Stillness is trust.', 'Third paragraph']);
    const change = lastMessage(page, 'HIGHLIGHTS_CHANGED');
    expect(change.added.map((row: any) => row.text).sort()).toEqual(['Stillness is trust.', 'Third paragraph']);
    expect(change.added.map((row: any) => row.serial)).toContain(change.primarySerial);

    // The excerpt saved from that selection lands again from My library.
    const saved = await openPage(render({
      targetBookmark: {
        ...targetBookmark,
        id: 'bm-across',
        kind: 'excerpt',
        scriptureReference: storedReferenceFor('excerpt'),
        scriptureText: 'Stillness is trust. Third paragraph',
        quotedText: 'Stillness is trust. Third paragraph',
      },
    }));
    await wait(200);
    expect(lastMessage(saved, 'TARGET_BOOKMARK_LOCATED')).toMatchObject({ bookmarkId: 'bm-across' });
  });

  it('stops a selection that runs on into the bar before the bar', async () => {
    const page = await openPage(renderPage());
    const node = textNodeWith(page, 'Stillness is trust.');
    const range = page.document.createRange();
    range.setStart(node, node.nodeValue.indexOf('Stillness'));
    range.setEnd(page.toolbar.querySelector('.bar-actions .lbl').firstChild, 3);
    page.window.getSelection().addRange(range);
    page.document.dispatchEvent(new page.window.Event('selectionchange'));
    await wait(90);

    tap(page, barButton(page, '[data-action="copy"]'));
    expect(lastMessage(page, 'SELECTION_ACTION')).toMatchObject({ action: 'copy', text: 'Stillness is trust.' });
  });

  it('runs a VoiceOver activation (a click with no touch) once', async () => {
    const page = await openPage(renderPage());
    await select(page, 'Grace meets you');
    barButton(page, '[data-action="share"]').dispatchEvent(new page.window.MouseEvent('click', { bubbles: true, cancelable: true }));
    expect(page.messages.filter((message) => message.type === 'SELECTION_ACTION')).toHaveLength(1);
  });

  it('closes on a tap outside the bar and when the selection empties', async () => {
    const page = await openPage(renderPage());
    await select(page, 'Grace meets you');
    tap(page, barButton(page, '[data-action="highlight"]'));
    answerViewport(page, 0, 3000);
    const paragraph = page.document.querySelector('p');
    touch(page, 'touchstart', paragraph);
    touch(page, 'touchend', paragraph);
    await wait(300);
    expect(isBarVisible(page)).toBe(false);
    expect(page.window.getSelection().toString()).toBe('');

    await select(page, 'faithful step');
    answerViewport(page, 0, 3000);
    expect(isBarVisible(page)).toBe(true);
    await wait(650);
    await collapseSelection(page);
    expect(isBarVisible(page)).toBe(false);
  });

  it('claims a touch on the bar, and a touchend that arrives after the click never runs the button again', async () => {
    const page = await openPage(renderPage());
    await select(page, 'Grace meets you');
    const bookmark = barButton(page, '[data-action="bookmark"]');

    // WebKit's selection gestures must not get a tap that lands on the bar.
    expect(touch(page, 'touchstart', bookmark).defaultPrevented).toBe(true);

    // If WebKit takes the tap anyway, the click runs it once. The held-back
    // touchend comes with the next touch and cannot be cancelled.
    bookmark.dispatchEvent(new page.window.MouseEvent('click', { bubbles: true, cancelable: true }));
    page.window.__unfoldSelectionConfirm(1, 'Saved to My library');
    const late = new page.window.Event('touchend', { bubbles: true, cancelable: false });
    Object.defineProperty(late, 'touches', { value: [] });
    bookmark.dispatchEvent(late);

    expect(page.messages.filter((message) => message.type === 'SELECTION_ACTION')).toHaveLength(1);
    expect(barMode(page)).toBe('status');
  });

  it('leaves out the spaces at the ends of a selection', async () => {
    const page = await openPage(renderPage());
    // A long press can start on the space at the end of the line above.
    await select(page, ' Grace meets you ');
    tap(page, barButton(page, '[data-action="highlight"]'));
    expect(page.window.getSelection().toString()).toBe('Grace meets you');
    tap(page, barButton(page, '.color-btn.green'));

    expect(page.document.querySelector('mark.highlight-green')?.textContent).toBe('Grace meets you');
    expect(lastMessage(page, 'HIGHLIGHTS_CHANGED').added).toEqual([expect.objectContaining({ text: 'Grace meets you' })]);
  });

  it('marks Scripture only when the selection stays in one quotation and its own citation', async () => {
    const page = await openPage(renderPage());
    const quote = page.document.querySelector('.scripture-quote');
    expect(quote.getAttribute('data-ref')).toBe('Matthew 11:28');
    expect(quote.textContent).toBe('“Come to me, all who are weary”');
    const citation = page.document.querySelector('.scripture-ref');
    const after = citation.nextSibling; // '). Rest is a gift. …'

    async function selectFromQuote(endNode: any, endOffset: number) {
      const range = page.document.createRange();
      range.setStart(quote.firstChild, 0);
      range.setEnd(endNode, endOffset);
      page.window.getSelection().removeAllRanges();
      page.window.getSelection().addRange(range);
      page.document.dispatchEvent(new page.window.Event('selectionchange'));
      await wait(90);
    }

    // The quotation with its citation, the way a reader shares a verse: the
    // words go without the citation, which RN puts on its own line.
    for (const [endNode, endOffset] of [[citation.firstChild, 'Matthew 11:28'.length], [after, 1], [after, 2], [quote.nextSibling, 2]]) {
      await selectFromQuote(endNode, endOffset);
      tap(page, barButton(page, '[data-action="bookmark"]'));
      expect(lastMessage(page, 'SELECTION_ACTION')).toMatchObject({
        action: 'bookmark', reference: 'Matthew 11:28', text: '“Come to me, all who are weary”',
      });
      page.window.__unfoldSelectionConfirm(lastMessage(page, 'SELECTION_ACTION').requestId, '');
    }

    // Copy keeps every word selected.
    await selectFromQuote(after, 1);
    tap(page, barButton(page, '[data-action="copy"]'));
    expect(lastMessage(page, 'SELECTION_ACTION')).toMatchObject({ action: 'copy', text: '“Come to me, all who are weary” (Matthew 11:28)' });
    page.window.__unfoldSelectionConfirm(lastMessage(page, 'SELECTION_ACTION').requestId, '');

    // From inside the quotation on into the prose after its citation.
    await selectFromQuote(after, '). Rest'.length);
    tap(page, barButton(page, '[data-action="share"]'));
    expect(lastMessage(page, 'SELECTION_ACTION')).toMatchObject({ action: 'share', reference: '' });
    expect(lastMessage(page, 'SELECTION_ACTION').text).toContain('Rest');
  });

  it('restores a stored highlight inside a Scripture quotation at its old offsets', async () => {
    // The offsets a highlight stored before quotations were wrapped: the
    // same page text with the wrappers taken out.
    const first = await openPage(renderPage());
    const unwrapped = first.document.body.cloneNode(true);
    unwrapped.querySelectorAll('.scripture-quote').forEach((quote: any) => quote.replaceWith(...quote.childNodes));
    expect(unwrapped.textContent).toBe(first.document.body.textContent);
    const start = unwrapped.textContent.indexOf('Come to me');
    const stored: Highlight = {
      ...targetHighlight,
      id: 'h-quote',
      highlightedText: 'Come to me',
      serializedRange: `${start}$${start + 'Come to me'.length}$1$rangy-highlight-yellow$`,
      contextBefore: 'Jesus said,',
    };

    const page = await openPage(renderPage({ existingHighlights: [stored] }));
    await wait(20);
    const mark = page.document.querySelector('mark.highlight-yellow');
    expect(mark?.textContent).toBe('Come to me');
    expect(mark?.closest('.scripture-quote')).not.toBeNull();
    // Nothing had to be re-anchored or reported lost.
    expect(page.messages.filter((message) => message.type === 'HIGHLIGHTS_CHANGED' || message.type === 'HIGHLIGHTS_LOST')).toEqual([]);
  });

  it('lands a bookmark that crossed paragraphs on its first paragraph, and reports words it cannot find', async () => {
    const crossing: Bookmark = {
      ...targetBookmark,
      id: 'bm-crossing',
      kind: 'excerpt',
      scriptureReference: storedReferenceFor('excerpt'),
      // As the page saves it: the paragraph break is one space.
      scriptureText: 'in the next act of trust. Jesus said, “Come to me',
      quotedText: 'in the next act of trust. Jesus said, “Come to me',
    };
    const page = await openPage(renderPage({ targetBookmark: crossing }));
    await wait(200);
    expect(lastMessage(page, 'TARGET_BOOKMARK_LOCATED')).toMatchObject({ bookmarkId: 'bm-crossing' });
    expect(page.document.querySelector('p').classList.contains('target-highlight-flash')).toBe(true);

    const gone = await openPage(renderPage({ targetBookmark: { ...crossing, id: 'bm-gone', scriptureText: 'Words this reading no longer has', quotedText: undefined } }));
    await wait(1100);
    expect(gone.messages.filter((message) => message.type === 'TARGET_BOOKMARK_MISSING')).toEqual([
      { type: 'TARGET_BOOKMARK_MISSING', bookmarkId: 'bm-gone' },
    ]);
    expect(lastMessage(gone, 'TARGET_BOOKMARK_LOCATED')).toBeUndefined();
  });

  it('lands a Scripture phrase on its words after a sync round trip, without its ellipses', async () => {
    // A sync pull rebuilds the phrase from its reference and text only.
    const synced: Bookmark = { ...targetBookmark, id: 'bm-phrase', scriptureReference: 'Matthew 11:28', scriptureText: '…all who are weary…' };
    const page = await openPage(renderPage({ targetBookmark: synced }));
    await wait(200);
    expect(lastMessage(page, 'TARGET_BOOKMARK_LOCATED')).toMatchObject({ bookmarkId: 'bm-phrase' });
    expect(page.document.querySelector('.target-highlight-flash')?.textContent).toContain('all who are weary');
  });

  it('lands a saved highlight on its words when no restored mark is there', async () => {
    const page = await openPage(renderPage({ targetHighlight: { ...targetHighlight, serializedRange: undefined }, existingHighlights: [] }));
    await wait(200);
    expect(lastMessage(page, 'TARGET_HIGHLIGHT_LOCATED')).toMatchObject({ highlightId: 'highlight-1' });
    expect(page.document.querySelector('p').classList.contains('target-highlight-flash')).toBe(true);
  });

  it('starts only after every part of its script has run, so start-up never reads a binding before it exists', async () => {
    const readyAtStart: string[] = [];
    const page = await openPage(renderPage({ existingHighlights: [targetHighlight] }), (window) => {
      const init = window.rangy.init;
      window.rangy.init = function start(this: unknown, ...args: unknown[]) {
        readyAtStart.push(typeof window.__unfoldCloseBar, typeof window.handleBookmark);
        return init.apply(this, args);
      };
    });
    expect(readyAtStart).toEqual(['function', 'function']);
    expect(page.document.querySelector('mark.highlight-yellow')?.textContent).toBe('Grace meets you');
  });

  it('finds a bookmark’s words exactly where the RN copy of the rule finds them', async () => {
    const cases: [bodyText: string, words: string][] = [
      ['For God *so loved* the world.', 'so loved the world'],
      ['For God so loved the world.', 'FOR GOD SO LOVED'],
      ['Be\u00A0still, and know.', 'be still, and know'],
      ['First part ends.\n\nSecond part begins.', 'ends. Second part'],
      ['Grace * peace.', 'grace peace'],
      ['ΛΟΓΟΣ is the Word.', 'λογοσ is'],
      ['Jesus said, “Come to me” (Matthew 11:28).', '“come to me”'],
      ['For God so loved the world.', 'not in the reading'],
    ];
    const pages = await Promise.all(cases.map(([bodyText, words], i) => {
      let tree: any;
      act(() => {
        tree = renderer.create(
          <DevotionalWebView
            day={{ ...day, quotableLine: '', bodyText }}
            fontSize="medium"
            devotionalId="dev-1"
            dayNumber={1}
            targetBookmark={{ ...targetBookmark, id: `bm-${i}`, kind: 'scripture', scriptureReference: 'Psalm 23:1', scriptureText: words }}
          />,
        );
      });
      return openPage(tree);
    }));
    await wait(1100);
    const found = pages.map((page) => Boolean(lastMessage(page, 'TARGET_BOOKMARK_LOCATED')));
    expect(found).toEqual(cases.map(([bodyText, words]) => textContainsWords(bodyText, words)));
    expect(found).toContain(false);
  });

  it('moves focus to the first button of the bar when a screen reader is on, and leaves it alone when none is', async () => {
    const quiet = await openPage(renderPage());
    await select(quiet, 'Grace meets you');
    answerViewport(quiet, 0, 3000);
    expect(isBarVisible(quiet)).toBe(true);
    expect(quiet.document.activeElement).toBe(quiet.document.body);

    const page = await openPage(renderPage());
    const click = (el: any) => el.dispatchEvent(new page.window.MouseEvent('click', { bubbles: true, cancelable: true }));
    page.window.__unfoldSetScreenReader(true);
    await select(page, 'Rest is a gift.');
    answerViewport(page, 0, 3000);
    expect(page.document.activeElement).toBe(barButton(page, '[data-action="highlight"]'));
    // WebKit clears the selection when focus moves into the bar. The bar stays.
    await collapseSelection(page);
    expect(isBarVisible(page)).toBe(true);

    // VoiceOver activates Highlight: Back is the first button of the colour step.
    click(barButton(page, '[data-action="highlight"]'));
    expect(barMode(page)).toBe('colors');
    expect(page.document.activeElement).toBe(barButton(page, '[data-action="back"]'));
    click(barButton(page, '.color-btn.green'));
    expect(isBarVisible(page)).toBe(false);

    // Tap-to-edit has no Back: the first colour.
    click(page.document.querySelector('mark.highlight-green'));
    answerViewport(page, 0, 3000);
    expect(barMode(page)).toBe('edit');
    expect(page.document.activeElement).toBe(barButton(page, '.color-btn.yellow'));
  });

  it('closes, with its selection, for a tap on one of the reader’s own views', async () => {
    const commandRef = { current: null as any };
    const page = await openPage(renderPage({ commandRef }));
    await select(page, 'Grace meets you');
    answerViewport(page, 0, 3000);
    expect(isBarVisible(page)).toBe(true);

    mockInjectJavaScript.mockClear();
    act(() => commandRef.current.closeSelectionBar());
    expect(mockInjectJavaScript).toHaveBeenCalledWith('window.__unfoldCloseBar && window.__unfoldCloseBar(); true;');
    page.window.eval(mockInjectJavaScript.mock.calls[0][0]);
    expect(isBarVisible(page)).toBe(false);
    expect(page.window.getSelection().toString()).toBe('');
  });

  it('on Android, Back in the colour step closes the bar and never shows the action bar', async () => {
    const AndroidWebView = loadAndroidWebView();
    let tree: any;
    act(() => {
      tree = renderer.create(<AndroidWebView day={pageDay} fontSize="medium" devotionalId="dev-1" dayNumber={1} />);
    });
    const page = await openPage(tree);
    await select(page, 'Grace meets you');
    await collapseSelection(page);
    page.window.__unfoldSelectionAction('highlight', 'Grace meets you');
    answerViewport(page, 0, 3000);
    expect(barMode(page)).toBe('colors');
    expect(isBarVisible(page)).toBe(true);

    tap(page, barButton(page, '[data-action="back"]'));
    expect(isBarVisible(page)).toBe(false);
    expect(page.messages.filter((message) => message.type === 'SELECTION_BAR').map((message) => message.mode)).toEqual(['colors']);
    expect(page.document.querySelector('mark')).toBeNull();
  });

  it('on Android shows no action bar and runs the native menu keys through the same path', async () => {
    const AndroidWebView = loadAndroidWebView();
    let tree: any;
    act(() => {
      tree = renderer.create(<AndroidWebView day={pageDay} fontSize="medium" devotionalId="dev-1" dayNumber={1} />);
    });
    const page = await openPage(tree);
    await select(page, 'Grace meets you');
    await wait(200);
    expect(isBarVisible(page)).toBe(false);
    expect(page.messages.filter((message) => message.type === 'SELECTION_ACTIVE')).toEqual([]);

    // The native menu closes the selection before RN hands over the key.
    await collapseSelection(page);
    page.window.__unfoldSelectionAction('highlight', 'Grace meets you');
    answerViewport(page, 0, 3000);
    expect(barMode(page)).toBe('colors');
    expect(isBarVisible(page)).toBe(true);
    tap(page, barButton(page, '.color-btn.blue'));
    expect(page.document.querySelector('mark.highlight-blue')?.textContent).toBe('Grace meets you');

    await select(page, 'Come to me');
    await collapseSelection(page);
    page.window.__unfoldSelectionAction('bookmark', 'Come to me');
    expect(lastMessage(page, 'SELECTION_ACTION')).toMatchObject({ action: 'bookmark', text: 'Come to me', reference: 'Matthew 11:28' });
  });

  it('on Android, runs a menu key on the kept range only when it holds the menu’s words', async () => {
    const AndroidWebView = loadAndroidWebView();
    let tree: any;
    act(() => {
      tree = renderer.create(<AndroidWebView day={pageDay} fontSize="medium" devotionalId="dev-1" dayNumber={1} />);
    });
    const page = await openPage(tree);
    const setSelection = (range: any) => {
      page.window.getSelection().removeAllRanges();
      page.window.getSelection().addRange(range);
    };
    const rangeOver = (needle: string) => {
      const node = textNodeWith(page, needle);
      const range = page.document.createRange();
      range.setStart(node, node.nodeValue.indexOf(needle));
      range.setEnd(node, node.nodeValue.indexOf(needle) + needle.length);
      return range;
    };

    // Words across paragraphs: the menu reads a line break the page text
    // does not have, and the kept range still stands in.
    const crossing = page.document.createRange();
    crossing.setStart(textNodeWith(page, 'act of trust.'), textNodeWith(page, 'act of trust.').nodeValue.indexOf('act of trust.'));
    crossing.setEnd(textNodeWith(page, 'Jesus said'), 'Jesus said'.length);
    setSelection(crossing);
    page.document.dispatchEvent(new page.window.Event('selectionchange'));
    await wait(90);
    await collapseSelection(page);
    page.window.__unfoldSelectionAction('copy', 'act of trust.\n\nJesus said');
    expect(lastMessage(page, 'SELECTION_ACTION')).toMatchObject({ action: 'copy', text: 'act of trust.\n\nJesus said' });
    page.window.__unfoldSelectionConfirm(1, '');

    // Selection A is dismissed without an action. Android then clears a new
    // selection B before the page sees it, and hands over B's menu text.
    await select(page, 'Grace meets you');
    await collapseSelection(page);
    const sent = page.messages.length;
    page.window.__unfoldSelectionAction('highlight', 'Rest is a gift.');
    tap(page, barButton(page, '.color-btn.blue'));
    expect(page.document.querySelector('mark')).toBeNull();
    page.window.__unfoldSelectionAction('bookmark', 'Rest is a gift.');
    expect(page.messages.slice(sent).filter((message: any) => message.type === 'SELECTION_ACTION' || message.type === 'SELECTION_BAR')).toEqual([]);
    expect(isBarVisible(page)).toBe(false);

    // B is still selected in the page, before the page has seen it: the
    // live selection is used.
    setSelection(rangeOver('Rest is a gift.'));
    page.window.__unfoldSelectionAction('highlight', 'Rest is a gift.');
    tap(page, barButton(page, '.color-btn.blue'));
    expect([...page.document.querySelectorAll('mark')].map((mark: any) => mark.textContent)).toEqual(['Rest is a gift.']);
  });
});
