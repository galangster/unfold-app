import { createHash } from 'node:crypto';
import { execFileSync, spawnSync } from 'node:child_process';
import { existsSync, lstatSync, mkdirSync, readFileSync, readlinkSync, realpathSync, statSync, writeFileSync } from 'node:fs';
import { basename, dirname, isAbsolute, join, relative, resolve, sep } from 'node:path';

export const EXPECTED_BUNDLE_ID = 'com.unfoldapp.ios';
export const EXPECTED_PROFILE = 'production';
export const PROOF_SCHEMA = 'unfold.simulator-release-proof.v2';
export const PROOF_KIND = 'local-evidence-record';
export const PROTECTED_FILES = ['ios/Podfile.lock', 'ios/Unfold.xcodeproj/project.pbxproj'];
export const STAMP_PLIST = 'ios/Unfold/Info.plist';
export const EXPECTED_WORKSPACE = 'ios/Unfold.xcworkspace';
/** Same window as `HEALTHY_BOOT_MS` in src/lib/crash-marker.ts. */
export const HEALTHY_BOOT_MS = 30_000;
const STAMP_PATTERN = /(<key>UNFOLDBuildProfile<\/key>\s*<string>)([^<]*)(<\/string>)/;
const UUID_RE = /^[0-9A-Fa-f]{8}-[0-9A-Fa-f]{4}-[0-9A-Fa-f]{4}-[0-9A-Fa-f]{4}-[0-9A-Fa-f]{12}$/;
const SPLASH_RE = /splash|launch screen/i;

export function fail(code, reason) {
  return { ok: false, code, reason };
}

export function sha256File(filePath) {
  return createHash('sha256').update(readFileSync(filePath)).digest('hex');
}

export function sha256Text(text) {
  return createHash('sha256').update(text).digest('hex');
}

export function releaseProofRequired(env = process.env) {
  return env.CVL_REQUIRE_DEVICE_PROOF === '1' || env.CVL_RELEASE_REQUIRED === '1';
}

export function flowDeckCommandEnv(baseEnv = process.env) {
  return { ...baseEnv, SENTRY_DISABLE_AUTO_UPLOAD: 'true' };
}

export function expectedProductionStamp(candidatePlistText) {
  if (!STAMP_PATTERN.test(candidatePlistText)) {
    throw new Error('candidate Info.plist is missing UNFOLDBuildProfile string');
  }
  return candidatePlistText.replace(STAMP_PATTERN, `$1${EXPECTED_PROFILE}$3`);
}

export function manifestHash(manifest) {
  return sha256Text(manifest.map((entry) => `${entry.path}\t${entry.kind}\t${entry.candidateSha256}\t${entry.expectedSha256}`).join('\n'));
}

export function inspectSourceEntry(filePath, { label = filePath, missingReason } = {}) {
  let stat;
  try {
    stat = lstatSync(filePath);
  } catch (err) {
    if (err?.code === 'ENOENT') {
      return fail('stale-inputs', missingReason || `source entry missing: ${label}`);
    }
    return fail('stale-inputs', `unable to inspect source entry: ${label}`);
  }
  if (stat.isSymbolicLink()) {
    let linkTarget;
    try {
      linkTarget = readlinkSync(filePath);
    } catch {
      return fail('stale-inputs', `unable to read symlink target: ${label}`);
    }
    return {
      ok: true,
      kind: 'symlink',
      linkTarget,
      sha256: sha256Text(linkTarget),
    };
  }
  if (stat.isFile()) {
    return {
      ok: true,
      kind: 'file',
      sha256: sha256File(filePath),
    };
  }
  if (stat.isDirectory()) {
    return fail('stale-inputs', `source entry is a directory: ${label}`);
  }
  return fail('stale-inputs', `unsupported source entry: ${label}`);
}

export function readGitIdentity(cwd) {
  const gitCommit = execFileSync('git', ['rev-parse', 'HEAD'], { cwd, encoding: 'utf8' }).trim();
  const gitTree = execFileSync('git', ['rev-parse', 'HEAD^{tree}'], { cwd, encoding: 'utf8' }).trim();
  const porcelain = execFileSync('git', ['status', '--porcelain'], { cwd, encoding: 'utf8' });
  return { gitCommit, gitTree, dirty: porcelain.trim() !== '' };
}

