import { getBuildProfile, resolveQaToolsEnabled } from '@/lib/build-profile';

/**
 * Master gate for every QA / debug affordance. A production build (stamped
 * `extra.buildProfile` starting with "production") is always OFF — see
 * build-profile.ts for the full decision table.
 */
export function isQaToolsEnabled(): boolean {
  return resolveQaToolsEnabled({
    buildProfile: getBuildProfile(),
    isDev: __DEV__,
    qaFlag: process.env.EXPO_PUBLIC_ENABLE_QA_TOOLS,
  });
}
