import React from 'react';

import { DevotionalWebView } from '../DevotionalWebView';
import type { Bookmark, DevotionalDay, Highlight } from '@/lib/store';

// eslint-disable-next-line @typescript-eslint/no-require-imports
const renderer = require('react-test-renderer');
const { act } = renderer;

let mockIsDark = false;

jest.mock('react-native-webview', () => ({
  WebView: 'WebView',
}));

jest.mock('expo-haptics', () => ({
  ImpactFeedbackStyle: { Light: 'Light' },
  selectionAsync: jest.fn(),
  impactAsync: jest.fn(),
}));

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
    medium: { body: 18 },
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

describe('DevotionalWebView highlight interactions', () => {
  beforeEach(() => {
    mockIsDark = false;
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

    expect(html).toContain('mark.highlight-yellow { background: rgba(255, 245, 112, 0.58); color: inherit;');
    expect(script).toContain("style: 'background: ' + highlightBackground + '; color: ' + highlightTextColor +");
    expect(script).toContain("const highlightTextColor = isDark ? colorConfigs[color].textDark : 'inherit';");
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

    expect(html).toContain('mark.highlight-yellow { background: transparent; color: #FFE86A;');
    expect(script).toContain("const highlightBackground = isDark ? 'transparent' : colorConfigs[color].light;");
    expect(script).toContain("const highlightTextColor = isDark ? colorConfigs[color].textDark : 'inherit';");
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