export function gitTopLevel(cwd) {
  return execFileSync('git', ['rev-parse', '--show-toplevel'], { cwd, encoding: 'utf8' }).trim();
}

export function parseFlowDeckJsonl(text) {
  const events = [];
  for (const line of text.split('\n')) {
    if (line.trim() === '') continue;
    events.push(JSON.parse(line));
  }
  return events;
}

export function eventType(event) {
  return event?.type || event?.payload?.type || '';
}

export function eventOperation(event) {
  return event?.operation || event?.payload?.operation || '';
}

export function eventStage(event) {
  return event?.payload?.stage || event?.stage || '';
}

export function eventSuccess(event) {
  if (typeof event?.success === 'boolean') return event.success;
  if (typeof event?.payload?.success === 'boolean') return event.payload.success;
  return null;
}

export function inspectBuiltApp(appPath, extract = plutilExtract) {
  const resolved = resolve(appPath);
  if (!existsSync(resolved) || !statSync(resolved).isDirectory()) {
    return fail('absent-artifact', `app bundle not found: ${resolved}`);
  }
  if (!resolved.split(sep).includes('Release-iphonesimulator')) {
    return fail('wrong-configuration', 'app must come from Release-iphonesimulator derived-data output');
  }
  const plistPath = join(resolved, 'Info.plist');
  if (!existsSync(plistPath)) {
    return fail('absent-artifact', `Info.plist not found in ${resolved}`);
  }
  const keys = {
    bundleId: 'CFBundleIdentifier',
    version: 'CFBundleShortVersionString',
    build: 'CFBundleVersion',
    executableName: 'CFBundleExecutable',
    buildProfile: 'UNFOLDBuildProfile',
  };
  const values = {};
  for (const [name, key] of Object.entries(keys)) {
    const extracted = extract(plistPath, key);
    if (!extracted.ok) {
      return fail(name === 'buildProfile' ? 'development-profile' : 'absent-artifact', extracted.reason);
    }
    values[name] = extracted.value;
  }
  if (values.bundleId !== EXPECTED_BUNDLE_ID) {
    return fail('identity-mismatch', `bundle id ${JSON.stringify(values.bundleId)} is not ${EXPECTED_BUNDLE_ID}`);
  }
  if (values.buildProfile !== EXPECTED_PROFILE) {
    return fail('development-profile', `UNFOLDBuildProfile ${JSON.stringify(values.buildProfile)} is not exactly production`);
  }
  if (!values.version || !values.build || !values.executableName) {
    return fail('incomplete-proof', 'Info.plist version, build, or executable is empty');
  }
  const executablePath = join(resolved, values.executableName);
  const jsBundlePath = join(resolved, 'main.jsbundle');
  const executableStat = existingFile(executablePath);
  const jsStat = existingFile(jsBundlePath);
  if (!executableStat) return fail('absent-artifact', `executable not found: ${executablePath}`);
  if (!jsStat) return fail('missing-bundle', `main.jsbundle not found in ${resolved}`);
  if (executableStat.size === 0 || jsStat.size === 0) {
    return fail('missing-bundle', 'executable or main.jsbundle is empty');
  }
  return {
    ok: true,
    appPath: resolved,
    ...values,
    executablePath,
    jsBundlePath,
    infoPlistPath: plistPath,
    infoPlistSha256: sha256File(plistPath),
    executableSha256: sha256File(executablePath),
    jsBundleSha256: sha256File(jsBundlePath),
  };
}

