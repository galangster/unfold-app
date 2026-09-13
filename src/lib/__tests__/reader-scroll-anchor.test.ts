import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { runInNewContext } from 'node:vm';

import {
  applyParagraphReport,
  applySectionLayoutReport,
  beginReaderLayoutGeneration,
  canRestoreReaderAnchor,
  createVersionedParagraphLocations,
  createVersionedSectionLocations,
  decideExplicitLocationCallback,
  findVisibleParagraphIndex,
  findVisibleReaderSection,
  parseWebViewLayoutGeneration,
  parseWebViewParagraphYs,
  resolveExplicitReaderTargetKey,
  resolveReaderReflowScrollY,
  resolveReflectionFocusAnchor,
  resolveVisibleReaderAnchor,
  shouldApplyPassiveReflowRestore,
  WEBVIEW_COLLECT_PARAGRAPH_YS_JS,
} from '../reader-scroll-anchor';

describe('findVisibleReaderSection', () => {
  const offsets = { scripture: 0, devotional: 180, reflection: 900, prayer: 1400 };

  it('uses the last section whose top is at or above the visible line', () => {
    expect(findVisibleReaderSection(offsets, 168, 12)).toBe('devotional');
    expect(findVisibleReaderSection(offsets, 890, 12)).toBe('reflection');
  });

  it('returns null until section positions exist', () => {
    expect(findVisibleReaderSection({}, 200, 12)).toBeNull();
  });
});

describe('WebView paragraph collector', () => {
  it('reports positioned boxes and nested paragraphs in document coordinates', () => {
    const box = { offsetTop: 400, offsetParent: { offsetTop: 0, offsetParent: null } };
    const paragraph = { offsetTop: 22, offsetParent: box };
    const document = { querySelectorAll: () => [box, paragraph] };
    const ys = runInNewContext(`${WEBVIEW_COLLECT_PARAGRAPH_YS_JS}; collectParagraphYs()`, { document });
    expect(Array.from(ys)).toEqual([400, 422]);
    // The same paragraph remains anchored after the positioned box moves.
    box.offsetTop = 650;
    paragraph.offsetTop = 48;
    const resizedYs = runInNewContext(`${WEBVIEW_COLLECT_PARAGRAPH_YS_JS}; collectParagraphYs()`, { document });
    expect(Array.from(resizedYs)).toEqual([650, 698]);
  });
});

describe('findVisibleParagraphIndex', () => {
  it('keeps the paragraph still occupying the visible top', () => {
    expect(findVisibleParagraphIndex([0, 80, 220, 400], 210)).toBe(1);
    expect(findVisibleParagraphIndex([0, 80, 220, 400], 0)).toBe(0);
  });

  it('returns null when the HTML body has not reported locations', () => {
    expect(findVisibleParagraphIndex([], 80)).toBeNull();
  });
});

describe('parseWebViewParagraphYs', () => {
  it('keeps finite non-negative locations and drops the rest', () => {
    expect(parseWebViewParagraphYs([0, 48, '96', Number.NaN, -4])).toEqual([0, 48, 96]);
    expect(parseWebViewParagraphYs(undefined)).toEqual([]);
  });
});

describe('parseWebViewLayoutGeneration', () => {
  it('keeps a positive integer generation and treats missing reports as 0', () => {
    expect(parseWebViewLayoutGeneration(2)).toBe(2);
    expect(parseWebViewLayoutGeneration('3')).toBe(3);
    expect(parseWebViewLayoutGeneration(undefined)).toBe(0);
    expect(parseWebViewLayoutGeneration(1.5)).toBe(0);
  });
});

