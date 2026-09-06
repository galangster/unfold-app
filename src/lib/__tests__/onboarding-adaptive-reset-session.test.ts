/* eslint-disable import/first */
/**
 * AQ-1: onboarding adaptive, diagnostic, and mirror-back callbacks must keep
 * the originating reset token. Reset and unmount discard settlement. Same-session
 * completion still applies after the user advances inside the mounted walk-through.
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

function compileBindings(code: string, bindings: Record<string, unknown>): Record<string, unknown> {
  const context = { exports: {} as Record<string, unknown>, setTimeout, clearTimeout, ...bindings };
  vm.runInNewContext(
    ts.transpileModule(code, {
      compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
    }).outputText,
    context,
  );
  return context.exports;
}

function extractVariableFn(name: string): string {
  const source = ts.createSourceFile('onboarding.tsx', onboardingSource, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  let found: ts.Expression | undefined;
  const walk = (node: ts.Node) => {
    if (ts.isVariableDeclaration(node) && node.name.getText(source) === name && node.initializer) {
      found = node.initializer;
    }
    ts.forEachChild(node, walk);
  };
  walk(source);
  if (!found) throw new Error(`Missing ${name}`);
  return found.getText(source);
}

function extractEffect(marker: string): ts.CallExpression {
  const source = ts.createSourceFile('onboarding.tsx', onboardingSource, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  let found: ts.CallExpression | undefined;
  const walk = (node: ts.Node) => {
    if (
      ts.isCallExpression(node)
      && node.expression.getText(source) === 'useEffect'
      && node.arguments[0].getText(source).includes(marker)
    ) {
      found = node;
    }
    ts.forEachChild(node, walk);
  };
  walk(source);
  if (!found) throw new Error(`Missing effect ${marker}`);
  return found;
}

function completeResetWithoutRotatingIdentity(): void {
  const token = beginLocalResetSession();
  endLocalResetSession(token);
}

beforeEach(() => {
  resetSyncSessionFenceForTesting();
});

afterEach(() => {
  resetSyncSessionFenceForTesting();
});

describe('generateNextAdaptiveQuestion ownership', () => {
  function compileAdaptive(bindings: Record<string, unknown>) {
    return compileBindings(`exports.run=${extractVariableFn('generateNextAdaptiveQuestion')}`, {
      captureSyncSession,
      isSyncSessionCurrent,
      SyncSessionInvalidatedError,
      ...bindings,
    }).run as (nextStepId: string, currentAnswerOverride?: string) => Promise<void>;
  }

  it('applies a valid same-session completion after the walk-through has advanced', async () => {
    const adapted: Record<string, unknown> = {};
    let loading = false;
    const run = compileAdaptive({
      data: { currentSituation: 'Synthetic situation', growthGoals: [], obstacles: [], relationshipWithGod: '' },
      adaptedSteps: {},
      STEPS: [
        { id: 'currentSituation', question: 'What is happening?', subtext: '' },
        { id: 'spiritualSeeking', question: 'What are you seeking?', subtext: '' },
      ],
      ownsOnboardingWork: (session: number) => isSyncSessionCurrent(session),
      setIsLoadingAdaptive: (value: boolean) => {
        loading = value;
      },
      setAdaptedSteps: (updater: (prev: Record<string, unknown>) => Record<string, unknown>) => {
        Object.assign(adapted, updater(adapted));
      },
      generateAdaptiveQuestion: async () => ({
        question: 'Same-session adaptive?',
        subtext: 'Ready',
        chips: ['one'],
      }),
    });

    await run('spiritualSeeking', 'Synthetic situation');
    expect(adapted.spiritualSeeking).toEqual({
      question: 'Same-session adaptive?',
      subtext: 'Ready',
      chips: ['one'],
    });
    expect(loading).toBe(false);
  });

  it('does not apply, recapture, or clear loading after reset', async () => {
    const adapted: Record<string, unknown> = {};
    let loading = false;
    let resolveQuestion!: (value: { question: string; subtext: string; chips: string[] }) => void;
    const run = compileAdaptive({
      data: { currentSituation: 'Synthetic situation', growthGoals: [], obstacles: [], relationshipWithGod: '' },
      adaptedSteps: {},
      STEPS: [
        { id: 'currentSituation', question: 'What is happening?', subtext: '' },
        { id: 'spiritualSeeking', question: 'What are you seeking?', subtext: '' },
      ],
      ownsOnboardingWork: (session: number) => isSyncSessionCurrent(session),
      setIsLoadingAdaptive: (value: boolean) => {
        loading = value;
      },
      setAdaptedSteps: (updater: (prev: Record<string, unknown>) => Record<string, unknown>) => {
        Object.assign(adapted, updater(adapted));
      },
      generateAdaptiveQuestion: () => new Promise((resolve) => {
        resolveQuestion = resolve;
      }),
    });

    const pending = run('spiritualSeeking', 'Synthetic situation');
    expect(loading).toBe(true);
    completeResetWithoutRotatingIdentity();
    resolveQuestion({ question: 'Stale adaptive?', subtext: '', chips: [] });
    await pending;

    expect(adapted).toEqual({});
    expect(loading).toBe(true);
  });

  it('does not apply after unmount even when the session is still current', async () => {
    const adapted: Record<string, unknown> = {};
    let loading = false;
    const mounted = { current: true };
    let resolveQuestion!: (value: { question: string; subtext: string }) => void;
    const run = compileAdaptive({
      data: { currentSituation: 'Synthetic situation', growthGoals: [], obstacles: [], relationshipWithGod: '' },
      adaptedSteps: {},
      STEPS: [
        { id: 'currentSituation', question: 'What is happening?', subtext: '' },
        { id: 'spiritualSeeking', question: 'What are you seeking?', subtext: '' },
      ],
      ownsOnboardingWork: (session: number) => mounted.current && isSyncSessionCurrent(session),
      setIsLoadingAdaptive: (value: boolean) => {
        loading = value;
      },
      setAdaptedSteps: (updater: (prev: Record<string, unknown>) => Record<string, unknown>) => {
        Object.assign(adapted, updater(adapted));
      },
      generateAdaptiveQuestion: () => new Promise((resolve) => {
        resolveQuestion = resolve;
      }),
    });

    const pending = run('spiritualSeeking', 'Synthetic situation');
    mounted.current = false;
    resolveQuestion({ question: 'Unmounted adaptive?', subtext: '' });
    await pending;

    expect(adapted).toEqual({});
    expect(loading).toBe(true);
  });

  it('swallows cancellation and does not treat it as an ordinary failure', async () => {
    const adapted: Record<string, unknown> = {};
    let loading = false;
    const run = compileAdaptive({
      data: { currentSituation: 'Synthetic situation', growthGoals: [], obstacles: [], relationshipWithGod: '' },
      adaptedSteps: {},
      STEPS: [
        { id: 'currentSituation', question: 'What is happening?', subtext: '' },
        { id: 'spiritualSeeking', question: 'What are you seeking?', subtext: '' },
      ],
      ownsOnboardingWork: (session: number) => isSyncSessionCurrent(session),
      setIsLoadingAdaptive: (value: boolean) => {
        loading = value;
      },
      setAdaptedSteps: (updater: (prev: Record<string, unknown>) => Record<string, unknown>) => {
        Object.assign(adapted, updater(adapted));
      },
      generateAdaptiveQuestion: async () => {
        throw new SyncSessionInvalidatedError('adaptive question');
      },
    });

    await run('spiritualSeeking', 'Synthetic situation');
    expect(adapted).toEqual({});
    expect(loading).toBe(false);
  });
});

describe('mounted mirror-back and diagnostic callbacks', () => {
  async function settle(): Promise<void> {
    await act(async () => {
      await Promise.resolve();
    });
  }

  it('applies mirror-back after the user advances in the same mounted session', async () => {
    let resolveMirror!: (value: { content: { reflection: string; workingRead?: string } }) => void;
    const writes: unknown[] = [];
    const effect = extractEffect('generateMirrorBackText(');
    const compiled = ts.transpileModule(effect.getText(
      ts.createSourceFile('onboarding.tsx', onboardingSource, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX),
    ), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;

    function Workflow() {
      const [currentStepId, setStep] = React.useState('mirrorBack');
      const [aiMirrorBack, setAiMirrorBack] = React.useState<unknown>(null);
      const [isLoadingMirrorBack, setIsLoadingMirrorBack] = React.useState(false);
      const [data, setData] = React.useState({
        selectedThemes: [],
        selectedType: undefined,
        currentSituation: 'Synthetic situation',
        spiritualSeeking: '',
        aspiration: '',
        name: 'Synthetic',
        aboutMe: SYNTHETIC_ABOUT,
        relationshipWithGod: '',
        growthGoals: [],
        obstacles: [],
        mirrorWorkingRead: undefined as string | undefined,
      });
      (Workflow as { navigate?: (step: string) => void }).navigate = setStep;
      vm.runInNewContext(compiled, {
        useEffect: React.useEffect,
        currentStepId,
        aiMirrorBack,
        isLoadingMirrorBack,
        data,
        captureSyncSession,
        ownsOnboardingWork: (session: number) => isSyncSessionCurrent(session),
        setIsLoadingMirrorBack,
        generateMirrorBackText: () => new Promise((resolve) => {
          resolveMirror = resolve;
        }),
        setAiMirrorBack: (value: unknown) => {
          writes.push(['mirror', value]);
          setAiMirrorBack(value);
        },
        setData: (updater: (prev: typeof data) => typeof data) => {
          const next = updater(data);
          writes.push(['data', next.mirrorWorkingRead]);
          setData(next);
        },
        SyncSessionInvalidatedError,
        logger: { warn: () => undefined },
        mirrorBackContent: { reflection: 'Unused fallback' },
      });
      return React.createElement('mirror-state', {
        step: currentStepId,
        loading: isLoadingMirrorBack,
        content: aiMirrorBack,
      });
    }

    let tree!: ReturnType<typeof create>;
    await act(async () => {
      tree = create(React.createElement(Workflow));
    });
    expect(tree.toJSON()?.props.loading).toBe(true);

    await act(async () => {
      (Workflow as { navigate?: (step: string) => void }).navigate?.('aspiration');
    });
    await act(async () => {
      resolveMirror({ content: { reflection: 'Same-session mirror', workingRead: 'Working read' } });
    });
    await settle();

    expect(tree.toJSON()?.props.step).toBe('aspiration');
    expect(tree.toJSON()?.props.content).toEqual({
      reflection: 'Same-session mirror',
      workingRead: 'Working read',
    });
    expect(tree.toJSON()?.props.loading).toBe(false);
    expect(writes).toContainEqual(['data', 'Working read']);
    await act(async () => {
      tree.unmount();
    });
  });

  it('does not apply mirror-back after reset or unmount', async () => {
    let resolveMirror!: (value: { content: { reflection: string } }) => void;
    let rejectMirror!: (error: Error) => void;
    const writes: string[] = [];
    const mounted = { current: true };
    const effect = extractEffect('generateMirrorBackText(');
    const compiled = ts.transpileModule(effect.getText(
      ts.createSourceFile('onboarding.tsx', onboardingSource, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX),
    ), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;

    function Workflow() {
      const [currentStepId] = React.useState('mirrorBack');
      const [aiMirrorBack, setAiMirrorBack] = React.useState<unknown>(null);
      const [isLoadingMirrorBack, setIsLoadingMirrorBack] = React.useState(false);
      const data = {
        selectedThemes: [],
        currentSituation: 'Synthetic situation',
        spiritualSeeking: '',
        aspiration: '',
        name: 'Synthetic',
        aboutMe: SYNTHETIC_ABOUT,
        growthGoals: [],
        obstacles: [],
      };
      vm.runInNewContext(compiled, {
        useEffect: React.useEffect,
        currentStepId,
        aiMirrorBack,
        isLoadingMirrorBack,
        data,
        captureSyncSession,
        ownsOnboardingWork: (session: number) => mounted.current && isSyncSessionCurrent(session),
        setIsLoadingMirrorBack: (value: boolean) => {
          writes.push(`loading:${value}`);
          setIsLoadingMirrorBack(value);
        },
        generateMirrorBackText: () => new Promise((resolve, reject) => {
          resolveMirror = resolve;
          rejectMirror = reject;
        }),
        setAiMirrorBack: (value: unknown) => {
          writes.push('content');
          setAiMirrorBack(value);
        },
        setData: () => {
          writes.push('data');
        },
        SyncSessionInvalidatedError,
        logger: { warn: () => undefined },
        mirrorBackContent: { reflection: 'Unused fallback' },
      });
      return React.createElement('mirror-state', { loading: isLoadingMirrorBack, content: aiMirrorBack });
    }

    let tree!: ReturnType<typeof create>;
    await act(async () => {
      tree = create(React.createElement(Workflow));
    });
    completeResetWithoutRotatingIdentity();
    await act(async () => {
      resolveMirror({ content: { reflection: 'Stale mirror' } });
    });
    expect(tree.toJSON()?.props.content).toBeNull();
    expect(writes.filter((entry) => entry === 'content' || entry === 'data')).toEqual([]);

    await act(async () => {
      tree.unmount();
    });

    mounted.current = true;
    resetSyncSessionFenceForTesting();
    await act(async () => {
      tree = create(React.createElement(Workflow));
    });
    mounted.current = false;
    await act(async () => {
      rejectMirror(new Error('ordinary failure after unmount'));
    });
    expect(tree.toJSON()?.props.content).toBeNull();
    await act(async () => {
      tree.unmount();
    });
  });

  it('keeps diagnostic cancelled-flag discard and still applies a valid same-session result', async () => {
    let resolveDiagnostic!: (value: { questions: { question: string; subtext: string; chips: string[] }[] }) => void;
    const effect = extractEffect('generateDiagnosticQuestions(');
    const compiled = ts.transpileModule(effect.getText(
      ts.createSourceFile('onboarding.tsx', onboardingSource, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX),
    ), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;

    function Workflow({ revisit }: { revisit: boolean }) {
      const [currentStepId, setStep] = React.useState('diagnosticRound');
      const [diagnosticQuestions, setDiagnosticQuestions] = React.useState<unknown>(null);
      const [isLoadingDiagnostic, setIsLoadingDiagnostic] = React.useState(false);
      const [index, setDiagnosticIndex] = React.useState(0);
      const [draft, setDiagnosticDraft] = React.useState('');
      (Workflow as { navigate?: (step: string) => void }).navigate = setStep;
      vm.runInNewContext(compiled, {
        useEffect: React.useEffect,
        currentStepId,
        diagnosticQuestions,
        isLoadingDiagnostic,
        setDiagnosticQuestions,
        setIsLoadingDiagnostic,
        setDiagnosticIndex,
        setDiagnosticDraft,
        data: { currentSituation: 'Synthetic situation', aboutMe: SYNTHETIC_ABOUT },
        advanceToNextStep: () => undefined,
        captureSyncSession,
        ownsOnboardingWork: (session: number) => isSyncSessionCurrent(session),
        generateDiagnosticQuestions: () => new Promise((resolve) => {
          resolveDiagnostic = resolve;
        }),
        SyncSessionInvalidatedError,
      });
      return React.createElement('diagnostic-state', {
        step: currentStepId,
        loading: isLoadingDiagnostic,
        questions: diagnosticQuestions,
        index,
        draft,
        revisit,
      });
    }

    let tree!: ReturnType<typeof create>;
    await act(async () => {
      tree = create(React.createElement(Workflow, { revisit: false }));
    });
    expect(tree.toJSON()?.props.loading).toBe(true);

    await act(async () => {
      resolveDiagnostic({ questions: [{ question: 'Same-session diagnostic?', subtext: '', chips: [] }] });
    });
    expect(tree.toJSON()?.props.questions).toEqual([
      { question: 'Same-session diagnostic?', subtext: '', chips: [] },
    ]);
    expect(tree.toJSON()?.props.loading).toBe(false);
    await act(async () => {
      tree.unmount();
    });

    resetSyncSessionFenceForTesting();
    await act(async () => {
      tree = create(React.createElement(Workflow, { revisit: true }));
    });
    await act(async () => {
      (Workflow as { navigate?: (step: string) => void }).navigate?.('currentSituation');
    });
    const staleResolve = resolveDiagnostic;
    await act(async () => {
      staleResolve({ questions: [{ question: 'Cancelled diagnostic?', subtext: '', chips: [] }] });
    });
    expect(tree.toJSON()?.props.questions).toBeNull();
    expect(tree.toJSON()?.props.loading).toBe(false);
    await act(async () => {
      tree.unmount();
    });
  });

  it('does not apply diagnostic questions or skip after reset', async () => {
    let resolveDiagnostic!: (value: { questions: { question: string }[] }) => void;
    let advanceCount = 0;
    const effect = extractEffect('generateDiagnosticQuestions(');
    const compiled = ts.transpileModule(effect.getText(
      ts.createSourceFile('onboarding.tsx', onboardingSource, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX),
    ), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;

    function Workflow() {
      const [currentStepId] = React.useState('diagnosticRound');
      const [diagnosticQuestions, setDiagnosticQuestions] = React.useState<unknown>(null);
      const [isLoadingDiagnostic, setIsLoadingDiagnostic] = React.useState(false);
      vm.runInNewContext(compiled, {
        useEffect: React.useEffect,
        currentStepId,
        diagnosticQuestions,
        isLoadingDiagnostic,
        setDiagnosticQuestions: (value: unknown) => {
          setDiagnosticQuestions(value);
        },
        setIsLoadingDiagnostic,
        setDiagnosticIndex: () => undefined,
        setDiagnosticDraft: () => undefined,
        data: { currentSituation: 'Synthetic situation', aboutMe: SYNTHETIC_ABOUT },
        advanceToNextStep: () => {
          advanceCount += 1;
        },
        captureSyncSession,
        ownsOnboardingWork: (session: number) => isSyncSessionCurrent(session),
        generateDiagnosticQuestions: () => new Promise((resolve) => {
          resolveDiagnostic = resolve;
        }),
        SyncSessionInvalidatedError,
      });
      return React.createElement('diagnostic-state', {
        loading: isLoadingDiagnostic,
        questions: diagnosticQuestions,
      });
    }

    let tree!: ReturnType<typeof create>;
    await act(async () => {
      tree = create(React.createElement(Workflow));
    });
    completeResetWithoutRotatingIdentity();
    await act(async () => {
      resolveDiagnostic({ questions: [{ question: 'Stale diagnostic?' }] });
    });
    expect(tree.toJSON()?.props.questions).toBeNull();
    expect(advanceCount).toBe(0);
    await act(async () => {
      tree.unmount();
    });
  });
});

const SYNTHETIC_ABOUT = 'Synthetic private old context';
