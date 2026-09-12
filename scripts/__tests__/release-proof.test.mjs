import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { afterEach, test } from 'node:test';
import { fileURLToPath } from 'node:url';
import {
  HEALTHY_BOOT_MS,
  analyzeBuildLog,
  captureSimulatorReleaseProof,
  evaluateReleaseGate,
  evaluateSimulatorReleaseProof,
  readCandidateManifest,
  readPreparedInputs,
  sha256Text,
} from '../release-proof-lib.mjs';

const testsDir = dirname(fileURLToPath(import.meta.url));
const scriptsDir = join(testsDir, '..');
const temps = [];
const SIM = 'AEDD3F7A-E96C-4826-A6C2-EC201FD82C87';

afterEach(() => {
  while (temps.length > 0) {
    rmSync(temps.pop(), { recursive: true, force: true });
  }
});

function tempDir(prefix) {
  const dir = mkdtempSync(join(tmpdir(), prefix));
  temps.push(dir);
  return dir;
}

function git(cwd, args) {
  const result = spawnSync('git', args, { cwd, encoding: 'utf8' });
  assert.equal(result.status, 0, result.stderr || result.stdout);
  return result.stdout.trim();
}

function writePlist(target, profile = '$(EAS_BUILD_PROFILE)', { version = '1.1.4', build = '183' } = {}) {
  writeFileSync(
    target,
    `<?xml version="1.0" encoding="UTF-8"?>
<plist version="1.0">
  <dict>
    <key>CFBundleIdentifier</key>
    <string>com.unfoldapp.ios</string>
    <key>CFBundleShortVersionString</key>
    <string>${version}</string>
    <key>CFBundleVersion</key>
    <string>${build}</string>
    <key>CFBundleExecutable</key>
    <string>Unfold</string>
    <key>UNFOLDBuildProfile</key>
    <string>${profile}</string>
  </dict>
</plist>
`,
  );
}

function writeApp(appPath, profile = 'production') {
  mkdirSync(appPath, { recursive: true });
  writePlist(join(appPath, 'Info.plist'), profile);
  writeFileSync(join(appPath, 'Unfold'), 'synthetic-unfold-executable\n');
  writeFileSync(join(appPath, 'main.jsbundle'), 'synthetic-main-jsbundle\n');
  return appPath;
}

function buildLog({ derivedData, simulator = SIM, configuration = 'Release', workspace }) {
  return [
    {
      payload: { type: 'status', stage: 'VALIDATE_CONFIGURATION', operation: 'BUILD', message: 'Validating configuration...' },
      schemaVersion: '1.0.0',
    },
    {
      type: 'configuration',
      message: 'Configuration: Unfold',
      schemaVersion: '1.0.0',
      timestamp: '2026-09-05T22:23:36.872Z',
      data: {
        configuration,
        workspace,
        derivedDataPath: derivedData,
        simulator,
        scheme: 'Unfold',
        platform: 'iOS Simulator',
      },
    },
    { payload: { type: 'status', stage: 'BUILD_APP', operation: 'BUILD', message: 'Building app...' }, schemaVersion: '1.0.0' },
    {
      payload: {
        type: 'result',
        operation: 'BUILD',
        success: true,
        message: 'BUILD succeeded',
        timestamp: '2026-09-05T22:25:26.104Z',
      },
      schemaVersion: '1.0.0',
    },
  ]
    .map((event) => JSON.stringify(event))
    .join('\n');
}

