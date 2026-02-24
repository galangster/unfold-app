import { execSync } from 'node:child_process';

function run(cmd) {
  execSync(cmd, { stdio: 'inherit' });
}

console.log('[cvl] smoke: adaptive healthcheck');
run('bun run health:adaptive');

console.log('[cvl] smoke: done');
