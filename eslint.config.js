// https://docs.expo.dev/guides/using-eslint/
const { defineConfig } = require("eslint/config");
const expoConfig = require("eslint-config-expo/flat");
const pluginQuery = require("@tanstack/eslint-plugin-query");

// Hoisted so the src/lib/navigation.ts override below can re-list them: flat
// config REPLACES a rule's config rather than merging it, so an override that
// only named the router selector would silently reopen the fetch ban there.
// src/lib/__tests__/eslint-no-bare-fetch-rule.test.ts pins these.
const FETCH_SELECTORS = [
  {
    selector: "CallExpression[callee.name='fetch']",
    message:
      "Call authenticatedFetch (@/lib/device-credential) for backend requests, or externalFetch (@/lib/external-fetch) for third-party hosts.",
  },
  {
    selector:
      "CallExpression[callee.type='MemberExpression'][callee.property.name='fetch'][callee.object.name=/^(globalThis|global|window|self)$/]",
    message:
      "Call authenticatedFetch (@/lib/device-credential) for backend requests, or externalFetch (@/lib/external-fetch) for third-party hosts.",
  },
];

// router.back() is a no-op on an empty stack, so a screen reached from a push
// notification or an `unfold://` link on a cold start could not be left at all
// (1.1.8 build 279). src/lib/__tests__/eslint-no-router-back-rule.test.ts pins
// this and its single allowed file.
const ROUTER_BACK_SELECTOR = {
  selector:
    "CallExpression[callee.type='MemberExpression'][callee.object.name='router'][callee.property.name='back']",
  message:
    "router.back() is a silent no-op on an empty stack (a push or deep-link cold start). Call goBackOr from @/lib/navigation so the exit always leads somewhere.",
};

module.exports = defineConfig([
  expoConfig,
  {
    ignores: [
      "**/dist/**",
      "**/backend/generated/**",
      "**/backend/prisma/**",
      "backend/generated/**",
      "backend/prisma/**",
      "backend/node_modules/**",
      "backend/src/generated/**",
      "**/node_modules/**",
      "node_modules/**",
      "**/.expo/**",
      ".expo/**",
      "**/.expo-shared/**",
      ".expo-shared/**",
      "**/patches/**",
      "patches/**",
      "bun.lock",
      "eslint.config.js",
      "nativewind-env.d.ts",
      "rootStore.example.ts",
    ],
    settings: {
      "import/resolver": {
        typescript: {
          alwaysTryTypes: true,
          project: "./tsconfig.json",
        },
      },
    },
    rules: {
      // Formatting nits the sorter doesn't fix
      "comma-spacing": ["warn", { before: false, after: true }],
      // React recommended rules (only those not already covered by expo config)
      "react/jsx-no-undef": "error",
      "react/jsx-uses-react": "off", // React 17+ JSX transform
      "react/react-in-jsx-scope": "off",

      // Enforce stable React Hooks rules. Expo 56's hook plugin also ships
      // React Compiler diagnostics, but this app is not compiler-ready yet and
      // those rules produce a large historical backlog unrelated to this SDK bump.
      "react-hooks/rules-of-hooks": "error",
      "react-hooks/exhaustive-deps": "warn",
      "react-hooks/config": "off",
      "react-hooks/error-boundaries": "off",
      "react-hooks/gating": "off",
      "react-hooks/globals": "off",
      "react-hooks/immutability": "off",
      "react-hooks/incompatible-library": "off",
      "react-hooks/preserve-manual-memoization": "off",
      "react-hooks/purity": "off",
      "react-hooks/refs": "off",
      "react-hooks/set-state-in-effect": "off",
      "react-hooks/set-state-in-render": "off",
      "react-hooks/static-components": "off",
      "react-hooks/unsupported-syntax": "off",
      "react-hooks/use-memo": "off",

      "react/no-unescaped-entities": "off",

      // Raw console calls bypass the __DEV__ gate in src/lib/logger.ts and
      // spam dev output (37 of them ran on every hydration). Go through
      // `logger` (dev-only) or `reportError` (production-worthy failures).
      "no-console": "error",

      // Backend requests go through `authenticatedFetch` (src/lib/device-credential.ts)
      // so a device-credential 401 heals once. Third-party hosts go through
      // `externalFetch` (src/lib/external-fetch.ts). A global fetch() call
      // anywhere else skips both. The allowlist below is those two transports,
      // tests, manual mocks, and Node tooling;
      // src/lib/__tests__/eslint-no-bare-fetch-rule.test.ts pins both halves.
      "no-restricted-syntax": ["error", ...FETCH_SELECTORS, ROUTER_BACK_SELECTOR],
    },
  },
  {
    // The only places a raw console call is allowed. Every entry needs a
    // reason; src/lib/__tests__/eslint-no-console-rule.test.ts pins the list.
    files: [
      // The __DEV__ gate itself.
      "src/lib/logger.ts",
      // Vendored, generated rangy bundle — never hand-edited.
      "src/components/reading/rangy-bundle.ts",
      // Node-side tooling: CLI scripts and the Metro build config. Both are
      // linted by `bun run lint` and print to the terminal on purpose.
      "scripts/**",
      "metro.config.js",
    ],
    rules: {
      "no-console": "off",
    },
  },
  {
    // The only places a global fetch() call is allowed. Every entry needs a
    // reason; src/lib/__tests__/eslint-no-bare-fetch-rule.test.ts pins the list.
    files: [
      // The backend transport, and the registration call it must not recurse into.
      "src/lib/device-credential.ts",
      // The third-party transport (bible-api.com).
      "src/lib/external-fetch.ts",
      // Tests and manual mocks stub the global fetch directly.
      "src/**/__tests__/**",
      "src/**/*.test.ts",
      "src/**/*.test.tsx",
      "src/lib/__mocks__/**",
      // Node-side tooling talks to App Store Connect and the backend directly.
      "scripts/**",
    ],
    rules: {
      "no-restricted-syntax": "off",
    },
  },
  {
    // The guard itself — the only file allowed to call router.back(). The fetch
    // selectors are re-listed because flat config replaces rule config.
    files: ["src/lib/navigation.ts"],
    rules: {
      "no-restricted-syntax": ["error", ...FETCH_SELECTORS],
    },
  },
  ...pluginQuery.configs["flat/recommended"],
]);