function launchLog({
  simulator = SIM,
  success = true,
  rebuild = false,
  registered = true,
  projectPath,
  logPath,
} = {}) {
  const events = [
    { payload: { type: 'status', stage: 'PRE_LAUNCH_CLEANUP', operation: 'LAUNCH', message: 'Cleaning up previous instances...' } },
    { payload: { type: 'status', stage: 'INSTALL_APP', operation: 'LAUNCH', message: 'Installing app...' } },
    { payload: { type: 'status', stage: 'LAUNCH_APP', operation: 'LAUNCH', message: 'Launching app...' } },
  ];
  if (rebuild) {
    events.unshift({ payload: { type: 'status', stage: 'BUILD_APP', operation: 'BUILD', message: 'Building app...' } });
  }
  if (registered) {
    events.push({
      type: 'app_registered',
      operation: 'LAUNCH',
      timestamp: '2026-09-05T22:31:39.534Z',
      message: 'App registered: com.unfoldapp.ios',
      schemaVersion: '1.0.0',
      data: {
        appPid: 28425,
        scheme: 'Unfold',
        id: '6C779498-8EA1-4869-B097-E11A7C73F2E8',
        launchType: 'simulator',
        bundleId: 'com.unfoldapp.ios',
        targetUdid: simulator,
        projectPath,
        logPath,
        shortId: '6C779498',
      },
    });
    events.push({ payload: { type: 'status', stage: 'RUNNING', operation: 'LAUNCH', message: 'Running', timestamp: '2026-09-05T22:31:39.540Z' } });
  }
  if (success === false) {
    events.push({
      payload: {
        type: 'result',
        operation: 'LAUNCH',
        success: false,
        message: 'LAUNCH failed',
        timestamp: '2026-09-05T22:31:40.000Z',
      },
    });
  }
  return events.map((event) => JSON.stringify(event)).join('\n');
}

function screenJson({
  simulator = SIM,
  label = 'Unfold',
  elementCount = 13,
  timestamp = '2026-09-05T22:32:20Z',
  splashOnly = false,
} = {}) {
  const tree = [
    {
      role: 'Application',
      label,
      visible: true,
      enabled: true,
      ref: 'e0',
    },
  ];
  if (splashOnly) {
    tree.push({ role: 'Image', label: 'Splash', visible: true, enabled: true, ref: 'e1' });
  } else if (elementCount > 1) {
    tree.push({ role: 'StaticText', label: 'Good afternoon', visible: true, enabled: true, ref: 'e1' });
    tree.push({
      role: 'Button',
      label: 'Journal tab',
      id: 'bottom-tab-journal',
      visible: true,
      enabled: true,
      ref: 'e12',
    });
  }
  return `${JSON.stringify({
    schema: 'flowdeck.ui',
    schemaVersion: '1.0.0',
    type: 'ui_snapshot',
    success: true,
    timestamp,
    simulator: { name: 'Simulator', runtime: 'iOS', udid: simulator },
    accessibility: {
      element_count: elementCount,
      screen_hash: 'b26ede15b4f8be62',
      tree_mode: 'full',
      tree,
    },
  })}\n`;
}

function seedRepo(dir) {
  mkdirSync(join(dir, 'ios/Unfold.xcodeproj'), { recursive: true });
  mkdirSync(join(dir, 'ios/Unfold'), { recursive: true });
  mkdirSync(join(dir, 'ios/Unfold.xcworkspace'), { recursive: true });
  mkdirSync(join(dir, 'scripts'), { recursive: true });
  writeFileSync(
    join(dir, 'ios/Unfold.xcworkspace/contents.xcworkspacedata'),
    '<?xml version="1.0" encoding="UTF-8"?>\n<Workspace version="1.0"></Workspace>\n',
  );
  writeFileSync(
    join(dir, 'eas.json'),
    `${JSON.stringify({
      build: {
        'qa-testflight': { env: { EXPO_PUBLIC_ENABLE_QA_TOOLS: '1' } },
        production: { env: { EAS_USE_CACHE: '1' } },
      },
    })}\n`,
  );
  writePlist(join(dir, 'ios/Unfold/Info.plist'));
  writeFileSync(join(dir, 'ios/Podfile.lock'), 'PODFILE.lock fixture\n');
  writeFileSync(join(dir, 'ios/Unfold.xcodeproj/project.pbxproj'), 'pbxproj fixture\n');
  writeFileSync(join(dir, 'scripts/stamp-build-profile.mjs'), 'export const stamp = true;\n');
  git(dir, ['init']);
  git(dir, ['config', 'user.email', 'release-proof@test.local']);
  git(dir, ['config', 'user.name', 'Release Proof']);
  git(dir, ['add', '.']);
  git(dir, ['commit', '-m', 'fixture']);
}