describe('reader reflow restoration', () => {
  const sectionOffsets = { scripture: 0, devotional: 200, reflection: 880 };
  const paragraphYs = [0, 120, 360];

  it('captures a paragraph inside the teaching when that section is visible', () => {
    expect(resolveVisibleReaderAnchor({
      sectionOffsets,
      paragraphYs,
      webViewTop: 200,
      contentOffsetY: 332,
      headerOffset: 24,
    })).toEqual({ kind: 'paragraph', section: 'devotional', index: 1 });
  });

  it('restores the same paragraph after the body reports new locations', () => {
    expect(resolveReaderReflowScrollY({
      explicitTargetY: null,
      anchor: { kind: 'paragraph', section: 'devotional', index: 2 },
      sectionOffsets: { scripture: 0, devotional: 240, reflection: 1100 },
      paragraphYs: [0, 160, 480],
      webViewTop: 240,
      headerOffset: 24,
    })).toBe(696);
  });

  it('restores a named section when the teaching locations are not ready', () => {
    expect(resolveReaderReflowScrollY({
      explicitTargetY: null,
      anchor: { kind: 'section', section: 'reflection' },
      sectionOffsets: { scripture: 0, devotional: 240, reflection: 1100 },
      paragraphYs: [],
      webViewTop: 240,
      headerOffset: 24,
    })).toBe(1076);
  });

  it('lets an explicit bookmark or highlight target beat a passive reflow restore', () => {
    expect(shouldApplyPassiveReflowRestore({ explicitPending: true })).toBe(false);
    expect(resolveReaderReflowScrollY({
      explicitTargetY: 410,
      anchor: { kind: 'paragraph', section: 'devotional', index: 2 },
      sectionOffsets,
      paragraphYs,
      webViewTop: 200,
      headerOffset: 24,
    })).toBe(410);
  });

  it('waits for the matching paragraph after resize instead of guessing', () => {
    expect(resolveReaderReflowScrollY({
      explicitTargetY: null,
      anchor: { kind: 'paragraph', section: 'devotional', index: 2 },
      sectionOffsets,
      paragraphYs: [0],
      webViewTop: 200,
      headerOffset: 24,
    })).toBeNull();
  });
});

