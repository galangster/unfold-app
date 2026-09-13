import type { ReaderSection } from '@/components/reading/DevotionalContent';

export const READER_SECTION_ORDER: readonly ReaderSection[] = [
  'scripture',
  'devotional',
  'reflection',
  'act',
  'prayer',
];

export type ReaderScrollAnchor =
  | { kind: 'section'; section: ReaderSection }
  | { kind: 'paragraph'; section: 'devotional'; index: number };

export type VersionedSectionLocations = {
  generation: number;
  offsets: Partial<Record<ReaderSection, number>>;
  reportedGeneration: Partial<Record<ReaderSection, number>>;
};

export type VersionedParagraphLocations = {
  generation: number;
  ys: number[];
};

export const WEBVIEW_COLLECT_PARAGRAPH_YS_JS = `
      function documentRelativeOffsetTop(el) {
        var y = 0;
        var node = el;
        while (node) {
          y += node.offsetTop;
          node = node.offsetParent;
        }
        return Math.round(y);
      }
      function collectParagraphYs() {
        var nodes = document.querySelectorAll('p, blockquote, .context-box, .word-study-box');
        var ys = [];
        for (var i = 0; i < nodes.length; i++) {
          ys.push(documentRelativeOffsetTop(nodes[i]));
        }
        return ys;
      }
`;

export function parseWebViewParagraphYs(value: unknown): number[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((entry) => Number(entry))
    .filter((y) => Number.isFinite(y) && y >= 0);
}

export function parseWebViewLayoutGeneration(value: unknown): number {
  const generation = Number(value);
  return Number.isInteger(generation) && generation > 0 ? generation : 0;
}

export function createVersionedSectionLocations(generation = 0): VersionedSectionLocations {
  return {
    generation,
    offsets: {},
    reportedGeneration: {},
  };
}

export function createVersionedParagraphLocations(generation = 0): VersionedParagraphLocations {
  return { generation, ys: [] };
}

export function findVisibleReaderSection(
  offsets: Partial<Record<ReaderSection, number>>,
  contentOffsetY: number,
  headerOffset: number,
): ReaderSection | null {
  const ordered = READER_SECTION_ORDER
    .map((section) => {
      const y = offsets[section];
      return y === undefined || !Number.isFinite(y) ? null : { section, y };
    })
    .filter((entry): entry is { section: ReaderSection; y: number } => entry !== null)
    .sort((left, right) => left.y - right.y);
  if (ordered.length === 0) return null;

  const visibleTop = Math.max(0, contentOffsetY + headerOffset);
  let anchor = ordered[0].section;
  for (const entry of ordered) {
    if (entry.y > visibleTop) break;
    anchor = entry.section;
  }
  return anchor;
}

export function findVisibleParagraphIndex(
  paragraphYs: readonly number[],
  visibleTopInWebView: number,
): number | null {
  if (paragraphYs.length === 0) return null;
  const visibleTop = Math.max(0, visibleTopInWebView);
  let index = 0;
  for (let i = 0; i < paragraphYs.length; i += 1) {
    if (paragraphYs[i] > visibleTop) break;
    index = i;
  }
  return index;
}

export function resolveReflectionFocusAnchor(): ReaderScrollAnchor {
  return { kind: 'section', section: 'reflection' };
}

export function resolveVisibleReaderAnchor(params: {
  sectionOffsets: Partial<Record<ReaderSection, number>>;
  paragraphYs: readonly number[];
  webViewTop: number;
  contentOffsetY: number;
  headerOffset: number;
}): ReaderScrollAnchor | null {
  const section = findVisibleReaderSection(
    params.sectionOffsets,
    params.contentOffsetY,
    params.headerOffset,
  );
  if (section === null) return null;
  if (section === 'devotional' && params.paragraphYs.length > 0) {
    const index = findVisibleParagraphIndex(
      params.paragraphYs,
      params.contentOffsetY + params.headerOffset - params.webViewTop,
    );
    if (index !== null) {
      return { kind: 'paragraph', section: 'devotional', index };
    }
  }
  return { kind: 'section', section };
}