function copyTree(from, to) {
  const files = git(from, ['ls-files']).split('\n').filter(Boolean);
  for (const file of files) {
    const target = join(to, file);
    mkdirSync(dirname(target), { recursive: true });
    writeFileSync(target, readFileSync(join(from, file)));
  }
  git(to, ['init']);
  git(to, ['config', 'user.email', 'release-proof@test.local']);
  git(to, ['config', 'user.name', 'Release Proof']);
  git(to, ['add', '.']);
  git(to, ['commit', '-m', 'native fixture']);
}

function stampNative(nativeDir) {
  const source = readFileSync(join(nativeDir, 'ios/Unfold/Info.plist'), 'utf8');
  writeFileSync(join(nativeDir, 'ios/Unfold/Info.plist'), source.replace('$(EAS_BUILD_PROFILE)', 'production'));
}

function makeHarness(overrides = {}) {
  const root = tempDir('unfold-rp1-');
  const candidateDir = join(root, 'candidate');
  const nativeDir = join(root, 'native');
  const derivedData = join(root, 'derived');
  const outPath = join(root, 'artifacts');
  mkdirSync(candidateDir);
  mkdirSync(nativeDir);
  seedRepo(candidateDir);
  copyTree(candidateDir, nativeDir);
  if (overrides.extraNativeCommit) {
    writeFileSync(join(nativeDir, 'native-only.txt'), 'native head marker\n');
    git(nativeDir, ['add', 'native-only.txt']);
    git(nativeDir, ['commit', '-m', 'native diverges']);
  }
  if (overrides.stamp !== false) stampNative(nativeDir);
  const appPath = join(derivedData, 'Build/Products/Release-iphonesimulator/Unfold.app');
  const appLogPath = join(derivedData, 'Logs/com.unfoldapp.ios_6C779498-8EA1-4869-B097-E11A7C73F2E8.log');
  const created = { build: false, run: false, screen: false, args: [], envs: [], waitMs: [] };
  const stub = overrides.stub || ((argv, ctx = {}) => {
    created.args.push(argv.slice());
    created.envs.push({ cmd: argv[0], env: ctx.env || {} });
    const cmd = argv[0];
    if (cmd === 'build') {
      created.build = true;
      writeApp(appPath, overrides.appProfile || 'production');
      if (overrides.omitBundle) rmSync(join(appPath, 'main.jsbundle'));
      return {
        status: 0,
        stdout: buildLog({
          derivedData,
          simulator: overrides.buildSimulator || SIM,
          configuration: overrides.configuration,
          workspace: overrides.workspace || join(nativeDir, 'ios/Unfold.xcworkspace'),
        }),
      };
    }
    if (cmd === 'run') {
      created.run = true;
      mkdirSync(dirname(appLogPath), { recursive: true });
      writeFileSync(appLogPath, 'flowdeck app log\n');
      return {
        status: overrides.launchStatus ?? 0,
        stdout: launchLog({
          simulator: overrides.launchSimulator || SIM,
          success: overrides.launchSuccess,
          rebuild: overrides.rebuild,
          registered: overrides.registered,
          projectPath: overrides.projectPath || nativeDir,
          logPath: overrides.launchLogPath || appLogPath,
        }),
      };
    }
    if (cmd === 'ui') {
      created.screen = true;
      return {
        status: overrides.screenStatus ?? 0,
        stdout: screenJson({
          simulator: overrides.screenSimulator || SIM,
          label: overrides.screenLabel,
          elementCount: overrides.elementCount,
          timestamp: overrides.screenTimestamp,
          splashOnly: overrides.splashOnly,
        }),
      };
    }
    return { status: 1, stdout: '', stderr: `unexpected ${argv.join(' ')}` };
  });
  return {
    root,
    candidateDir,
    nativeDir,
    derivedData,
    outPath,
    appPath,
    created,
    capture(extra = {}) {
      return captureSimulatorReleaseProof({
        candidateDir,
        nativeDir,
        derivedData,
        simulator: SIM,
        outPath,
        stampProduction: overrides.stamp !== false,
        runFlowDeck: stub,
        wait: (ms) => {
          created.waitMs.push(ms);
        },
        ...extra,
      });
    },
  };
}

