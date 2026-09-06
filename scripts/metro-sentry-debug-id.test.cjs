'use strict';

/**
 * Regression for Metro Sentry runtime Debug ID wiring.
 *
 * Loads the app metro.config.js. Captures the plugins and Expo
 * enhanceMiddleware reference from the real getDefaultConfig call.
 * Serializes both fixtures with config.serializer.customSerializer from
 * that loaded configuration. Prepares a Core event with the installed
 * stack parser in a child process.
 *
 * NativeWind is stubbed at the require boundary. Loading the real
 * nativewind/metro wrapper writes TypeScript caches and can start the
 * Tailwind watcher. The installed wrapper delegates to CSS interop,
 * which spreads the configuration and keeps the serializer property.
 * This file does not load that wrapper, so it does not prove NativeWind
 * rendering, CSS output, or serializer preservation after wrap.
 * It does not prove complete app bundling.
 */

const assert = require('node:assert/strict');
const { spawnSync } = require('node:child_process');
const fs = require('node:fs');
const Module = require('node:module');
const os = require('node:os');
const path = require('node:path');
const vm = require('node:vm');

const THIS_FILE = require.main.filename;
const APP_ROOT = path.resolve(path.dirname(THIS_FILE), '..');
const METRO_CONFIG = path.join(APP_ROOT, 'metro.config.js');
const BUNDLE = 'app:///main.jsbundle';
const UNRELATED = 'app:///unrelated.jsbundle';
const FIXED_RELEASE = 'com.unfoldapp.ios@1.1.4+183';
const FIXED_DIST = '183';

function sourcemapImages(event) {
  const images =
    event && event.debug_meta && Array.isArray(event.debug_meta.images)
      ? event.debug_meta.images
      : [];
  return images.filter((image) => image && image.type === 'sourcemap');
}

