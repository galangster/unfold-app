import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { PROTECTED_FILES } from '../release-proof-lib.mjs';
import {
  DRIFT_NORMALIZERS,
  PODFILE_LOCK,
  PROJECT_FILE,
  builtFiles,
  bundleProblems,
  parseEasEnvList,
  podVersions,
  productionBuildEnv,
  simulatorUdids,
} from '../release-smoke-lib.mjs';

const SCRIPT = fileURLToPath(new URL('../release-smoke.mjs', import.meta.url));

const LOCKFILE_TEXT = `PODS:
  - ExpoWidgets (57.0.4):
    - ExpoModulesCore
  - libwebp (1.5.0)

DEPENDENCIES:
  - ExpoWidgets (from \`../node_modules/expo-widgets/ios\`)

SPEC CHECKSUMS:
  ExpoWidgets: 95c4223fb8b296ec4ef8f7a0eeeb470b33b8062d
`;

const PROJECT_TEXT = `
		F4AA6B04106CE3B1D8CF4DB1 /* UnfoldVerse.swift in Sources */ = {isa = PBXBuildFile; fileRef = 7C61D49366EB3439DEBEA1EB /* UnfoldVerse.swift */; };
		166A1EF854A44FD8B8DB41C0 /* Inter_700Bold.ttf in Resources */ = {isa = PBXBuildFile; fileRef = 3DB3EE1D35624179A8E7F79A /* Inter_700Bold.ttf */; };
`;

// The committed widget entry. Its build phase name has more than one word.
const WIDGET_ENTRY =
  '\t\tE63BE6E347E84A3898A30B07 /* ExpoWidgetsTarget.appex in Embed Foundation Extensions */ = {isa = PBXBuildFile; fileRef = 334F1374FB8F4DD28C362129 /* ExpoWidgetsTarget.appex */; };\n';

const BACKEND = 'https://api.unfoldapp.co';

test('the drift normalizers cover exactly the release-proof protected files', () => {
  assert.deepEqual([...DRIFT_NORMALIZERS.keys()].sort(), [...PROTECTED_FILES].sort());
});

test('each drift normalizer reads its own file', () => {
  assert.equal(DRIFT_NORMALIZERS.get(PODFILE_LOCK), podVersions);
  assert.equal(DRIFT_NORMALIZERS.get(PROJECT_FILE), builtFiles);
  assert.notEqual(podVersions(LOCKFILE_TEXT), '');
  assert.notEqual(builtFiles(PROJECT_TEXT), '');
});

test('podVersions ignores the spec checksums every pod install rewrites', () => {
  const resigned = LOCKFILE_TEXT.replace(
    '95c4223fb8b296ec4ef8f7a0eeeb470b33b8062d',
    '7217b543559f469527809fbfdf83acf90bbfdea1',
  );
  assert.equal(podVersions(resigned), podVersions(LOCKFILE_TEXT));
});

test('podVersions sees a pod resolve to another version', () => {
  assert.notEqual(podVersions(LOCKFILE_TEXT.replace('libwebp (1.5.0)', 'libwebp (1.6.0)')), podVersions(LOCKFILE_TEXT));
});

test('builtFiles ignores the build-file IDs every pod install rewrites', () => {
  const rewritten = PROJECT_TEXT.replace('F4AA6B04106CE3B1D8CF4DB1', '0A1B2C3D4E5F60718293A4B5').replace(
    '166A1EF854A44FD8B8DB41C0',
    '9F8E7D6C5B4A39281706F5E4',
  );
  assert.equal(builtFiles(rewritten), builtFiles(PROJECT_TEXT));
});

test('builtFiles sees a file dropped from the build', () => {
  const dropped = PROJECT_TEXT.split('\n')
    .filter((line) => !line.includes('UnfoldVerse.swift in Sources'))
    .join('\n');
  assert.notEqual(builtFiles(dropped), builtFiles(PROJECT_TEXT));
});

test('builtFiles sees the widget extension dropped from the build', () => {
  const withWidget = PROJECT_TEXT + WIDGET_ENTRY;
  assert.match(builtFiles(withWidget), /^ExpoWidgetsTarget\.appex in Embed Foundation Extensions$/m);
  assert.notEqual(builtFiles(withWidget), builtFiles(PROJECT_TEXT));
});

test('parseEasEnvList keeps readable values and skips masked secrets and other lines', () => {
  const listing = [
    '★ eas-cli@24.12.0 is now available.',
    'Environment: production',
    'EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY=pk_test_example',
    "SENTRY_AUTH_TOKEN=***** (This is a secret env variable that can only be accessed on EAS builder and can't be read in any UI. Learn more.)",
  ].join('\n');
  assert.deepEqual(parseEasEnvList(listing), { EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY: 'pk_test_example' });
});

