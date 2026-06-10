import * as fs from 'fs';
import * as path from 'path';

describe('onboarding privacy copy honesty (RT-ONB-2)', () => {
  it('makes no on-device privacy claim anywhere in src (aboutMe is sent to the backend)', () => {
    const sourceRoot = path.join(__dirname, '../..');
    const offenders: string[] = [];
    const walk = (dir: string) => {
      for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        const full = path.join(dir, entry.name);
        if (entry.isDirectory()) {
          if (entry.name === '__tests__' || entry.name === 'node_modules') continue;
          walk(full);
        } else if (/\.tsx?$/.test(entry.name)) {
          if (fs.readFileSync(full, 'utf-8').includes('stays on your device')) {
            offenders.push(path.relative(sourceRoot, full));
          }
        }
      }
    };
    walk(sourceRoot);
    expect(offenders).toEqual([]);
  });
});
