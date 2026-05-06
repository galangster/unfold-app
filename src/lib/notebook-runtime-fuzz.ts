export type NotebookRuntimeFuzzCategory =
  | 'blank-like'
  | 'plain-writing'
  | 'long-writing'
  | 'unicode'
  | 'rtl'
  | 'markdown-like'
  | 'html-like'
  | 'scripture'
  | 'rich-blocks'
  | 'paste-storm';

export type NotebookRuntimeFuzzCommand =
  | { type: 'get-html' }
  | { type: 'focus' }
  | { type: 'blur' }
  | { type: 'toggle-bold' }
  | { type: 'toggle-italic' }
  | { type: 'toggle-underline' }
  | { type: 'toggle-strikethrough' }
  | { type: 'set-block'; blockType: 'p' | 'h1' | 'h2' | 'h3' | 'blockquote' | 'pre' }
  | { type: 'set-list'; listType: 'bullet' | 'ordered' | 'checklist' }
  | { type: 'clear-list' }
  | { type: 'toggle-checklist' }
  | { type: 'indent-list' }
  | { type: 'outdent-list' }
  | { type: 'undo' }
  | { type: 'redo' }
  | { type: 'insert-link'; url: string }
  | { type: 'insert-scripture'; reference: string; text: string };

export type NotebookRuntimeFuzzCase = {
  id: string;
  label: string;
  category: NotebookRuntimeFuzzCategory;
  initialHtml: string;
  commands: NotebookRuntimeFuzzCommand[];
  expectedNeedles?: string[];
  allowEmptyFinalHtml?: boolean;
};

export type NotebookRuntimeFuzzObservation = {
  finalHtml: string;
  error?: string | null;
};

export type NotebookRuntimeFuzzResult = {
  id: string;
  label: string;
  category: NotebookRuntimeFuzzCategory;
  passed: boolean;
  failures: string[];
  finalHtmlLength: number;
};

export type NotebookRuntimeFuzzSummary = {
  total: number;
  passed: number;
  failed: number;
  failedIds: string[];
  failedByCategory: Partial<Record<NotebookRuntimeFuzzCategory, number>>;
};

const CATEGORIES: NotebookRuntimeFuzzCategory[] = [
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
];

const COMMAND_PATTERNS: NotebookRuntimeFuzzCommand[][] = [
  [{ type: 'get-html' }],
  [{ type: 'focus' }, { type: 'get-html' }, { type: 'blur' }],
  [{ type: 'toggle-bold' }, { type: 'get-html' }, { type: 'undo' }, { type: 'redo' }],
  [{ type: 'toggle-italic' }, { type: 'toggle-underline' }, { type: 'get-html' }],
  [{ type: 'set-block', blockType: 'h2' }, { type: 'set-block', blockType: 'p' }, { type: 'get-html' }],
  [{ type: 'set-list', listType: 'bullet' }, { type: 'indent-list' }, { type: 'outdent-list' }, { type: 'clear-list' }],
  [{ type: 'set-list', listType: 'checklist' }, { type: 'toggle-checklist' }, { type: 'get-html' }],
  [{ type: 'insert-link', url: 'https://unfold.app/runtime-fuzz' }, { type: 'get-html' }],
  [
    {
      type: 'insert-scripture',
      reference: 'Romans 8:28',
      text: 'And we know that in all things God works for the good of those who love him.',
    },
    { type: 'get-html' },
  ],
  [{ type: 'toggle-strikethrough' }, { type: 'undo' }, { type: 'redo' }, { type: 'get-html' }],
];

