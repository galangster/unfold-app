import { readFileSync } from 'fs';
import { join } from 'path';

import {
  buildNotebookRuntimeFuzzCases,
  evaluateNotebookRuntimeFuzzCase,
  summarizeNotebookRuntimeFuzzResults,
  type NotebookRuntimeFuzzCase,
} from '@/lib/notebook-runtime-fuzz';

describe('notebook runtime fuzz harness', () => {
  it('keeps the dev editor route QA-gated and wired to structured runtime fuzz logs', () => {
    const routeSource = readFileSync(
      join(process.cwd(), 'src/app/__dev__/unfold-editor-test.tsx'),
      'utf8',
    );

    expect(routeSource).toContain('isQaToolsEnabled');
    expect(routeSource).toContain('Redirect');
    expect(routeSource).toContain('useLocalSearchParams');
    expect(routeSource).toContain('buildNotebookRuntimeFuzzCases');
    expect(routeSource).toContain('evaluateNotebookRuntimeFuzzCase');
    expect(routeSource).toContain('summarizeNotebookRuntimeFuzzResults');
    expect(routeSource).toContain('NOTEBOOK_RUNTIME_FUZZ_SUMMARY');
    expect(routeSource).toContain('no fuzz cases selected');
    expect(routeSource).toContain('key={activeFuzzCase.id}');
  });

  it('never seeds [object Object] as legitimate fuzz content', () => {
    const cases = buildNotebookRuntimeFuzzCases();

    expect(cases.some((testCase) => testCase.initialHtml.includes('[object Object]'))).toBe(false);
    expect(
      cases.some((testCase) => testCase.expectedNeedles?.includes('[object Object]')),
    ).toBe(false);
  });

  it('builds a deterministic hundreds-level matrix across writing/pathological content categories', () => {
    const cases = buildNotebookRuntimeFuzzCases();

    expect(cases.length).toBeGreaterThanOrEqual(150);
    expect(new Set(cases.map((testCase) => testCase.id)).size).toBe(cases.length);

    expect(new Set(cases.map((testCase) => testCase.category))).toEqual(
      new Set([
        'blank-like',
        'plain-writing',
        'long-writing',
        'unicode',
        'rtl',
        'markdown-like',
        'html-like',
        'scripture',
        'rich-blocks',
        'paste-storm',
      ]),
    );

    expect(cases.some((testCase) => testCase.initialHtml.includes('שלום'))).toBe(true);
    expect(cases.some((testCase) => testCase.initialHtml.includes('👨‍👩‍👧'))).toBe(true);
    expect(cases.some((testCase) => testCase.initialHtml.includes('&lt;script&gt;'))).toBe(true);
    expect(cases.some((testCase) => testCase.initialHtml.length > 5000)).toBe(true);
    expect(cases.some((testCase) => testCase.commands.some((command) => command.type === 'insert-scripture'))).toBe(true);
  });

  it('keeps generated cases serializable for route params/log capture', () => {
    const cases = buildNotebookRuntimeFuzzCases();

    expect(() => JSON.parse(JSON.stringify(cases))).not.toThrow();
    for (const testCase of cases) {
      expect(testCase.id).toMatch(/^[a-z0-9-]+$/);
      expect(testCase.initialHtml).toEqual(expect.any(String));
      expect(Array.isArray(testCase.commands)).toBe(true);
    }
  });

  it('passes a non-empty case when expected text survives the native round trip', () => {
    const testCase: NotebookRuntimeFuzzCase = {
      id: 'plain-survives',
      label: 'plain survives',
      category: 'plain-writing',
      initialHtml: '<p>Grace upon grace.</p>',
      commands: [{ type: 'get-html' }],
      expectedNeedles: ['Grace upon grace.'],
    };

    expect(
      evaluateNotebookRuntimeFuzzCase(testCase, {
        finalHtml: '<p>Grace upon grace.</p>',
      }),
    ).toMatchObject({ passed: true, failures: [] });
  });

  it('fails when meaningful text disappears, bridge errors surface, or object sentinels leak', () => {
    const testCase: NotebookRuntimeFuzzCase = {
      id: 'unicode-disappears',
      label: 'unicode disappears',
      category: 'unicode',
      initialHtml: '<p>mañana café 👨‍👩‍👧</p>',
      commands: [{ type: 'get-html' }],
      expectedNeedles: ['mañana café', '👨‍👩‍👧'],
    };

    expect(
      evaluateNotebookRuntimeFuzzCase(testCase, {
        finalHtml: '<p><br></p>',
      }),
    ).toMatchObject({ passed: false });

    expect(
      evaluateNotebookRuntimeFuzzCase(testCase, {
        finalHtml: '<p>mañana café [object Object]</p>',
        error: 'bridge exploded',
      }).failures,
    ).toEqual(expect.arrayContaining(['bridge exploded', 'final html leaked [object Object]']));
  });

  it('allows intentionally blank-like seeds to remain visually empty', () => {
    const testCase: NotebookRuntimeFuzzCase = {
      id: 'blank-seed',
      label: 'blank seed',
      category: 'blank-like',
      initialHtml: '<p>\u200b</p>',
      commands: [{ type: 'get-html' }],
      allowEmptyFinalHtml: true,
    };

    expect(
      evaluateNotebookRuntimeFuzzCase(testCase, {
        finalHtml: '<p><br></p>',
      }),
    ).toMatchObject({ passed: true, failures: [] });
  });

  it('summarizes failures by id and category for FlowDeck log assertions', () => {
    const cases = buildNotebookRuntimeFuzzCases().slice(0, 2);
    const results = [
      evaluateNotebookRuntimeFuzzCase(cases[0], { finalHtml: cases[0].initialHtml }),
      evaluateNotebookRuntimeFuzzCase(cases[1], { finalHtml: '', error: 'native timeout' }),
    ];

    expect(summarizeNotebookRuntimeFuzzResults(results)).toMatchObject({
      total: 2,
      passed: 1,
      failed: 1,
      failedIds: [cases[1].id],
    });
  });
});