describe('versioned layout reports', () => {
  const previousSections = {
    ...createVersionedSectionLocations(1),
    offsets: { scripture: 0, devotional: 200, reflection: 880 },
    reportedGeneration: { scripture: 1, devotional: 1, reflection: 1 },
  };
  const previousParagraphs = { generation: 1, ys: [0, 80, 220] };

  it('captures the old anchor before discarding coordinates', () => {
    const started = beginReaderLayoutGeneration({
      nextGeneration: 2,
      sections: previousSections,
      paragraphs: previousParagraphs,
      contentOffsetY: 260,
      headerOffset: 24,
    });

    expect(started.anchor).toEqual({ kind: 'paragraph', section: 'devotional', index: 1 });
    expect(started.sections.offsets).toEqual({});
    expect(started.paragraphs).toEqual({ generation: 0, ys: [] });
    expect(canRestoreReaderAnchor(started.anchor, started.sections, started.paragraphs)).toBe(false);
  });

  it('keeps the paragraph through intermediate window sizes without fresh coordinates', () => {
    const first = beginReaderLayoutGeneration({
      nextGeneration: 2,
      sections: previousSections,
      paragraphs: previousParagraphs,
      contentOffsetY: 260,
      headerOffset: 24,
    });
    const intermediate = beginReaderLayoutGeneration({
      nextGeneration: 3,
      previousAnchor: first.anchor,
      sections: first.sections,
      paragraphs: first.paragraphs,
      contentOffsetY: 0,
      headerOffset: 24,
    });
    expect(intermediate.anchor).toEqual({ kind: 'paragraph', section: 'devotional', index: 1 });
    expect(canRestoreReaderAnchor(intermediate.anchor, intermediate.sections, intermediate.paragraphs)).toBe(false);
  });

  it('rejects previous-generation WebView and native reports delivered after a new generation starts', () => {
    const started = beginReaderLayoutGeneration({
      nextGeneration: 2,
      sections: previousSections,
      paragraphs: previousParagraphs,
      contentOffsetY: 260,
      headerOffset: 24,
    });

    const staleParagraphs = applyParagraphReport(started.paragraphs, [0, 80, 220], 1, 2);
    const staleSections = applySectionLayoutReport(started.sections, 'devotional', 200, 1);

    expect(staleParagraphs).toEqual({ generation: 0, ys: [] });
    expect(staleSections.offsets).toEqual({});
    expect(canRestoreReaderAnchor(started.anchor, staleSections, staleParagraphs)).toBe(false);
  });

  it('does not restore from a mixed old WebView report and an unrelated current native report', () => {
    const started = beginReaderLayoutGeneration({
      nextGeneration: 2,
      sections: previousSections,
      paragraphs: previousParagraphs,
      contentOffsetY: 260,
      headerOffset: 24,
    });
    const sections = applySectionLayoutReport(started.sections, 'scripture', 0, 2);
    const staleParagraphs = applyParagraphReport(started.paragraphs, previousParagraphs.ys, 1, 2);

    expect(sections.reportedGeneration.scripture).toBe(2);
    expect(sections.reportedGeneration.devotional).toBeUndefined();
    expect(canRestoreReaderAnchor(started.anchor, sections, staleParagraphs)).toBe(false);
  });

  it('waits for an actual current-generation measurement of the anchored section', () => {
    const started = beginReaderLayoutGeneration({
      nextGeneration: 2,
      sections: previousSections,
      paragraphs: previousParagraphs,
      contentOffsetY: 260,
      headerOffset: 24,
    });
    const sections = applySectionLayoutReport(started.sections, 'scripture', 0, 2);

    expect(sections.offsets.devotional).toBeUndefined();
    expect(sections.reportedGeneration.devotional).toBeUndefined();
    expect(canRestoreReaderAnchor(started.anchor, sections, started.paragraphs)).toBe(false);
  });

  it('rejects a late stale section report after the current report arrives', () => {
    const started = beginReaderLayoutGeneration({
      nextGeneration: 2,
      sections: previousSections,
      paragraphs: previousParagraphs,
      contentOffsetY: 900,
      headerOffset: 24,
    });
    const current = applySectionLayoutReport(started.sections, 'reflection', 1040, 2);
    const afterStale = applySectionLayoutReport(current, 'reflection', 880, 1);

    expect(afterStale).toBe(current);
    expect(afterStale.offsets.reflection).toBe(1040);
    expect(canRestoreReaderAnchor(started.anchor, afterStale, started.paragraphs)).toBe(true);
  });

  it('restores only after current-generation section and paragraph locations arrive', () => {
    const started = beginReaderLayoutGeneration({
      nextGeneration: 2,
      sections: previousSections,
      paragraphs: previousParagraphs,
      contentOffsetY: 260,
      headerOffset: 24,
    });
    const sections = applySectionLayoutReport(started.sections, 'devotional', 240, 2);
    expect(canRestoreReaderAnchor(started.anchor, sections, started.paragraphs)).toBe(false);

    const paragraphs = applyParagraphReport(started.paragraphs, [0, 160, 480], 2, 2);
    expect(canRestoreReaderAnchor(started.anchor, sections, paragraphs)).toBe(true);
    expect(resolveReaderReflowScrollY({
      explicitTargetY: null,
      anchor: started.anchor,
      sectionOffsets: sections.offsets,
      paragraphYs: paragraphs.ys,
      webViewTop: sections.offsets.devotional ?? 0,
      headerOffset: 24,
    })).toBe(376);
  });
});

