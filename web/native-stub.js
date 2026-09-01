// Web-only stub for native-only modules (dev/test environment).
// Metro maps native-only packages here on web (see metro.config.js) so the app
// can boot in a browser. Any imported symbol resolves to a no-op function that
// is also usable as a React component rendering nothing.
/* eslint-disable */
function noop() {
  return null;
}
noop.displayName = 'NativeStub';

const stub = new Proxy(noop, {
  get(_target, prop) {
    if (prop === '__esModule') return true;
    if (prop === 'default') return stub;
    if (prop === Symbol.toPrimitive || prop === 'toString') return () => '[native-stub]';
    return stub;
  },
  apply() {
    return null;
  },
  construct() {
    return {};
  },
});

module.exports = stub;
