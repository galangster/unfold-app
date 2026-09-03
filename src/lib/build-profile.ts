/**
 * Build-profile provenance for the internal-tooling gates.
 *
 * `app.config.js` stamps the EAS build profile (EAS_BUILD_PROFILE) into
 * `expo.extra.buildProfile`, so every binary knows which eas.json profile
 * produced it. `qa-tools.ts` and `paywall-diagnostics.ts` both route their
 * decision through this module, which is the single place that says
 * "a production build can never expose internal tooling".
 *
 * Decision table (see resolveQaToolsEnabled / resolvePaywallDiagnosticsEnabled):
 *   - profile starts with "production"     → always OFF (flags/.env ignored)
 *   - __DEV__ bundle                        → QA tools ON; diagnostics need the flag
 *   - stamped non-production profile        → ON only with EXPO_PUBLIC_ENABLE_QA_TOOLS=1
 *   - release bundle with NO stamped profile → OFF (a local release build with a
 *     stray .env flag is not a QA build)
 */

export type BuildProfile = string | null;

/** Pure: extract a non-empty `buildProfile` string from an `expo.extra` object. */
export function readBuildProfileFromExtra(extra: unknown): BuildProfile {
  if (!extra || typeof extra !== 'object') return null;
  const value = (extra as { buildProfile?: unknown }).buildProfile;
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

/**
 * The build profile stamped into this binary, or null when unknown (local
 * `expo run`, Expo Go, or a build produced outside EAS).
 */
export function getBuildProfile(): BuildProfile {
  try {
    // Lazy require keeps expo-constants (a native module that does not load
    // under Jest) off the module graph of every test that transitively imports
    // a gate — the same pattern mmkv-storage.ts and widget-bridge.ts use.
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const Constants = require('expo-constants').default as
      | { expoConfig?: { extra?: unknown } | null }
      | undefined;
    return readBuildProfileFromExtra(Constants?.expoConfig?.extra);
  } catch {
    return null;
  }
}

/** Pure: "production", "Production", "production-hotfix"… all count as production. */
export function isProductionBuildProfile(profile: BuildProfile): boolean {
  return profile !== null && profile.toLowerCase().startsWith('production');
}

/** True when this binary was produced by a production EAS profile. */
export function isProductionBuild(): boolean {
  return isProductionBuildProfile(getBuildProfile());
}

export interface InternalToolingInput {
  buildProfile: BuildProfile;
  isDev: boolean;
  /** Raw value of EXPO_PUBLIC_ENABLE_QA_TOOLS (only the exact string '1' counts). */
  qaFlag: string | undefined;
}

/**
 * QA tools (Settings QA section, paywall skip, seeded previews, premium
 * override): dev bundles always; release bundles only when a NON-production
 * profile is stamped AND the explicit flag was inlined at build time.
 */
export function resolveQaToolsEnabled({ buildProfile, isDev, qaFlag }: InternalToolingInput): boolean {
  if (isProductionBuildProfile(buildProfile)) return false;
  if (isDev) return true;
  return buildProfile !== null && qaFlag === '1';
}

/**
 * Paywall diagnostics (JSONL file + raw console breadcrumbs): never on by
 * __DEV__ alone — the explicit flag is required — and never in production.
 */
export function resolvePaywallDiagnosticsEnabled({ buildProfile, isDev, qaFlag }: InternalToolingInput): boolean {
  if (isProductionBuildProfile(buildProfile)) return false;
  if (qaFlag !== '1') return false;
  return isDev || buildProfile !== null;
}