describe('reflection focus anchor', () => {
  const sectionOffsets = { scripture: 0, devotional: 200, reflection: 880 };
  const paragraphYs = [0, 120, 360];

  it('does not treat a keyboard-inset reflection scroll Y as a teaching paragraph', () => {
    expect(resolveVisibleReaderAnchor({
      sectionOffsets,
      paragraphYs,
      webViewTop: 200,
      contentOffsetY: 880 - 220,
      headerOffset: 24,
    })).toEqual({ kind: 'paragraph', section: 'devotional', index: 2 });
    expect(resolveReflectionFocusAnchor()).toEqual({ kind: 'section', section: 'reflection' });
  });

  it('keeps the reflection section through resize and Dynamic Type', () => {
    const previousSections = {
      ...createVersionedSectionLocations(1),
      offsets: sectionOffsets,
      reportedGeneration: { scripture: 1, devotional: 1, reflection: 1 },
    };
    const started = beginReaderLayoutGeneration({
      nextGeneration: 2,
      previousAnchor: resolveReflectionFocusAnchor(),
      sections: previousSections,
      paragraphs: { generation: 1, ys: paragraphYs },
      contentOffsetY: 660,
      headerOffset: 24,
    });
    const intermediate = beginReaderLayoutGeneration({
      nextGeneration: 3,
      previousAnchor: started.anchor,
      sections: started.sections,
      paragraphs: started.paragraphs,
      contentOffsetY: 0,
      headerOffset: 24,
    });
    const sections = applySectionLayoutReport(intermediate.sections, 'reflection', 1100, 3);

    expect(intermediate.anchor).toEqual({ kind: 'section', section: 'reflection' });
    expect(canRestoreReaderAnchor(intermediate.anchor, sections, intermediate.paragraphs)).toBe(true);
    expect(resolveReaderReflowScrollY({
      explicitTargetY: null,
      anchor: intermediate.anchor,
      sectionOffsets: sections.offsets,
      paragraphYs: [],
      webViewTop: 240,
      headerOffset: 24,
    })).toBe(1076);
  });
});

describe('reader source contracts', () => {
  const readingSource = readFileSync(
    join(__dirname, '../../app/(tabs)/(today)/reading.tsx'),
    'utf8',
  );
  const webViewSource = readFileSync(
    join(__dirname, '../../components/reading/DevotionalWebView.tsx'),
    'utf8',
  );

  it('selects the reflection section before a preserved focus scroll', () => {
    expect(readingSource).toContain('reflowAnchorRef.current = resolveReflectionFocusAnchor()');
    expect(readingSource).toContain('scrollReaderToY(y, true)');
  });

  it('uses one document-relative collector in every HTML reporting path', () => {
    expect(WEBVIEW_COLLECT_PARAGRAPH_YS_JS).toContain('documentRelativeOffsetTop');
    expect(WEBVIEW_COLLECT_PARAGRAPH_YS_JS).toContain('node.offsetParent');
    expect(WEBVIEW_COLLECT_PARAGRAPH_YS_JS).not.toContain('nodes[i].offsetTop');
    expect(webViewSource).toContain('${WEBVIEW_COLLECT_PARAGRAPH_YS_JS}');
    expect(webViewSource.match(/WEBVIEW_COLLECT_PARAGRAPH_YS_JS/g)?.length).toBe(4);
    expect(webViewSource).not.toContain('nodes[i].offsetTop');
  });
});

describe('explicit reader target requests', () => {
  it('builds a stable key for bookmark, highlight, and act navigation', () => {
    expect(resolveExplicitReaderTargetKey({ highlightId: 'h1' })).toBe('highlight:h1');
    expect(resolveExplicitReaderTargetKey({ bookmarkId: 'b1' })).toBe('bookmark:b1');
    expect(resolveExplicitReaderTargetKey({ focusAct: true })).toBe('act');
  });

  it('ignores a duplicate callback for a consumed or already pending key', () => {
    expect(decideExplicitLocationCallback({
      targetKey: 'highlight:h1',
      pendingKey: null,
      consumedKey: 'highlight:h1',
    })).toBe('ignore');
    expect(decideExplicitLocationCallback({
      targetKey: 'highlight:h1',
      pendingKey: 'highlight:h1',
      consumedKey: null,
    })).toBe('ignore');
  });

  it('starts a new bookmark or highlight key after a previous request was consumed', () => {
    expect(decideExplicitLocationCallback({
      targetKey: 'bookmark:b2',
      pendingKey: null,
      consumedKey: 'highlight:h1',
    })).toBe('start');
  });

  it('lets a later resize restore after the explicit request is consumed', () => {
    expect(shouldApplyPassiveReflowRestore({ explicitPending: false })).toBe(true);
    expect(canRestoreReaderAnchor(
      { kind: 'section', section: 'reflection' },
      {
        ...createVersionedSectionLocations(3),
        offsets: { reflection: 1100 },
        reportedGeneration: { reflection: 3 },
      },
      createVersionedParagraphLocations(3),
    )).toBe(true);
  });
});