function executableFixtureJs(code) {
  return String(code)
    .split('\n')
    .filter((line) => line.trim() !== '' && !/^\s*\/\/#/.test(line))
    .join('\n');
}

function evaluateFixture(code) {
  const fixtureJs = executableFixtureJs(code);
  const context = vm.createContext({
    Error,
    process: { env: { ...process.env } },
  });
  vm.runInContext(fixtureJs, context, {
    filename: 'metro-sentry-debug-id-fixture.js',
    timeout: 1000,
  });
  const identifier = context._sentryDebugIdIdentifier;
  const ids = context._sentryDebugIds;
  const hasSentryDebugIds = typeof ids === 'object' && ids !== null;
  const hasSentryDebugIdIdentifier = typeof identifier === 'string';
  let runtimeId = null;
  if (hasSentryDebugIdIdentifier && identifier.startsWith('sentry-dbid-')) {
    runtimeId = identifier.slice('sentry-dbid-'.length);
  } else if (hasSentryDebugIds) {
    const values = Object.values(ids);
    if (typeof values[0] === 'string') {
      runtimeId = values[0];
    }
  }
  return {
    fixtureJs,
    hasSentryDebugIds,
    hasSentryDebugIdIdentifier,
    runtimeId,
  };
}

function makeGraph(entry, dev) {
  return {
    dependencies: new Map(),
    entryPoints: new Set([entry]),
    transformOptions: {
      customTransformOptions: { environment: 'client' },
      dev,
      minify: !dev,
      platform: 'ios',
      type: 'module',
      unstable_transformProfile: 'hermes-stable',
    },
  };
}

function makeOptions(entryDir, createModuleIdFactory, dev) {
  return {
    asyncRequireModulePath: 'metro-runtime/src/modules/asyncRequire',
    createModuleId: createModuleIdFactory(),
    dev,
    getRunModuleStatement: (moduleId) => `__r(${JSON.stringify(moduleId)});`,
    globalPrefix: '',
    includeAsyncPaths: false,
    inlineSourceMap: false,
    modulesOnly: false,
    processModuleFilter: () => true,
    projectRoot: entryDir,
    runBeforeMainModule: [],
    runModule: false,
    serverRoot: entryDir,
    shouldAddToIgnoreList: () => false,
    sourceMapUrl: 'fixture.map',
    sourceUrl: null,
  };
}

async function serializeFixture(serializer, { entry, entryDir, createModuleIdFactory, dev }) {
  const result = await serializer(
    entry,
    [],
    makeGraph(entry, dev),
    makeOptions(entryDir, createModuleIdFactory, dev),
  );
  const isString = typeof result === 'string';
  const code = isString ? result : result.code;
  const map = !isString && typeof result.map === 'string' ? JSON.parse(result.map) : null;
  const mapDebugId = map && typeof map.debugId === 'string' ? map.debugId : null;
  return {
    resultShape: isString ? 'string' : 'code+map',
    mapDebugId,
    runtime: evaluateFixture(code),
  };
}

function loadAppMetroWiring() {
  const nativeWindCalls = [];
  let capturedPlugins;
  let capturedExpoMiddleware;
  const originalLoad = Module._load;
  const previousDevFlag = process.env.___SENTRY_METRO_DEV_SERVER___;

  Module._load = function loadIsolated(request, parent, isMain) {
    if (request === 'nativewind/metro') {
      return {
        withNativeWind(config, options) {
          nativeWindCalls.push(options);
          return config;
        },
      };
    }
    if (request === 'expo/metro-config') {
      const actual = originalLoad.call(this, request, parent, isMain);
      return new Proxy(actual, {
        get(target, prop, receiver) {
          if (prop === 'getDefaultConfig') {
            return function captureExpoConstructor(projectRoot, options) {
              capturedPlugins = Array.isArray(options?.unstable_beforeAssetSerializationPlugins)
                ? options.unstable_beforeAssetSerializationPlugins
                : [];
              const expoConfig = target.getDefaultConfig(projectRoot, options);
              capturedExpoMiddleware = expoConfig.server?.enhanceMiddleware;
              return expoConfig;
            };
          }
          return Reflect.get(target, prop, receiver);
        },
      });
    }
    return originalLoad.call(this, request, parent, isMain);
  };

  try {
    delete require.cache[require.resolve(METRO_CONFIG)];
    const config = require(METRO_CONFIG);
    return { config, capturedPlugins, capturedExpoMiddleware, nativeWindCalls };
  } finally {
    Module._load = originalLoad;
    if (previousDevFlag === undefined) {
      delete process.env.___SENTRY_METRO_DEV_SERVER___;
    } else {
      process.env.___SENTRY_METRO_DEV_SERVER___ = previousDevFlag;
    }
  }
}

async function prepareEventMain() {
  const payload = JSON.parse(fs.readFileSync(0, 'utf8'));
  const {
    prepareEvent,
    createStackParser,
    nodeStackLineParser,
    getFilenameToDebugIdMap,
  } = require('@sentry/core');

  if (typeof prepareEvent !== 'function') {
    throw new Error('prepareEvent is not a function');
  }

  vm.runInThisContext(payload.fixtureJs, {
    filename: BUNDLE,
    timeout: 1000,
  });

  const stackParser = createStackParser(nodeStackLineParser());
  const filenameMap = getFilenameToDebugIdMap(stackParser);
  const parserExtractedBundleFilename = Object.keys(filenameMap).includes(BUNDLE);

  const event = {
    exception: {
      values: [
        {
          type: 'Error',
          value: 'fixture',
          stacktrace: {
            frames: [
              { filename: UNRELATED, lineno: 1, colno: 1 },
              { filename: BUNDLE, lineno: 1, colno: 1 },
            ],
          },
        },
      ],
    },
  };

  const prepared = await prepareEvent(
    {
      integrations: [],
      stackParser,
      release: FIXED_RELEASE,
      dist: FIXED_DIST,
    },
    event,
    {},
  );
  if (!prepared) {
    throw new Error('prepareEvent returned empty');
  }

  const images = sourcemapImages(prepared);
  const matchingImage = images.find(
    (image) => image.debug_id === payload.mapDebugId && image.code_file === BUNDLE,
  );
  const unrelatedImage = images.find((image) => image.code_file === UNRELATED);
  const frames = (((prepared.exception || {}).values || [])[0] || {}).stacktrace || {};
  const frameList = Array.isArray(frames.frames) ? frames.frames : [];
  const unrelatedFrame = frameList.find((frame) => frame.filename === UNRELATED);

  process.stdout.write(
    `${JSON.stringify({
      parserExtractedBundleFilename,
      hasSourcemapImage: images.length > 0,
      imageMatchesMap: Boolean(matchingImage),
      unrelatedHasImage: Boolean(unrelatedImage),
      unrelatedHasDebugId: Boolean(unrelatedFrame && unrelatedFrame.debug_id),
      releaseSurvived: prepared.release === FIXED_RELEASE,
      distSurvived: prepared.dist === FIXED_DIST,
    })}\n`,
  );
}

function runPrepareEventChild(payload) {
  const child = spawnSync(process.execPath, [THIS_FILE, '--prepare-event'], {
    encoding: 'utf8',
    cwd: APP_ROOT,
    input: JSON.stringify(payload),
    timeout: 15000,
  });
  if (child.status !== 0) {
    throw new Error((child.stderr || '').trim() || `prepare-event child exited ${String(child.status)}`);
  }
  const line = (child.stdout || '').trim().split('\n').filter(Boolean).pop();
  if (!line) {
    throw new Error('prepare-event child produced no machine output');
  }
  return JSON.parse(line);
}

async function main() {
  const { unstableBeforeAssetSerializationDebugIdPlugin } = require('@sentry/react-native/metro');
  assert.equal(typeof unstableBeforeAssetSerializationDebugIdPlugin, 'function');

  const { config, capturedPlugins, capturedExpoMiddleware, nativeWindCalls } =
    loadAppMetroWiring();
  const plugins = Array.isArray(capturedPlugins) ? capturedPlugins : [];
  const serializer = config.serializer?.customSerializer;
  const createModuleIdFactory = config.serializer?.createModuleIdFactory;

  assert.equal(nativeWindCalls.length, 1, 'metro.config.js must still compose NativeWind last');
  assert.equal(nativeWindCalls[0]?.input, './global.css');
  assert.ok(
    plugins.includes(unstableBeforeAssetSerializationDebugIdPlugin),
    'app Metro wiring must pass Sentry Debug ID plugin to Expo getDefaultConfig',
  );
  assert.equal(
    plugins.length,
    1,
    'injectReleaseForWeb:false must omit the web release-constants plugin',
  );
  assert.equal(
    config.server?.enhanceMiddleware,
    capturedExpoMiddleware,
    'enableSourceContextInDevelopment:false must keep Expo enhanceMiddleware',
  );
  assert.ok(
    String(config.transformer?.babelTransformerPath || '').includes('react-native-svg-transformer'),
    'metro.config.js must preserve the SVG transformer',
  );
  assert.equal(config.transformer?.minifierConfig?.compress?.drop_console, true);
  assert.equal(config.resolver?.sourceExts?.includes('svg'), true);
  assert.equal(config.resolver?.assetExts?.includes('svg'), false);
  assert.equal(typeof serializer, 'function', 'loaded app config must export a Metro serializer');
  assert.equal(typeof createModuleIdFactory, 'function');

  const entryDir = fs.mkdtempSync(path.join(os.tmpdir(), 'metro-sentry-debug-id-'));
  const entry = path.join(entryDir, 'fixture-entry.js');
  fs.writeFileSync(entry, 'void 0;\n');

  try {
    const prod = await serializeFixture(serializer, {
      entry,
      entryDir,
      createModuleIdFactory,
      dev: false,
    });
    const dev = await serializeFixture(serializer, {
      entry,
      entryDir,
      createModuleIdFactory,
      dev: true,
    });

    assert.equal(prod.resultShape, 'code+map');
    assert.equal(typeof prod.mapDebugId, 'string');
    assert.equal(prod.runtime.hasSentryDebugIds, true);
    assert.equal(prod.runtime.hasSentryDebugIdIdentifier, true);
    assert.equal(prod.runtime.runtimeId, prod.mapDebugId);

    assert.equal(dev.resultShape, 'string');
    assert.equal(dev.mapDebugId, null);
    assert.equal(dev.runtime.hasSentryDebugIds, false);
    assert.equal(dev.runtime.hasSentryDebugIdIdentifier, false);
    assert.equal(dev.runtime.runtimeId, null);

    const prepared = runPrepareEventChild({
      fixtureJs: prod.runtime.fixtureJs,
      mapDebugId: prod.mapDebugId,
    });
    assert.equal(prepared.parserExtractedBundleFilename, true);
    assert.equal(prepared.hasSourcemapImage, true);
    assert.equal(prepared.imageMatchesMap, true);
    assert.equal(prepared.unrelatedHasImage, false);
    assert.equal(prepared.unrelatedHasDebugId, false);
    assert.equal(prepared.releaseSurvived, true);
    assert.equal(prepared.distSurvived, true);
  } finally {
    fs.rmSync(entryDir, { recursive: true, force: true });
  }

  console.log('metro-sentry-debug-id PASS');
}

if (process.argv.includes('--prepare-event')) {
  prepareEventMain().catch((error) => {
    process.stderr.write(`${error && error.message ? error.message : String(error)}\n`);
    process.exit(1);
  });
} else {
  main().catch((error) => {
    console.error(error && error.message ? error.message : String(error));
    process.exit(1);
  });
}
