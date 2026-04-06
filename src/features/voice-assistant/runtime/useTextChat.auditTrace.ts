import { resolveDialogNativeMessageTypeName } from '../../../core/providers/dialog-engine/nativeMessageCatalog';
import type { DialogEngineEvent } from '../../../core/providers/dialog-engine/types';
import type { DialogOrchestratorState } from './dialog-orchestrator/types';
import type { AndroidDialogMode, TurnTraceContext } from './useTextChat.shared';

type TurnSeed = Partial<TurnTraceContext> | undefined;

function normalizeMaybeString(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() ? value.trim() : undefined;
}

export function upsertTurnTrace(
  existing: TurnTraceContext | null,
  seed: TurnSeed,
  ids: { turnId: number; sessionEpoch: number },
  createTurnTraceId: (seed: { turnId: number; sessionEpoch: number }) => string,
): TurnTraceContext {
  const normalizedSeedTraceId = normalizeMaybeString(seed?.traceId);
  const normalizedSeedQuestionId = normalizeMaybeString(seed?.questionId);
  const normalizedSeedReplyId = normalizeMaybeString(seed?.replyId);
  const normalizedSdkTraceId = normalizeMaybeString(seed?.sdkTraceId);

  if (existing) {
    return {
      traceId: normalizedSeedTraceId ?? existing.traceId,
      questionId: normalizedSeedQuestionId ?? existing.questionId,
      replyId: normalizedSeedReplyId ?? existing.replyId,
      sdkTraceId: normalizedSdkTraceId ?? existing.sdkTraceId,
    };
  }

  return {
    traceId:
      normalizedSeedTraceId ??
      createTurnTraceId({
        turnId: ids.turnId,
        sessionEpoch: ids.sessionEpoch,
      }),
    questionId: normalizedSeedQuestionId,
    replyId: normalizedSeedReplyId,
    sdkTraceId: normalizedSdkTraceId,
  };
}

export function mergeTraceSeedFromEvent(event?: DialogEngineEvent | null): Partial<TurnTraceContext> | undefined {
  if (!event) {
    return undefined;
  }
  return {
    questionId: normalizeMaybeString(event.questionId),
    replyId: normalizeMaybeString(event.replyId),
    sdkTraceId: normalizeMaybeString(event.traceId),
  };
}

export function buildDialogLogContextPayload(params: {
  orchestratorState: DialogOrchestratorState;
  androidDialogSessionId: string | null;
  androidDialogMode: AndroidDialogMode | null;
  replyChainMode: string;
  androidDialogWorkMode: string;
  androidReplyGeneration: number;
  trace: TurnTraceContext | null;
  extra?: Record<string, unknown>;
}) {
  const nativeMessageTypeRaw = params.extra?.nativeMessageType;
  const nativeMessageType =
    typeof nativeMessageTypeRaw === 'string' || typeof nativeMessageTypeRaw === 'number'
      ? nativeMessageTypeRaw
      : undefined;
  const nativeMessageName = resolveDialogNativeMessageTypeName(nativeMessageType);

  return {
    sessionEpoch: params.orchestratorState.session.sessionEpoch,
    sessionId: params.orchestratorState.session.sdkSessionId ?? params.androidDialogSessionId,
    dialogId: params.orchestratorState.session.dialogId,
    turnId: params.orchestratorState.turn.turnId,
    mode: params.orchestratorState.session.interactionMode ?? params.androidDialogMode,
    replyChain: params.orchestratorState.session.replyChain ?? params.replyChainMode,
    workMode: params.orchestratorState.session.workMode ?? params.androidDialogWorkMode,
    phase: params.orchestratorState.turn.phase,
    replyOwner: params.orchestratorState.turn.replyOwner,
    generation: params.orchestratorState.generation.replyGeneration ?? params.androidReplyGeneration,
    traceId: params.trace?.traceId,
    questionId: params.trace?.questionId,
    replyId: params.trace?.replyId,
    sdkTraceId: params.trace?.sdkTraceId,
    nativeMessageName,
    ...params.extra,
  };
}
