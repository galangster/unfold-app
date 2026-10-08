#!/usr/bin/env node
/**
 * Release smoke, build half (docs/RELEASE-SMOKE.md).
 *
 * Prepares this worktree as the release build does (dependencies, pods, the
 * profile stamp). Then it runs the release-proof capture with the production
 * environment on the "Unfold Release Smoke" simulator, the verify:release gate
 * and the bundle checks. Run it from a detached worktree at the release commit:
 *
 *   node scripts/release-smoke.mjs
 *
 * It ends on `[release-smoke] PASS {...}` or stops at the first failed check.
 * The capture builds into fresh derived data and launches the app, so a run
 * takes about 10 minutes. It keeps a candidate worktree beside this one,
 * named `<this worktree>-candidate`, because verify:release reads it again.
 */
import { execFileSync, spawnSync } from 'node:child_process';
import { copyFileSync, existsSync, lstatSync, readFileSync, readdirSync, rmSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { EXPECTED_WORKSPACE, inspectBuiltApp } from './release-proof-lib.mjs';
import {
  DRIFT_NORMALIZERS,
  PODFILE_LOCK,
  bundleProblems,
  parseEasEnvList,
  simulatorUdids,
} from './release-smoke-lib.mjs';

const SIMULATOR = 'Unfold Release Smoke';
const GATE_MATCH = '[cvl] verify:release simulator-artifact MATCH';

// CocoaPods stops on a non-UTF-8 locale, and agent shells often leave it unset.
process.env.LANG ||= 'en_US.UTF-8';
process.env.LC_ALL ||= 'en_US.UTF-8';

// 1. Preflight: a detached, clean tree with nothing local that could reach the bundle.
const root = output('git', ['rev-parse', '--show-toplevel']);
process.chdir(root);
if (output('git', ['branch', '--show-current'])) stop('run this from a detached worktree at the release commit');
if (output('git', ['status', '--porcelain'])) {
  stop('the worktree has local changes. After a failed run, restore it with git checkout -- .');
}
if (existsSync('node_modules') && lstatSync('node_modules').isSymbolicLink()) {
  stop('node_modules is a link. Remove it, because a linked tree moves pod versions');
}
if (existsSync('src/app') && readdirSync('src/app').some((name) => name.startsWith('__break-'))) {
  stop('src/app holds __break-* routes');
}
const envFiles = readdirSync('.').filter((name) => name.startsWith('.env') && name !== '.env.example');
if (envFiles.length) stop(`remove the local env files: ${envFiles.join(', ')}`);
const commit = output('git', ['rev-parse', 'HEAD']);
log(`commit ${commit}`);

// 2. Dependencies, resolved as the EAS build resolves them. Every pod install,
// the EAS builder's included, rewrites spec checksums and build-file IDs.
// Drift is a different pod version or a different set of built files.
run('bun', ['install', '--frozen-lockfile']);
run('node', ['scripts/verify-profile-safety.mjs']);
const protectedFiles = [...DRIFT_NORMALIZERS.keys()];
const committed = new Map(protectedFiles.map((path) => [path, output('git', ['show', `HEAD:${path}`])]));
run('pod', ['install'], { cwd: 'ios' });
const changed = [
  ...output('git', ['diff', '--name-only']).split('\n'),
  ...output('git', ['ls-files', '--others', '--exclude-standard']).split('\n'),
].filter(Boolean);
const unexpected = changed.filter((path) => !DRIFT_NORMALIZERS.has(path));
if (unexpected.length) stop(`pod install changed ${unexpected.join(', ')}`);
for (const [path, normalize] of DRIFT_NORMALIZERS) {
  if (normalize(readFileSync(path, 'utf8')) !== normalize(committed.get(path))) {
    stop(`pod install changed what ${path} resolves. Run git diff ${path}`);
  }
}
// The capture needs the protected files as committed, and the Pods build phase
// needs Manifest.lock to equal Podfile.lock. The guard above proved that only
// checksums and build-file IDs differ, so restore the committed files and
// record the committed lockfile as the installed manifest.
run('git', ['checkout', '--', ...protectedFiles]);
copyFileSync(PODFILE_LOCK, 'ios/Pods/Manifest.lock');

// 3. Stamp the build profile into Info.plist, as eas-build-post-install does.
run('node', ['scripts/stamp-build-profile.mjs'], {
  env: { ...process.env, EAS_BUILD_PROFILE: 'production' },
});

// 4. The production environment in EAS order: the EAS environment, then the
// profile's env. It stays in the capture's process environment, never on disk.
const profile = JSON.parse(readFileSync('eas.json', 'utf8')).build?.production;
const backendUrl = profile?.env?.EXPO_PUBLIC_BACKEND_URL;
if (!backendUrl) stop('eas.json build.production.env has no EXPO_PUBLIC_BACKEND_URL');
const easVariables = parseEasEnvList(output('eas', [
  'env:list', '--environment', profile.environment ?? 'production', '--format', 'short', '--include-sensitive',
]));
const productionEnv = { ...process.env, ...easVariables, ...profile.env, EAS_BUILD_PROFILE: 'production' };

// 5. Capture and gate. The capture makes a fresh build, a launch and the
// evidence record. It compares this worktree with a pristine candidate worktree
// at the same commit, and verify:release reads that candidate again.
const udid = findSimulator();
// The capture runs FlowDeck without -w, so save this worktree's workspace and scheme.
run('flowdeck', [
  'config', 'set', '--project', root, '--workspace', join(root, EXPECTED_WORKSPACE), '--scheme', 'Unfold',
  '--configuration', 'Release', '--simulator', udid, '--force',
]);
const candidate = `${root}-candidate`;
prepareCandidate(candidate);
const derivedData = join(homedir(), 'Library/Developer/FlowDeck/DerivedData', `release-smoke-${commit.slice(0, 8)}-${Date.now()}`);
const evidence = join(root, '.artifacts/release-smoke');
const record = join(evidence, 'record.json');
rmSync(evidence, { recursive: true, force: true });
const capture = spawnSync('node', [
  'scripts/capture-release-proof.mjs',
  '--candidate', candidate,
  '--native', root,
  '--derived-data', derivedData,
  '--simulator', udid,
  '--stamp-production',
  '--out', evidence,
], { stdio: 'inherit', env: productionEnv });
if (capture.status !== 0) stop('the release-proof capture failed. Its [cvl] line names the check');
// The release gate QUALITY.md requires. verify:release always exits 1, because
// it reports the IPA, signing, upload and device gates as open. The IPA check
// and App Review cover those. A matching simulator record prints GATE_MATCH.
const gate = spawnSync('bun', ['run', 'verify:release'], {
  encoding: 'utf8',
  env: { ...process.env, CVL_RELEASE_PROOF: record },
});
process.stdout.write(gate.stdout ?? '');
process.stderr.write(gate.stderr ?? '');
if (!(gate.stdout ?? '').includes(GATE_MATCH)) stop('verify:release did not match the simulator record');

// 6. What reaches the bundle.
const app = inspectBuiltApp(JSON.parse(readFileSync(record, 'utf8')).artifact.appPath);
if (!app.ok) stop(`${app.code}: ${app.reason}`);
const expectedVersion = JSON.parse(readFileSync('app.json', 'utf8')).expo.version;
if (app.version !== expectedVersion) stop(`the app is version ${app.version}. Expected ${expectedVersion}`);
const problems = bundleProblems(readFileSync(app.jsBundlePath).toString('latin1'), backendUrl);
if (problems.length) stop(problems.join('. '));
if (readFileSync(app.executablePath).includes('EXDevLauncher')) stop('the binary contains the Expo dev launcher');

// The IPA check prints the same hash. Equal hashes mean the smoke ran the JS that ships.
log(`PASS ${JSON.stringify({
  commit,
  version: app.version,
  simulator: SIMULATOR,
  udid,
  record,
  candidate,
  bundleSha256: app.jsBundleSha256,
})}`);

function prepareCandidate(path) {
  if (!existsSync(path)) {
    run('git', ['worktree', 'add', '--detach', path, commit]);
    return;
  }
  if (output('git', ['-C', path, 'rev-parse', 'HEAD']) !== commit || output('git', ['-C', path, 'status', '--porcelain'])) {
    stop(`${path} is not a clean worktree at ${commit}. Ask before you replace it`);
  }
}

function findSimulator() {
  const udids = simulatorUdids(JSON.parse(output('flowdeck', ['simulator', 'list', '--json'])), SIMULATOR);
  if (udids.length === 0) {
    stop(`no simulator is named "${SIMULATOR}". Create it with flowdeck simulator create --name "${SIMULATOR}" --device-type "iPhone 17 Pro" --runtime <newest iOS>`);
  }
  if (udids.length > 1) stop(`${udids.length} simulators are named "${SIMULATOR}". Keep one`);
  return udids[0];
}

function log(message) {
  console.log(`[release-smoke] ${message}`);
}

function stop(message) {
  console.error(`[release-smoke] FAIL ${message}`);
  process.exit(1);
}

function run(command, args, options = {}) {
  try {
    execFileSync(command, args, { stdio: 'inherit', ...options });
  } catch {
    stop(`${command} ${args.join(' ')} exited non-zero`);
  }
}

function output(command, args) {
  return execFileSync(command, args, { encoding: 'utf8' }).trim();
}
