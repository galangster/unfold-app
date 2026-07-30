import {
  WORD_INTERVAL_MS,
  MAX_LAG_MS,
  budgetTicks,
  nextWordBoundary,
  countRemainingWords,
  computeRevealStep,
  createRevealTicker,
} from '../smooth-text-reveal';

describe('nextWordBoundary', () => {
  it('advances past one word including leading whitespace', () => {
    const text = 'hello world';
    expect(nextWordBoundary(text, 0)).toBe(5); // "hello"
    expect(nextWordBoundary(text, 5)).toBe(11); // " world"
    expect(nextWordBoundary(text, 11)).toBe(11); // nothing left
  });

  it('treats newlines inside the tail as word separators', () => {
    const text = 'a\nb';
    expect(nextWordBoundary(text, 1)).toBe(3);
  });
});

describe('countRemainingWords', () => {
  it('counts unrevealed words from an offset', () => {
    expect(countRemainingWords('one two three', 0)).toBe(3);
    expect(countRemainingWords('one two three', 3)).toBe(2);
    expect(countRemainingWords('one two three', 13)).toBe(0);
  });
});

describe('computeRevealStep', () => {
  it('returns null when fully revealed', () => {
    expect(computeRevealStep('done', 4)).toBeNull();
  });

  it('reveals one word per tick when the backlog is small', () => {
    const step = computeRevealStep('hello world', 0);
    expect(step).toEqual({ nextIndex: 5, delayMs: WORD_INTERVAL_MS });
  });

  it('reveals multiple words per tick proportional to backlog', () => {
    const words = Array.from({ length: 100 }, (_, i) => `w${i}`).join(' ');
    const step = computeRevealStep(words, 0)!;
    // 100 words at 28ms/word would trail by 2.8s — catch-up must batch words
    // so the drain finishes within MAX_LAG_MS.
    const expectedWordsPerTick = Math.ceil((100 * WORD_INTERVAL_MS) / MAX_LAG_MS);
    let boundary = 0;
    for (let i = 0; i < expectedWordsPerTick; i += 1) boundary = nextWordBoundary(words, boundary);
    expect(step.nextIndex).toBe(boundary);
  });

  it('never drains a backlog slower than MAX_LAG_MS', () => {
    const words = Array.from({ length: 500 }, (_, i) => `w${i}`).join(' ');
    let index = 0;
    let elapsed = 0;
    // The ticker counts its budget down as it drains; threading it here mirrors
    // that loop, and is what guarantees convergence rather than geometric decay.
    let ticksRemaining = budgetTicks();
    while (index < words.length) {
      const step = computeRevealStep(words, index, { ticksRemaining })!;
      ticksRemaining = Math.max(1, ticksRemaining - 1);
      index = step.nextIndex;
      elapsed += step.delayMs;
    }
    expect(elapsed).toBeLessThanOrEqual(MAX_LAG_MS + WORD_INTERVAL_MS);
  });
});

describe('createRevealTicker (fake timers)', () => {
  beforeEach(() => {
    jest.useFakeTimers();
  });
  afterEach(() => {
    jest.useRealTimers();
  });

  function harness() {
    const revealed: number[] = [];
    const ticker = createRevealTicker((i) => revealed.push(i));
    return { revealed, ticker };
  }

  it('reveals a chunk word by word on the base cadence', () => {
    const { revealed, ticker } = harness();
    ticker.setText('one two three');

    expect(revealed).toEqual([]); // nothing before the first tick

    jest.advanceTimersByTime(WORD_INTERVAL_MS);
    expect(revealed).toEqual([3]); // "one"

    jest.advanceTimersByTime(WORD_INTERVAL_MS);
    expect(revealed).toEqual([3, 7]); // "one two"

    jest.advanceTimersByTime(WORD_INTERVAL_MS);
    expect(revealed).toEqual([3, 7, 13]); // fully revealed
    expect(ticker.getRevealedIndex()).toBe(13);

    // No further ticks once caught up.
    jest.advanceTimersByTime(WORD_INTERVAL_MS * 5);
    expect(revealed).toEqual([3, 7, 13]);
  });

  it('continues the reveal when new chunks append mid-stream', () => {
    const { revealed, ticker } = harness();
    ticker.setText('alpha beta');
    jest.advanceTimersByTime(WORD_INTERVAL_MS * 2);
    expect(ticker.getRevealedIndex()).toBe(10);

    // Chunk arrival: appended text restarts the timer loop without resetting.
    ticker.setText('alpha beta gamma');
    jest.advanceTimersByTime(WORD_INTERVAL_MS);
    expect(revealed[revealed.length - 1]).toBe(16);
  });

  it('never trails the full text by more than ~MAX_LAG_MS after a large chunk', () => {
    const { ticker } = harness();
    const big = Array.from({ length: 200 }, (_, i) => `word${i}`).join(' ');
    ticker.setText(big);

    jest.advanceTimersByTime(MAX_LAG_MS + WORD_INTERVAL_MS * 2);
    expect(ticker.getRevealedIndex()).toBe(big.length);
  });

  it('restarts from zero when the text is replaced (paragraph promotion)', () => {
    const { revealed, ticker } = harness();
    ticker.setText('first paragraph text');
    jest.advanceTimersByTime(WORD_INTERVAL_MS * 2);
    expect(ticker.getRevealedIndex()).toBe(15); // "first paragraph"

    ticker.setText('next tail');
    expect(revealed[revealed.length - 1]).toBe(0); // reset emitted immediately
    jest.advanceTimersByTime(WORD_INTERVAL_MS);
    expect(ticker.getRevealedIndex()).toBe(4); // "next"
  });

  it('flush reveals everything immediately', () => {
    const { revealed, ticker } = harness();
    ticker.setText('one two three four');
    jest.advanceTimersByTime(WORD_INTERVAL_MS);
    ticker.flush();
    expect(ticker.getRevealedIndex()).toBe(18);
    expect(revealed[revealed.length - 1]).toBe(18);

    // Timer cancelled — no further emissions.
    const count = revealed.length;
    jest.advanceTimersByTime(WORD_INTERVAL_MS * 5);
    expect(revealed.length).toBe(count);
  });

  it('dispose stops ticking without emitting', () => {
    const { revealed, ticker } = harness();
    ticker.setText('one two');
    jest.advanceTimersByTime(WORD_INTERVAL_MS);
    const count = revealed.length;
    ticker.dispose();
    jest.advanceTimersByTime(WORD_INTERVAL_MS * 5);
    expect(revealed.length).toBe(count);
  });
});
