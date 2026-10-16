/**
 * The per-day shape of the prompts the app writes itself. A daily reader
 * should never meet the same opening, closing, or name use two days running,
 * and two readers should not be on the same sequence.
 */

import { findBannedPhrase } from '../bridge-text';
import {
  BRIDGE_CLOSINGS,
  BRIDGE_OPENINGS,
  EXAMEN_CLOSING_LINES,
  EXAMEN_CLOSINGS,
  GO_DEEPER_ANGLES,
  GO_DEEPER_ANGLES_PER_REQUEST,
  bridgeShapeFor,
  examenShapeFor,
  goDeeperAnglesFor,
  legacyDevotionalDayShape,
  type PromptDraw,
} from '../prompt-variety';
import { dayIndexFor } from '../variation-bag';

const SEEDS = ['install-a', 'install-b', '9f3c2a7e-0d41-4b8e-a1f2-6c0e5d7b9a13', 'ephemeral-1', 'unfold'];
const START_DAY = dayIndexFor(new Date(2026, 9, 16));
const DAYS = 730;

function days(seed: string, count = DAYS): PromptDraw[] {
  return Array.from({ length: count }, (_, offset) => ({ seed, dayIndex: START_DAY + offset }));
}

/** Each field as the value a reader sees for a day. */
const FIELDS: Record<string, (draw: PromptDraw) => string | null> = {
  'bridge opening': (draw) => bridgeShapeFor(draw).opening.id,
  'bridge closing': (draw) => bridgeShapeFor(draw).closing.id,
  'examen closing': (draw) => examenShapeFor(draw).closing.id,
  'examen closing line': (draw) => examenShapeFor(draw).closingLine,
  'legacy devotional closing': (draw) => legacyDevotionalDayShape(draw.seed, draw.dayIndex).closing,
};

describe('prompt variety', () => {
  it.each(Object.keys(FIELDS))('never draws the same %s on two consecutive local days', (field) => {
    const valueFor = FIELDS[field];
    for (const seed of SEEDS) {
      const values = days(seed).map(valueFor);
      for (let i = 1; i < values.length; i += 1) {
        expect(values[i]).not.toBe(values[i - 1]);
      }
    }
  });

  it('uses the name on one bridge in three, never two mornings running', () => {
    // A lap of the three-entry pool starts on every multiple of three.
    const lapStart = Math.floor(START_DAY / 3) * 3;
    for (const seed of SEEDS) {
      const named = Array.from({ length: 300 }, (_, i) => bridgeShapeFor({ seed, dayIndex: lapStart + i }).useName);
      expect(named.filter(Boolean)).toHaveLength(100);
      for (let i = 1; i < named.length; i += 1) {
        expect(named[i] && named[i - 1]).toBe(false);
      }
    }
  });

  it('keeps the name off day 1 of a legacy series and off two days running', () => {
    for (const seed of SEEDS) {
      expect(legacyDevotionalDayShape(seed, 1).useName).toBe(false);
      const named = Array.from({ length: 200 }, (_, i) => legacyDevotionalDayShape(seed, i + 1).useName);
      expect(named.some(Boolean)).toBe(true);
      for (let i = 1; i < named.length; i += 1) {
        expect(named[i] && named[i - 1]).toBe(false);
      }
    }
  });

  it('gives Go Deeper three different angles, none of them drawn the day before', () => {
    for (const seed of SEEDS) {
      let yesterday: Set<string> | null = null;
      for (const draw of days(seed)) {
        const today = goDeeperAnglesFor(draw).map((angle) => angle.id);
        expect(today).toHaveLength(GO_DEEPER_ANGLES_PER_REQUEST);
        expect(new Set(today).size).toBe(GO_DEEPER_ANGLES_PER_REQUEST);
        if (yesterday) {
          for (const id of today) expect(yesterday.has(id)).toBe(false);
        }
        yesterday = new Set(today);
      }
    }
  });

  it('puts two installs on different sequences', () => {
    const [first, second] = SEEDS;
    const sequences: Record<string, (seed: string) => string> = {
      ...Object.fromEntries(
        Object.entries(FIELDS).map(([field, valueFor]) => [field, (seed: string) => days(seed, 60).map(valueFor).join('|')]),
      ),
      'bridge name': (seed) => days(seed, 60).map((draw) => String(bridgeShapeFor(draw).useName)).join('|'),
      'go deeper angles': (seed) => days(seed, 60).map((draw) => goDeeperAnglesFor(draw).map((a) => a.id).join(',')).join('|'),
    };
    for (const sequence of Object.values(sequences)) {
      expect(sequence(first)).not.toBe(sequence(second));
    }
  });

  it('holds the pool sizes the guarantees rest on', () => {
    expect(BRIDGE_OPENINGS.length).toBeGreaterThanOrEqual(5);
    // Three angles a day stay apart across days only at twelve or more, in threes.
    expect(GO_DEEPER_ANGLES.length).toBeGreaterThanOrEqual(12);
    expect(GO_DEEPER_ANGLES.length % GO_DEEPER_ANGLES_PER_REQUEST).toBe(0);
  });
});

describe('prompt variety copy', () => {
  const STOCK_EMPATHY = [
    'good question',
    'great question',
    'this is a safe place',
    'this is a safe space',
    "it's okay to feel",
    "there's no judgment",
    'i hear you',
    "i'm here for you",
    'thank you for sharing',
  ];
  const lines = [
    ...BRIDGE_OPENINGS,
    ...BRIDGE_CLOSINGS,
    ...EXAMEN_CLOSINGS,
    ...GO_DEEPER_ANGLES,
  ].map((move) => move.instruction).concat(EXAMEN_CLOSING_LINES.filter((line): line is string => line !== null));

  it.each(lines)('follows the copy rules: %s', (line) => {
    const lower = line.toLowerCase().replace(/’/g, "'");
    expect(findBannedPhrase(line)).toBeNull();
    for (const phrase of [...STOCK_EMPATHY, 'sitting with', 'wrestling with']) {
      expect(lower).not.toContain(phrase);
    }
    expect(line).not.toContain('—');
    expect(line).not.toMatch(/\bAI\b/);
    expect(line).not.toMatch(/artificial intelligence|language model|chatbot/i);
  });
});
