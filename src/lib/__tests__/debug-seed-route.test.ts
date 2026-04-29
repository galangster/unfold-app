/**
 * Source assertion: dev seed routes should replace their own seeded QA data.
 * Otherwise older persisted noncanonical seed rows can survive and make
 * runtime QA falsely land on the reader fallback.
 */
import * as fs from 'fs';
import * as path from 'path';

describe('debug seed routes', () => {
  const seedRevealSource = fs.readFileSync(
    path.join(__dirname, '../../app/debug-seed-reveal.tsx'),
    'utf-8',
  );
  const seedNotificationSource = fs.readFileSync(
    path.join(__dirname, '../../app/debug-seed-notification-tap.tsx'),
    'utf-8',
  );

  it('replaces any previous seeded reveal devotional before adding a fresh one', () => {
    expect(seedRevealSource).toContain('store.removeDevotional(seeded.id);');
    expect(seedRevealSource).toContain('store.addDevotional(seeded);');
  });

  it('replaces any previous seeded notification devotional before adding a fresh one', () => {
    expect(seedNotificationSource).toContain('store.removeDevotional(seeded.id);');
    expect(seedNotificationSource).toContain('store.addDevotional(seeded);');
  });
});
