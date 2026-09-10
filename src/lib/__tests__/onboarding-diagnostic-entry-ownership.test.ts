/* eslint-disable import/first */
/**
 * AQ-2: a diagnostic entry starts fresh work after a previous entry is
 * cancelled. An old settlement cannot apply questions, skip, or clear a newer
 * request's loading flag. Reset, unmount, empty-context skip, and ordinary
 * failure stay as they are.
 */
import * as fs from 'fs';
import * as path from 'path';
import * as vm from 'vm';
import * as ts from 'typescript';
import React from 'react';

const renderer = require('react-test-renderer') as {
  act: (callback: () => void | Promise<void>) => Promise<void>;
  create: (element: React.ReactElement) => {
    toJSON: () => { props: Record<string, unknown> } | null;
    unmount: () => void;
  };
};
const { act, create } = renderer;

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
import {
  beginLocalResetSession,
  captureSyncSession,
  endLocalResetSession,
  isSyncSessionCurrent,
  resetSyncSessionFenceForTesting,
  SyncSessionInvalidatedError,
} from '../generation-session';

const onboardingSource = fs.readFileSync(
  path.join(__dirname, '../../app/onboarding.tsx'),
  'utf8',
);

const sourceFile = ts.createSourceFile(
  'onboarding.tsx',
  onboardingSource,
  ts.ScriptTarget.Latest,
  true,
  ts.ScriptKind.TSX,
);

function extractVariable(name: string): string {
  let found: ts.VariableDeclaration | undefined;
  const walk = (node: ts.Node) => {
    if (ts.isVariableDeclaration(node) && node.name.getText(sourceFile) === name) {
      found = node;
    }
    ts.forEachChild(node, walk);
  };
  walk(sourceFile);
  if (!found) throw new Error(`Missing ${name}`);
  return `const ${found.getText(sourceFile)};`;
}

function extractEffect(marker: string): string {
  let found: ts.CallExpression | undefined;
  const walk = (node: ts.Node) => {
    if (
      ts.isCallExpression(node)
      && node.expression.getText(sourceFile) === 'useEffect'
      && node.arguments[0].getText(sourceFile).includes(marker)
    ) {
      found = node;
    }
    ts.forEachChild(node, walk);
  };
  walk(sourceFile);
  if (!found) throw new Error(`Missing effect ${marker}`);
  return `${found.getText(sourceFile)};`;
}

const compiledEntry = ts.transpileModule(
  extractVariable('onboardingMountedRef')
    + extractEffect('onboardingMountedRef.current = true')
    + extractVariable('ownsOnboardingWork')
    + extractEffect('generateDiagnosticQuestions('),
  { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } },
).outputText;

type DiagnosticQuestion = { question: string; subtext: string; chips: string[] };
type DiagnosticResult = { questions: DiagnosticQuestion[] } | null;

type PendingRequest = {
  promise: Promise<DiagnosticResult>;
  resolve: (value: DiagnosticResult) => void;
  reject: (error: unknown) => void;
  settled: boolean;
};

type DiagnosticState = {
  step: string;
  loading: boolean;
  questions: DiagnosticQuestion[] | null;
  index: number;
  draft: string;
};

function questionsNamed(name: string): DiagnosticResult {
  return { questions: [{ question: name, subtext: '', chips: [] }] };
}

function createPending(): PendingRequest {
  const pending: PendingRequest = {
    settled: false,
    promise: undefined as unknown as Promise<DiagnosticResult>,
    resolve: () => undefined,
    reject: () => undefined,
  };
  pending.promise = new Promise<DiagnosticResult>((resolve, reject) => {
    pending.resolve = (value) => {
      if (pending.settled) return;
      pending.settled = true;
      resolve(value);
    };
    pending.reject = (error) => {
      if (pending.settled) return;
      pending.settled = true;
      reject(error);
    };
  });
  void pending.promise.catch(() => undefined);
  return pending;
}

function stateOf(tree: ReturnType<typeof create>): DiagnosticState {
  const props = tree.toJSON()?.props as DiagnosticState | undefined;
  if (!props) {
    return { step: '', loading: false, questions: null, index: 0, draft: '' };
  }
  return props;
}

