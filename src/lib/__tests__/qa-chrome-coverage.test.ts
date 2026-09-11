import * as fs from 'fs';
import * as path from 'path';

function walk(dir: string, files: string[] = []): string[] {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.name === '__tests__' || entry.name === 'node_modules') continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      walk(full, files);
      continue;
    }
    if (entry.name.endsWith('.ts') || entry.name.endsWith('.tsx')) files.push(full);
  }
  return files;
}

describe('L8 QA chrome coverage', () => {
  it('keeps isQaToolsEnabled out of JSX children outside fixture routes and Dev Tools', () => {
    const src = path.resolve(__dirname, '../..');
    const hits: string[] = [];
    for (const root of ['app', 'components']) {
      for (const file of walk(path.join(src, root))) {
        const rel = path.relative(src, file).replace(/\\/g, '/');
        if (rel.startsWith('app/dev/')) continue;
        if (rel === 'components/settings/QaToolsSection.tsx') continue;
        const source = fs.readFileSync(file, 'utf8');
        if (/(?<!=)\{isQaToolsEnabled\(\)\s*&&/.test(source)) hits.push(rel);
      }
    }
    expect(hits).toEqual([]);
  });
});
