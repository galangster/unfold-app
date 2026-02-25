import { execSync } from 'node:child_process';

function hasCmd(cmd) {
  try {
    execSync(`command -v ${cmd}`, { stdio: 'ignore' });
    return true;
  } catch {
    return false;
  }
}

function run(cmd) {
  execSync(cmd, { stdio: 'inherit' });
}

function runSoft(cmd) {
  try {
    execSync(cmd, { stdio: 'inherit' });
    return true;
  } catch {
    return false;
  }
}

function sh(cmd) {
  return execSync(cmd, { encoding: 'utf8' }).trim();
}

function discoverUnfoldBundleIds() {
  try {
    const out = sh('agent-device apps --platform ios');
    return out
      .split('\n')
      .map((line) => line.trim())
      .filter((line) => /unfold/i.test(line) && /com\./i.test(line))
      .map((line) => {
        const parts = line.split(/\s+/);
        const maybe = parts.find((p) => p.startsWith('com.'));
        return maybe || '';
      })
      .filter(Boolean);
  } catch {
    return [];
  }
}

if (process.env.CI === 'true') {
  console.log('[cvl][device] CI detected -> skipping live device flow audit');
  process.exit(0);
}

if (!hasCmd('agent-device')) {
  console.log('[cvl][device] agent-device not installed -> skipping');
  process.exit(0);
}

const configured = process.env.CVL_IOS_APP_BUNDLE?.trim();
const defaults = ['com.vibecode.unfold.9fj08t', 'com.vibecode.unfold.x9fj08t'];
const discovered = discoverUnfoldBundleIds();
const strict = process.env.CVL_STRICT_DEVICE === '1';
const candidates = [...new Set([configured, ...discovered, ...defaults].filter(Boolean))];

console.log('[cvl][device] bundle candidates:', candidates);
if (!configured && discovered.length === 0 && !strict) {
  console.log('[cvl][device] no installed Unfold bundle discovered; skipping (set CVL_STRICT_DEVICE=1 to enforce)');
  process.exit(0);
}

let lastErr = null;
for (const appId of candidates) {
  try {
    console.log('[cvl][device] trying', appId);
    run(`agent-device open ${appId} --platform ios --relaunch`);

    // Dismiss common Expo dev overlays when present.
    runSoft('agent-device find "Continue" click --platform ios');
    runSoft('agent-device find "Close" click --platform ios');

    // Snapshot + foreground app assertion
    run('agent-device snapshot -i --platform ios');
    run('agent-device appstate --platform ios');

    // Best-effort signal for adaptive UI in dev builds (won't fail if onboarding not reached yet)
    const sawAdaptiveLabel = runSoft('agent-device find "AI source:" exists --platform ios');
    if (sawAdaptiveLabel) {
      console.log('[cvl][device] detected adaptive source label on-screen');
    } else {
      console.log('[cvl][device] adaptive source label not visible in current screen (non-fatal)');
    }

    console.log('[cvl][device] PASS using', appId);
    process.exit(0);
  } catch (err) {
    lastErr = err;
    console.warn('[cvl][device] candidate failed:', appId);
  }
}

console.error('[cvl][device] FAIL: no candidate bundle launched successfully');
if (lastErr) throw lastErr;
process.exit(1);