const SEEDS: Record<NotebookRuntimeFuzzCategory, string[]> = {
  'blank-like': [
    '<p><br></p>',
    '<p>\u200b</p>',
    '<p>&nbsp;</p>',
    '<h1><br></h1>',
    '<blockquote>\u00a0</blockquote>',
    '<ul><li data-level="1"><br></li></ul>',
    '<p>\ufeff</p>',
    '<p>   </p>',
    '<p>\u2060</p>',
    '<h2>&nbsp;</h2>',
    '<pre><code>   </code></pre>',
    '<p>\n\t</p>',
    '<ol><li data-level="1">\u200b</li></ol>',
    '<ul data-type="checklist"><li data-checked="false">&nbsp;</li></ul>',
    '<p><span>\u200b</span></p>',
  ],
  'plain-writing': [
    '<p>Grace upon grace.</p>',
    '<p>Today I noticed patience growing slowly.</p>',
    '<p>Prayer: help me listen before I answer.</p>',
    '<p>I felt peace during the morning reading.</p>',
    '<p>One small obedient step is still obedience.</p>',
    '<p>Lord, make my attention gentle and whole.</p>',
    '<p>Remember the quiet mercy in the ordinary.</p>',
    '<p>Confession, gratitude, and a next right step.</p>',
    '<p>Write the verse. Sit with it. Carry it.</p>',
    '<p>The notebook should preserve this sentence exactly.</p>',
    '<p>Two paragraphs.</p><p>Second paragraph after a save.</p>',
    '<p>Question: what is this passage inviting me to trust?</p>',
    '<p>Answer with humility, not performance.</p>',
    '<p>Short note.</p>',
    '<p>A final plain writing sample for runtime sweep.</p>',
  ],
  'long-writing': [
    longHtml('long-devotional-reflection', 120),
    longHtml('long-pasted-sermon-notes', 150),
    longHtml('long-prayer-journal', 180),
    longHtml('long-small-group-outline', 140),
    longHtml('long-scripture-study', 160),
    longHtml('long-daily-review', 170),
    longHtml('long-lament-and-hope', 155),
    longHtml('long-gratitude-list', 145),
    longHtml('long-counseling-notes', 165),
    longHtml('long-retreat-notes', 175),
    longHtml('long-voice-dictation-cleanup', 185),
    longHtml('long-pasted-newsletter-draft', 190),
    longHtml('long-mixed-headings', 130),
    longHtml('long-memorization-plan', 150),
    longHtml('long-release-qa-note', 200),
  ],
  unicode: [
    '<p>mañana café naïve façade coöperate</p>',
    '<p>emoji family 👨‍👩‍👧 and skin tones 🙏🏽✨</p>',
    '<p>combining marks: a\u0301 e\u0301 i\u0308 o\u0302</p>',
    '<p>math symbols: ∑ ∆ √ ≈ ≤ ≥ ∞</p>',
    '<p>smart punctuation: “quoted” ‘single’ — dash … ellipsis</p>',
    '<p>Filipino: Kumusta, salamat, pananampalataya.</p>',
    '<p>Hawaiian: aloha, ʻohana, Hawaiʻi, kāne.</p>',
    '<p>Japanese: 神は愛です。祈りましょう。</p>',
    '<p>Korean: 하나님은 사랑이십니다.</p>',
    '<p>Chinese: 神爱世人，也看顾微小的心。</p>',
    '<p>Thai: พระเจ้าทรงรักโลก</p>',
    '<p>Greek: ἀγάπη μένει πίστις ἐλπίς</p>',
    '<p>Cyrillic: Господь мой пастырь.</p>',
    '<p>Accents mixed: São Tomé, Zürich, Québec, Bogotá.</p>',
    '<p>Emoji sequence: 🕊️📖🔥🌊🌿👨‍👩‍👧</p>',
  ],
  rtl: [
    '<p dir="rtl">שלום עולם</p>',
    '<p dir="rtl">בְּרֵאשִׁית בָּרָא אֱלֹהִים</p>',
    '<p dir="rtl">الرب راعي فلا يعوزني شيء</p>',
    '<p dir="rtl">سلام و رحمت</p>',
    '<blockquote dir="rtl">שלום — with an English dash</blockquote>',
    '<p>Mixed LTR then RTL: John 3:16 שלום</p>',
    '<p dir="rtl">שלום John 3:16 בתוך המשפט</p>',
    '<ul><li dir="rtl" data-level="1">שלום ברשימה</li></ul>',
    '<ol><li dir="rtl" data-level="1">البند الأول</li></ol>',
    '<h2 dir="rtl">כותרת בעברית</h2>',
    '<p dir="rtl">עברית עם מספרים 12345</p>',
    '<p dir="rtl">نص عربي مع emoji 🙏</p>',
    '<p dir="rtl">שלום\u200f עם סימן כיוון</p>',
    '<blockquote dir="rtl">אבגדהוזחטיכלמנסעפצקרשת</blockquote>',
    '<p>LTR wrapper <span dir="rtl">שלום</span> after span.</p>',
  ],
  'markdown-like': [
    '<p># Heading typed as markdown</p>',
    '<p>## Subheading typed as markdown</p>',
    '<p>- bullet one\n- bullet two\n- bullet three</p>',
    '<p>1. first\n2. second\n3. third</p>',
    '<p>> quoted markdown reflection</p>',
    '<p>**bold markers** and _italic markers_ should stay text.</p>',
    '<p>`inline code` and ``` fences ```</p>',
    '<p>[Unfold](https://unfold.app) markdown link syntax</p>',
    '<p>- [ ] unchecked task\n- [x] checked task</p>',
    '<p>--- horizontal-rule-like text ---</p>',
    '<p>| table | looking | text |</p>',
    '<p>Nested markdown\n  - child bullet\n    - grandchild</p>',
    '<p>Escaped characters: \\*not italic\\*</p>',
    '<p>Scripture markdown: **Romans 8:28**</p>',
    '<p>Mix # heading, > quote, and - list in one paste.</p>',
  ],
  'html-like': [
    '<p>&lt;script&gt;alert("x")&lt;/script&gt;</p>',
    '<p>&lt;div onclick="evil()"&gt;text&lt;/div&gt;</p>',
    '<p>Literal tag text: &lt;p&gt;hello&lt;/p&gt;</p>',
    '<p>&lt;img src=x onerror=alert(1)&gt;</p>',
    '<p>&lt;style&gt;body{display:none}&lt;/style&gt;</p>',
    '<p>&lt;iframe src="https://example.com"&gt;&lt;/iframe&gt;</p>',
    '<p>Angle brackets 2 &lt; 3 and 5 &gt; 4</p>',
    '<pre><code>&lt;script&gt;console.log("safe text")&lt;/script&gt;</code></pre>',
    '<p>Entities: &amp; &lt; &gt; &quot; &#39;</p>',
    '<p>&lt;a href="javascript:alert(1)"&gt;bad link text&lt;/a&gt;</p>',
    '<p>Malformed &lt;strong text without close</p>',
    '<p>Nested literal: &lt;ul&gt;&lt;li&gt;one&lt;/li&gt;&lt;/ul&gt;</p>',
    '<blockquote>&lt;blockquote&gt;literal quote&lt;/blockquote&gt;</blockquote>',
    '<p>Must never leak object sentinels from HTML-ish payload.</p>',
    '<p>&lt;!-- comment-like content --&gt;</p>',
  ],
  scripture: [
    '<p>John 3:16 — For God so loved the world.</p>',
    '<p>Romans 8:28 and Psalm 23:1 in one note.</p>',
    '<p>1 Corinthians 13:4-7 is about patient love.</p>',
    '<p>Philippians 4:6–7 with an en dash range.</p>',
    '<p>Genesis 1:1; Revelation 21:5.</p>',
    '<p>Psalm 119:105 says the word is a lamp.</p>',
    '<blockquote>Matthew 5:14 — You are the light of the world.</blockquote>',
    '<p>Hebrews 11:1 faith definition.</p>',
    '<p>James 1:2-4 testing and perseverance.</p>',
    '<p>2 Timothy 1:7 not fear but power, love, self-control.</p>',
    '<p>Romans 12:1-2 transformed mind.</p>',
    '<p>Isaiah 41:10 fear not.</p>',
    '<p>Proverbs 3:5-6 trust in the Lord.</p>',
    '<p>Galatians 5:22-23 fruit of the Spirit.</p>',
    '<p>Luke 15:20 the father ran to him.</p>',
  ],
  'rich-blocks': [
    '<h1>Title</h1><p>Paragraph below.</p>',
    '<h2>Observation</h2><blockquote>Quote block</blockquote><p>Response.</p>',
    '<ul><li data-level="1">Parent</li><li data-level="2">Child</li></ul>',
    '<ol><li data-level="1">First</li><li data-level="1">Second</li></ol>',
    '<ul data-type="checklist"><li data-checked="false">Pray</li><li data-checked="true">Read</li></ul>',
    '<pre><code>const grace = true;</code></pre>',
    '<p><strong>Bold</strong> <em>italic</em> <u>under</u> <s>strike</s></p>',
    '<p><a href="https://unfold.app">link text</a></p>',
    '<blockquote><p>Nested paragraph quote</p></blockquote>',
    '<h3>Small heading</h3><ul><li data-level="1">one</li></ul>',
    '<p>Before image</p><img src="placeholder" width="320" height="180" /><p>After image</p>',
    '<p>Line one<br>Line two<br>Line three</p>',
    '<h1>Devotion</h1><h2>Read</h2><h3>Apply</h3>',
    '<p><code>inline code</code> inside paragraph.</p>',
    '<blockquote>Romans 8:28</blockquote><ul><li data-level="1">Remember</li></ul>',
  ],
  'paste-storm': [
    pasteStormHtml('sermon paste', 20),
    pasteStormHtml('mixed app paste', 22),
    pasteStormHtml('notes from chat', 24),
    pasteStormHtml('copied article', 26),
    pasteStormHtml('email devotional', 28),
    pasteStormHtml('study guide', 30),
    pasteStormHtml('small group chat', 32),
    pasteStormHtml('web clipping', 34),
    pasteStormHtml('voice transcript', 36),
    pasteStormHtml('planning doc', 38),
    pasteStormHtml('unicode paste 👨‍👩‍👧 שלום', 25),
    pasteStormHtml('markdown html scripture paste', 27),
    pasteStormHtml('rapid autosave payload', 29),
    pasteStormHtml('undo redo paste body', 31),
    pasteStormHtml('final paste storm sample', 33),
  ],
};

