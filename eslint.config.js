// https://docs.expo.dev/guides/using-eslint/
const { defineConfig } = require("eslint/config");
const expoConfig = require("eslint-config-expo/flat");
const pluginQuery = require("@tanstack/eslint-plugin-query");

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
  ...pluginQuery.configs["flat/recommended"],
]);