export function beginReaderLayoutGeneration(params: {
  nextGeneration: number;
  previousAnchor?: ReaderScrollAnchor | null;
  sections: VersionedSectionLocations;
  paragraphs: VersionedParagraphLocations;
  contentOffsetY: number;
  headerOffset: number;
}): {
  generation: number;
  anchor: ReaderScrollAnchor | null;
  sections: VersionedSectionLocations;
  paragraphs: VersionedParagraphLocations;
} {
  const anchor = params.previousAnchor ?? resolveVisibleReaderAnchor({
    sectionOffsets: params.sections.offsets,
    paragraphYs: params.paragraphs.ys,
    webViewTop: params.sections.offsets.devotional ?? 0,
    contentOffsetY: params.contentOffsetY,
    headerOffset: params.headerOffset,
  });
  return {
    generation: params.nextGeneration,
    anchor,
    sections: {
      generation: params.nextGeneration,
      offsets: {},
      reportedGeneration: {},
    },
    paragraphs: {
      generation: 0,
      ys: [],
    },
  };
}

export function applySectionLayoutReport(
  sections: VersionedSectionLocations,
  section: ReaderSection,
  y: number,
  reportGeneration: number,
): VersionedSectionLocations {
  if (reportGeneration !== sections.generation) return sections;
  return {
    ...sections,
    offsets: { ...sections.offsets, [section]: y },
    reportedGeneration: { ...sections.reportedGeneration, [section]: reportGeneration },
  };
}

export function applyParagraphReport(
  paragraphs: VersionedParagraphLocations,
  ys: number[],
  reportGeneration: number,
  currentGeneration: number,
): VersionedParagraphLocations {
  if (reportGeneration !== currentGeneration) return paragraphs;
  return { generation: reportGeneration, ys };
}

export function canRestoreReaderAnchor(
  anchor: ReaderScrollAnchor | null,
  sections: VersionedSectionLocations,
  paragraphs: VersionedParagraphLocations,
): boolean {
  if (anchor === null) return false;
  if (anchor.kind === 'paragraph') {
    if (paragraphs.generation !== sections.generation) return false;
    if (paragraphs.ys[anchor.index] === undefined) return false;
    return sections.reportedGeneration.devotional === sections.generation;
  }
  return sections.reportedGeneration[anchor.section] === sections.generation;
}

export function resolveReaderReflowScrollY(params: {
  explicitTargetY: number | null;
  anchor: ReaderScrollAnchor | null;
  sectionOffsets: Partial<Record<ReaderSection, number>>;
  paragraphYs: readonly number[];
  webViewTop: number;
  headerOffset: number;
}): number | null {
  if (params.explicitTargetY !== null) {
    return Math.max(0, params.explicitTargetY);
  }
  if (params.anchor === null) return null;
  if (params.anchor.kind === 'paragraph') {
    const paragraphY = params.paragraphYs[params.anchor.index];
    if (paragraphY === undefined) return null;
    return Math.max(0, params.webViewTop + paragraphY - params.headerOffset);
  }
  const sectionY = params.sectionOffsets[params.anchor.section];
  if (sectionY === undefined) return null;
  return Math.max(0, sectionY - params.headerOffset);
}

export function resolveExplicitReaderTargetKey(params: {
  highlightId?: string | null;
  bookmarkId?: string | null;
  focusAct?: boolean;
}): string | null {
  if (params.highlightId) return `highlight:${params.highlightId}`;
  if (params.bookmarkId) return `bookmark:${params.bookmarkId}`;
  if (params.focusAct) return 'act';
  return null;
}

export function decideExplicitLocationCallback(params: {
  targetKey: string | null;
  pendingKey: string | null;
  consumedKey: string | null;
}): 'start' | 'ignore' {
  if (params.targetKey === null) return 'ignore';
  if (params.consumedKey === params.targetKey) return 'ignore';
  if (params.pendingKey === params.targetKey) return 'ignore';
  return 'start';
}

export function shouldApplyPassiveReflowRestore(params: {
  explicitPending: boolean;
}): boolean {
  return !params.explicitPending;
}
