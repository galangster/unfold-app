/* eslint-disable import/first */
/**
 * The requests behind the prompts the app writes itself: the evening examen,
 * the morning bridge, and Go Deeper. Each request carries what the reader
 * already got, recorded when it was cached, so the model does not write it
 * again, and the day's shape from the bag. The bridge and examen caches key on
 * the local day of the date the caller passes.
 */

jest.mock('@/lib/api-config', () => ({
  PRIMARY_BACKEND_URL: 'https://backend.test',
  getBackendCandidates: () => ['https://backend.test'],
  getAuthHeaders: jest.fn(async () => ({ 'Content-Type': 'application/json' })),
  sanitizeForPrompt: (value: string | undefined, max: number) => String(value ?? '').slice(0, max),
}));

jest.mock('@/lib/device-credential');

jest.mock('@/lib/rate-limit', () => ({
  checkRateLimit: jest.fn(async () => ({ allowed: true, remaining: 5, resetTime: 0 })),
  incrementRateLimit: jest.fn(async () => undefined),
}));

jest.mock('@/lib/logger', () => ({
  logger: { log: jest.fn(), warn: jest.fn(), error: jest.fn() },
}));

// copySeed() reads the install id from here, so every draw below is on "install-a".
jest.mock('@/lib/mmkv-storage', () => ({
  getSharedEncryptionKey: jest.fn(() => null),
  getDeviceId: jest.fn(() => 'install-a'),
}));

import { PERSONA_BRIEF } from '@/constants/persona';
import { authenticatedFetch } from '@/lib/device-credential';
import { clearBridgeCache, generateBridge } from '../bridge-service';
import { clearExamenCache, generateExamen, parseCachedExamen } from '../examen-service';
import { buildGoDeeperRequest } from '../go-deeper-prompt';
import { bridgeShapeFor, examenShapeFor, goDeeperAnglesFor } from '../prompt-variety';
import type { JournalEntry } from '../store';
import { dayIndexFor } from '../variation-bag';

const SEED = 'install-a';

const EXAMEN_INPUT = {
  todayTheme: 'rest',
  todayScripture: '1 Kings 19:5',
  currentSituation: 'tired',
};
const EXAMEN_CONTEXT = { devotionalId: 'dev-1', dayNumber: 3 };

const BRIDGE_INPUT = {
  userName: 'Alex',
  todayTheme: 'rest',
  todayScripture: '1 Kings 19:5',
  currentSituation: 'tired',
};
const BRIDGE_A = 'Rest gets a whole chapter today. Elijah sleeps under a tree and wakes to bread. What would you do with that kind of morning?';
const BRIDGE_B = 'Who taught you to keep score? Today is about a debt cancelled before it is paid. It starts with a servant on his knees.';
const BRIDGE_C = 'One jar of oil and a widow with nothing left. Today is about what God does with a little. The jar keeps pouring.';

function okJson(body: unknown) {
  return { ok: true, status: 200, json: async () => body, text: async () => JSON.stringify(body) };
}

function respondWith(body: unknown) {
  (global.fetch as jest.Mock).mockResolvedValueOnce(okJson(body));
}

function examenReply(tag: string) {
  const movements = [0, 1, 2, 3, 4].map((i) => ({
    title: `${tag} title ${i}`,
    prayer: `${tag} opens movement ${i} tonight. The rest of the prayer follows here.`,
  }));
  return { content: [{ text: JSON.stringify({ movements }) }] };
}

function bridgeReply(text: string) {
  return { content: [{ text }] };
}

function lastRequest(): { system: string; userMessage: string } {
  const calls = (authenticatedFetch as jest.Mock).mock.calls;
  const body = JSON.parse((calls[calls.length - 1][1] as RequestInit).body as string);
  return { system: body.system, userMessage: body.messages[0].content };
}

beforeEach(() => {
  (authenticatedFetch as jest.Mock).mockClear();
  global.fetch = jest.fn(async () => okJson({})) as unknown as typeof fetch;
  clearBridgeCache();
  clearExamenCache();
});