function runScript(scriptName, { cwd, env, args = [] }) {
  return spawnSync(process.execPath, [join(scriptsDir, scriptName), ...args], {
    cwd,
    encoding: 'utf8',
    env: { ...process.env, ...env },
  });
}

test('matching observed FlowDeck fixture captures and evaluates; release stays incomplete', () => {
  const fx = makeHarness({ extraNativeCommit: true });
  const captured = fx.capture();
  assert.equal(captured.ok, true, captured.reason);
  assert.equal(captured.record.source.candidateTree, git(fx.candidateDir, ['rev-parse', 'HEAD^{tree}']));
  assert.notEqual(captured.record.source.nativeHead, captured.record.source.candidateCommit);
  assert.deepEqual(fx.created.args[0], ['build', '-C', 'Release', '-d', fx.derivedData, '-S', SIM, '--json']);
  assert.deepEqual(fx.created.args[1], ['run', '--no-build', '-C', 'Release', '-d', fx.derivedData, '-S', SIM, '--json']);
  assert.ok(fx.created.args[2].includes('screen'));
  assert.equal(captured.record.build.configuration.workspace, join(fx.nativeDir, 'ios/Unfold.xcworkspace'));
  assert.match(captured.record.artifact.infoPlistSha256, /^[0-9a-f]{64}$/);
  assert.ok(captured.record.notProven.includes('dependency-tree'));
  assert.ok(captured.record.notProven.includes('ignored-environment'));
  assert.deepEqual(fx.created.waitMs, [HEALTHY_BOOT_MS]);
  for (const row of fx.created.envs.filter((entry) => entry.cmd === 'build' || entry.cmd === 'run')) {
    assert.equal(row.env.SENTRY_DISABLE_AUTO_UPLOAD, 'true');
  }

  const simulator = evaluateSimulatorReleaseProof({ recordPath: captured.recordPath });
  assert.equal(simulator.ok, true, simulator.reason);
  const gate = evaluateReleaseGate({ recordPath: captured.recordPath });
  assert.equal(gate.ok, false);
  assert.equal(gate.code, 'incomplete-release');

  const release = runScript('verify-release.mjs', {
    cwd: fx.nativeDir,
    env: { CVL_RELEASE_PROOF: captured.recordPath, CI: 'true' },
  });
  assert.notEqual(release.status, 0);
  assert.match(release.stdout, /simulator-artifact MATCH/);
  assert.doesNotMatch(`${release.stdout}\n${release.stderr}`, /verify:release PASS/);
  assert.match(release.stderr, /App Store IPA/);

  const device = runScript('verify-device-flow.mjs', {
    cwd: fx.nativeDir,
    env: { CVL_REQUIRE_DEVICE_PROOF: '1', CVL_RELEASE_PROOF: captured.recordPath, CI: 'true' },
  });
  assert.equal(device.status, 0, device.stderr);
  assert.match(device.stdout, /MATCH simulator-release evidence/);
});