export function buildNotebookRuntimeFuzzCases(): NotebookRuntimeFuzzCase[] {
  return CATEGORIES.flatMap((category) =>
    SEEDS[category].map((initialHtml, index) => {
      const id = `${category}-${String(index + 1).padStart(2, '0')}`;
      const commands = commandPatternFor(category, index);
      return {
        id,
        label: `${category} ${index + 1}`,
        category,
        initialHtml,
        commands,
        expectedNeedles: expectedNeedlesFor(category, initialHtml),
        allowEmptyFinalHtml: category === 'blank-like',
      };
    }),
  );
}

export function evaluateNotebookRuntimeFuzzCase(
  testCase: NotebookRuntimeFuzzCase,
  observation: NotebookRuntimeFuzzObservation,
): NotebookRuntimeFuzzResult {
  const failures: string[] = [];
  const finalHtml = observation.finalHtml ?? '';

  if (observation.error) {
    failures.push(observation.error);
  }

  if (finalHtml.includes('[object Object]')) {
    failures.push('final html leaked [object Object]');
  }

  if (!testCase.allowEmptyFinalHtml && isVisuallyEmptyHtml(finalHtml)) {
    failures.push('final html is visually empty');
  }

  for (const needle of testCase.expectedNeedles ?? []) {
    if (!finalHtml.includes(needle)) {
      failures.push(`missing expected text: ${needle}`);
    }
  }

  return {
    id: testCase.id,
    label: testCase.label,
    category: testCase.category,
    passed: failures.length === 0,
    failures,
    finalHtmlLength: finalHtml.length,
  };
}