export function readCandidateManifest(candidateDir, stampProduction) {
  const identity = readGitIdentity(candidateDir);
  if (identity.dirty) {
    return fail('stale-source', 'candidate worktree is dirty; capture the immutable candidate first');
  }
  const files = execFileSync('git', ['ls-files'], { cwd: candidateDir, encoding: 'utf8' })
    .split('\n')
    .filter(Boolean);
  if (files.length === 0) {
    return fail('stale-inputs', 'candidate has no tracked files');
  }
  const manifest = [];
  for (const file of files) {
    const candidateFile = join(candidateDir, file);
    const source = inspectSourceEntry(candidateFile, {
      label: file,
      missingReason: `candidate file missing: ${file}`,
    });
    if (!source.ok) return source;
    const candidateSha256 = source.sha256;
    let expectedSha256 = candidateSha256;
    if (stampProduction && file === STAMP_PLIST) {
      if (source.kind !== 'file') {
        return fail('stale-inputs', 'Info.plist must be a regular file');
      }
      expectedSha256 = sha256Text(expectedProductionStamp(readFileSync(candidateFile, 'utf8')));
    }
    const entry = { path: file, kind: source.kind, candidateSha256, expectedSha256 };
    if (source.kind === 'symlink') entry.linkTarget = source.linkTarget;
    manifest.push(entry);
  }
  const protectedHashes = {};
  for (const file of PROTECTED_FILES) {
    const candidateFile = join(candidateDir, file);
    const source = inspectSourceEntry(candidateFile);
    if (!source.ok || source.kind !== 'file') {
      return fail('protected-hash', `protected file must be a regular file: ${file}`);
    }
    protectedHashes[file] = source.sha256;
  }
  return {
    ok: true,
    candidateCommit: identity.gitCommit,
    candidateTree: identity.gitTree,
    stampProduction: stampProduction === true,
    manifest,
    protected: protectedHashes,
    inputHash: manifestHash(manifest),
  };
}

export function readPreparedInputs({ candidateDir, nativeDir, stampProduction }) {
  const expected = readCandidateManifest(candidateDir, stampProduction);
  if (!expected.ok) return expected;
  for (const entry of expected.manifest) {
    const nativeFile = join(nativeDir, entry.path);
    const source = inspectSourceEntry(nativeFile, {
      label: entry.path,
      missingReason: `prepared native file missing: ${entry.path}`,
    });
    if (!source.ok) return source;
    if (source.kind !== entry.kind || source.linkTarget !== entry.linkTarget || source.sha256 !== entry.expectedSha256) {
      return fail(
        'stale-inputs',
        entry.path === STAMP_PLIST && stampProduction
          ? 'native Info.plist is not the exact production stamp transformation'
          : `prepared native file does not match candidate: ${entry.path}`,
      );
    }
  }
  for (const file of PROTECTED_FILES) {
    const nativeFile = join(nativeDir, file);
    if (!existsSync(nativeFile) || sha256File(nativeFile) !== expected.protected[file]) {
      return fail('protected-hash', `protected file changed: ${file}`);
    }
  }
  const native = readGitIdentity(nativeDir);
  return {
    ...expected,
    nativeHead: native.gitCommit,
  };
}

export function assertEvidenceLocation(outPath, worktrees) {
  const resolved = resolve(outPath);
  for (const tree of worktrees) {
    const top = gitTopLevel(tree);
    if (isInside(resolved, top) && !isInside(resolved, join(top, '.artifacts'))) {
      return fail('evidence-location', 'write evidence under ignored .artifacts/ or outside the worktree');
    }
  }
  return { ok: true, path: resolved };
}

export function analyzeBuildLog(text, { derivedData, simulator, nativeDir }) {
  let events;
  try {
    events = parseFlowDeckJsonl(text);
  } catch (err) {
    return fail('invalid-log', `build log is not FlowDeck JSONL: ${err.message}`);
  }
  const configuration = events.find((event) => eventType(event) === 'configuration');
  const result = events.find((event) => eventType(event) === 'result' && eventOperation(event) === 'BUILD');
  if (!configuration?.data) {
    return fail('wrong-configuration', 'build log has no configuration event');
  }
  if (configuration.data.configuration !== 'Release') {
    return fail('wrong-configuration', `build configuration is ${JSON.stringify(configuration.data.configuration)}, not Release`);
  }
  if (resolve(configuration.data.derivedDataPath || '') !== resolve(derivedData)) {
    return fail('wrong-configuration', 'build derived-data path does not match the observed directory');
  }
  if (configuration.data.simulator !== simulator) {
    return fail('wrong-target', 'build configuration simulator does not match the requested target');
  }
  if (configuration.data.scheme !== 'Unfold' || configuration.data.platform !== 'iOS Simulator') {
    return fail('wrong-configuration', 'build scheme/platform is not Unfold iOS Simulator');
  }
  const expectedWorkspace = join(realPath(nativeDir), EXPECTED_WORKSPACE);
  if (!configuration.data.workspace || realPath(configuration.data.workspace) !== expectedWorkspace) {
    return fail(
      'wrong-workspace',
      'build configuration workspace is not the prepared native ios/Unfold.xcworkspace',
    );
  }
  if (!result || eventSuccess(result) !== true) {
    return fail('build-failed', 'build log has no successful BUILD result');
  }
  return { ok: true, configuration: configuration.data, result: { operation: 'BUILD', success: true } };
}