test('capture refuses an old artifact sitting in derived-data after a later source commit', () => {
  const fx = makeHarness();
  writeApp(fx.appPath);
  writeFileSync(join(fx.candidateDir, 'source.txt'), 'new source after old app\n');
  git(fx.candidateDir, ['add', 'source.txt']);
  git(fx.candidateDir, ['commit', '-m', 'new source']);
  writeFileSync(join(fx.nativeDir, 'source.txt'), 'new source after old app\n');
  const captured = fx.capture();
  assert.equal(captured.ok, false);
  assert.equal(captured.code, 'stale-artifact');
});

test('explicit failed FlowDeck launch cannot pass', () => {
  const fx = makeHarness({ launchSuccess: false });
  const captured = fx.capture();
  assert.equal(captured.ok, false);
  assert.equal(captured.code, 'launch-failed');
});

test('unrelated or changed evidence cannot pass', () => {
  const fx = makeHarness();
  const captured = fx.capture();
  assert.equal(captured.ok, true, captured.reason);
  writeFileSync(captured.record.logs.launchLog, 'Unrelated nonempty text without any FlowDeck event\n');
  const changed = evaluateSimulatorReleaseProof({ recordPath: captured.recordPath });
  assert.equal(changed.ok, false);
  assert.equal(changed.code, 'changed-log');
});

test('undefined production-prefix profile cannot pass', () => {
  const fx = makeHarness({ appProfile: 'production-debug-unrecognized' });
  const captured = fx.capture();
  assert.equal(captured.ok, false);
  assert.equal(captured.code, 'development-profile');
});

test('missing proof and optional skip stay distinct', () => {
  const fx = makeHarness();
  const release = runScript('verify-release.mjs', { cwd: fx.nativeDir, env: { CI: 'true' } });
  assert.notEqual(release.status, 0);
  assert.doesNotMatch(`${release.stdout}\n${release.stderr}`, /verify:release PASS/);
  assert.match(release.stderr, /skipped device check is not release proof|CVL_RELEASE_PROOF/);

  const required = runScript('verify-device-flow.mjs', {
    cwd: fx.nativeDir,
    env: { CVL_REQUIRE_DEVICE_PROOF: '1', CI: 'true' },
  });
  assert.notEqual(required.status, 0);
  assert.doesNotMatch(required.stdout, /skipping live device flow audit/);

  const optional = runScript('verify-device-flow.mjs', { cwd: fx.nativeDir, env: { CI: 'true' } });
  assert.equal(optional.status, 0);
  assert.match(optional.stdout, /skipping live device flow audit/);
});

test('wrong target or Release configuration cannot pass', () => {
  const wrongTarget = makeHarness({ launchSimulator: 'D5BF1CF9-5835-47AB-A7B0-F644A28D6100' });
  const target = wrongTarget.capture();
  assert.equal(target.ok, false);
  assert.equal(target.code, 'wrong-target');

  const wrongConfig = makeHarness({ configuration: 'Debug' });
  const config = wrongConfig.capture();
  assert.equal(config.ok, false);
  assert.equal(config.code, 'wrong-configuration');

  const wrongProject = makeHarness({ projectPath: '/tmp/unfold-unrelated-project' });
  const project = wrongProject.capture();
  assert.equal(project.ok, false);
  assert.equal(project.code, 'wrong-target');

  const wrongLog = makeHarness({ launchLogPath: '/tmp/unfold-unrelated.log' });
  const logPath = wrongLog.capture();
  assert.equal(logPath.ok, false);
  assert.equal(logPath.code, 'missing-runtime');
});

test('missing bundle, rebuild, and immediate crash cannot pass', () => {
  const missing = makeHarness({ omitBundle: true });
  const noBundle = missing.capture();
  assert.equal(noBundle.ok, false);
  assert.equal(noBundle.code, 'missing-bundle');

  const rebuilt = makeHarness({ rebuild: true });
  const rebuild = rebuilt.capture();
  assert.equal(rebuild.ok, false);
  assert.equal(rebuild.code, 'unexpected-rebuild');

  const crash = makeHarness({ screenLabel: 'SpringBoard', elementCount: 1 });
  const crashed = crash.capture();
  assert.equal(crashed.ok, false);
  assert.equal(crashed.code, 'immediate-crash');
});

