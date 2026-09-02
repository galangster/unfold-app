// Dynamic wrapper around app.json.
//
// Expo passes the static app.json contents in as `config`; the only thing
// added here is build-profile provenance. EAS sets EAS_BUILD_PROFILE for every
// build (cloud and --local), so each binary carries the eas.json profile that
// produced it in `expo.extra.buildProfile`. `src/lib/build-profile.ts` reads it
// through expo-constants so the QA-tools and paywall-diagnostics gates can hard
// block a production binary regardless of EXPO_PUBLIC_* flags or a stray .env.
// Local `expo start` / `expo run:*` leave the variable unset → key omitted, so
// the resolved config is identical to app.json.
const buildProfile = process.env.EAS_BUILD_PROFILE?.trim();

module.exports = ({ config }) => ({
  ...config,
  extra: {
    ...(config.extra ?? {}),
    ...(buildProfile ? { buildProfile } : {}),
  },
});
