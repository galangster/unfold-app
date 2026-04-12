#!/usr/bin/env node
// set-testflight-changelog.mjs — Push "What to Test" copy to an ASC TestFlight build.
//
// Usage:
//   node scripts/set-testflight-changelog.mjs                  # auto: current buildNumber + changelogs/build-{N}.md
//   node scripts/set-testflight-changelog.mjs 73               # explicit build number, default changelog path
//   node scripts/set-testflight-changelog.mjs 73 path/to.md    # explicit build number + changelog path
//
// Reads credentials from eas.json submit.production.ios:
//   ascAppId, ascApiKeyId, ascApiKeyIssuerId, ascApiKeyPath
//
// What it does:
//   1. Mints an ES256 JWT against the ASC API
//   2. Finds the Build on App Store Connect by (appId, version=buildNumber)
//   3. Retries with backoff if the build is still processing (not yet queryable)
//   4. Reads the existing betaBuildLocalizations for the build, filtered to locale=en-US
//   5. Creates or updates the en-US localization's whatsNew field with the changelog body
//
// No external deps — pure Node (global fetch, node:crypto, node:fs, node:path).

import { readFileSync, existsSync } from 'node:fs';
import { createSign } from 'node:crypto';
import { resolve, dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(__dirname, '..');

// ── Read eas.json credentials ─────────────────────────────────────────────
const easJsonPath = join(REPO_ROOT, 'eas.json');
if (!existsSync(easJsonPath)) {
  die(`eas.json not found at ${easJsonPath}`);
}
const eas = JSON.parse(readFileSync(easJsonPath, 'utf8'));
const iosSubmit = eas?.submit?.production?.ios;
if (!iosSubmit) {
  die('eas.json is missing submit.production.ios');
}
const { ascAppId, ascApiKeyId, ascApiKeyIssuerId, ascApiKeyPath } = iosSubmit;
for (const [k, v] of Object.entries({ ascAppId, ascApiKeyId, ascApiKeyIssuerId, ascApiKeyPath })) {
  if (!v) die(`eas.json submit.production.ios.${k} is missing`);
}

const keyPath = resolve(REPO_ROOT, ascApiKeyPath);
if (!existsSync(keyPath)) {
  die(`ASC private key not found at ${keyPath}`);
}
const privateKey = readFileSync(keyPath, 'utf8');

// ── Parse args ────────────────────────────────────────────────────────────
const args = process.argv.slice(2);
let buildNumber = args[0];
let changelogPath = args[1];

if (!buildNumber) {
  const appJson = JSON.parse(readFileSync(join(REPO_ROOT, 'app.json'), 'utf8'));
  buildNumber = appJson?.expo?.ios?.buildNumber ?? appJson?.ios?.buildNumber;
  if (!buildNumber) die('Could not auto-detect buildNumber from app.json — pass it explicitly.');
}

if (!changelogPath) {
  changelogPath = join(REPO_ROOT, 'changelogs', `build-${buildNumber}.md`);
}
if (!existsSync(changelogPath)) {
  die(`Changelog file not found: ${changelogPath}`);
}

const changelogBody = readFileSync(changelogPath, 'utf8').trim();
if (!changelogBody) die(`Changelog file is empty: ${changelogPath}`);
if (changelogBody.length > 4000) {
  die(`Changelog is ${changelogBody.length} chars; ASC whatsNew limit is 4000. Trim it.`);
}

console.log(`[asc] build=${buildNumber}  changelog=${changelogPath}  (${changelogBody.length} chars)`);

// ── JWT (ES256) ───────────────────────────────────────────────────────────
function b64url(input) {
  return Buffer.from(input).toString('base64').replace(/=+$/, '').replace(/\+/g, '-').replace(/\//g, '_');
}

function mintJwt() {
  const header = { alg: 'ES256', kid: ascApiKeyId, typ: 'JWT' };
  const now = Math.floor(Date.now() / 1000);
  const payload = {
    iss: ascApiKeyIssuerId,
    iat: now,
    exp: now + 20 * 60, // 20 min (max 20, per ASC docs)
    aud: 'appstoreconnect-v1',
  };
  const signingInput = `${b64url(JSON.stringify(header))}.${b64url(JSON.stringify(payload))}`;
  const signer = createSign('SHA256');
  signer.update(signingInput);
  signer.end();
  // ASC wants raw r||s (JOSE format), not DER. Node returns DER by default; request IEEE-P1363 (jose).
  const signature = signer.sign({ key: privateKey, dsaEncoding: 'ieee-p1363' });
  return `${signingInput}.${b64url(signature)}`;
}

const token = mintJwt();

// ── API helpers ───────────────────────────────────────────────────────────
const ASC = 'https://api.appstoreconnect.apple.com/v1';

async function asc(method, path, body) {
  const res = await fetch(`${ASC}${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  let json;
  try { json = text ? JSON.parse(text) : null; } catch { json = { raw: text }; }
  if (!res.ok) {
    const errs = json?.errors?.map((e) => `${e.code}: ${e.title} — ${e.detail ?? ''}`).join('\n  ') ?? text;
    throw new Error(`ASC ${method} ${path} → ${res.status}\n  ${errs}`);
  }
  return json;
}

async function sleep(ms) { return new Promise((r) => setTimeout(r, ms)); }

// ── Find the Build ────────────────────────────────────────────────────────
async function findBuild() {
  // GET /v1/builds?filter[app]={appId}&filter[version]={buildNumber}
  // filter[version] matches CFBundleVersion (the build number), not CFBundleShortVersionString.
  const qs = new URLSearchParams({
    'filter[app]': ascAppId,
    'filter[version]': String(buildNumber),
    'fields[builds]': 'version,processingState,uploadedDate,expired',
    limit: '5',
  });
  const res = await asc('GET', `/builds?${qs}`);
  return res?.data ?? [];
}

async function waitForBuild() {
  const maxAttempts = 10;
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    const builds = await findBuild();
    if (builds.length > 0) {
      // Prefer a non-expired build
      const live = builds.find((b) => b.attributes?.expired === false) ?? builds[0];
      console.log(`[asc] found build ${live.id} (state=${live.attributes?.processingState}, uploaded=${live.attributes?.uploadedDate})`);
      return live;
    }
    const delay = Math.min(30, 5 * attempt) * 1000;
    console.log(`[asc] build ${buildNumber} not visible yet (attempt ${attempt}/${maxAttempts}); retrying in ${delay / 1000}s…`);
    await sleep(delay);
  }
  die(`Build ${buildNumber} never appeared on ASC after ${maxAttempts} attempts. Is it actually uploaded?`);
}

const build = await waitForBuild();

// ── Read existing en-US localization, if any ──────────────────────────────
async function findEnUsLocalization(buildId) {
  // The /builds/{id}/betaBuildLocalizations relationship endpoint rejects
  // filter[locale], so query the top-level resource with a compound filter.
  const qs = new URLSearchParams({
    'filter[build]': buildId,
    'filter[locale]': 'en-US',
    'fields[betaBuildLocalizations]': 'locale,whatsNew',
    limit: '5',
  });
  const res = await asc('GET', `/betaBuildLocalizations?${qs}`);
  return res?.data?.[0] ?? null;
}

const existing = await findEnUsLocalization(build.id);

// ── Write the changelog ───────────────────────────────────────────────────
if (existing) {
  console.log(`[asc] updating existing en-US localization ${existing.id}`);
  await asc('PATCH', `/betaBuildLocalizations/${existing.id}`, {
    data: {
      type: 'betaBuildLocalizations',
      id: existing.id,
      attributes: { whatsNew: changelogBody },
    },
  });
} else {
  console.log(`[asc] creating new en-US localization for build ${build.id}`);
  await asc('POST', `/betaBuildLocalizations`, {
    data: {
      type: 'betaBuildLocalizations',
      attributes: { locale: 'en-US', whatsNew: changelogBody },
      relationships: {
        build: { data: { type: 'builds', id: build.id } },
      },
    },
  });
}

console.log(`[asc] ✅ "What to Test" set for build ${buildNumber}`);

// ── utils ─────────────────────────────────────────────────────────────────
function die(msg) {
  console.error(`[asc] ❌ ${msg}`);
  process.exit(1);
}