export function analyzeLaunchLog(text, { derivedData, simulator, nativeDir }) {
  let events;
  try {
    events = parseFlowDeckJsonl(text);
  } catch (err) {
    return fail('invalid-log', `launch log is not FlowDeck JSONL: ${err.message}`);
  }
  if (events.some((event) => eventOperation(event) === 'BUILD' || eventStage(event) === 'BUILD_APP')) {
    return fail('unexpected-rebuild', 'launch log contains a FlowDeck BUILD; --no-build was not honored');
  }
  const failed = events.find((event) => eventType(event) === 'result' && eventOperation(event) === 'LAUNCH' && eventSuccess(event) === false);
  if (failed) {
    return fail('launch-failed', 'FlowDeck LAUNCH result is success:false');
  }
  const stages = events.map(eventStage).filter(Boolean);
  if (!stages.includes('PRE_LAUNCH_CLEANUP') || !stages.includes('INSTALL_APP')) {
    return fail('missing-runtime', 'launch log is missing PRE_LAUNCH_CLEANUP or INSTALL_APP');
  }
  const registered = events.find((event) => eventType(event) === 'app_registered');
  if (!registered?.data) {
    return fail('missing-runtime', 'launch log has no app_registered event');
  }
  if (registered.data.bundleId !== EXPECTED_BUNDLE_ID) {
    return fail('identity-mismatch', 'registered bundle id is not com.unfoldapp.ios');
  }
  if (registered.data.targetUdid !== simulator) {
    return fail('wrong-target', 'registered target does not match the requested simulator');
  }
  if (registered.data.launchType && registered.data.launchType !== 'simulator') {
    return fail('wrong-target', 'launch type is not simulator');
  }
  if (!registered.data.projectPath || realPath(registered.data.projectPath) !== realPath(nativeDir)) {
    return fail('wrong-target', 'registered projectPath is not the prepared native checkout');
  }
  if (!registered.data.logPath || !isInside(registered.data.logPath, derivedData)) {
    return fail('missing-runtime', 'registered logPath is not inside the observed derived-data directory');
  }
  return {
    ok: true,
    stages,
    launchId: registered.data.id || '',
    targetUdid: registered.data.targetUdid,
    bundleId: registered.data.bundleId,
    projectPath: registered.data.projectPath,
    logPath: registered.data.logPath,
    registeredAt: registered.timestamp || '',
  };
}

