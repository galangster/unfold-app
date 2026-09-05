#!/usr/bin/env node
/**
 * Stamp the EAS build profile into ios/Unfold/Info.plist before xcodebuild runs.
 *
 * AppDelegate.swift reads `UNFOLDBuildProfile` from Info.plist before React
 * Native starts, so Sentry can tag native crashes, app hangs and release-health
 * sessions with the profile that produced the binary. Without it every Release
 * build reports environment "production", including preview and qa-testflight.
 *
 * The checked-in value is the literal `$(EAS_BUILD_PROFILE)`, which CANNOT
 * expand on its own. Xcode's INFOPLIST_EXPAND_BUILD_SETTINGS substitutes BUILD
 * SETTINGS; EAS_BUILD_PROFILE is a process environment variable, and xcodebuild
 * does not import the environment into the build-settings namespace. Verified:
 *   EAS_BUILD_PROFILE=qa-testflight xcodebuild -showBuildSettings ... | grep EAS_
 * returns nothing. So the substitution has to happen here instead.
 *
 * EAS runs `eas-build-post-install` after dependencies are installed and before
 * the native build, with EAS_BUILD_PROFILE set.
 *
 * With no profile in the environment this is a no-op, which is the correct
 * behaviour for a local build: the literal still contains "$", and AppDelegate
 * rejects any value containing "$" and falls back to "production" — which is
 * also Cocoa's own default. The worst case is therefore today's behaviour,
 * never a garbage environment name.
 */
import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const PLIST = join(dirname(fileURLToPath(import.meta.url)), "..", "ios", "Unfold", "Info.plist");
const KEY = "UNFOLDBuildProfile";

const profile = (process.env.EAS_BUILD_PROFILE ?? "").trim();

if (!profile) {
  console.log(`[stamp-build-profile] EAS_BUILD_PROFILE is unset — leaving ${KEY} unstamped.`);
  process.exit(0);
}

// A profile name reaches a Sentry environment label and an Info.plist string.
// Refuse anything that is not a plain identifier rather than write junk or XML.
if (!/^[A-Za-z0-9._-]{1,64}$/.test(profile)) {
  console.error(`[stamp-build-profile] refusing to stamp an unexpected profile name: ${JSON.stringify(profile)}`);
  process.exit(1);
}

const plist = readFileSync(PLIST, "utf8");
const pattern = new RegExp(`(<key>${KEY}</key>\\s*<string>)([^<]*)(</string>)`);

if (!pattern.test(plist)) {
  console.error(`[stamp-build-profile] ${KEY} is missing from ${PLIST}. AppDelegate reads it; add it back.`);
  process.exit(1);
}

const stamped = plist.replace(pattern, `$1${profile}$3`);
writeFileSync(PLIST, stamped);
console.log(`[stamp-build-profile] ${KEY} = ${profile}`);
