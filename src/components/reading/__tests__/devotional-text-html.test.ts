import { findScriptureQuotes, renderDevotionalInline } from '../devotional-text-html';
import { parseScriptureReferences } from '@/lib/scripture-parser';

const day = {
  scriptureReference: 'Psalm 46:10',
  scriptureText: 'Be still, and know that I am God; I will be exalted among the nations.',
};

const quotesIn = (text: string) =>
  findScriptureQuotes(text, parseScriptureReferences(text), day).map((q) => [text.slice(q.start, q.end), q.reference]);

const plainText = (html: string) => html.replace(/<[^>]+>/g, '');

describe('findScriptureQuotes', () => {
  it('finds a quotation followed by its reference, quote marks included', () => {
    expect(quotesIn('Jesus said, “Come to me, all who are weary” (Matthew 11:28). Rest is a gift.'))
      .toEqual([['“Come to me, all who are weary”', 'Matthew 11:28']]);
  });

  it('finds a quotation that follows its reference', () => {
    expect(quotesIn('Romans 8:28: “all things work together for good.”'))
      .toEqual([['“all things work together for good.”', 'Romans 8:28']]);
  });

  it('finds a quotation of the day’s passage without a reference', () => {
    expect(quotesIn('The Lord says, "Be still, and know that I am God." Stillness is trust.'))
      .toEqual([['"Be still, and know that I am God."', 'Psalm 46:10']]);
  });

  it('leaves prose quotations and short echoes of the passage alone', () => {
    expect(quotesIn('My friend said, “Rest is a gift,” and meant it.')).toEqual([]);
    expect(quotesIn('Just “be still” today.')).toEqual([]);
    expect(findScriptureQuotes('“Be still, and know that I am God.”', [], { scriptureText: day.scriptureText })).toEqual([]);
  });

  it('names each quotation by its own citation when citations follow each other', () => {
    expect(quotesIn('Jesus invites us: “Come to me, all you who are weary” (Matthew 11:28). “My yoke is easy and my burden is light” (Matthew 11:30).'))
      .toEqual([
        ['“Come to me, all you who are weary”', 'Matthew 11:28'],
        ['“My yoke is easy and my burden is light”', 'Matthew 11:30'],
      ]);
  });

  it('does not give a citation to a quotation in the next sentence', () => {
    expect(quotesIn('God calls us to stillness (Psalm 23:2). “Prayer does not change God,” C.S. Lewis wrote.'))
      .toEqual([]);
    expect(quotesIn('Matthew 11:28. “Grace is enough,” my friend said.')).toEqual([]);
  });

  it('pairs each opening mark with the next closing mark only', () => {
    expect(quotesIn('“Grace is enough” and then “Come to me” (Matthew 11:28).'))
      .toEqual([['“Come to me”', 'Matthew 11:28']]);
  });

  it('leaves a quotation as prose when the reference after it starts the next sentence', () => {
    expect(quotesIn('“Rest is a gift.” John 3:16 reminds us that God loves the world.')).toEqual([]);
    expect(quotesIn('“Rest is a gift.” *John 3:16* reminds us that God loves the world.')).toEqual([]);
  });

  it.each([
    ['in parentheses', '“For God so loved the world” (John 3:16) reminds us.'],
    ['after an em dash', '“For God so loved the world”—John 3:16 reminds us.'],
    ['after a spaced en dash', '“For God so loved the world” – John 3:16 reminds us.'],
    ['after a hyphen', '“For God so loved the world” - John 3:16 reminds us.'],
    ['bare, before a full stop', '“For God so loved the world” John 3:16. He gave.'],
    ['bare, before a comma', '“For God so loved the world” John 3:16, and so on.'],
    ['bare, before a semicolon', '“For God so loved the world” John 3:16; so we rest.'],
    ['bare, before a colon', '“For God so loved the world” John 3:16: he gave.'],
    ['bare, before an exclamation mark', '“For God so loved the world” John 3:16! He gave.'],
    ['bare, before a question mark', 'Do you know “For God so loved the world” John 3:16?'],
    ['bare, before a closing parenthesis', '(Jesus said “For God so loved the world” John 3:16)'],
    ['bare, at the end of the block', '“For God so loved the world” John 3:16'],
    ['bare, in emphasis, before a full stop', '“For God so loved the world” *John 3:16*.'],
  ])('names a quotation by a citation after it, %s', (_form, text) => {
    expect(quotesIn(text)).toEqual([['“For God so loved the world”', 'John 3:16']]);
  });
});

describe('renderDevotionalInline', () => {
  it('wraps a Scripture quotation and still links its reference', () => {
    const html = renderDevotionalInline('Jesus said, “Come to me” (Matthew 11:28).', day);
    expect(html).toBe(
      'Jesus said, <span class="scripture-quote" data-ref="Matthew 11:28">“Come to me”</span> '
        + '(<span class="scripture-ref" data-ref="Matthew 11:28">Matthew 11:28</span>).',
    );
  });

  it('adds no text, so stored highlight offsets stay valid', () => {
    const text = 'He said, **“Come to me”** (Matthew 11:28). The Lord says, "Be still, and know that I am God." *Rest*.';
    const html = renderDevotionalInline(text, day);
    expect(html).toContain('class="scripture-quote"');
    expect(plainText(html)).toBe(plainText(renderDevotionalInline(text, {})));
  });

  it('nests a quotation inside emphasis that surrounds it', () => {
    expect(renderDevotionalInline('**“Come to me”** (Matthew 11:28)', day)).toBe(
      '<strong><span class="scripture-quote" data-ref="Matthew 11:28">“Come to me”</span></strong> '
        + '(<span class="scripture-ref" data-ref="Matthew 11:28">Matthew 11:28</span>)',
    );
    expect(renderDevotionalInline('“Come to *me*” (Matthew 11:28)', day)).toContain(
      '<span class="scripture-quote" data-ref="Matthew 11:28">“Come to <em class="devotional-emphasis">me</em>”</span>',
    );
  });

  it('keeps a quotation that emphasis crosses as prose, with the emphasis as before', () => {
    const html = renderDevotionalInline('*He said, “Come* to me” (Matthew 11:28)', day);
    expect(html).not.toContain('scripture-quote');
    expect(html).toContain('<em class="devotional-emphasis">He said, “Come</em> to me”');
  });

  it('keeps private-use characters of the text as text', () => {
    const quoted = renderDevotionalInline('Icon \uE000 then “Come to me” (Matthew 11:28) \uE001.', day);
    expect(quoted).toContain('Icon &#xe000; then <span class="scripture-quote" data-ref="Matthew 11:28">“Come to me”</span>');
    expect(quoted).toContain('&#xe001;.');
    expect(renderDevotionalInline('Icon \uE001 then plain text.', {})).toBe('Icon &#xe001; then plain text.');
  });

  it('escapes the text and the reference it stores', () => {
    const html = renderDevotionalInline('Fear & trembling: “Come to <me>” (Matthew 11:28)', day);
    expect(html).toContain('Fear &amp; trembling');
    expect(html).toContain('“Come to &lt;me&gt;”');
  });
});