test('productionBuildEnv drops EXPO_PUBLIC_* values from the shell and lets later sources win', () => {
  const shell = { PATH: '/usr/bin', EXPO_PUBLIC_ENABLE_VOICE_CHECK_INS: '1', EXPO_PUBLIC_BACKEND_URL: 'http://localhost:4000' };
  const easVariables = { EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY: 'pk_test_example', EXPO_PUBLIC_BACKEND_URL: 'https://stale.example.com' };
  const profileEnv = { EXPO_PUBLIC_BACKEND_URL: BACKEND };
  assert.deepEqual(productionBuildEnv(shell, easVariables, profileEnv, { EAS_BUILD_PROFILE: 'production' }), {
    PATH: '/usr/bin',
    EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY: 'pk_test_example',
    EXPO_PUBLIC_BACKEND_URL: BACKEND,
    EAS_BUILD_PROFILE: 'production',
  });
});

test('bundleProblems passes a production bundle with only the library local URLs', () => {
  const bundle = `${BACKEND} http://localhost:8081 http://localhost:3000 http://localhost:8969`;
  assert.deepEqual(bundleProblems(bundle, BACKEND), []);
});

test('bundleProblems refuses a bundle without the production backend', () => {
  assert.deepEqual(bundleProblems('https://example.com', BACKEND), [`the bundle does not name ${BACKEND}`]);
});

test('bundleProblems refuses dev hosts and unknown local URLs', () => {
  const bundle = `${BACKEND} https://unfold-dev.up.railway.app http://localhost:4000`;
  assert.deepEqual(bundleProblems(bundle, BACKEND), [
    'the bundle names dev hosts: https://unfold-dev.up.railway.app',
    'the bundle names local URLs: http://localhost:4000',
  ]);
});

test('simulatorUdids matches the name in FlowDeck simulator list output', () => {
  const simulators = [
    { name: 'iPhone 17', udid: 'A' },
    { name: 'Unfold Release Smoke', udid: 'B' },
  ];
  assert.deepEqual(simulatorUdids(simulators, 'Unfold Release Smoke'), ['B']);
});

// The CLI's preflight refusals, each in a throwaway repository.
const repos = [];
afterEach(() => {
  for (const repo of repos.splice(0)) rmSync(repo, { recursive: true, force: true });
});

function fixtureRepo({ detached = true, ignore = [] } = {}) {
  const repo = mkdtempSync(join(tmpdir(), 'release-smoke-test-'));
  repos.push(repo);
  const git = (...args) => spawnSync('git', args, { cwd: repo, encoding: 'utf8' });
  git('init', '-q', '-b', 'main');
  writeFileSync(join(repo, '.gitignore'), `${ignore.join('\n')}\n`);
  mkdirSync(join(repo, 'src/app'), { recursive: true });
  writeFileSync(join(repo, 'src/app/index.tsx'), 'export default null;\n');
  git('add', '.');
  git('-c', 'user.name=Fixture', '-c', 'user.email=fixture@example.com', 'commit', '-q', '-m', 'fixture');
  if (detached) git('checkout', '-q', '--detach');
  return repo;
}

function runCli(repo) {
  return spawnSync('node', [SCRIPT], { cwd: repo, encoding: 'utf8' });
}

test('the CLI refuses a checkout on a branch', () => {
  const result = runCli(fixtureRepo({ detached: false }));
  assert.equal(result.status, 1);
  assert.match(result.stderr, /FAIL run this from a detached worktree/);
});

test('the CLI refuses a worktree with local changes', () => {
  const repo = fixtureRepo();
  writeFileSync(join(repo, 'stray.txt'), 'left behind\n');
  const result = runCli(repo);
  assert.equal(result.status, 1);
  assert.match(result.stderr, /FAIL the worktree has local changes/);
});

test('the CLI refuses a linked node_modules', () => {
  const repo = fixtureRepo({ ignore: ['node_modules'] });
  symlinkSync(tmpdir(), join(repo, 'node_modules'));
  const result = runCli(repo);
  assert.equal(result.status, 1);
  assert.match(result.stderr, /FAIL node_modules is a link/);
});

test('the CLI refuses __break-* routes', () => {
  const repo = fixtureRepo({ ignore: ['src/app/__break-*'] });
  writeFileSync(join(repo, 'src/app/__break-crash.tsx'), 'export default null;\n');
  const result = runCli(repo);
  assert.equal(result.status, 1);
  assert.match(result.stderr, /FAIL src\/app holds __break-\* routes/);
});
