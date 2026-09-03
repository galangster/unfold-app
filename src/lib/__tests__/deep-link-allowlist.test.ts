/**
 * P3-4 item 2a — external deep-link allowlist.
 *
 * Every legitimate `unfold://` producer in the app must be accepted; every
 * unknown route, blocked route, out-of-range number, oversized id, junk
 * value, and unknown route group must be rejected.
 */
import * as fs from 'fs';
import * as path from 'path';

import {
  DEEP_LINK_FALLBACK_PATH,
  EXTERNAL_ROUTE_ALLOWLIST,
  EXTERNAL_ROUTE_BLOCKLIST,
  resolveExternalDeepLink,
} from '../deep-link-allowlist';

const UUID = '8489bcfc-a86a-44e1-bbb1-6a6fa13d4e97';

function expectAllowed(url: string, route?: string) {
  const decision = resolveExternalDeepLink(url);
  expect(decision).toMatchObject({ allowed: true, ...(route ? { route } : {}) });
}

function expectRejected(url: string, reason?: string) {
  const decision = resolveExternalDeepLink(url);
  expect(decision.allowed).toBe(false);
  if (reason) expect(decision).toMatchObject({ reason });
}

describe('deep-link allowlist — legitimate producers', () => {
  it('accepts the exact widgetURL literal every iOS widget source declares', () => {
    const widgetDir = path.join(__dirname, '../../widgets/ios');
    const files = ['UnfoldStreak.tsx', 'UnfoldToday.tsx', 'UnfoldDashboard.tsx'];
    for (const file of files) {
      const src = fs.readFileSync(path.join(widgetDir, file), 'utf-8');
      const match = /const deepLink = '([^']+)';/.exec(src);
      expect(match).not.toBeNull();
      expectAllowed(match![1], '/');
    }
  });

  it('accepts the bare scheme and every tab root, with or without route groups', () => {
    for (const url of [
      'unfold://',
      'unfold:///',
      'unfold://(tabs)',
      'unfold://(tabs)/(today)',
      'unfold://(tabs)/(bible)',
      'unfold://(tabs)/(ask)',
      'unfold://(tabs)/(journal)',
      'unfold://(tabs)/(you)',
      'unfold:///(tabs)/(today)/',
    ]) {
      expectAllowed(url, '/');
    }
  });

  it('accepts both registered schemes and a plain path', () => {
    expectAllowed('unfold://paywall', '/paywall');
    expectAllowed('com.unfoldapp.ios://paywall', '/paywall');
    expectAllowed('/paywall', '/paywall');
    expectAllowed('unfold:paywall', '/paywall');
  });

  it('accepts forward-compatible web / Expo Go forms by dropping the authority', () => {
    expectAllowed('https://unfoldapp.co/paywall', '/paywall');
    expectAllowed('https://unfoldapp.co:443/how-it-works?', '/how-it-works');
    expectAllowed('exp://192.168.1.20:8081/--/reader?bookId=43&chapter=3', '/reader');
  });

  it('accepts the devotional-ready reveal shape (notification payload params)', () => {
    expectAllowed(
      `unfold://reveal?devotionalId=devotional-1725000000000-abc123xyz&dayNumber=3&seriesTitle=Quiet%20Strength&dayTitle=Day%20Three&totalDays=7`,
      '/reveal',
    );
    expectAllowed(`unfold:///reveal?devotionalId=onboarding-sample-anon_${UUID}&dayNumber=1`, '/reveal');
    expectAllowed(`unfold://reveal?devotionalId=${UUID}&dayNumber=1&dayTitle=&seriesTitle=`.replace('&dayTitle=&seriesTitle=', ''), '/reveal');
  });

  it('accepts every in-app reading / journal / library producer shape', () => {
    expectAllowed('unfold://(tabs)/(today)/reading?devotionalId=devotional-1725000000000-abc123xyz&dayNumber=2', '/reading');
    expectAllowed('unfold://reading', '/reading');
    expectAllowed('unfold://reading?dayNumber=4', '/reading');
    expectAllowed('unfold://reading?devotionalId=abc&dayNumber=2&highlightId=hl_1725000000000_ab12c', '/reading');
    expectAllowed('unfold://reading?devotionalId=abc&dayNumber=2&bookmarkId=bm_1725000000000_ab12c', '/reading');
    expectAllowed('unfold://(tabs)/(today)/journal?devotionalId=abc&dayNumber=2&focusQuestion=1', '/journal');
    expectAllowed('unfold://(tabs)/(journal)/entry?devotionalId=abc&dayNumber=2', '/entry');
    expectAllowed('unfold://(tabs)/(today)/journal-detail?entryId=journal-1725000000000-abc123xyz', '/journal-detail');
    expectAllowed('unfold://(tabs)/(today)/evening-wind-down', '/evening-wind-down');
    expectAllowed('unfold://evening-wind-down?devotionalId=abc&dayNumber=5', '/evening-wind-down');
    expectAllowed('unfold://(tabs)/(you)/my-content?tab=highlights&source=bible&from=bible', '/my-content');
    expectAllowed('unfold://(tabs)/(today)/my-content?tab=bookmarks&from=home', '/my-content');
    expectAllowed('unfold://my-content?tab=highlights&source=devotional&type=notes', '/my-content');
    expectAllowed('unfold://(tabs)/(today)/past-devotionals?from=home', '/past-devotionals');
    expectAllowed('unfold://(tabs)/(you)/series-detail?id=devotional-1725000000000-abc123xyz', '/series-detail');
  });

  it('accepts bible reader references and the search screen', () => {
    expectAllowed('unfold://(tabs)/(bible)/reader?bookId=43&chapter=3&verse=16', '/reader');
    expectAllowed('unfold://reader?bookId=1&chapter=1', '/reader');
    expectAllowed('unfold://reader?bookId=19&chapter=150&verse=176', '/reader');
    expectAllowed('unfold://reader', '/reader');
    expectAllowed('unfold://(tabs)/(bible)/search', '/search');
  });

  it('accepts notebook, settings, check-in, onboarding, share-card, and static screens', () => {
    expectAllowed('unfold://(tabs)/(journal)/note-detail?noteId=note_1725000000000_abc123def', '/note-detail');
    expectAllowed('unfold://note-detail?startEditing=true&folderId=folder_1725000000000_abc123def', '/note-detail');
    expectAllowed('unfold://(tabs)/(journal)/recently-deleted', '/recently-deleted');
    expectAllowed('unfold://(tabs)/(you)/settings?from=home', '/settings');
    expectAllowed('unfold://(tabs)/(you)/checkin-schedule?type=evening', '/checkin-schedule');
    expectAllowed('unfold://checkin-schedule?type=midday', '/checkin-schedule');
    expectAllowed('unfold://onboarding?startAt=themeType&flow=newSeries', '/onboarding');
    expectAllowed('unfold://onboarding', '/onboarding');
    expectAllowed(
      'unfold://share-card?text=For%20God%20so%20loved%20the%20world&reference=John%203%3A16&translation=BSB&type=verse',
      '/share-card',
    );
    expectAllowed('unfold://share-card?text=Be+still+and+know', '/share-card');
    expectAllowed('unfold://how-it-works', '/how-it-works');
    expectAllowed('unfold://streak-settings', '/streak-settings');
  });

  it('ignores fragments and empty query strings', () => {
    expectAllowed('unfold://paywall#top', '/paywall');
    expectAllowed('unfold://paywall?', '/paywall');
    expectAllowed('unfold://reader?bookId=1&chapter=1&', '/reader');
  });
});