export function analyzeLiveness(text, { simulator, registeredAt }) {
  let snapshot;
  try {
    snapshot = JSON.parse(text);
  } catch (err) {
    return fail('missing-liveness', `liveness file is not JSON: ${err.message}`);
  }
  if (snapshot.schema !== 'flowdeck.ui' || snapshot.type !== 'ui_snapshot' || snapshot.success !== true) {
    return fail('missing-liveness', 'liveness observation is not a successful flowdeck.ui ui_snapshot');
  }
  if (snapshot.simulator?.udid !== simulator) {
    return fail('wrong-target', 'liveness snapshot target does not match the launch target');
  }
  const elapsed = Date.parse(snapshot.timestamp) - Date.parse(registeredAt);
  if (!registeredAt || !snapshot.timestamp || !Number.isFinite(elapsed) || elapsed < HEALTHY_BOOT_MS) {
    return fail(
      'too-early-observation',
      `rendered observation must be at least ${HEALTHY_BOOT_MS}ms after registration (src/lib/crash-marker.ts HEALTHY_BOOT_MS)`,
    );
  }
  const tree = snapshot.accessibility?.tree;
  if (!Array.isArray(tree)) {
    return fail('missing-liveness', 'liveness snapshot has no accessibility tree');
  }
  const application = tree.find((node) => node.role === 'Application' && node.label === 'Unfold' && node.visible === true);
  if (!application) {
    return fail('immediate-crash', 'liveness snapshot has no visible Unfold application after launch');
  }
  const rendered = tree.filter((node) => node.visible === true && node.role !== 'Application');
  const splashOnly = rendered.length === 0 || rendered.every(isSplashNode);
  const hasRenderedId = rendered.some((node) => typeof node.id === 'string' && node.id && !isSplashNode(node));
  if (splashOnly || !hasRenderedId) {
    return fail('splash-only', 'observation is splash-only; post-boot rendered UI with an accessibility id is required');
  }
  return {
    ok: true,
    kind: 'ui_snapshot',
    targetUdid: snapshot.simulator.udid,
    timestamp: snapshot.timestamp,
    screenHash: snapshot.accessibility.screen_hash || '',
    elementCount: snapshot.accessibility.element_count ?? tree.length,
    elapsedMs: elapsed,
  };
}

export function artifactDrift(live, recorded) {
  if (!recorded?.infoPlistSha256) {
    return fail('incomplete-proof', 'record is missing captured Info.plist hash');
  }
  if (live.infoPlistSha256 !== recorded.infoPlistSha256) {
    return fail('stale-hash', 'Info.plist hash no longer matches the derived-data app');
  }
  if (live.executableSha256 !== recorded.executableSha256 || live.jsBundleSha256 !== recorded.jsBundleSha256) {
    return fail('stale-hash', 'artifact hashes no longer match the derived-data app');
  }
  if (
    live.version !== recorded.version
    || live.build !== recorded.build
    || live.bundleId !== recorded.bundleId
    || live.buildProfile !== recorded.buildProfile
  ) {
    return fail('stale-hash', 'Info.plist metadata no longer matches the captured artifact');
  }
  return { ok: true };
}

