import { execSync } from 'node:child_process';

execSync('bun run verify:changed', { stdio: 'inherit' });
execSync('bun run verify:smoke', { stdio: 'inherit' });

console.log('[cvl] verify:release PASS');
