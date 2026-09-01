// Web-only stub for @shopify/react-native-skia (dev/test environment).
// Skia components render nothing on web; the `Skia` factory namespace returns
// chainable inert objects so call sites like `Skia.Path.MakeFromSVGString(s).copy()`
// don't crash. Mapped in metro.config.js for web only; native untouched.
/* eslint-disable */
function componentNoop() {
  return null;
}
componentNoop.displayName = 'SkiaStubComponent';

// A value that absorbs any property access or call and stays chainable.
const chainable = new Proxy(function () {}, {
  get(_t, prop) {
    if (prop === Symbol.toPrimitive) return () => 0;
    if (prop === Symbol.iterator)
      return function* () {
        yield chainable;
        yield chainable;
        yield chainable;
      };
    if (prop === 'toString') return () => '[skia-stub-value]';
    return chainable;
  },
  apply() {
    return chainable;
  },
  construct() {
    return chainable;
  },
});

// Skia.* namespaces (Path, Paint, Point, ...) produce chainable values.
const skiaNamespace = new Proxy(
  {},
  {
    get() {
      return chainable;
    },
  },
);

module.exports = new Proxy(
  { __esModule: true, Skia: skiaNamespace },
  {
    get(target, prop) {
      if (prop in target) return target[prop];
      if (prop === 'default') return componentNoop;
      // Hooks (useClock, useFont, useImage, ...) return an inert chainable so
      // worklets reading `.value` or destructuring don't crash.
      if (typeof prop === 'string' && /^use[A-Z]/.test(prop)) return () => chainable;
      // Non-component helpers (rect, vec, rrect, TileMode, ...) are lowercase
      // or enum-like; give them chainable too. Capitalized names render as
      // components (Canvas, Path, Group, ...).
      if (typeof prop === 'string' && /^[a-z]/.test(prop)) return chainable;
      return componentNoop;
    },
  },
);
