import type { GenerationSessionStatus, UserProfile } from '@/lib/store';
import type { InflightGenerationJob } from '@/lib/inflight-generation-job';
import { INPUT_LIMITS } from '@/lib/validation';

export const COMPANION_NAME_MAX_LENGTH = 30;
export const PERSONAL_CONTEXT_MAX_LENGTH = INPUT_LIMITS.LONG_TEXT.max;
export const DEFAULT_COMPANION_NAME = 'Grace';

export const COMPANION_IS_AI_BODY =
  "Companion is Unfold's AI. It can pray with you, talk through Scripture, and sit with what's going on. Naming it is how you'll address it — it doesn't change how your devotionals are written.";

export const COMPANION_NAME_LATER_HINT =
  'You can change this name later in Profile.';

export const COMPANION_EMPTY_STATE_AI_NOTE =
  "Companion is Unfold's AI. It can listen, pray, and think with you — and it can get things wrong.";

export const GENERATING_CAN_CLOSE_COPY =
  'You can close Unfold and come back when you are ready.';

export const GENERATING_WRITING_CONTINUES_COPY =
  "We'll keep writing while you're away.";

export const GENERATING_GO_HOME_COPY = 'Go home';

export const GENERATING_GO_HOME_WRITING_COPY =
  "Go home — we'll keep writing";

export const PERSONAL_CONTEXT_FUTURE_DAYS_COPY =
  "The next days we write will use what you save here. A day that's already written stays as it is.";

export const PERSONAL_CONTEXT_PENDING_SYNC_COPY =
  "Saved here. We'll try syncing again.";

export const PENDING_INITIAL_RESUME_TITLE = 'Your first days are still waiting.';

export const PENDING_INITIAL_RESUME_BODY =
  'Continue when you are ready. Profile is still here if you want it.';

export const PENDING_INITIAL_RESUME_CTA = 'Continue';

export type PendingInitialArcResume =
  | 'offer-resume'
  | 'offer-nonblocking-resume'
  | 'none';

export function isReadableCurrentSeries(
  devotional: { days?: readonly unknown[] } | null | undefined,
): boolean {
  return (devotional?.days?.length ?? 0) > 0;
}

export function resolveCreateNewDuringPendingInitial(
  resume: PendingInitialArcResume,
): 'resume-existing' | 'start-fresh' {
  return resume === 'none' ? 'start-fresh' : 'resume-existing';
}

export type PersonalContextSaveResult =
  | { status: 'saved' }
  | { status: 'pending-sync'; message: string };

export interface PersonalContextDraft {
  companionName: string;
  aboutMe: string;
}

export function resolveCompanionDisplayName(
  userCompanionName?: string | null,
  storeCompanionName?: string | null,
): string | null {
  const named = userCompanionName?.trim() || storeCompanionName?.trim();
  return named || null;
}

export function resolveCompanionNameToPersist(
  input: string,
  fallback = DEFAULT_COMPANION_NAME,
): string {
  return input.trim() || fallback;
}

export function createPersonalContextDraft(
  user: Pick<UserProfile, 'aboutMe' | 'companionName'> | null | undefined,
  storeCompanionName?: string | null,
): PersonalContextDraft {
  return {
    companionName:
      resolveCompanionDisplayName(user?.companionName, storeCompanionName) ?? '',
    aboutMe: user?.aboutMe ?? '',
  };
}

export function personalContextDraftHasChanges(
  draft: PersonalContextDraft,
  original: PersonalContextDraft,
): boolean {
  return (
    draft.companionName !== original.companionName ||
    draft.aboutMe !== original.aboutMe
  );
}

export function applyPersonalContextDraft(
  draft: PersonalContextDraft,
): PersonalContextDraft {
  return {
    companionName: resolveCompanionNameToPersist(draft.companionName),
    aboutMe: draft.aboutMe,
  };
}

export function commitPersonalContextDraft(args: {
  draft: PersonalContextDraft;
  updateUser: (updates: Pick<UserProfile, 'aboutMe' | 'companionName'>) => void;
  setCompanionName: (name: string | null) => void;
}): Pick<UserProfile, 'aboutMe' | 'companionName'> {
  const updates = applyPersonalContextDraft(args.draft);
  args.updateUser(updates);
  args.setCompanionName(updates.companionName);
  return updates;
}

export async function savePersonalContextDraft(args: {
  draft: PersonalContextDraft;
  currentUser: UserProfile;
  sync: (user: UserProfile) => Promise<void>;
  updateUser: (updates: Pick<UserProfile, 'aboutMe' | 'companionName'>) => void;
  setCompanionName: (name: string | null) => void;
}): Promise<PersonalContextSaveResult> {
  const updates = commitPersonalContextDraft(args);
  try {
    await args.sync({ ...args.currentUser, ...updates });
    return { status: 'saved' };
  } catch {
    return { status: 'pending-sync', message: PERSONAL_CONTEXT_PENDING_SYNC_COPY };
  }
}

export function resolveGeneratingCloseCopy(hasAcceptedJob: boolean): string {
  return hasAcceptedJob
    ? `${GENERATING_CAN_CLOSE_COPY} ${GENERATING_WRITING_CONTINUES_COPY}`
    : GENERATING_CAN_CLOSE_COPY;
}

export function resolveGeneratingGoHomeLabel(hasAcceptedJob: boolean): string {
  return hasAcceptedJob ? GENERATING_GO_HOME_WRITING_COPY : GENERATING_GO_HOME_COPY;
}

/**
 * A first-series request can outlive a close during submit. Today must not
 * force /generating again: that loops with Go home and blocks Profile.
 * Offer a resume instead. Auto-trial purchase still owns its own reveal.
 */
export function resolvePendingInitialArcResume(input: {
  inflight: InflightGenerationJob | null;
  requestId: string | null;
  generationSessionStatus: GenerationSessionStatus;
  hasReadableCurrentSeries: boolean;
  autoTrialOwnsFlow?: boolean;
}): PendingInitialArcResume {
  if (input.autoTrialOwnsFlow) return 'none';
  if (input.inflight && !input.inflight.superseded) return 'none';
  if (!input.requestId) return 'none';
  if (input.generationSessionStatus === 'complete') return 'none';
  if (input.generationSessionStatus === 'error') return 'none';
  return input.hasReadableCurrentSeries ? 'offer-nonblocking-resume' : 'offer-resume';
}