test('caller-supplied success assertion and inside-repo proof path cannot pass', () => {
  const fx = makeHarness();
  const asserted = fx.capture({ runtimeStatus: 'pass' });
  assert.equal(asserted.ok, false);
  assert.equal(asserted.code, 'unbound-assertion');

  const inside = captureSimulatorReleaseProof({
    candidateDir: fx.candidateDir,
    nativeDir: fx.nativeDir,
    derivedData: fx.derivedData,
    simulator: SIM,
    outPath: join(fx.nativeDir, '.release-proof.json'),
    stampProduction: true,
    runFlowDeck: () => ({ status: 0, stdout: '' }),
    wait: () => {},
  });
  assert.equal(inside.ok, false);
  assert.equal(inside.code, 'evidence-location');
});

test('capture CLI rejects caller-supplied runtime status', () => {
  const fx = makeHarness();
  const result = runScript('capture-release-proof.mjs', {
    cwd: fx.nativeDir,
    args: [
      '--candidate',
      fx.candidateDir,
      '--native',
      fx.nativeDir,
      '--derived-data',
      fx.derivedData,
      '--simulator',
      SIM,
      '--out',
      fx.outPath,
      '--runtime-status',
      'pass',
    ],
  });
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /runtime-status|--app/);
});

test('build and run force SENTRY_DISABLE_AUTO_UPLOAD without printing secrets', () => {
  const fx = makeHarness();
  const captured = fx.capture({
    env: {
      SENTRY_DISABLE_AUTO_UPLOAD: 'false',
      SENTRY_AUTH_TOKEN: 'secret-token-do-not-print',
    },
  });
  assert.equal(captured.ok, true, captured.reason);
  const commandEnvs = fx.created.envs.filter((entry) => entry.cmd === 'build' || entry.cmd === 'run');
  assert.equal(commandEnvs.length, 2);
  for (const row of commandEnvs) {
    assert.equal(row.env.SENTRY_DISABLE_AUTO_UPLOAD, 'true');
    assert.equal(row.env.SENTRY_AUTH_TOKEN, 'secret-token-do-not-print');
  }
  const dumped = JSON.stringify(captured.record);
  assert.doesNotMatch(dumped, /secret-token-do-not-print/);
  assert.doesNotMatch(dumped, /SENTRY_AUTH_TOKEN/);
});

test('evaluation succeeds after native overlay restore; candidate/manifest/log/artifact drift still fail', () => {
  const fx = makeHarness();
  const captured = fx.capture();
  assert.equal(captured.ok, true, captured.reason);
  writePlist(join(fx.nativeDir, 'ios/Unfold/Info.plist'));
  const restored = evaluateSimulatorReleaseProof({ recordPath: captured.recordPath });
  assert.equal(restored.ok, true, restored.reason);

  writeFileSync(join(fx.candidateDir, 'source.txt'), 'candidate drifted\n');
  git(fx.candidateDir, ['add', 'source.txt']);
  git(fx.candidateDir, ['commit', '-m', 'candidate drift']);
  const drifted = evaluateSimulatorReleaseProof({ recordPath: captured.recordPath });
  assert.equal(drifted.ok, false);
  assert.equal(drifted.code, 'stale-source');

  git(fx.candidateDir, ['reset', '--hard', captured.record.source.candidateCommit]);
  const record = JSON.parse(readFileSync(captured.recordPath, 'utf8'));
  record.inputs.manifest[0].expectedSha256 = '0'.repeat(64);
  writeFileSync(captured.recordPath, `${JSON.stringify(record)}\n`);
  const tampered = evaluateSimulatorReleaseProof({ recordPath: captured.recordPath });
  assert.equal(tampered.ok, false);
  assert.equal(tampered.code, 'stale-inputs');

  writeFileSync(captured.recordPath, `${JSON.stringify(captured.record)}\n`);
  const originalLaunch = readFileSync(captured.record.logs.launchLog);
  writeFileSync(captured.record.logs.launchLog, 'Unrelated nonempty text without any FlowDeck event\n');
  const logDrift = evaluateSimulatorReleaseProof({ recordPath: captured.recordPath });
  assert.equal(logDrift.ok, false);
  assert.equal(logDrift.code, 'changed-log');

  writeFileSync(captured.record.logs.launchLog, originalLaunch);
  writePlist(join(fx.appPath, 'Info.plist'), 'production', { version: '9.9.9' });
  const metadataDrift = evaluateSimulatorReleaseProof({ recordPath: captured.recordPath });
  assert.equal(metadataDrift.ok, false);
  assert.equal(metadataDrift.code, 'stale-hash');

  writePlist(join(fx.appPath, 'Info.plist'), 'production');
  writeFileSync(join(fx.appPath, 'Unfold'), 'mutated-executable\n');
  const artifactDrift = evaluateSimulatorReleaseProof({ recordPath: captured.recordPath });
  assert.equal(artifactDrift.ok, false);
  assert.equal(artifactDrift.code, 'stale-hash');
});