describe('examen request', () => {
  it('sends the openings and titles of earlier examens, newest first', async () => {
    respondWith(examenReply('alpha'));
    await generateExamen(EXAMEN_INPUT, { devotionalId: 'dev-1', dayNumber: 3 }, new Date(2026, 9, 10, 20, 30));
    expect(lastRequest().userMessage).not.toContain('RECENT OPENINGS');

    respondWith(examenReply('bravo'));
    await generateExamen(EXAMEN_INPUT, { devotionalId: 'dev-1', dayNumber: 4 }, new Date(2026, 9, 11, 20, 30));

    respondWith(examenReply('charlie'));
    await generateExamen(EXAMEN_INPUT, { devotionalId: 'dev-1', dayNumber: 5 }, new Date(2026, 9, 12, 20, 30));

    const message = lastRequest().userMessage;
    expect(message).toContain('RECENT OPENINGS (do not begin a movement with these words):\n- bravo opens movement 0');
    expect(message).toContain('- alpha opens movement 4');
    expect(message.indexOf('bravo opens movement 4')).toBeLessThan(message.indexOf('alpha opens movement 0'));
    expect(message).toContain('RECENT TITLES (do not reuse):\n- bravo title 0');
    expect(message).toContain('- alpha title 4');
  });

  it('lists two examens written on one day in the order they were written', async () => {
    const evening = new Date(2026, 9, 10, 20, 30);
    respondWith(examenReply('first'));
    await generateExamen(EXAMEN_INPUT, { devotionalId: 'dev-1', dayNumber: 3 }, evening);
    respondWith(examenReply('second'));
    await generateExamen(EXAMEN_INPUT, { devotionalId: 'dev-1', dayNumber: 4 }, evening);

    respondWith(examenReply('third'));
    await generateExamen(EXAMEN_INPUT, { devotionalId: 'dev-1', dayNumber: 5 }, new Date(2026, 9, 11, 20, 30));

    const message = lastRequest().userMessage;
    expect(message.indexOf('second opens movement 4')).toBeLessThan(message.indexOf('first opens movement 0'));
  });

  it("names tonight's close, sends no name, and carries the night's closing line", async () => {
    const now = new Date(2026, 9, 14, 21, 0);
    respondWith(examenReply('delta'));

    const prayer = await generateExamen(EXAMEN_INPUT, EXAMEN_CONTEXT, now);

    const shape = examenShapeFor({ seed: SEED, dayIndex: dayIndexFor(now) });
    const { system, userMessage } = lastRequest();
    expect(userMessage).toContain(`TONIGHT'S CLOSE: ${shape.closing.instruction}`);
    expect(userMessage).not.toMatch(/\bName:/);
    expect(prayer?.closingLine).toBe(shape.closingLine);
    // The quoted openers and fixed titles the model used to copy are gone.
    for (const opener of ['Lord, I thank you for', 'I felt you near when', 'I confess that', 'I release', 'Tomorrow, I trust that']) {
      expect(system).not.toContain(opener);
    }
    expect(system).not.toContain('"title": "Gratitude"');
  });

  it("keeps the model's own titles and drops an Amen it wrote anyway", async () => {
    respondWith({
      content: [{
        text: JSON.stringify({
          movements: [
            { title: '1. Small mercies.', prayer: 'The bread was warm. Thank you.' },
            { title: 'A title that runs on far too long to be any kind of title', prayer: 'Keep me (and them.) Amen.' },
            { title: 'What weighed on me', prayer: 'I call it "home" Amen' },
            { title: 'Setting it down!!!', prayer: `I put the worry in your hands,${' ;'.repeat(4_000)} amen.` },
            { title: 'Morning light', prayer: 'I trust you with tomorrow. Amen.' },
          ],
        }),
      }],
    });

    const prayer = await generateExamen(EXAMEN_INPUT, EXAMEN_CONTEXT, new Date(2026, 9, 14, 21, 0));

    expect(prayer?.movements.map((movement) => movement.title)).toEqual([
      'Small mercies',
      'Presence',
      'What weighed on me',
      'Setting it down',
      'Morning light',
    ]);
    expect(prayer?.movements.map((movement) => movement.prayer)).toEqual([
      'The bread was warm. Thank you.',
      'Keep me (and them.)',
      'I call it "home".',
      'I put the worry in your hands.',
      'I trust you with tomorrow.',
    ]);
  });

  it("keys the cache by the local day of the date it is given, not the UTC date", async () => {
    // Outside UTC, these two local times fall on different UTC dates.
    respondWith(examenReply('echo'));
    await generateExamen(EXAMEN_INPUT, EXAMEN_CONTEXT, new Date(2026, 9, 16, 0, 30));

    const sameEvening = await generateExamen(EXAMEN_INPUT, EXAMEN_CONTEXT, new Date(2026, 9, 16, 23, 30));
    expect(authenticatedFetch).toHaveBeenCalledTimes(1);
    expect(sameEvening?.movements[0].title).toBe('echo title 0');

    respondWith(examenReply('foxtrot'));
    const nextDay = await generateExamen(EXAMEN_INPUT, EXAMEN_CONTEXT, new Date(2026, 9, 17, 0, 30));
    expect(authenticatedFetch).toHaveBeenCalledTimes(2);
    expect(nextDay?.movements[0].title).toBe('foxtrot title 0');
  });

  it('reads a cached examen from before the closing line varied as ending on "Amen."', () => {
    const movements = [0, 1, 2, 3, 4].map((i) => ({ title: `Title ${i}`, prayer: 'A prayer.' }));
    expect(parseCachedExamen(JSON.stringify({ movements, totalWordCount: 10 }))?.closingLine).toBe('Amen.');
    expect(parseCachedExamen(JSON.stringify({ movements, totalWordCount: 10, closingLine: null }))?.closingLine).toBeNull();
    expect(parseCachedExamen(JSON.stringify({ movements: movements.slice(1), totalWordCount: 8 }))).toBeNull();
    expect(parseCachedExamen('not json')).toBeNull();
  });
});

