import type { AuditStage } from '../../../core/providers/audit/types';
import type { DialogOrchestratorAction } from './dialog-orchestrator/types';
import { buildDialogLogContextPayload, mergeTraceSeedFromEvent, upsertTurnTrace } from './useTextChat.auditTrace';
import type { RealtimeCallPhase, RealtimeListeningState, TurnTraceContext } from './useTextChat.shared';

export function createRuntimeStateHandlers(deps: any) {
  const getActiveConversationId = (): string | null =>
    (typeof deps.getActiveConversationId === 'function'
      ? deps.getActiveConversationId()
      : deps.activeConversationId) ?? null;

  const setRuntimeStatus = (
    status: 'idle' | 'listening' | 'thinking' | 'speaking' | 'error',
  ) => {
    deps.setRuntimeStatus(status);
  };

  const markConversationSelectionEpoch = () => {
    deps.conversationSelectionEpochRef.current += 1;
    return deps.conversationSelectionEpochRef.current;
  };

  const syncConversationState = async () => {
    const activeConversationId = getActiveConversationId();
    if (!activeConversationId) {
      return;
    }
    deps.setMessages(await deps.repo.listMessages(activeConversationId));
    deps.setConversations(await deps.repo.listConversations());
  };

  const selectConversation = async (conversationId: string) => {
    const requestEpoch = markConversationSelectionEpoch();
    const isStaleRequest = () => requestEpoch !== deps.conversationSelectionEpochRef.current;

    const refreshedConversations = await deps.repo.listConversations();
    if (isStaleRequest()) {
      return false;
    }
    const nextConversation = refreshedConversations.find((conversation: any) => conversation.id === conversationId);
    if (!nextConversation) {
      return false;
    }

    deps.setActiveConversationId(conversationId);
    const nextMessages = await deps.repo.listMessages(conversationId);
    if (isStaleRequest()) {
      return false;
    }
    deps.setMessages(nextMessages);
    deps.setConversations(refreshedConversations);
    deps.setLiveUserTranscript('');
    deps.setPendingAssistantReply('');
    await updateConversationRuntimeStatus('idle', { conversationId });
    if (isStaleRequest()) {
      return false;
    }
    return true;
  };

  const createConversation = async (title = '新会话') => {
    markConversationSelectionEpoch();
    let systemPromptSnapshot = deps.getRuntimeConfig().persona.systemPrompt;
    if (!deps.getRuntimeConfigHydrated()) {
      try {
        const hydratedRuntimeConfig = await deps.getEffectiveRuntimeConfig();
        systemPromptSnapshot = hydratedRuntimeConfig.persona.systemPrompt;
        deps.setRuntimeConfig((current: any) =>
          deps.isRuntimeConfigEqual(current, hydratedRuntimeConfig) ? current : hydratedRuntimeConfig,
        );
        deps.setRuntimeConfigHydrated(true);
      } catch {
        // Keep env snapshot as a safe fallback when hydration is unavailable.
      }
    }
    const conversation = await deps.repo.createConversation(title, {
      systemPromptSnapshot,
    });
    deps.setActiveConversationId(conversation.id);
    deps.setConversations(await deps.repo.listConversations());
    deps.setMessages(await deps.repo.listMessages(conversation.id));
    deps.setLiveUserTranscript('');
    deps.setPendingAssistantReply('');
    await updateConversationRuntimeStatus('idle', { conversationId: conversation.id });
    return conversation.id;
  };

  const renameConversationTitle = async (conversationId: string, title: string) => {
    const normalized = title.trim();
    if (!normalized) {
      return false;
    }
    const renamed = await deps.repo.renameConversationTitle(conversationId, normalized);
    if (!renamed) {
      return false;
    }
    deps.setConversations(await deps.repo.listConversations());
    return true;
  };

  const deleteConversation = async (conversationId: string) => {
    markConversationSelectionEpoch();
    const currentActiveConversationId = getActiveConversationId();
    const deleted = await deps.repo.deleteConversation(conversationId);
    if (!deleted) {
      return { ok: false, nextConversationId: currentActiveConversationId ?? null };
    }

    let refreshedConversations = await deps.repo.listConversations();
    let nextConversationId = currentActiveConversationId ?? null;

    if (currentActiveConversationId === conversationId) {
      const fallbackConversation = refreshedConversations[0] ?? null;
      if (fallbackConversation) {
        nextConversationId = fallbackConversation.id;
        deps.setActiveConversationId(fallbackConversation.id);
        deps.setMessages(await deps.repo.listMessages(fallbackConversation.id));
      } else {
        const created = await deps.repo.createConversation('默认会话', {
          systemPromptSnapshot: deps.getRuntimeConfig().persona.systemPrompt,
        });
        refreshedConversations = await deps.repo.listConversations();
        nextConversationId = created.id;
        deps.setActiveConversationId(created.id);
        deps.setMessages(await deps.repo.listMessages(created.id));
      }
      deps.setLiveUserTranscript('');
      deps.setPendingAssistantReply('');
      setRuntimeStatus('idle');
      if (nextConversationId) {
        await deps.repo.updateConversationStatus(nextConversationId, 'idle');
      }
    }

    deps.setConversations(refreshedConversations);
    return { ok: true, nextConversationId };
  };

  const appendAssistantAudioMessage = async (
    text: string,
    options?: { dedupeWindowMs?: number; conversationId?: string | null },
  ) => {
    const conversationId = options?.conversationId ?? getActiveConversationId();
    if (!conversationId) {
      return;
    }
    const normalized = text.trim();
    if (!normalized) {
      return;
    }
    const dedupeWindowMs = options?.dedupeWindowMs ?? 0;
    const now = Date.now();
    const lastHint = deps.lastAssistantAudioHintRef.current;
    if (dedupeWindowMs > 0 && lastHint && lastHint.content === normalized && now - lastHint.at <= dedupeWindowMs) {
      return;
    }
    await deps.repo.appendMessage(conversationId, {
      conversationId,
      role: 'assistant',
      content: normalized,
      type: 'audio',
    });
    deps.lastAssistantAudioHintRef.current = { content: normalized, at: now };
  };

  const resetRealtimeCallState = () => {
    deps.realtimeCallGenerationRef.current += 1;
    deps.voiceLoopActiveRef.current = false;
    deps.voiceLoopRunningRef.current = false;
    deps.realtimePlaybackQueueEndAtRef.current = 0;
    deps.realtimeUpstreamMutedUntilRef.current = 0;
    deps.realtimeSilentFramesRef.current = 0;
    deps.realtimeDroppedNoiseFramesRef.current = 0;
    deps.realtimeSpeechFramesRef.current = 0;
    deps.realtimeSpeechDetectedRef.current = false;
    deps.realtimePostSpeechSilentFramesRef.current = 0;
    deps.lastRealtimeAssistantTextRef.current = '';
    deps.lastAssistantAudioHintRef.current = null;
    deps.androidDialogModeRef.current = null;
    deps.androidDialogInterruptedRef.current = false;
    deps.androidDialogInterruptInFlightRef.current = false;
    deps.androidAssistantDraftRef.current = '';
    deps.androidDialogSessionIdRef.current = null;
    deps.androidDialogConversationIdRef.current = null;
    deps.androidDialogSessionReadyRef.current = false;
    deps.androidPlayerSpeakingRef.current = false;
    deps.androidDialogClientTtsEnabledRef.current = false;
    deps.androidDialogClientTtsSelectionEpochRef.current += 1;
    deps.androidDialogClientTtsSelectionPromiseRef.current = null;
    deps.androidDialogClientTtsSelectionReadyRef.current = false;
    deps.androidCustomClientTtsStreamStartedRef.current = false;
    if (typeof deps.setActiveVoiceSessionId === 'function') {
      deps.setActiveVoiceSessionId(null);
    }
    deps.setIsVoiceActive(false);
    updateRealtimeListeningState('ready');
    updateRealtimeCallPhase('idle');
    setVoiceInputMutedRuntime(false);
    deps.setLiveUserTranscript('');
    deps.setPendingAssistantReply('');
  };

  const setVoiceInputMutedRuntime = (muted: boolean) => {
    deps.setIsVoiceInputMuted(muted);
  };

  const rememberRetiredAndroidDialogSession = (sessionId?: string | null) => {
    const value = sessionId?.trim();
    if (!value) {
      return;
    }
    const next = [...deps.androidRetiredSessionIdsRef.current.filter((id: string) => id !== value), value];
    deps.androidRetiredSessionIdsRef.current = next.slice(-20);
  };

  const toAudioErrorMessage = (message: string, fallback: string): string => {
    if (message.includes('未检测到麦克风输入')) {
      return '没有检测到麦克风声音输入。若使用模拟器，请在 Extended controls > Microphone 中开启 Host audio input，或执行 adb emu avd hostmicon；建议优先用真机测试语音识别。';
    }
    return fallback;
  };

  const updateRealtimeCallPhase = (phase: RealtimeCallPhase) => {
    deps.setRealtimeCallPhase(phase);
  };

  const updateRealtimeListeningState = (state: RealtimeListeningState) => {
    if (deps.getRealtimeListeningState() === state) {
      return;
    }
    deps.setRealtimeListeningState(state);
  };

  const ensureS2SSession = async () => {
    if (deps.getS2SSessionReady()) {
      return;
    }
    await deps.providers.s2s.connect();
    await deps.providers.s2s.startSession();
    deps.setS2SSessionReady(true);
  };

  const updateConversationRuntimeStatus = async (
    status: 'idle' | 'listening' | 'thinking' | 'speaking' | 'error',
    options?: { refreshConversations?: boolean; conversationId?: string | null },
  ) => {
    setRuntimeStatus(status);
    const targetConversationId = options?.conversationId ?? getActiveConversationId();
    if (targetConversationId) {
      await deps.repo.updateConversationStatus(targetConversationId, status);
    }
    if (options?.refreshConversations) {
      deps.setConversations(await deps.repo.listConversations());
    }
  };

  const withCallLifecycleLock = async (
    task: () => Promise<void>,
    options?: { waitIfLocked?: boolean; waitTimeoutMs?: number },
  ) => {
    if (deps.callLifecycleLockRef.current) {
      if (!options?.waitIfLocked) {
        return;
      }
      const waitTimeoutMs = options.waitTimeoutMs ?? deps.CALL_LIFECYCLE_LOCK_WAIT_TIMEOUT_MS;
      try {
        await deps.withTimeout(
          (async () => {
            while (deps.callLifecycleLockRef.current) {
              await new Promise<void>((resolve) => {
                setTimeout(resolve, deps.CALL_LIFECYCLE_LOCK_POLL_INTERVAL_MS);
              });
            }
          })(),
          waitTimeoutMs,
          'call lifecycle lock wait timeout',
        );
      } catch (error) {
        const message = error instanceof Error ? error.message : 'unknown error';
        deps.providers.observability.log('warn', 'call lifecycle lock wait timed out', {
          message,
          waitTimeoutMs,
        });
        throw error;
      }
    }
    deps.callLifecycleLockRef.current = true;
    try {
      await task();
    } finally {
      deps.callLifecycleLockRef.current = false;
    }
  };

  const dispatchDialogOrchestrator = (action: DialogOrchestratorAction) => {
    deps.orchestratorStateRef.current = deps.reduceDialogOrchestratorState(deps.orchestratorStateRef.current, action);
    return deps.orchestratorStateRef.current;
  };

  const ensureTurnTrace = (seed?: Partial<TurnTraceContext>): TurnTraceContext => {
    const next = upsertTurnTrace(
      deps.turnTraceRef.current,
      seed,
      {
        turnId: deps.orchestratorStateRef.current.turn.turnId,
        sessionEpoch: deps.orchestratorStateRef.current.session.sessionEpoch,
      },
      deps.createTurnTraceId,
    );
    deps.turnTraceRef.current = next;
    return next;
  };

  const mergeTurnTraceFromDialogEvent = (event?: any | null) => {
    const traceSeed = mergeTraceSeedFromEvent(event);
    if (!traceSeed) {
      return deps.turnTraceRef.current;
    }
    const next = ensureTurnTrace(traceSeed);
    return next;
  };

  const clearTurnTrace = () => {
    deps.turnTraceRef.current = null;
  };

  const buildDialogLogContext = (extra?: Record<string, unknown>) =>
    buildDialogLogContextPayload({
      orchestratorState: deps.orchestratorStateRef.current,
      androidDialogSessionId: deps.androidDialogSessionIdRef.current,
      androidDialogMode: deps.androidDialogModeRef.current,
      replyChainMode: deps.replyChainMode,
      androidDialogWorkMode: deps.androidDialogWorkMode,
      androidReplyGeneration: deps.androidReplyGenerationRef.current,
      trace: deps.turnTraceRef.current,
      extra,
    });

  const recordAudit = (
    stage: AuditStage,
    options?: {
      level?: 'info' | 'warn' | 'error';
      message?: string;
      traceSeed?: Partial<TurnTraceContext>;
      extra?: Record<string, unknown>;
    },
  ) => {
    const trace = ensureTurnTrace(options?.traceSeed);
    const context = buildDialogLogContext(options?.extra);
    deps.providers.audit.record({
      ...context,
      stage,
      traceId: trace.traceId,
      level: options?.level,
      message: options?.message,
    } as any);
  };

  return {
    syncConversationState,
    selectConversation,
    createConversation,
    renameConversationTitle,
    deleteConversation,
    appendAssistantAudioMessage,
    resetRealtimeCallState,
    setVoiceInputMutedRuntime,
    rememberRetiredAndroidDialogSession,
    toAudioErrorMessage,
    updateRealtimeCallPhase,
    updateRealtimeListeningState,
    ensureS2SSession,
    updateConversationRuntimeStatus,
    withCallLifecycleLock,
    dispatchDialogOrchestrator,
    ensureTurnTrace,
    mergeTurnTraceFromDialogEvent,
    clearTurnTrace,
    buildDialogLogContext,
    recordAudit,
  };
}
