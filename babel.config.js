module.exports = function (api) {
  api.cache(true);
  return {
    presets: [
      ["babel-preset-expo", { jsxImportSource: "nativewind", unstable_transformImportMeta: true }],
      "nativewind/babel",
    ],
    plugins: [
      // React Compiler runs via babel-preset-expo (app.json experiments.reactCompiler).
      // Do not also register babel-plugin-react-compiler here: the preset's instance
      // excludes node_modules, sets the production panicThreshold, and carries the
      // 'widget' opt-out directive; a second unguarded pass has none of that.
      [
        "module-resolver",
        {
          alias: {
            "@": "./src",
            "@/shared": "./shared",
            "unfold-editor": "./modules/unfold-editor/src",
            "better-auth/react": "./node_modules/better-auth/dist/client/react/index.cjs",
            "better-auth/client/plugins":
              "./node_modules/better-auth/dist/client/plugins/index.cjs",
            "@better-auth/expo/client": "./node_modules/@better-auth/expo/dist/client.cjs",
          },
        },
      ],
      "@babel/plugin-proposal-export-namespace-from",
      "react-native-reanimated/plugin",
    ],
  };
};