describe('bridge request', () => {
  it('sends the first sentence of earlier bridges, newest first', async () => {
    respondWith(bridgeReply(BRIDGE_A));
    await generateBridge(BRIDGE_INPUT, 'dev-1', 3, new Date(2026, 9, 10, 7, 0));
    expect(lastRequest().userMessage).not.toContain('RECENT FIRST SENTENCES');

    respondWith(bridgeReply(BRIDGE_B));
    await generateBridge(BRIDGE_INPUT, 'dev-1', 4, new Date(2026, 9, 11, 7, 0));

    respondWith(bridgeReply(BRIDGE_C));
    await generateBridge(BRIDGE_INPUT, 'dev-1', 5, new Date(2026, 9, 12, 7, 0));

    expect(lastRequest().userMessage).toContain(
      'RECENT FIRST SENTENCES (do not reuse their wording or their first words):\n' +
        '- Who taught you to keep score?\n' +
        '- Rest gets a whole chapter today.',
    );
  });

  it("names the day's opening and closing, and sends the name only on mornings the bag picks", async () => {
    let named = 0;
    for (let day = 1; day <= 9; day += 1) {
      const now = new Date(2026, 9, day, 7, 0);
      respondWith(bridgeReply(BRIDGE_A));
      await generateBridge(BRIDGE_INPUT, 'dev-1', day, now);

      const shape = bridgeShapeFor({ seed: SEED, dayIndex: dayIndexFor(now) });
      const { system, userMessage } = lastRequest();
      expect(userMessage).toContain(`- Opening: ${shape.opening.instruction}`);
      expect(userMessage).toContain(`- Closing: ${shape.closing.instruction}`);
      if (shape.useName) {
        named += 1;
        expect(userMessage).toContain("Reader's name: Alex");
        expect(userMessage).toContain('- Name: Use their name once, after the first sentence.');
      } else {
        expect(userMessage).not.toContain('Alex');
        expect(userMessage).toContain('- Name: Do not use their name today.');
      }
      expect(system).not.toContain('Hey Alex');
      expect(system).not.toContain('Use their name once, casually');
    }
    // Nine mornings hold two full laps of the three-morning name pool.
    expect(named).toBeGreaterThanOrEqual(2);
    expect(named).toBeLessThanOrEqual(4);
  });

  it("keys the cache by the local day of the date it is given, not the UTC date", async () => {
    respondWith(bridgeReply(BRIDGE_A));
    expect(await generateBridge(BRIDGE_INPUT, 'dev-1', 6, new Date(2026, 9, 16, 0, 30))).toBe(BRIDGE_A);

    expect(await generateBridge(BRIDGE_INPUT, 'dev-1', 6, new Date(2026, 9, 16, 23, 30))).toBe(BRIDGE_A);
    expect(authenticatedFetch).toHaveBeenCalledTimes(1);

    respondWith(bridgeReply(BRIDGE_B));
    expect(await generateBridge(BRIDGE_INPUT, 'dev-1', 6, new Date(2026, 9, 17, 0, 30))).toBe(BRIDGE_B);
    expect(authenticatedFetch).toHaveBeenCalledTimes(2);
  });

  it('caches and shows a bridge that ends in a curly closing quote', async () => {
    const quoted = 'Elijah is done, and he says so. Today the reading lets him sleep. The angel said, “Get up and eat.”';
    const morning = new Date(2026, 9, 16, 7, 0);
    respondWith(bridgeReply(quoted));
    expect(await generateBridge(BRIDGE_INPUT, 'dev-1', 8, morning)).toBe(quoted);
    expect(await generateBridge(BRIDGE_INPUT, 'dev-1', 8, morning)).toBe(quoted);
    expect(authenticatedFetch).toHaveBeenCalledTimes(1);
  });

  it('shows no bridge, and caches and records none, when banned phrases leave too little', async () => {
    const morning = new Date(2026, 9, 16, 7, 0);
    respondWith(bridgeReply("It's about a season of rest. Elijah slept for a long time."));
    expect(await generateBridge(BRIDGE_INPUT, 'dev-1', 7, morning)).toBeNull();

    respondWith(bridgeReply(BRIDGE_A));
    expect(await generateBridge(BRIDGE_INPUT, 'dev-1', 7, morning)).toBe(BRIDGE_A);
    expect(authenticatedFetch).toHaveBeenCalledTimes(2);
    expect(lastRequest().userMessage).not.toContain('RECENT FIRST SENTENCES');
  });
});