export function evaluateSimulatorReleaseProof({ recordPath, runPlutil = plutilExtract } = {}) {
  if (!recordPath) {
    return fail('absent-proof', 'CVL_RELEASE_PROOF is required; a skipped device check is not release proof');
  }
  const resolved = resolve(recordPath);
  if (!existsSync(resolved) || !statSync(resolved).isFile()) {
    return fail('absent-proof', `release-proof record not found: ${resolved}`);
  }
  let record;
  try {
    record = JSON.parse(readFileSync(resolved, 'utf8'));
  } catch (err) {
    return fail('incomplete-proof', `release-proof is not valid JSON: ${err.message}`);
  }
  if (record.schema !== PROOF_SCHEMA || record.kind !== PROOF_KIND || record.proofClass !== 'simulator-release-artifact') {
    return fail('incomplete-proof', 'record is not a local simulator-release evidence record');
  }
  if (!Array.isArray(record.inputs?.manifest) || record.inputs.manifest.length === 0) {
    return fail('incomplete-proof', 'record is missing the captured input manifest');
  }
  if (manifestHash(record.inputs.manifest) !== record.inputs.inputHash) {
    return fail('stale-inputs', 'input manifest hash does not match the stored per-file hashes');
  }
  const live = readCandidateManifest(record.paths.candidateDir, record.inputs.stampProduction);
  if (!live.ok) return live;
  if (live.candidateCommit !== record.source.candidateCommit || live.candidateTree !== record.source.candidateTree) {
    return fail('stale-source', 'record candidate commit/tree does not match the current candidate');
  }
  if (live.inputHash !== record.inputs.inputHash) {
    return fail('stale-inputs', 'candidate files no longer match the captured expected stamped hashes');
  }
  for (const stored of record.inputs.manifest) {
    const liveEntry = live.manifest.find((entry) => entry.path === stored.path);
    if (
      !liveEntry
      || liveEntry.kind !== stored.kind
      || liveEntry.linkTarget !== stored.linkTarget
      || liveEntry.expectedSha256 !== stored.expectedSha256
    ) {
      return fail('stale-inputs', `candidate no longer matches captured expected hash: ${stored.path}`);
    }
  }
  for (const file of PROTECTED_FILES) {
    if (live.protected[file] !== record.inputs.protected[file]) {
      return fail('protected-hash', `protected hash drifted: ${file}`);
    }
  }
  for (const [name, pathKey] of [
    ['build', 'buildLog'],
    ['launch', 'launchLog'],
    ['liveness', 'livenessLog'],
  ]) {
    const logPath = record.logs[pathKey];
    if (!logPath || !existsSync(logPath)) {
      return fail('changed-log', `${name} log is missing`);
    }
    if (sha256Text(readFileSync(logPath, 'utf8')) !== record.logs[`${pathKey}Sha256`]) {
      return fail('changed-log', `${name} log hash no longer matches the bound raw file`);
    }
  }
  const build = analyzeBuildLog(readFileSync(record.logs.buildLog, 'utf8'), {
    derivedData: record.paths.derivedData,
    simulator: record.launch.targetUdid,
    nativeDir: record.paths.nativeDir,
  });
  if (!build.ok) return build;
  const launch = analyzeLaunchLog(readFileSync(record.logs.launchLog, 'utf8'), {
    derivedData: record.paths.derivedData,
    simulator: record.launch.targetUdid,
    nativeDir: record.paths.nativeDir,
  });
  if (!launch.ok) return launch;
  const liveness = analyzeLiveness(readFileSync(record.logs.livenessLog, 'utf8'), {
    simulator: record.launch.targetUdid,
    registeredAt: launch.registeredAt,
  });
  if (!liveness.ok) return liveness;
  const app = inspectBuiltApp(record.artifact.appPath, runPlutil);
  if (!app.ok) return app;
  if (!isInside(record.artifact.appPath, record.paths.derivedData)) {
    return fail('stale-artifact', 'recorded app is not inside the observed derived-data directory');
  }
  const drifted = artifactDrift(app, record.artifact);
  if (!drifted.ok) return drifted;
  return {
    ok: true,
    code: 'simulator-artifact-match',
    reason: 'observed simulator Release artifact matched bound logs, candidate manifest, and hashes',
    proofClass: 'simulator-release-artifact',
    details: {
      candidateCommit: live.candidateCommit,
      candidateTree: live.candidateTree,
      appPath: app.appPath,
    },
  };
}

export function evaluateReleaseGate(options) {
  const simulator = evaluateSimulatorReleaseProof(options);
  if (!simulator.ok) return simulator;
  return {
    ok: false,
    code: 'incomplete-release',
    reason:
      'simulator Release artifact matched. App Store IPA identity, signing, upload, and physical-device proof remain a separate manual gate',
    simulator,
    manualGates: ['app-store-ipa', 'signing', 'upload', 'physical-device'],
  };
}