test('too-early and splash-only observations cannot pass', () => {
  const early = makeHarness({ screenTimestamp: '2026-09-05T22:31:40Z' });
  const tooEarly = early.capture();
  assert.equal(tooEarly.ok, false);
  assert.equal(tooEarly.code, 'too-early-observation');

  const splash = makeHarness({ splashOnly: true, screenTimestamp: '2026-09-05T22:32:20Z' });
  const splashOnly = splash.capture();
  assert.equal(splashOnly.ok, false);
  assert.equal(splashOnly.code, 'splash-only');
});

test('directory symlink in a clean candidate and prepared native binds target and kind', () => {
  const fx = makeHarness();
  const targetDir = tempDir('unfold-skill-target-');
  writeFileSync(join(targetDir, 'SKILL.md'), 'skill\n');
  mkdirSync(join(fx.candidateDir, 'skills'));
  mkdirSync(join(fx.nativeDir, 'skills'));
  symlinkSync(targetDir, join(fx.candidateDir, 'skills/link'));
  symlinkSync(targetDir, join(fx.nativeDir, 'skills/link'));
  git(fx.candidateDir, ['add', 'skills/link']);
  git(fx.candidateDir, ['commit', '-m', 'skill dir link']);

  const candidate = readCandidateManifest(fx.candidateDir, true);
  assert.equal(candidate.ok, true, candidate.reason);
  const link = candidate.manifest.find((entry) => entry.path === 'skills/link');
  assert.equal(link.kind, 'symlink');
  assert.equal(link.linkTarget, targetDir);
  assert.equal(link.candidateSha256, sha256Text(targetDir));
  assert.equal(link.expectedSha256, sha256Text(targetDir));

  const prepared = readPreparedInputs({
    candidateDir: fx.candidateDir,
    nativeDir: fx.nativeDir,
    stampProduction: true,
  });
  assert.equal(prepared.ok, true, prepared.reason);

  const captured = fx.capture();
  assert.equal(captured.ok, true, captured.reason);
  const capturedLink = captured.record.inputs.manifest.find((entry) => entry.path === 'skills/link');
  assert.equal(capturedLink.kind, 'symlink');
  assert.equal(capturedLink.linkTarget, targetDir);
});

