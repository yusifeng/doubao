import type { DialogOrchestratorState } from './types';

export function collectInvariantViolations(state: DialogOrchestratorState): string[] {
  const violations: string[] = [];

  if (state.turn.replyOwner === 'custom' && state.turn.platformReplyAllowed) {
    violations.push('custom reply owner cannot allow platform replies');
  }

  if (state.session.phase === 'idle' && state.turn.phase !== 'idle') {
    violations.push('turn phase must be idle when session is idle');
  }

  if (state.turn.phase === 'finalized' && !state.draft.persisted && state.draft.assistantDraft) {
    violations.push('finalized turn with draft text must be persisted');
  }

  return violations;
}

export function assertDialogOrchestratorInvariants(state: DialogOrchestratorState): void {
  const violations = collectInvariantViolations(state);
  if (violations.length === 0) {
    return;
  }
  throw new Error(`dialog orchestrator invariant violation: ${violations.join('; ')}`);
}
