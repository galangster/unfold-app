import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

const APP_ROOT = join(__dirname, '../../app');

function walk(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const full = join(dir, name);
    return statSync(full).isDirectory() ? walk(full) : [full];
  });
}

function churnedSheetUsages(source: string): string[] {
  const usages: string[] = [];
  let searchFrom = 0;
  while (searchFrom < source.length) {
    const start = source.indexOf('<ExclusiveOfferSheet', searchFrom);
    if (start < 0) break;
    const end = source.indexOf('/>', start);
    const block = end < 0 ? source.slice(start) : source.slice(start, end + 2);
    if (block.includes('context="churned"') || block.includes("context='churned'")) {
      usages.push(block);
    }
    searchFrom = start + 1;
  }
  return usages;
}

describe('F5 churned ExclusiveOfferSheet source guard', () => {
  it('passes onPurchaseSuccess on every churned sheet under src/app', () => {
    const files = walk(APP_ROOT).filter((file) => file.endsWith('.tsx'));
    const churned = files.flatMap((file) => (
      churnedSheetUsages(readFileSync(file, 'utf8')).map((block) => ({ file, block }))
    ));

    expect(churned.length).toBeGreaterThan(0);
    for (const { file, block } of churned) {
      expect(`${file}\n${block}`).toContain('onPurchaseSuccess=');
      expect(block).toContain('handleOfferVerifiedExit');
      expect(block).toContain('surface="churned_sheet"');
    }
  });
});
