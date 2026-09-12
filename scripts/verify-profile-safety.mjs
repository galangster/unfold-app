import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const repoRoot = process.cwd();
const eas = JSON.parse(readFileSync(join(repoRoot, 'eas.json'), 'utf8'));

const qaEnv = eas?.build?.['qa-testflight']?.env ?? {};
const productionEnv = eas?.build?.production?.env ?? {};

if (qaEnv.EXPO_PUBLIC_ENABLE_QA_TOOLS !== '1') {
  throw new Error('[cvl] qa-testflight must explicitly enable EXPO_PUBLIC_ENABLE_QA_TOOLS=1');
}

if ('EXPO_PUBLIC_ENABLE_QA_TOOLS' in productionEnv) {
  throw new Error('[cvl] production build must not define EXPO_PUBLIC_ENABLE_QA_TOOLS');
}

if (qaEnv.EXPO_PUBLIC_ENABLE_SCRIPTURE_PRACTICE !== '1') {
  throw new Error('[cvl] qa-testflight must explicitly enable EXPO_PUBLIC_ENABLE_SCRIPTURE_PRACTICE=1');
}

for (const [profileName, profile] of Object.entries(eas?.build ?? {})) {
  if (profileName === 'qa-testflight') continue;
  const env = profile?.env ?? {};
  if ('EXPO_PUBLIC_ENABLE_SCRIPTURE_PRACTICE' in env) {
    throw new Error(`[cvl] ${profileName} build must not define EXPO_PUBLIC_ENABLE_SCRIPTURE_PRACTICE`);
  }
}

if ('EXPO_PUBLIC_REVENUECAT_TEST_KEY' in productionEnv) {
  throw new Error('[cvl] production build must not define EXPO_PUBLIC_REVENUECAT_TEST_KEY');
}

console.log('[cvl] profile safety PASS');
