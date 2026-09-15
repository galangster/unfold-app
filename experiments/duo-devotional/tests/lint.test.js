import { expect, test } from 'bun:test';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

function lintFixture(source) {
  const directory = mkdtempSync(join(tmpdir(), 'duo-lint-fixture-'));
  const file = join(directory, 'example.ts');
  try {
    writeFileSync(file, source);
    const result = Bun.spawnSync(['node_modules/.bin/oxlint', '--config', resolve('.oxlintrc.json'), '--format', 'json', file], {
      env: { ...process.env, NODE_OPTIONS: '--experimental-strip-types' }
    });
    const report = JSON.parse(result.stdout.toString());
    return { status: result.exitCode, codes: report.diagnostics.map(item => item.code) };
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
}

test('vendored rules report prohibited access and an unexplained assertion', () => {
  const result = lintFixture('export const value = Reflect.get({ count: 1 }, "count");\nexport const count = value as number;');
  expect(result.status).toBe(1);
  expect(result.codes).toContain('anti-slop(no-reflect-get)');
  expect(result.codes).toContain('anti-slop(require-safety-comment-for-type-assertion)');
});

test('vendored rules accept typed access and respect a locally bound Reflect name', () => {
  const result = lintFixture('const Reflect = { get() { return 1; } };\nconst reading = { count: 1 };\nexport const count = reading.count + Reflect.get();');
  expect(result).toEqual({ status: 0, codes: [] });
});
