import { spawnSync } from 'node:child_process';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { evaluateReleaseGate } from './release-proof-lib.mjs';

const scriptsDir = dirname(fileURLToPath(import.meta.url));

const profiles = spawnSync(process.execPath, [join(scriptsDir, 'verify-profile-safety.mjs')], {
  cwd: process.cwd(),
  env: process.env,
  stdio: 'inherit',
});
if ((profiles.status ?? 1) !== 0) {
  process.exit(profiles.status ?? 1);
}

const flag = process.argv.indexOf('--proof');
const recordPath = flag >= 0 ? process.argv[flag + 1] : process.env.CVL_RELEASE_PROOF;
const result = evaluateReleaseGate({ recordPath });

if (result.simulator?.ok) {
  console.log('[cvl] verify:release simulator-artifact MATCH');
  console.log('[cvl] verify:release evidence: local simulator record only; not a cryptographic attestation');
}

if (result.code === 'incomplete-release') {
  console.error(`[cvl] verify:release FAIL incomplete: ${result.reason}`);
  process.exit(1);
}

console.error(`[cvl] verify:release FAIL: ${result.reason}`);
process.exit(1);