describe('deep-link allowlist — rejections', () => {
  it('rejects the hidden and transitional routes explicitly', () => {
    expectRejected('unfold://unfolded', 'blocked-route');
    expectRejected('unfold:///unfolded', 'blocked-route');
    expectRejected('unfold://generating', 'blocked-route');
    expectRejected('unfold://(tabs)/(today)/day-menu?devotionalId=abc&currentDay=1', 'blocked-route');
    for (const route of EXTERNAL_ROUTE_BLOCKLIST) {
      expect(EXTERNAL_ROUTE_ALLOWLIST).not.toHaveProperty(route);
    }
  });

  it('rejects unknown routes, including the retired QA seed routes and case variants', () => {
    expectRejected('unfold://debug-seed-today?state=evening', 'unknown-route');
    expectRejected('unfold://debug-premium?mode=grant', 'unknown-route');
    expectRejected('unfold://debug-reset-beginning', 'unknown-route');
    expectRejected('unfold://__dev__/unfold-editor-test?autoFuzz=1', 'unknown-route');
    expectRejected('unfold://(tabs)/(you)/component-catalog', 'unknown-route');
    expectRejected('unfold://wallpaper?quote=x', 'unknown-route');
    expectRejected('unfold://Reveal?devotionalId=abc&dayNumber=1', 'unknown-route');
    expectRejected('unfold://reveal%00?devotionalId=abc&dayNumber=1', 'unknown-route');
    expectRejected('unfold://reading/extra', 'unknown-route');
    expectRejected('unfold://index', 'unknown-route');
  });

  it('rejects unknown route groups and path traversal', () => {
    expectRejected('unfold://(evil)/reading', 'unknown-group');
    expectRejected('unfold://(tabs)/(admin)', 'unknown-group');
    expectRejected('unfold://(tabs)/(today)/../reveal?devotionalId=abc&dayNumber=1', 'malformed');
    expectRejected('unfold://./paywall', 'malformed');
    expectRejected('unfold://paywall/%2e%2e/unfolded', 'malformed');
  });

  it('rejects javascript-ish junk and non-URL input', () => {
    expectRejected('javascript:alert(1)', 'unknown-route');
    expectRejected('unfold://share-card?text=%3Cscript%3Ealert(1)%3C%2Fscript%3E', 'invalid-param');
    expectRejected('unfold://share-card?text=javascript:alert(1)', 'invalid-param');
    expectRejected('unfold://share-card?text=%20%20JAVASCRIPT%3Aalert(1)', 'invalid-param');
    expectRejected('unfold://share-card?text=data:text/html,x', 'invalid-param');
    expectRejected('unfold://share-card?text=hello%00world', 'invalid-param');
    expectRejected('unfold://share-card?text=', 'invalid-param');
    expectRejected('unfold://share-card?reference=John', 'missing-param');
    expectRejected('unfold://share-card?text=%E0%A4%A', 'malformed');
    expectRejected('unfold://reveal?devotionalId=abc&dayNumber=1&%ZZ=1', 'malformed');
    expect(resolveExternalDeepLink(undefined as unknown as string)).toMatchObject({ allowed: false, reason: 'malformed' });
    expect(resolveExternalDeepLink(42 as unknown as string)).toMatchObject({ allowed: false, reason: 'malformed' });
  });

  it('rejects out-of-range numbers and non-canonical integers', () => {
    expectRejected('unfold://reader?bookId=0&chapter=1', 'invalid-param');
    expectRejected('unfold://reader?bookId=67&chapter=1', 'invalid-param');
    expectRejected('unfold://reader?bookId=999&chapter=1', 'invalid-param');
    expectRejected('unfold://reader?bookId=1&chapter=0', 'invalid-param');
    expectRejected('unfold://reader?bookId=1&chapter=151', 'invalid-param');
    expectRejected('unfold://reader?bookId=1&chapter=1&verse=0', 'invalid-param');
    expectRejected('unfold://reader?bookId=1&chapter=1&verse=177', 'invalid-param');
    expectRejected('unfold://reader?bookId=1&chapter=1&verse=9999999', 'invalid-param');
    expectRejected('unfold://reveal?devotionalId=abc&dayNumber=0', 'invalid-param');
    expectRejected('unfold://reveal?devotionalId=abc&dayNumber=367', 'invalid-param');
    expectRejected('unfold://reveal?devotionalId=abc&dayNumber=-1', 'invalid-param');
    expectRejected('unfold://reveal?devotionalId=abc&dayNumber=1.5', 'invalid-param');
    expectRejected('unfold://reveal?devotionalId=abc&dayNumber=1e3', 'invalid-param');
    expectRejected('unfold://reveal?devotionalId=abc&dayNumber=0x10', 'invalid-param');
    expectRejected('unfold://reveal?devotionalId=abc&dayNumber=007', 'invalid-param');
    expectRejected('unfold://reveal?devotionalId=abc&dayNumber=%2B3', 'invalid-param');
    expectRejected('unfold://reveal?devotionalId=abc&dayNumber=three', 'invalid-param');
    expectRejected('unfold://reveal?devotionalId=abc&dayNumber=1&totalDays=400', 'invalid-param');
    expectRejected('unfold://journal?devotionalId=abc&dayNumber=1&focusQuestion=100', 'invalid-param');
  });

  it('rejects oversized, empty, or malformed ids and over-long text', () => {
    expectRejected(`unfold://reveal?devotionalId=${'a'.repeat(129)}&dayNumber=1`, 'invalid-param');
    expectAllowed(`unfold://reveal?devotionalId=${'a'.repeat(128)}&dayNumber=1`);
    expectRejected('unfold://reveal?devotionalId=&dayNumber=1', 'invalid-param');
    expectRejected('unfold://reveal?devotionalId=a%20b&dayNumber=1', 'invalid-param');
    expectRejected('unfold://reveal?devotionalId=a%2Fb&dayNumber=1', 'invalid-param');
    expectRejected('unfold://reveal?devotionalId=-abc&dayNumber=1', 'invalid-param');
    expectRejected('unfold://reveal?devotionalId=abc&dayNumber=1&seriesTitle=' + encodeURIComponent('x'.repeat(201)), 'invalid-param');
    expectAllowed('unfold://reveal?devotionalId=abc&dayNumber=1&seriesTitle=' + encodeURIComponent('x'.repeat(200)));
    expectRejected('unfold://share-card?text=' + 'x'.repeat(1001), 'invalid-param');
    expectAllowed('unfold://share-card?text=' + 'x'.repeat(1000));
    expectRejected('unfold://journal-detail?entryId=%00', 'invalid-param');
    expectRejected('unfold://series-detail?id=', 'invalid-param');
  });

  it('rejects missing required params', () => {
    expectRejected('unfold://reveal?devotionalId=abc', 'missing-param');
    expectRejected('unfold://reveal?dayNumber=1', 'missing-param');
    expectRejected('unfold://reveal', 'missing-param');
    expectRejected('unfold://journal?devotionalId=abc', 'missing-param');
    expectRejected('unfold://journal-detail', 'missing-param');
    expectRejected('unfold://series-detail?from=home', 'missing-param');
    expectRejected('unfold://checkin-schedule', 'missing-param');
  });

  it('rejects unknown, duplicated, or excessive params', () => {
    expectRejected('unfold://reveal?devotionalId=abc&dayNumber=1&evil=1', 'unknown-param');
    expectRejected('unfold://paywall?source=onboarding_early', 'unknown-param');
    expectRejected('unfold://paywall?source=onboarding', 'unknown-param');
    expectRejected('unfold://reader?bookId=1&chapter=1&openNote=true', 'unknown-param');
    expectRejected('unfold://note-detail?verseText=hello', 'unknown-param');
    expectRejected('unfold://note-detail?bookId=1&chapter=1&verse=1', 'unknown-param');
    expectRejected('unfold://reveal?devotionalId=abc&dayNumber=1&dayNumber=2', 'duplicate-param');
    expectRejected('unfold://reading?constructor=1', 'unknown-param');
    expectRejected('unfold://reading?__proto__=1', 'unknown-param');
    expectRejected('unfold://constructor', 'unknown-route');
    const many = Array.from({ length: 17 }, (_, i) => `p${i}=1`).join('&');
    expectRejected(`unfold://reading?${many}`, 'too-many-params');
  });

  it('rejects enum values outside the mirrored sets', () => {
    expectRejected('unfold://my-content?tab=admin', 'invalid-param');
    expectRejected('unfold://my-content?source=journal', 'invalid-param');
    expectRejected('unfold://my-content?type=bible', 'invalid-param');
    expectRejected('unfold://my-content?from=reader-settings', 'invalid-param');
    expectRejected('unfold://settings?from=(you)', 'invalid-param');
    expectRejected('unfold://checkin-schedule?type=morning', 'invalid-param');
    expectRejected('unfold://onboarding?flow=reset', 'invalid-param');
    expectRejected('unfold://onboarding?startAt=%3Cscript%3E', 'invalid-param');
    expectRejected('unfold://onboarding?startAt=1theme', 'invalid-param');
    expectRejected('unfold://share-card?text=x&type=wallpaper', 'invalid-param');
    expectRejected('unfold://note-detail?startEditing=yes', 'invalid-param');
  });

  it('rejects over-long URLs', () => {
    expectRejected(`unfold://reading?devotionalId=${'a'.repeat(5000)}`, 'too-long');
  });
});

describe('deep-link allowlist — table integrity', () => {
  it('uses group-less canonical keys and the root anchor as fallback', () => {
    expect(DEEP_LINK_FALLBACK_PATH).toBe('/');
    for (const key of Object.keys(EXTERNAL_ROUTE_ALLOWLIST)) {
      expect(key.startsWith('/')).toBe(true);
      expect(key).not.toMatch(/\(/);
    }
  });

  it('lists every required param in the params schema', () => {
    for (const [route, schema] of Object.entries(EXTERNAL_ROUTE_ALLOWLIST)) {
      for (const required of schema.required ?? []) {
        expect(schema.params).toHaveProperty(required);
        expect(route).toBeTruthy();
      }
    }
  });
});
