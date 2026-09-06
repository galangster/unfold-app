'use strict';

/**
 * Behavioral regressions for expo-notifications getDevicePushTokenAsync.
 *
 * Loads the installed TypeScript source and the shipped JavaScript from a
 * parameterized dependency root. Mocks the synthetic expo-modules-core
 * Platform and UnavailabilityError adapters, the native token adapter, and
 * the Expo Go warning helper.
 *
 * Split-thenable scheduling is an adversarial model for owner-only clear
 * races. It is not a claim about native Promise timing.
 */

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

function parseArgs(argv) {
  const out = {
    root: process.env.EXPO_NOTIFICATIONS_ROOT || '',
    typescript: process.env.TYPESCRIPT_ROOT || '',
    jsonOut: process.env.NT3_TEST_JSON_OUT || '',
  };
  for (let i = 2; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--root') {
      out.root = argv[++i];
    } else if (arg === '--typescript') {
      out.typescript = argv[++i];
    } else if (arg === '--json-out') {
      out.jsonOut = argv[++i];
    } else if (arg === '--help') {
      process.stdout.write(
        'Usage: node scripts/expo-notifications-device-push-token-retry.test.cjs --root <expo-notifications> [--typescript <typescript>] [--json-out <file>]\n',
      );
      process.exit(0);
    } else {
      throw new Error(`Unknown argument: ${arg}`);
    }
  }
  return out;
}

function resolveDependencyRoot(requested) {
  if (!requested) {
    throw new Error('expo-notifications root is required: pass --root or set EXPO_NOTIFICATIONS_ROOT');
  }
  return path.resolve(requested);
}

function resolveTypescriptRoot(requested, dependencyRoot) {
  if (requested) {
    return path.resolve(requested);
  }
  return path.resolve(dependencyRoot, '..', 'typescript');
}