export function summarizeNotebookRuntimeFuzzResults(
  results: NotebookRuntimeFuzzResult[],
): NotebookRuntimeFuzzSummary {
  const failedResults = results.filter((result) => !result.passed);
  const failedByCategory: Partial<Record<NotebookRuntimeFuzzCategory, number>> = {};

  for (const result of failedResults) {
    failedByCategory[result.category] = (failedByCategory[result.category] ?? 0) + 1;
  }

  return {
    total: results.length,
    passed: results.length - failedResults.length,
    failed: failedResults.length,
    failedIds: failedResults.map((result) => result.id),
    failedByCategory,
  };
}

function commandPatternFor(
  category: NotebookRuntimeFuzzCategory,
  index: number,
): NotebookRuntimeFuzzCommand[] {
  if (category === 'scripture' && index % 3 === 0) {
    return [
      { type: 'focus' },
      {
        type: 'insert-scripture',
        reference: 'John 3:16',
        text: 'For God so loved the world that he gave his one and only Son.',
      },
      { type: 'get-html' },
    ];
  }

  if (category === 'rich-blocks' && index % 4 === 0) {
    return [
      { type: 'set-list', listType: 'checklist' },
      { type: 'toggle-checklist' },
      { type: 'undo' },
      { type: 'redo' },
      { type: 'get-html' },
    ];
  }

  return COMMAND_PATTERNS[index % COMMAND_PATTERNS.length];
}