export function captureSimulatorReleaseProof(options) {
  const callerStatus = options.runtimeStatus ?? options.env?.CVL_RUNTIME_STATUS;
  if (callerStatus !== undefined) {
    return fail('unbound-assertion', 'caller-supplied runtime status is not release proof');
  }
  if (options.appPath) {
    return fail('unbound-assertion', 'do not pass an existing app; the app must come from the observed build');
  }
  if (!options.simulator || !UUID_RE.test(options.simulator)) {
    return fail('wrong-target', '--simulator must be an explicit simulator UDID');
  }
  const candidateDir = resolve(options.candidateDir);
  const nativeDir = resolve(options.nativeDir);
  const derivedData = resolve(options.derivedData);
  const location = assertEvidenceLocation(options.outPath, [candidateDir, nativeDir]);
  if (!location.ok) return location;
  const inputs = readPreparedInputs({
    candidateDir,
    nativeDir,
    stampProduction: options.stampProduction === true,
  });
  if (!inputs.ok) return inputs;
  const existingApp = join(derivedData, 'Build/Products/Release-iphonesimulator/Unfold.app');
  if (existsSync(existingApp)) {
    return fail('stale-artifact', 'derived-data already contains Unfold.app; use a fresh directory');
  }
  mkdirSync(derivedData, { recursive: true });
  const outDir = location.path.endsWith('.json') ? dirname(location.path) : location.path;
  mkdirSync(outDir, { recursive: true });
  const recordPath = location.path.endsWith('.json') ? location.path : join(outDir, 'record.json');
  const buildLogPath = join(outDir, 'build.jsonl');
  const launchLogPath = join(outDir, 'launch.jsonl');
  const livenessLogPath = join(outDir, 'screen.json');
  const runFlowDeck = options.runFlowDeck || defaultRunFlowDeck;
  const commandEnv = flowDeckCommandEnv(options.env || process.env);
  const buildArgs = ['build', '-C', 'Release', '-d', derivedData, '-S', options.simulator, '--json'];
  const buildRun = runFlowDeck(buildArgs, { cwd: nativeDir, env: commandEnv });
  writeFileSync(buildLogPath, buildRun.stdout || '');
  if ((buildRun.status ?? 1) !== 0) {
    return fail('build-failed', `FlowDeck build exited ${buildRun.status ?? 1}`);
  }
  const build = analyzeBuildLog(buildRun.stdout || '', { derivedData, simulator: options.simulator, nativeDir });
  if (!build.ok) return build;
  const app = inspectBuiltApp(existingApp, options.extract || plutilExtract);
  if (!app.ok) return app;
  const launchArgs = ['run', '--no-build', '-C', 'Release', '-d', derivedData, '-S', options.simulator, '--json'];
  const launchRun = runFlowDeck(launchArgs, { cwd: nativeDir, env: commandEnv });
  writeFileSync(launchLogPath, launchRun.stdout || '');
  if ((launchRun.status ?? 1) !== 0) {
    return fail('launch-failed', `FlowDeck run exited ${launchRun.status ?? 1}`);
  }
  const launch = analyzeLaunchLog(launchRun.stdout || '', { derivedData, simulator: options.simulator, nativeDir });
  if (!launch.ok) return launch;
  const wait = options.wait || defaultWait;
  wait(HEALTHY_BOOT_MS);
  const screenArgs = ['ui', 'simulator', 'screen', '-S', options.simulator, '--json'];
  const screenRun = runFlowDeck(screenArgs, { cwd: nativeDir, env: commandEnv });
  writeFileSync(livenessLogPath, screenRun.stdout || '');
  if ((screenRun.status ?? 1) !== 0) {
    return fail('missing-liveness', `FlowDeck ui simulator screen exited ${screenRun.status ?? 1}`);
  }
  const liveness = analyzeLiveness(screenRun.stdout || '', {
    simulator: options.simulator,
    registeredAt: launch.registeredAt,
  });
  if (!liveness.ok) return liveness;
  const inputsAfter = readPreparedInputs({
    candidateDir,
    nativeDir,
    stampProduction: options.stampProduction === true,
  });
  if (!inputsAfter.ok) return inputsAfter;
  if (inputsAfter.inputHash !== inputs.inputHash || inputsAfter.candidateTree !== inputs.candidateTree) {
    return fail('stale-inputs', 'source or prepared inputs changed during capture');
  }
  const appAfter = inspectBuiltApp(existingApp, options.extract || plutilExtract);
  if (!appAfter.ok) return appAfter;
  const changed = artifactDrift(appAfter, app);
  if (!changed.ok) return changed;
  const record = {
    schema: PROOF_SCHEMA,
    kind: PROOF_KIND,
    proofClass: 'simulator-release-artifact',
    disclaimer: 'Local evidence record. Not a cryptographic attestation. Not App Store or device proof.',
    notProven: [
      'app-store-ipa',
      'signing',
      'upload',
      'physical-device',
      'native-process-lease',
      'dependency-tree',
      'ignored-environment',
    ],
    limits: {
      processLease:
        'FlowDeck ui snapshots do not prove the OS process stayed alive for the healthy-boot window. This record only proves a later rendered snapshot.',
      trackedInputs:
        'The input manifest covers git-tracked candidate files plus the exact production stamp on ios/Unfold/Info.plist. It does not cover ignored or untracked dependency trees (Pods/, node_modules/), derived data, or process environment besides SENTRY_DISABLE_AUTO_UPLOAD=true.',
    },
    source: {
      candidateCommit: inputs.candidateCommit,
      candidateTree: inputs.candidateTree,
      nativeHead: inputs.nativeHead,
    },
    paths: { candidateDir, nativeDir, derivedData },
    inputs: {
      stampProduction: inputs.stampProduction,
      protected: inputs.protected,
      manifest: inputs.manifest,
      inputHash: inputs.inputHash,
    },
    commands: {
      build: ['flowdeck', ...buildArgs],
      run: ['flowdeck', ...launchArgs],
      screen: ['flowdeck', ...screenArgs],
    },
    logs: {
      buildLog: buildLogPath,
      buildLogSha256: sha256File(buildLogPath),
      launchLog: launchLogPath,
      launchLogSha256: sha256File(launchLogPath),
      livenessLog: livenessLogPath,
      livenessLogSha256: sha256File(livenessLogPath),
    },
    build: {
      configuration: build.configuration,
      result: build.result,
    },
    artifact: {
      appPath: app.appPath,
      bundleId: app.bundleId,
      version: app.version,
      build: app.build,
      buildProfile: app.buildProfile,
      infoPlistSha256: app.infoPlistSha256,
      executableSha256: app.executableSha256,
      jsBundleSha256: app.jsBundleSha256,
    },
    launch: {
      targetUdid: launch.targetUdid,
      launchId: launch.launchId,
      bundleId: launch.bundleId,
      projectPath: launch.projectPath,
      logPath: launch.logPath,
      registeredAt: launch.registeredAt,
      stages: launch.stages,
    },
    liveness: {
      ...liveness,
      healthyBootMs: HEALTHY_BOOT_MS,
    },
  };
  writeFileSync(recordPath, `${JSON.stringify(record, null, 2)}\n`);
  return { ok: true, code: 'captured', recordPath, record };
}