function deferred() {
  let resolve;
  let reject;
  const promise = new Promise((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

/**
 * Adversarial thenable that delivers to each awaiter independently.
 * This models an owner-only clear race. It is not native Promise timing.
 */
function createSplitThenable() {
  const pending = [];
  const thenable = {
    then(onFulfilled, onRejected) {
      return new Promise((resolve, reject) => {
        pending.push({
          fulfill(value) {
            try {
              resolve(typeof onFulfilled === 'function' ? onFulfilled(value) : value);
            } catch (error) {
              reject(error);
            }
          },
          reject(error) {
            if (typeof onRejected === 'function') {
              try {
                resolve(onRejected(error));
              } catch (next) {
                reject(next);
              }
            } else {
              reject(error);
            }
          },
        });
      });
    },
  };
  return {
    thenable,
    reactionCount() {
      return pending.length;
    },
    rejectIndex(index, error) {
      if (!pending[index]) {
        throw new Error(`no thenable reaction at ${index}`);
      }
      pending[index].reject(error);
    },
    fulfillAll(value) {
      for (const reaction of pending) {
        reaction.fulfill(value);
      }
    },
  };
}

function loadGetDevicePushTokenAsync(file, ts, nativeImpl, warnImpl, platformOS) {
  const source = fs.readFileSync(file, 'utf8');
  const compiled = ts.transpileModule(source, {
    fileName: file,
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022,
      esModuleInterop: true,
    },
  }).outputText;

  const module = { exports: {} };
  class UnavailabilityError extends Error {
    constructor(moduleName, property) {
      super(`${moduleName}.${property} is unavailable`);
      this.name = 'UnavailabilityError';
    }
  }
  const mocks = {
    'expo-modules-core': {
      Platform: { OS: platformOS },
      UnavailabilityError,
    },
    './PushTokenManager': {
      __esModule: true,
      default: { getDevicePushTokenAsync: nativeImpl },
    },
    './warnOfExpoGoPushUsage': {
      warnOfExpoGoPushUsage: warnImpl,
    },
  };

  const script = new vm.Script(`(function (require, module, exports) {\n${compiled}\n})`, {
    filename: file,
  });
  script.runInThisContext()(
    (id) => {
      if (!Object.prototype.hasOwnProperty.call(mocks, id)) {
        throw new Error(`Unexpected require during SDK load: ${id}`);
      }
      return mocks[id];
    },
    module,
    module.exports,
  );

  if (typeof module.exports.getDevicePushTokenAsync !== 'function') {
    throw new Error(`getDevicePushTokenAsync was not exported from ${file}`);
  }
  return module.exports.getDevicePushTokenAsync;
}

function settled(promise) {
  return promise.then(
    (value) => ({ ok: true, value }),
    (error) => ({ ok: false, error }),
  );
}

async function flushMicrotasks() {
  await Promise.resolve();
  await Promise.resolve();
  await Promise.resolve();
}

async function runSuite(label, file, ts) {
  const results = [];

  async function test(name, fn) {
    const fullName = `${label} ${name}`;
    try {
      await fn();
      results.push({ name: fullName, ok: true });
    } catch (error) {
      results.push({
        name: fullName,
        ok: false,
        message: error && error.message ? error.message : String(error),
      });
    }
  }

  await test('1 native rejects once and succeeds on the next wrapper call', async () => {
    let nativeCalls = 0;
    const warnCalls = [];
    const getToken = loadGetDevicePushTokenAsync(
      file,
      ts,
      async () => {
        nativeCalls += 1;
        if (nativeCalls === 1) {
          throw new Error('synthetic first failure');
        }
        return 'recovered-token';
      },
      () => {
        warnCalls.push('warn');
      },
      'ios',
    );

    const first = await settled(getToken());
    assert.equal(first.ok, false, 'first wrapper call should reject');
    assert.equal(first.error.message, 'synthetic first failure');
    assert.equal(nativeCalls, 1);

    const second = await settled(getToken());
    assert.equal(nativeCalls, 2, 'second wrapper call must reach native again');
    assert.equal(second.ok, true, 'second wrapper call should succeed after a later native success');
    assert.deepEqual(second.value, { type: 'ios', data: 'recovered-token' });
    assert.equal(warnCalls.length, 2);
  });

  await test('2 concurrent callers share one native request', async () => {
    let nativeCalls = 0;
    const gate = deferred();
    const getToken = loadGetDevicePushTokenAsync(
      file,
      ts,
      () => {
        nativeCalls += 1;
        return gate.promise;
      },
      () => {},
      'ios',
    );

    const first = getToken();
    const second = getToken();
    assert.equal(nativeCalls, 1, 'concurrent callers must coalesce');
    gate.resolve('shared-token');
    const values = await Promise.all([first, second]);
    assert.ok(values.every((value) => value.type === 'ios' && value.data === 'shared-token'));
  });

  await test('3 concurrent callers receive the original rejection', async () => {
    let nativeCalls = 0;
    const gate = deferred();
    const original = new Error('shared-native-rejection');
    const getToken = loadGetDevicePushTokenAsync(
      file,
      ts,
      () => {
        nativeCalls += 1;
        return gate.promise;
      },
      () => {},
      'android',
    );

    const first = getToken();
    const second = getToken();
    assert.equal(nativeCalls, 1);
    gate.reject(original);
    const [a, b] = await Promise.all([settled(first), settled(second)]);
    assert.equal(a.ok, false);
    assert.equal(b.ok, false);
    assert.equal(a.error, original, 'caller A must receive the original rejection');
    assert.equal(b.error, original, 'caller B must receive the original rejection');
  });

  await test('4 adversarial thenable: rejected creator starts a new request, old waiters cannot clear it, and further callers join it', async () => {
    const first = createSplitThenable();
    const second = createSplitThenable();
    const nativeErr = new Error('native-1-reject');
    let nativeCalls = 0;
    const getToken = loadGetDevicePushTokenAsync(
      file,
      ts,
      () => {
        nativeCalls += 1;
        if (nativeCalls === 1) {
          return first.thenable;
        }
        if (nativeCalls === 2) {
          return second.thenable;
        }
        throw new Error(`unexpected native call ${nativeCalls}`);
      },
      () => {},
      'ios',
    );

    const callerA = getToken();
    const callerB = getToken();
    assert.equal(nativeCalls, 1);
    await flushMicrotasks();
    assert.equal(first.reactionCount(), 2, 'creator and follower must share the first native thenable');

    first.rejectIndex(0, nativeErr);
    const aResult = await settled(callerA);
    assert.equal(aResult.ok, false);
    assert.equal(aResult.error, nativeErr);

    const retry = getToken();
    assert.equal(nativeCalls, 2, 'rejected creator must be able to start a second native request');
    await flushMicrotasks();
    assert.equal(second.reactionCount(), 1, 'second native request must still be pending');

    first.rejectIndex(1, nativeErr);
    const bResult = await settled(callerB);
    assert.equal(bResult.ok, false);
    assert.equal(bResult.error, nativeErr);
    assert.equal(nativeCalls, 2, 'old follower must not start or clear into a third native request');
    assert.equal(second.reactionCount(), 1, 'new pending request must remain the current native request');

    const joiner = getToken();
    assert.equal(nativeCalls, 2, 'joiner must reuse the second native request');
    await flushMicrotasks();
    assert.equal(second.reactionCount(), 2);

    second.fulfillAll('second-wave-token');
    const [retryResult, joinerResult] = await Promise.all([retry, joiner]);
    assert.deepEqual(retryResult, { type: 'ios', data: 'second-wave-token' });
    assert.deepEqual(joinerResult, { type: 'ios', data: 'second-wave-token' });
  });

  await test('5 success preserves type/data and permits a later native request', async () => {
    let nativeCalls = 0;
    const getToken = loadGetDevicePushTokenAsync(
      file,
      ts,
      async () => {
        nativeCalls += 1;
        return nativeCalls === 1 ? 'first-token' : 'later-token';
      },
      () => {},
      'android',
    );

    const first = await getToken();
    assert.deepEqual(first, { type: 'android', data: 'first-token' });
    const second = await getToken();
    assert.deepEqual(second, { type: 'android', data: 'later-token' });
    assert.equal(nativeCalls, 2);
  });

  return results;
}

async function main() {
  const args = parseArgs(process.argv);
  const dependencyRoot = resolveDependencyRoot(args.root);
  const typescriptRoot = resolveTypescriptRoot(args.typescript, dependencyRoot);

  if (!fs.existsSync(dependencyRoot)) {
    throw new Error(`expo-notifications root does not exist: ${dependencyRoot}`);
  }
  if (!fs.existsSync(typescriptRoot)) {
    throw new Error(`TypeScript root does not exist: ${typescriptRoot}`);
  }

  const pkg = JSON.parse(fs.readFileSync(path.join(dependencyRoot, 'package.json'), 'utf8'));
  if (pkg.name !== 'expo-notifications' || pkg.version !== '57.0.14') {
    throw new Error(`Unexpected package at ${dependencyRoot}: ${pkg.name}@${pkg.version}`);
  }

  const ts = require(typescriptRoot);
  const surfaces = [
    { label: 'source', relative: 'src/getDevicePushTokenAsync.ts' },
    { label: 'shipped-js', relative: 'build/getDevicePushTokenAsync.js' },
  ];

  const all = [];
  for (const surface of surfaces) {
    const file = path.join(dependencyRoot, surface.relative);
    if (!fs.existsSync(file)) {
      throw new Error(`Missing ${surface.relative} under ${dependencyRoot}`);
    }
    const results = await runSuite(surface.label, file, ts);
    all.push(...results);
  }

  const passed = all.filter((item) => item.ok).length;
  const failed = all.filter((item) => !item.ok).length;
  const summary = {
    dependencyRoot,
    typescriptRoot,
    package: `${pkg.name}@${pkg.version}`,
    total: all.length,
    passed,
    failed,
    results: all,
  };

  process.stdout.write(`${JSON.stringify(summary, null, 2)}\n`);
  if (args.jsonOut) {
    fs.mkdirSync(path.dirname(args.jsonOut), { recursive: true });
    fs.writeFileSync(args.jsonOut, `${JSON.stringify(summary, null, 2)}\n`);
  }
  process.exitCode = failed === 0 ? 0 : 1;
}

main().catch((error) => {
  process.stderr.write(`${error && error.stack ? error.stack : error}\n`);
  process.exitCode = 1;
});