function expectedNeedlesFor(
  category: NotebookRuntimeFuzzCategory,
  initialHtml: string,
): string[] {
  if (category === 'blank-like') {
    return [];
  }

  if (category === 'html-like') {
    if (initialHtml.includes('&lt;script&gt;')) {
      return ['&lt;script&gt;'];
    }
    if (initialHtml.includes('[object Object]')) {
      return ['[object Object]'];
    }
    return [firstTextNeedle(initialHtml)];
  }

  return [firstTextNeedle(initialHtml)];
}

function firstTextNeedle(html: string): string {
  const decoded = html
    .replace(/<br\s*\/?\s*>/gi, '\n')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/g, "'")
    .replace(/\s+/g, ' ')
    .trim();

  if (!decoded) {
    return '';
  }

  return decoded.length > 64 ? decoded.slice(0, 64).trim() : decoded;
}

function isVisuallyEmptyHtml(html: string): boolean {
  return html
    .replace(/<br\s*\/?\s*>/gi, '')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;|&#160;|&#xA0;/gi, '')
    .replace(/[\s\u00a0\u200b\u200c\u200d\u2060\ufeff]/g, '')
    .length === 0;
}

function longHtml(seed: string, paragraphs: number): string {
  return Array.from({ length: paragraphs }, (_, index) => {
    const number = index + 1;
    return `<p>${seed} paragraph ${number}: Grace trains attention through repeated, ordinary faithfulness. This sentence intentionally stays stable for native editor round-trip verification.</p>`;
  }).join('');
}

function pasteStormHtml(label: string, sections: number): string {
  return Array.from({ length: sections }, (_, index) => {
    const n = index + 1;
    switch (index % 5) {
      case 0:
        return `<h2>${label} section ${n}</h2>`;
      case 1:
        return `<p>${label} paragraph ${n} with John 3:16, emoji 🙏, and markdown-ish **bold**.</p>`;
      case 2:
        return `<ul><li data-level="1">${label} bullet ${n}</li><li data-level="2">nested item ${n}</li></ul>`;
      case 3:
        return `<blockquote>${label} quote ${n} — שלום and café should survive.</blockquote>`;
      default:
        return `<pre><code>${label} code ${n}: const safe = "&lt;script&gt;";</code></pre>`;
    }
  }).join('');
}