describe('Go Deeper request', () => {
  function entry(id: string, updatedAt: string, deeperQuestions?: string[]): JournalEntry {
    return { id, devotionalId: 'dev-1', dayNumber: 1, content: 'x', createdAt: updatedAt, updatedAt, deeperQuestions };
  }

  function request(journalEntries: readonly JournalEntry[]) {
    return buildGoDeeperRequest({
      devotionalTitle: 'Rest',
      dayTitle: 'Bread Under the Broom Tree',
      scriptureReference: '1 Kings 19:5',
      entryText: 'I slept badly and woke up angry at nothing.',
      journalEntries,
      seed: SEED,
    });
  }

  const ENTRIES = [
    entry('e1', '2026-10-10T10:00:00.000Z', ['P1a', 'P1b', 'P1c']),
    entry('e2', '2026-10-12T10:00:00.000Z', ['P2a', 'P2b', 'P2c']),
    entry('e3', '2026-10-11T10:00:00.000Z'),
    entry('e4', '2026-10-13T10:00:00.000Z', ['P4a', 'P4b', 'P4c']),
    entry('e5', '2026-10-14T10:00:00.000Z', ['P5a', 'P5b', 'P5c']),
  ];

  it("sends the reader's last nine prompts, newest first, with the request's three angles", () => {
    const { system, userMessage } = request(ENTRIES);

    expect(userMessage).toContain(
      'RECENT PROMPTS (do not reuse their wording or their first words):\n' +
        '- P5a\n- P5b\n- P5c\n- P4a\n- P4b\n- P4c\n- P2a\n- P2b\n- P2c',
    );
    expect(userMessage).not.toContain('P1a');
    // Four entries already hold prompts, so this is request number four.
    goDeeperAnglesFor({ seed: SEED, dayIndex: 4 }).forEach((angle, index) => {
      expect(userMessage).toContain(`${index + 1}. ${angle.instruction}`);
    });
    expect(system.startsWith(`${PERSONA_BRIEF}\n\nWHAT YOU'RE DOING:`)).toBe(true);
    // The quoted openers the model used to copy are gone.
    for (const opener of [
      'What does it feel like when',
      'Where do you feel that in your body',
      'If Jesus were sitting with you',
      'What would change if you believed this',
    ]) {
      expect(system).not.toContain(opener);
    }
  });

  it('moves the angles on with each saved request, and keeps them for a retry', () => {
    const anglesOf = (entries: readonly JournalEntry[]) =>
      request(entries).userMessage.split('ANGLES FOR THESE THREE PROMPTS:\n')[1].split('\n\n')[0];

    const before = anglesOf(ENTRIES);
    expect(anglesOf(ENTRIES)).toBe(before);

    const after = anglesOf([...ENTRIES, entry('e6', '2026-10-15T10:00:00.000Z', ['P6a', 'P6b', 'P6c'])]);
    for (const line of before.split('\n')) {
      expect(after).not.toContain(line.slice(3));
    }
  });

  it('sends no recent block before the reader has any prompts', () => {
    expect(request([entry('e1', '2026-10-10T10:00:00.000Z')]).userMessage).not.toContain('RECENT PROMPTS');
  });
});
