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

const hookNames = new Set(['useFont', 'useFonts', 'useImage', 'useSVG', 'useTypeface', 'useData', 'useRawData']);

module.exports = new Proxy(
  { __esModule: true, Skia: skiaNamespace },
  {
    get(target, prop) {
      if (prop in target) return target[prop];
      if (prop === 'default') return componentNoop;
      if (typeof prop === 'string' && hookNames.has(prop)) return () => null;
      // Everything else is treated as a component (Canvas, Path, Group, ...).
      return componentNoop;
    },
  },
);