describe('diagnostic entry ownership', () => {
  const owned: PendingRequest[] = [];
  let advances = 0;

  function track(request: PendingRequest): PendingRequest {
    owned.push(request);
    return request;
  }

  async function settleOwned(): Promise<void> {
    for (const request of owned.splice(0)) {
      request.resolve(null);
      try {
        await request.promise;
      } catch {
        // Owned synthetic promises must not leak out of the suite.
      }
    }
  }

  beforeEach(() => {
    advances = 0;
    resetSyncSessionFenceForTesting();
  });

  afterEach(async () => {
    await settleOwned();
    resetSyncSessionFenceForTesting();
  });

  async function mountDiagnostic(situation = 'Synthetic situation') {
    const requests: PendingRequest[] = [];
    let navigate!: (step: string) => void;

    function Workflow() {
      const [currentStepId, setStep] = React.useState('diagnosticRound');
      const [diagnosticQuestions, setDiagnosticQuestions] = React.useState<DiagnosticQuestion[] | null>(null);
      const [isLoadingDiagnostic, setIsLoadingDiagnostic] = React.useState(false);
      const [index, setDiagnosticIndex] = React.useState(0);
      const [draft, setDiagnosticDraft] = React.useState('');
      navigate = setStep;
      vm.runInNewContext(compiledEntry, {
        useRef: React.useRef,
        useEffect: React.useEffect,
        currentStepId,
        diagnosticQuestions,
        isLoadingDiagnostic,
        data: { currentSituation: situation, aboutMe: 'Synthetic private old context' },
        setDiagnosticQuestions,
        setIsLoadingDiagnostic,
        setDiagnosticIndex,
        setDiagnosticDraft,
        advanceToNextStep: () => {
          advances += 1;
        },
        generateDiagnosticQuestions: () => {
          const pending = track(createPending());
          requests.push(pending);
          return pending.promise;
        },
        captureSyncSession,
        isSyncSessionCurrent,
        SyncSessionInvalidatedError,
      });
      return React.createElement('diagnostic-state', {
        step: currentStepId,
        loading: isLoadingDiagnostic,
        questions: diagnosticQuestions,
        index,
        draft,
      });
    }

    let tree!: ReturnType<typeof create>;
    await act(async () => {
      tree = create(React.createElement(Workflow));
    });
    return {
      tree,
      requests,
      navigate: (step: string) => navigate(step),
      unmount: async () => {
        await act(async () => {
          tree.unmount();
        });
      },
    };
  }

  async function leaveAndReturn(navigate: (step: string) => void): Promise<void> {
    await act(async () => {
      navigate('currentSituation');
    });
    await act(async () => {
      navigate('diagnosticRound');
    });
  }

  it('starts a replacement request when the user returns before the old request settles', async () => {
    const mounted = await mountDiagnostic();
    expect(mounted.requests).toHaveLength(1);
    expect(stateOf(mounted.tree).loading).toBe(true);

    await leaveAndReturn(mounted.navigate);

    expect(mounted.requests).toHaveLength(2);
    expect(stateOf(mounted.tree)).toMatchObject({
      step: 'diagnosticRound',
      loading: true,
      questions: null,
    });
    expect(advances).toBe(0);
    await mounted.unmount();
  });

  it('leaves the new request loading when the old request completes first', async () => {
    const mounted = await mountDiagnostic();
    await leaveAndReturn(mounted.navigate);

    await act(async () => {
      mounted.requests[0].resolve(questionsNamed('Old diagnostic?'));
    });

    expect(stateOf(mounted.tree)).toMatchObject({
      loading: true,
      questions: null,
    });
    expect(advances).toBe(0);
    await mounted.unmount();
  });

  it('keeps the new questions when the new request finishes before the old one', async () => {
    const mounted = await mountDiagnostic();
    await leaveAndReturn(mounted.navigate);

    await act(async () => {
      mounted.requests[1].resolve(questionsNamed('New diagnostic?'));
    });
    await act(async () => {
      mounted.requests[0].resolve(questionsNamed('Old diagnostic?'));
    });

    expect(stateOf(mounted.tree).questions).toEqual([
      { question: 'New diagnostic?', subtext: '', chips: [] },
    ]);
    expect(stateOf(mounted.tree).loading).toBe(false);
    expect(advances).toBe(0);
    await mounted.unmount();
  });

  it('does not let an old failure advance the replacement entry', async () => {
    const mounted = await mountDiagnostic();
    await leaveAndReturn(mounted.navigate);

    await act(async () => {
      mounted.requests[0].reject(new Error('old diagnostic failure'));
    });

    expect(stateOf(mounted.tree)).toMatchObject({
      step: 'diagnosticRound',
      loading: true,
      questions: null,
    });
    expect(advances).toBe(0);

    await act(async () => {
      mounted.requests[1].resolve(questionsNamed('Replacement diagnostic?'));
    });
    expect(stateOf(mounted.tree).questions).toEqual([
      { question: 'Replacement diagnostic?', subtext: '', chips: [] },
    ]);
    expect(advances).toBe(0);
    await mounted.unmount();
  });

  it('does not apply questions or skip after reset', async () => {
    const mounted = await mountDiagnostic();
    expect(mounted.requests).toHaveLength(1);

    const token = beginLocalResetSession();
    endLocalResetSession(token);

    await act(async () => {
      mounted.requests[0].resolve(questionsNamed('Stale after reset?'));
    });

    expect(stateOf(mounted.tree).questions).toBeNull();
    expect(advances).toBe(0);
    await mounted.unmount();
  });

  it('does not apply questions or skip after unmount', async () => {
    const mounted = await mountDiagnostic();
    expect(mounted.requests).toHaveLength(1);

    await mounted.unmount();
    await act(async () => {
      mounted.requests[0].resolve(questionsNamed('Stale after unmount?'));
    });

    expect(advances).toBe(0);
    expect(stateOf(mounted.tree).questions).toBeNull();
  });

  it('skips once and does not request when the situation is empty', async () => {
    const mounted = await mountDiagnostic('   ');
    expect(mounted.requests).toHaveLength(0);
    expect(advances).toBe(1);
    expect(stateOf(mounted.tree).questions).toBeNull();
    expect(stateOf(mounted.tree).loading).toBe(false);
    await mounted.unmount();
  });

  it('skips once on a current ordinary failure', async () => {
    const mounted = await mountDiagnostic();
    expect(mounted.requests).toHaveLength(1);

    await act(async () => {
      mounted.requests[0].reject(new Error('current diagnostic failure'));
    });

    expect(advances).toBe(1);
    expect(stateOf(mounted.tree).questions).toBeNull();
    expect(stateOf(mounted.tree).loading).toBe(false);
    await mounted.unmount();
  });

  it('shows questions after a normal current-session completion', async () => {
    const mounted = await mountDiagnostic();
    expect(mounted.requests).toHaveLength(1);
    expect(stateOf(mounted.tree).loading).toBe(true);

    await act(async () => {
      mounted.requests[0].resolve(questionsNamed('Current diagnostic?'));
    });

    expect(stateOf(mounted.tree).questions).toEqual([
      { question: 'Current diagnostic?', subtext: '', chips: [] },
    ]);
    expect(stateOf(mounted.tree).loading).toBe(false);
    expect(advances).toBe(0);
    await mounted.unmount();
  });
});