export function defaultRunFlowDeck(argv, { cwd, env } = {}) {
  const result = spawnSync('flowdeck', argv, {
    cwd,
    env: flowDeckCommandEnv(env || process.env),
    encoding: 'utf8',
    maxBuffer: 20 * 1024 * 1024,
  });
  return { status: result.status ?? 1, stdout: result.stdout || '', stderr: result.stderr || '' };
}

function defaultWait(ms) {
  const buf = new Int32Array(new SharedArrayBuffer(4));
  Atomics.wait(buf, 0, 0, ms);
}

function plutilExtract(plistPath, key) {
  if (!existsSync('/usr/bin/plutil')) {
    return fail('missing-plutil', 'read-only /usr/bin/plutil is required to read Info.plist metadata');
  }
  const result = spawnSync('/usr/bin/plutil', ['-extract', key, 'raw', '-o', '-', plistPath], { encoding: 'utf8' });
  if ((result.status ?? 1) !== 0) {
    return fail('absent-artifact', `plutil could not extract ${key}`);
  }
  return { ok: true, value: (result.stdout || '').replace(/\n$/, '') };
}

function existingFile(filePath) {
  if (!existsSync(filePath)) return null;
  const stat = statSync(filePath);
  return stat.isFile() ? stat : null;
}

function isSplashNode(node) {
  return SPLASH_RE.test(`${node?.label || ''} ${node?.id || ''}`);
}

function realPath(pathValue) {
  const resolved = resolve(pathValue);
  if (existsSync(resolved)) return realpathSync(resolved);
  const parent = dirname(resolved);
  if (existsSync(parent)) return join(realpathSync(parent), basename(resolved));
  return resolved;
}

function isInside(pathValue, root) {
  const rel = relative(realPath(root), realPath(pathValue));
  return rel === '' || (!rel.startsWith(`..${sep}`) && rel !== '..' && !isAbsolute(rel));
}