test('mismatched symlink target or kind cannot pass prepared input validation', () => {
  const fx = makeHarness();
  const targetDir = tempDir('unfold-skill-target-');
  const otherDir = tempDir('unfold-skill-other-');
  writeFileSync(join(targetDir, 'SKILL.md'), 'skill\n');
  mkdirSync(join(fx.candidateDir, 'skills'));
  mkdirSync(join(fx.nativeDir, 'skills'));
  symlinkSync(targetDir, join(fx.candidateDir, 'skills/link'));
  symlinkSync(otherDir, join(fx.nativeDir, 'skills/link'));
  git(fx.candidateDir, ['add', 'skills/link']);
  git(fx.candidateDir, ['commit', '-m', 'skill dir link']);

  const targetMismatch = readPreparedInputs({
    candidateDir: fx.candidateDir,
    nativeDir: fx.nativeDir,
    stampProduction: true,
  });
  assert.equal(targetMismatch.ok, false);
  assert.equal(targetMismatch.code, 'stale-inputs');

  rmSync(join(fx.nativeDir, 'skills/link'));
  writeFileSync(join(fx.nativeDir, 'skills/link'), targetDir);
  const kindMismatch = readPreparedInputs({
    candidateDir: fx.candidateDir,
    nativeDir: fx.nativeDir,
    stampProduction: true,
  });
  assert.equal(kindMismatch.ok, false);
  assert.equal(kindMismatch.code, 'stale-inputs');
});

test('protected source files cannot be replaced with directory links', () => {
  const fx = makeHarness();
  const targetDir = tempDir('unfold-protected-target-');
  const lock = join(fx.candidateDir, 'ios/Podfile.lock');
  rmSync(lock);
  symlinkSync(targetDir, lock);
  git(fx.candidateDir, ['add', 'ios/Podfile.lock']);
  git(fx.candidateDir, ['commit', '-m', 'invalid protected link']);
  const candidate = readCandidateManifest(fx.candidateDir, true);
  assert.equal(candidate.ok, false);
  assert.equal(candidate.code, 'protected-hash');
});

test('dangling symlink binds target and does not throw', () => {
  const fx = makeHarness();
  const missing = join(tempDir('unfold-skill-missing-'), 'absent');
  mkdirSync(join(fx.candidateDir, 'skills'));
  symlinkSync(missing, join(fx.candidateDir, 'skills/link'));
  git(fx.candidateDir, ['add', 'skills/link']);
  git(fx.candidateDir, ['commit', '-m', 'dangling skill link']);
  const candidate = readCandidateManifest(fx.candidateDir, true);
  assert.equal(candidate.ok, true, candidate.reason);
  const link = candidate.manifest.find((entry) => entry.path === 'skills/link');
  assert.equal(link.kind, 'symlink');
  assert.equal(link.linkTarget, missing);
});

test('unrelated build workspace cannot pass capture or evaluation', () => {
  const unrelated = '/private/tmp/unrelated-ios/Unfold.xcworkspace';
  const captureFx = makeHarness({ workspace: unrelated });
  const captured = captureFx.capture();
  assert.equal(captured.ok, false);
  assert.equal(captured.code, 'wrong-workspace');

  const analyzed = analyzeBuildLog(
    buildLog({
      derivedData: '/private/tmp/synthetic-rp1-derived',
      workspace: unrelated,
    }),
    {
      derivedData: '/private/tmp/synthetic-rp1-derived',
      simulator: SIM,
      nativeDir: captureFx.nativeDir,
    },
  );
  assert.equal(analyzed.ok, false);
  assert.equal(analyzed.code, 'wrong-workspace');

  const evalFx = makeHarness();
  const ok = evalFx.capture();
  assert.equal(ok.ok, true, ok.reason);
  const rewritten = readFileSync(ok.record.logs.buildLog, 'utf8').replaceAll(
    ok.record.build.configuration.workspace,
    unrelated,
  );
  writeFileSync(ok.record.logs.buildLog, rewritten);
  const record = JSON.parse(readFileSync(ok.recordPath, 'utf8'));
  record.logs.buildLogSha256 = sha256Text(rewritten);
  writeFileSync(ok.recordPath, `${JSON.stringify(record)}\n`);
  const evaluated = evaluateSimulatorReleaseProof({ recordPath: ok.recordPath });
  assert.equal(evaluated.ok, false);
  assert.equal(evaluated.code, 'wrong-workspace');
});
