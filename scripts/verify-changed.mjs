import { execSync } from 'node:child_process';

function sh(cmd) {
  return execSync(cmd, { stdio: ['ignore', 'pipe', 'pipe'], encoding: 'utf8' }).trim();
}

const baseRef = process.env.BASE_REF || 'origin/main';
let changed = [];
try {
  changed = sh(`git diff --name-only ${baseRef}...HEAD`).split('\n').filter(Boolean);
} catch {
  changed = sh('git diff --name-only HEAD~1...HEAD').split('\n').filter(Boolean);
}

console.log('[cvl] baseRef:', baseRef);
console.log('[cvl] changed files:', changed.length);

if (changed.length === 0) {
  console.log('[cvl] nothing changed; pass');
  process.exit(0);
}

const touchedAdaptive = changed.some((f) =>
  ['src/lib/devotional-service.ts', 'src/app/onboarding.tsx'].includes(f)
);

if (touchedAdaptive) {
  console.log('[cvl] adaptive flow touched -> running adaptive healthcheck');
  execSync('bun run health:adaptive', { stdio: 'inherit' });
} else {
  console.log('[cvl] adaptive flow untouched -> skipping adaptive healthcheck');
}

console.log('[cvl] verify:changed PASS');
