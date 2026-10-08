/**
 * Pure checks for the release smoke (scripts/release-smoke.mjs, docs/RELEASE-SMOKE.md).
 */

export const PODFILE_LOCK = 'ios/Podfile.lock';
export const PROJECT_FILE = 'ios/Unfold.xcodeproj/project.pbxproj';

// `eas env:list` prints this in place of a secret value.
const MASKED_VALUE = '*****';
// Library defaults present in every production bundle (Expo, Metro, Sentry Spotlight).
const LIBRARY_LOCAL_URLS = new Set([
  'http://localhost:3000',
  'http://localhost:8081',
  'http://localhost:8969',
]);
const DEV_HOSTS = /https?:\/\/[a-z0-9.-]+\.(?:up\.railway\.app|ngrok-free\.app|ngrok\.io|loca\.lt)/g;
const LOCAL_URLS = /https?:\/\/(?:localhost|127\.0\.0\.1)(?::\d+)?/g;

/** The resolved pod versions: the PODS section, without the spec checksums every install rewrites. */
export function podVersions(lockfile) {
  return lockfile.slice(lockfile.indexOf('PODS:'), lockfile.indexOf('DEPENDENCIES:'));
}

/**
 * "UnfoldVerse.swift in Sources" for each PBXBuildFile, without the IDs every
 * install rewrites. Phase names can have more than one word, as in
 * "ExpoWidgetsTarget.appex in Embed Foundation Extensions".
 */
export function builtFiles(project) {
  return [...project.matchAll(/\/\* ([^*]+ in [A-Za-z]+(?: [A-Za-z]+)*) \*\/ = \{isa = PBXBuildFile/g)]
    .map((match) => match[1])
    .sort()
    .join('\n');
}

/** For each file pod install may rewrite (release-proof's PROTECTED_FILES), the part that must stay the same. */
export const DRIFT_NORMALIZERS = new Map([
  [PODFILE_LOCK, podVersions],
  [PROJECT_FILE, builtFiles],
]);

/**
 * Plain-text and sensitive values from `eas env:list --format short`, as
 * `eas build --local` loads them. Secret values stay on EAS builders. The only
 * one, SENTRY_AUTH_TOKEN, uploads artifacts, which a smoke build skips.
 */
export function parseEasEnvList(output) {
  const variables = {};
  for (const line of output.split('\n')) {
    const match = /^([A-Z][A-Z0-9_]*)=(.*)$/.exec(line.trim());
    if (match && !match[2].startsWith(MASKED_VALUE)) variables[match[1]] = match[2];
  }
  return variables;
}

/**
 * The capture's environment. It keeps this shell's variables except its
 * EXPO_PUBLIC_* values, which would reach the bundle. Then it adds each
 * production source in EAS order, so a later source wins.
 */
export function productionBuildEnv(shellEnv, ...sources) {
  const kept = Object.entries(shellEnv).filter(([name]) => !name.startsWith('EXPO_PUBLIC_'));
  return Object.assign(Object.fromEntries(kept), ...sources);
}

/** What makes a bundle unfit to ship: no production backend, or a dev or unknown local host. */
export function bundleProblems(bundle, backendUrl) {
  const problems = [];
  if (!bundle.includes(backendUrl)) problems.push(`the bundle does not name ${backendUrl}`);
  const devHosts = unique(bundle.match(DEV_HOSTS));
  if (devHosts.length) problems.push(`the bundle names dev hosts: ${devHosts.join(', ')}`);
  const localUrls = unique(bundle.match(LOCAL_URLS)).filter((url) => !LIBRARY_LOCAL_URLS.has(url));
  if (localUrls.length) problems.push(`the bundle names local URLs: ${localUrls.join(', ')}`);
  return problems;
}

/** UDIDs of the simulators with this name in `flowdeck simulator list --json`. */
export function simulatorUdids(simulators, name) {
  return simulators.filter((simulator) => simulator.name === name).map((simulator) => simulator.udid);
}

function unique(matches) {
  return [...new Set(matches ?? [])];
}
