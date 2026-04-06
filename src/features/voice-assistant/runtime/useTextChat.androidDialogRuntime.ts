import { isSameAssistantText, sanitizeAssistantText } from '../service/assistantText';
import { createTurnTraceId } from './useTextChat.shared';
import { runCustomLlmReplyRound } from './useTextChat.customReplyRound';
import type { Message } from '../types/model';
import type { AuditStage } from '../../../core/providers/audit/types';
import { KONAN_CHARACTER_MANIFEST } from '../../../character/konanManifest';

export function createAndroidDialogRuntimeHandlers(deps: {
  activeConversationId: string | null;
  useAndroidDialogRuntime: boolean;
  isVoiceActive: boolean;
  replyChainMode: 'official_s2s' | 'custom_llm';
  llmConfig: { model?: string; provider?: string };
  conversations: any[];
  repo: any;
  providers: any;
  orchestratorStateRef: { current: any };
  turnTraceRef: { current: any };
  androidDialogSessionIdRef: { current: string | null };
  androidDialogConversationIdRef: { current: string | null };
  androidDialogModeRef: { current: 'voice' | 'text' | null };
  androidReplyGenerationRef: { current: number };
  androidDialogClientTtsSelectionReadyRef: { current: boolean };
  androidDialogClientTtsEnabledRef: { current: boolean };
  androidCustomClientTtsStreamStartedRef: { current: boolean };
  androidDialogInterruptedRef: { current: boolean };
  androidDialogInterruptInFlightRef: { current: boolean };
  androidPlayerSpeakingRef: { current: boolean };
  realtimeCallPhaseRef: { current: string };
  voiceLoopActiveRef: { current: boolean };
  pendingAssistantReply: string;
  androidAssistantDraftRef: { current: string };
  ensureTurnTrace: (seed?: any) => { traceId: string; questionId?: string; replyId?: string };
  dispatchDialogOrchestrator: (action: any) => void;
  setPendingAssistantReply: (value: string) => void;
  setLiveUserTranscript: (value: string) => void;
  setConnectivityHint: (value: string) => void;
  setConversations: (value: any[]) => void;
  updateConversationRuntimeStatus: (status: any, options?: { refreshConversations?: boolean }) => Promise<void>;
  updateRealtimeCallPhase: (phase: any) => void;
  updateRealtimeListeningState: (state: any) => void;
  resetRealtimeCallState: () => void;
  syncConversationState: () => Promise<void>;
  buildDialogLogContext: (context?: Record<string, unknown>) => Record<string, unknown>;
  recordAudit: (stage: AuditStage, options?: any) => void;
  stopAndroidDialogConversation: (options?: { persistPendingAssistantDraft?: boolean }) => Promise<void>;
  ensureAndroidDialogConversation: (mode: 'voice' | 'text', options?: { forceRestart?: boolean }) => Promise<void>;
  withCallLifecycleLock: (task: () => Promise<void>, options?: { waitIfLocked?: boolean }) => Promise<void>;
  androidSessionController: any;
}) {
  const runAndroidReplyFlow = async ({
    userText,
    mode,
    assistantMessageType,
    resumeVoiceAfterReply,
    conversationId,
  }: {
    userText: string;
    mode: 'text' | 'voice';
    assistantMessageType: Message['type'];
    resumeVoiceAfterReply: boolean;
    conversationId?: string;
  }) => {
    const targetConversationId = conversationId ?? deps.androidDialogConversationIdRef.current ?? deps.activeConversationId;
    if (!targetConversationId || !deps.useAndroidDialogRuntime) {
      return;
    }

    const generation = deps.androidReplyGenerationRef.current + 1;
    deps.androidReplyGenerationRef.current = generation;
    deps.dispatchDialogOrchestrator({ type: 'generation_bump_reply' });
    deps.dispatchDialogOrchestrator({ type: 'turn_reply_owner', owner: 'custom' });
    deps.dispatchDialogOrchestrator({ type: 'turn_phase', phase: 'replying' });
    const trace = deps.ensureTurnTrace({
      traceId:
        deps.turnTraceRef.current?.traceId ??
        createTurnTraceId({
          turnId: deps.orchestratorStateRef.current.turn.turnId,
          sessionEpoch: deps.orchestratorStateRef.current.session.sessionEpoch,
        }),
    });
    deps.recordAudit('reply.custom.request_start', {
      extra: {
        generation,
        mode,
        userTextLength: userText.length,
        model: deps.llmConfig.model || 'unknown',
        provider: deps.llmConfig.provider || 'openai-compatible',
      },
    });
    const conversation = deps.conversations.find((item) => item.id === targetConversationId) ?? null;
    if (conversation && !conversation.systemPromptSnapshot?.trim()) {
      await deps.repo.updateConversationSystemPromptSnapshot(targetConversationId, KONAN_CHARACTER_MANIFEST);
      deps.setConversations(await deps.repo.listConversations());
    }
    const currentMessages = await deps.repo.listMessages(targetConversationId);
    const effectiveSystemPrompt = conversation?.systemPromptSnapshot?.trim() || KONAN_CHARACTER_MANIFEST;

    await deps.updateConversationRuntimeStatus('thinking', { refreshConversations: true });

    let assistantText = '';
    deps.setPendingAssistantReply('');
    let assistantPersisted = false;
    const persistAssistantText = async (raw: string) => {
      const normalized = sanitizeAssistantText(raw.trim());
      if (!normalized) {
        return;
      }
      await deps.repo.appendMessage(targetConversationId, {
        conversationId: targetConversationId,
        role: 'assistant',
        content: normalized,
        type: assistantMessageType,
      });
      assistantPersisted = true;
    };

    const customRound = await runCustomLlmReplyRound({
      generation,
      getCurrentGeneration: () => deps.androidReplyGenerationRef.current,
      userText,
      mode,
      conversation,
      currentMessages,
      effectiveSystemPrompt,
      trace,
      sdkSessionId: deps.orchestratorStateRef.current.session.sdkSessionId ?? deps.androidDialogSessionIdRef.current,
      dialogId: deps.orchestratorStateRef.current.session.dialogId,
      turnId: deps.orchestratorStateRef.current.turn.turnId,
      llmConfig: deps.llmConfig,
      replyChainMode: deps.replyChainMode,
      assistantMessageType,
      initialCanStreamViaClientTts:
        deps.replyChainMode === 'custom_llm' ? deps.androidDialogClientTtsSelectionReadyRef.current : false,
      // Preserve provider instance context (`this`) for class-based implementations.
      generateReplyStream: (input: {
        userText: string;
        mode: 'text' | 'voice';
        conversation: unknown;
        messages: unknown[];
        systemPrompt: string;
        trace: {
          traceId: string;
          questionId?: string;
          replyId?: string;
          sessionId: string | null;
          dialogId: string | null;
          turnId: number;
        };
      }) => deps.providers.reply.generateReplyStream(input),
      streamClientTtsText: (payload: any) => deps.androidSessionController.streamClientTtsText(payload),
      interruptCurrentDialog: () => deps.androidSessionController.interruptCurrentDialog(),
      setPendingAssistantReply: deps.setPendingAssistantReply,
      setConnectivityHint: deps.setConnectivityHint,
      disableClientTtsFlag: () => {
        deps.androidDialogClientTtsEnabledRef.current = false;
      },
      markClientTtsStreamStarted: () => {
        deps.androidCustomClientTtsStreamStartedRef.current = true;
      },
      dispatchDraftReplyDelta: (chunk: string) => {
        deps.dispatchDialogOrchestrator({ type: 'draft_reply_delta', text: chunk, source: 'custom' });
      },
      dispatchDraftReplyFinalized: () => {
        deps.dispatchDialogOrchestrator({ type: 'draft_reply_finalized', persisted: true });
      },
      dispatchTurnInterrupted: () => {
        deps.dispatchDialogOrchestrator({ type: 'turn_phase', phase: 'interrupted' });
      },
      persistAssistantText: async (raw: string) => {
        await persistAssistantText(raw);
        assistantPersisted = true;
      },
      syncConversationState: deps.syncConversationState,
      appendFailureAssistantMessage: async () => {
        await deps.repo.appendMessage(targetConversationId, {
          conversationId: targetConversationId,
          role: 'assistant',
          content: '自定义LLM语音回复失败，请重试。',
          type: 'text',
        });
      },
      log: deps.providers.observability.log,
      buildDialogLogContext: deps.buildDialogLogContext,
      recordAudit: (stage: string, options: any) => {
        deps.recordAudit(stage as AuditStage, options);
      },
    });
    assistantText = customRound.assistantText;
    assistantPersisted = assistantPersisted || customRound.assistantPersisted;
    if (customRound.abortedByGeneration) {
      return;
    }

    if (resumeVoiceAfterReply && deps.voiceLoopActiveRef.current) {
      if (deps.androidPlayerSpeakingRef.current) {
        deps.updateRealtimeCallPhase('speaking');
        deps.dispatchDialogOrchestrator({ type: 'turn_phase', phase: 'speaking' });
        await deps.updateConversationRuntimeStatus('speaking', { refreshConversations: true });
      } else {
        deps.updateRealtimeListeningState('ready');
        deps.updateRealtimeCallPhase('listening');
        deps.dispatchDialogOrchestrator({ type: 'turn_phase', phase: 'listening' });
        await deps.updateConversationRuntimeStatus('listening', { refreshConversations: true });
      }
    } else {
      await deps.stopAndroidDialogConversation();
      await deps.updateConversationRuntimeStatus('idle', { refreshConversations: true });
    }

    if (!assistantPersisted && assistantText.trim().length > 0) {
      const fallbackPartialText = sanitizeAssistantText(assistantText.trim());
      if (fallbackPartialText) {
        await persistAssistantText(fallbackPartialText);
      }
    }
    await deps.syncConversationState();
  };

  const performAndroidDialogInterrupt = async (source: 'manual' | 'barge_in') => {
    const targetConversationId = deps.androidDialogConversationIdRef.current ?? deps.activeConversationId;
    if (!targetConversationId || !deps.useAndroidDialogRuntime || !deps.isVoiceActive) {
      return;
    }
    if (deps.realtimeCallPhaseRef.current !== 'speaking') {
      return;
    }
    if (deps.androidDialogInterruptInFlightRef.current) {
      return;
    }

    deps.androidDialogInterruptInFlightRef.current = true;
    const interruptedText = sanitizeAssistantText((deps.androidAssistantDraftRef.current || deps.pendingAssistantReply).trim());

    try {
      await deps.androidSessionController.interruptCurrentDialog();
      deps.androidDialogInterruptedRef.current = true;
      deps.androidPlayerSpeakingRef.current = false;
      deps.dispatchDialogOrchestrator({ type: 'turn_interrupted' });
      deps.recordAudit('tts.playback_interrupted', {
        extra: {
          semanticEvent: 'assistant_playback_interrupted',
          source,
        },
      });
      if (interruptedText) {
        const currentMessages = await deps.repo.listMessages(targetConversationId);
        const lastMessage = currentMessages[currentMessages.length - 1];
        if (!(lastMessage?.role === 'assistant' && isSameAssistantText(lastMessage.content, interruptedText))) {
          await deps.repo.appendMessage(targetConversationId, {
            conversationId: targetConversationId,
            role: 'assistant',
            content: interruptedText,
            type: 'audio',
          });
        }
      }
      if (source === 'manual') {
        deps.setLiveUserTranscript('');
      }
      deps.setPendingAssistantReply('');
      deps.androidAssistantDraftRef.current = '';
      if (source === 'manual') {
        deps.updateRealtimeListeningState('ready');
      }
      deps.updateRealtimeCallPhase('listening');
      await deps.updateConversationRuntimeStatus('listening', { refreshConversations: true });
      if (targetConversationId === deps.activeConversationId) {
        await deps.syncConversationState();
      } else {
        deps.setConversations(await deps.repo.listConversations());
      }
      deps.providers.observability.log('info', 'android dialog interrupted', {
        ...deps.buildDialogLogContext({
          source,
          interruptedTextLength: interruptedText.length,
        }),
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'unknown error';
      deps.providers.observability.log(
        'warn',
        'failed to interrupt android dialog output',
        deps.buildDialogLogContext({
          message,
          source,
        }),
      );
      deps.androidDialogInterruptedRef.current = false;
    } finally {
      deps.androidDialogInterruptInFlightRef.current = false;
    }
  };

  const maybeInterruptOnBargeIn = ({ eventType, text }: { eventType: 'asr_start' | 'asr_partial'; text?: string }) => {
    if (!deps.useAndroidDialogRuntime || !deps.isVoiceActive || !deps.voiceLoopActiveRef.current) {
      return;
    }
    if (deps.realtimeCallPhaseRef.current !== 'speaking') {
      return;
    }
    if (deps.androidDialogInterruptedRef.current || deps.androidDialogInterruptInFlightRef.current) {
      return;
    }
    if (deps.replyChainMode === 'custom_llm') {
      if (eventType === 'asr_start') {
        return;
      }
      if ((text?.trim().length ?? 0) < 2) {
        return;
      }
    }
    deps.providers.observability.log('info', 'android barge-in detected while speaking', {
      eventType,
    });
    void performAndroidDialogInterrupt('barge_in');
  };

  const recoverFromPlatformReplyLeakInCustomMode = async (eventType: 'chat_partial' | 'chat_final') => {
    if (!deps.useAndroidDialogRuntime) {
      return;
    }
    const shouldRestartVoice =
      deps.voiceLoopActiveRef.current &&
      deps.androidDialogModeRef.current === 'voice' &&
      deps.realtimeCallPhaseRef.current !== 'stopping';

    let interruptErrorMessage: string | null = null;
    try {
      await deps.androidSessionController.interruptCurrentDialog();
      return;
    } catch (error) {
      interruptErrorMessage = error instanceof Error ? error.message : 'unknown error';
      deps.providers.observability.log(
        'warn',
        'failed to interrupt platform voice after platform leak; escalating to hard reset',
        deps.buildDialogLogContext({
          eventType,
          message: interruptErrorMessage,
        }),
      );
    }

    try {
      await deps.withCallLifecycleLock(
        async () => {
          await deps.stopAndroidDialogConversation({ persistPendingAssistantDraft: false });
          if (shouldRestartVoice) {
            await deps.ensureAndroidDialogConversation('voice', { forceRestart: true });
          }
        },
        { waitIfLocked: true },
      );

      if (shouldRestartVoice) {
        deps.updateRealtimeListeningState('ready');
        deps.updateRealtimeCallPhase('listening');
        await deps.updateConversationRuntimeStatus('listening', { refreshConversations: true });
        deps.setConnectivityHint('检测到平台回复泄漏，已重置语音会话并继续自定义LLM。');
      } else {
        await deps.updateConversationRuntimeStatus('idle', { refreshConversations: true });
        deps.setConnectivityHint('检测到平台回复泄漏，已自动挂断通话。');
      }
    } catch (resetError) {
      const message = resetError instanceof Error ? resetError.message : 'unknown error';
      deps.providers.observability.log(
        'warn',
        'failed to recover from platform leak in custom_llm mode',
        deps.buildDialogLogContext({
          eventType,
          message,
          interruptErrorMessage: interruptErrorMessage ?? undefined,
        }),
      );
      deps.resetRealtimeCallState();
      await deps.updateConversationRuntimeStatus('idle', { refreshConversations: true });
      deps.setConnectivityHint('检测到平台回复泄漏，自动重置失败，请重新接通语音通话。');
    }
  };

  return {
    runAndroidReplyFlow,
    performAndroidDialogInterrupt,
    maybeInterruptOnBargeIn,
    recoverFromPlatformReplyLeakInCustomMode,
  };
}
