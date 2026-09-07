/**
 * MP-4: queued paywall presentation against the installed Expo Router 57.0.16
 * stack reducer. routingQueue.run dispatches each action against the state
 * produced by the previous dispatch, so this test applies actions sequentially.
 */
import * as fs from 'fs';
import * as path from 'path';
import Module from 'module';

const expoRouterBuild = path.join(process.cwd(), 'node_modules/expo-router/build');
const stackClientPath = path.join(expoRouterBuild, 'layouts/StackClient.js');
const rnStackRouterPath = path.join(expoRouterBuild, 'react-navigation/routers/StackRouter.js');

function getSingularId(name: string, options: { params?: Record<string, unknown> } = {}) {
  return name.split('/').map((segment) => {
    if (segment.startsWith('[...')) {
      const value = options.params?.[segment.slice(4, -1)];
      return Array.isArray(value) ? value.join('/') : segment;
    }
    if (segment.startsWith('[') && segment.endsWith(']')) {
      const value = options.params?.[segment.slice(1, -1)];
      return typeof value === 'string' ? value : segment;
    }
    return segment;
  }).join('/');
}

const { StackRouter: RNStackRouter } = jest.requireActual(rnStackRouterPath) as {
  StackRouter: (options: Record<string, unknown>) => { getStateForAction: Function };
};

const stubs: Record<string, unknown> = {
  './withLayoutContext': { withLayoutContext: (value: unknown) => value },
  '../fork/native-stack/createNativeStackNavigator': {
    createNativeStackNavigator: () => ({ Navigator: () => null }),
  },
  '../link/preview/LinkPreviewContext': {},
  './stack-utils': {
    mapProtectedScreen: () => ({ children: null }),
    StackScreen: () => null,
    StackHeader: () => null,
    StackSearchBar: () => null,
    StackTitle: () => null,
    StackToolbar: () => null,
  },
  '../utils/children': {},
  '../views/Protected': { Protected: () => null },
  '../useScreens': { getSingularId },
  '../react-navigation/native': { StackRouter: RNStackRouter },
};

const NodeModule = Module as typeof Module & {
  _nodeModulePaths(from: string): string[];
};
const stackClientModule = new Module(stackClientPath, module) as Module & {
  _compile(code: string, filename: string): void;
};
stackClientModule.filename = stackClientPath;
stackClientModule.paths = NodeModule._nodeModulePaths(path.dirname(stackClientPath));
const originalRequire = stackClientModule.require.bind(stackClientModule);
stackClientModule.require = ((request: string) => {
  if (Object.prototype.hasOwnProperty.call(stubs, request)) {
    return stubs[request];
  }
  return originalRequire(request);
}) as NodeRequire;
stackClientModule._compile(fs.readFileSync(stackClientPath, 'utf8'), stackClientPath);

const { StackRouter } = stackClientModule.exports as {
  StackRouter: (options: Record<string, unknown>) => { getStateForAction: Function };
};

type StackRoute = { key: string; name: string; params?: unknown };
type StackState = {
  stale: boolean;
  type: 'stack';
  key: string;
  index: number;
  routeNames: string[];
  routes: StackRoute[];
  preloadedRoutes: StackRoute[];
};

const ROUTE_NAMES = ['(tabs)', 'paywall'];
const OPTIONS = {
  routeNames: ROUTE_NAMES,
  routeParamList: {},
  routeGetIdList: {},
};

const router = StackRouter({ initialRouteName: '(tabs)' });

function journalState(): StackState {
  return {
    stale: false,
    type: 'stack',
    key: 'stack-1',
    index: 0,
    routeNames: ROUTE_NAMES,
    routes: [{ key: 'tabs-1', name: '(tabs)' }],
    preloadedRoutes: [],
  };
}

function apply(state: StackState, action: { type: string; payload?: { name: string } }): StackState {
  const next = router.getStateForAction(state, action, OPTIONS);
  if (!next) {
    throw new Error(`Action ${action.type} produced null state`);
  }
  return next as StackState;
}

function applyQueued(state: StackState, actions: { type: string; payload?: { name: string } }[]): StackState {
  return actions.reduce((current, action) => apply(current, action), state);
}

function routeNames(state: StackState): string[] {
  return state.routes.map((route) => route.name);
}

describe('Expo Router 57.0.16 paywall presentation queue', () => {
  it('loads the installed stackRouterOverride and StackRouter', () => {
    expect(fs.existsSync(stackClientPath)).toBe(true);
    expect(stackClientModule.exports.stackRouterOverride).toEqual(expect.any(Function));
    expect(router.getStateForAction).toEqual(expect.any(Function));
  });

  it('collapses repeated queued NAVIGATE /paywall actions onto one route', () => {
    const queued = Array.from({ length: 4 }, () => ({
      type: 'NAVIGATE',
      payload: { name: 'paywall' },
    }));

    const presented = applyQueued(journalState(), queued);

    expect(routeNames(presented)).toEqual(['(tabs)', 'paywall']);
    expect(presented.index).toBe(1);
  });

  it('returns to the invoking screen on one GO_BACK and presents again later', () => {
    const firstWave = Array.from({ length: 3 }, () => ({
      type: 'NAVIGATE',
      payload: { name: 'paywall' },
    }));

    const stacked = applyQueued(journalState(), firstWave);
    expect(routeNames(stacked)).toEqual(['(tabs)', 'paywall']);

    const dismissed = apply(stacked, { type: 'GO_BACK' });
    expect(routeNames(dismissed)).toEqual(['(tabs)']);
    expect(dismissed.index).toBe(0);

    const presentedAgain = apply(dismissed, {
      type: 'NAVIGATE',
      payload: { name: 'paywall' },
    });
    expect(routeNames(presentedAgain)).toEqual(['(tabs)', 'paywall']);
    expect(presentedAgain.index).toBe(1);
  });

  it('still stacks distinct keys when the same events use PUSH', () => {
    const queuedPush = Array.from({ length: 3 }, () => ({
      type: 'PUSH',
      payload: { name: 'paywall' },
    }));

    const stacked = applyQueued(journalState(), queuedPush);

    expect(routeNames(stacked)).toEqual(['(tabs)', 'paywall', 'paywall', 'paywall']);
    const keys = stacked.routes.filter((route) => route.name === 'paywall').map((route) => route.key);
    expect(new Set(keys).size).toBe(3);
  });
});
