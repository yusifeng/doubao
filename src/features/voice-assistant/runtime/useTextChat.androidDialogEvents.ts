import type { DialogEngineEvent } from '../../../core/providers/dialog-engine/types';
import { finalizeOfficialS2SReply } from './dialog-orchestrator/replyDrivers/officialS2SReplyDriver';
import { shouldDropPlatformReplyInCustomTurn } from './dialog-orchestrator/replyDrivers/customLlmReplyDriver';
import { isSameAssistantText, sanitizeAssistantText } from '../service/assistantText';

type LifecycleDeps = {
  androidDialogSessionIdRef: { current: string | null };
  androidDialogConversationIdRef: { current: string | null };
  androidDialogSessionReadyRef: { current: boolean };
  androidPlayerSpeakingRef: { current: boolean };
  androidDialogClientTtsEnabledRef: { current: boolean };
  androidDialogClientTtsSelectionEpochRef: { current: number };
  androidDialogClientTtsSelectionPromiseRef: { current: Promise<boolean> | null };
  androidDialogClientTtsSelectionReadyRef: { current: boolean };
  androidCustomClientTtsStreamStartedRef: { current: boolean };
  androidReplyGenerationRef: { current: number };
  androidPlatformFinalTextByTurnKeyRef: { current: Map<string, string> };
  androidPlatformFinalInFlightTurnKeysRef: { current: Set<string> };
  androidPlatformFinalPendingTextByTurnKeyRef: { current: Map<string, string> };
  androidRetiredSessionIdsRef: { current: string[] };
  voiceLoopActiveRef: { current: boolean };
  rememberRetiredAndroidDialogSession: (sessionId?: string | null) => void;
  setConnectivityHint: (value: string) => void;
  clearTurnTrace: () => void;
  recordAudit: (stage: any, options?: any) => void;
  dispatchDialogOrchestrator: (action: any) => void;
  resetRealtimeCallState: () => void;
  updateRealtimeCallPhase: (phase: any) => void;
  updateRealtimeListeningState: (state: any) => void;
  setIsVoiceActive: (value: boolean) => void;
  updateConversationRuntimeStatus: (status: any, options?: { refreshConversations?: boolean }) => Promise<void>;
  logIgnoredAndroidDialogEvent: (reason: string) => void;
};

const MAX_PLATFORM_FINAL_TEXT_CACHE_SIZE = 120;

function resolvePlatformReplyTurnKey(
  event: DialogEngineEvent,
  fallbackConversationId: string | null,
): string | null {
  const replyId = event.replyId?.trim();
  if (replyId) {
    return `reply:${replyId}`;
  }
  const questionId = event.questionId?.trim();
  if (questionId) {
    return `question:${questionId}`;
  }
  const traceId = event.traceId?.trim();
  if (traceId) {
    return `trace:${traceId}`;
  }
  if (event.sessionId || typeof event.turnIndex === 'number' || fallbackConversationId) {
    return `session:${event.sessionId ?? 'unknown'}:turn:${event.turnIndex ?? 'unknown'}:conversation:${fallbackConversationId ?? 'unknown'}`;
  }
  return null;
}

function rememberPlatformFinalTextByTurnKey(cache: Map<string, string>, key: string, text: string) {
  cache.delete(key);
  cache.set(key, text);
  if (cache.size <= MAX_PLATFORM_FINAL_TEXT_CACHE_SIZE) {
    return;
  }
  const oldestKey = cache.keys().next().value;
  if (typeof oldestKey === 'string') {
    cache.delete(oldestKey);
  }
}

function mergePlatformFinalTextCandidate(currentText: string, incomingText: string): string {
  if (!incomingText) {
    return currentText;
  }
  if (!currentText) {
    return incomingText;
  }
  if (incomingText.includes(currentText)) {
    return incomingText;
  }
  if (currentText.includes(incomingText)) {
    return currentText;
  }
  return incomingText.length >= currentText.length ? incomingText : currentText;
}

export function guardAndroidDialogSession(
  event: DialogEngineEvent,
  deps: {
    androidDialogSessionIdRef: { current: string | null };
    androidRetiredSessionIdsRef: { current: string[] };
    logIgnoredAndroidDialogEvent: (reason: string) => void;
  },
) {
  if (event.type === 'engine_start' && event.sessionId && deps.androidRetiredSessionIdsRef.current.includes(event.sessionId)) {
    deps.logIgnoredAndroidDialogEvent('retired_session');
    return true;
  }
  if (
    (event.type === 'engine_start' || event.type === 'session_ready') &&
    event.sessionId &&
    deps.androidDialogSessionIdRef.current &&
    event.sessionId !== deps.androidDialogSessionIdRef.current
  ) {
    if (event.type === 'engine_start') {
      deps.logIgnoredAndroidDialogEvent('lifecycle_session_mismatch');
      return true;
    }
  }
  return false;
}

export function handleAndroidLifecycleEvent(event: DialogEngineEvent, deps: LifecycleDeps): boolean {
  switch (event.type) {
    case 'engine_start':
      deps.androidDialogSessionIdRef.current = event.sessionId ?? null;
      deps.androidDialogSessionReadyRef.current = false;
      deps.androidPlayerSpeakingRef.current = false;
      deps.androidDialogClientTtsEnabledRef.current = false;
      deps.androidDialogClientTtsSelectionEpochRef.current += 1;
      deps.androidDialogClientTtsSelectionPromiseRef.current = null;
      deps.androidDialogClientTtsSelectionReadyRef.current = false;
      deps.androidCustomClientTtsStreamStartedRef.current = false;
      deps.androidPlatformFinalTextByTurnKeyRef.current.clear();
      deps.androidPlatformFinalInFlightTurnKeysRef.current.clear();
      deps.androidPlatformFinalPendingTextByTurnKeyRef.current.clear();
      deps.clearTurnTrace();
      deps.dispatchDialogOrchestrator({
        type: 'session_started',
        sdkSessionId: event.sessionId ?? null,
      });
      deps.setConnectivityHint('Android Dialog SDK 引擎已启动');
      return true;
    case 'session_ready':
      if (event.sessionId && !deps.androidDialogSessionIdRef.current) {
        deps.androidDialogSessionIdRef.current = event.sessionId;
      }
      deps.androidDialogSessionReadyRef.current = true;
      deps.dispatchDialogOrchestrator({
        type: 'session_ready',
        sdkSessionId: event.sessionId ?? null,
        dialogId: event.dialogId ?? event.sessionId ?? null,
      });
      return true;
    case 'engine_stop':
      if (event.sessionId) {
        deps.rememberRetiredAndroidDialogSession(event.sessionId);
      }
      if (
        event.sessionId &&
        (!deps.androidDialogSessionIdRef.current || event.sessionId !== deps.androidDialogSessionIdRef.current)
      ) {
        deps.logIgnoredAndroidDialogEvent('lifecycle_session_mismatch');
        return true;
      }
      deps.androidDialogSessionIdRef.current = null;
      deps.androidDialogConversationIdRef.current = null;
      deps.androidDialogSessionReadyRef.current = false;
      deps.androidPlayerSpeakingRef.current = false;
      deps.androidDialogClientTtsEnabledRef.current = false;
      deps.androidDialogClientTtsSelectionEpochRef.current += 1;
      deps.androidDialogClientTtsSelectionPromiseRef.current = null;
      deps.androidDialogClientTtsSelectionReadyRef.current = false;
      deps.androidCustomClientTtsStreamStartedRef.current = false;
      deps.androidPlatformFinalTextByTurnKeyRef.current.clear();
      deps.androidPlatformFinalInFlightTurnKeysRef.current.clear();
      deps.androidPlatformFinalPendingTextByTurnKeyRef.current.clear();
      deps.recordAudit('session.stopped');
      deps.clearTurnTrace();
      deps.setConnectivityHint('Android Dialog SDK 引擎已停止');
      deps.androidReplyGenerationRef.current += 1;
      deps.dispatchDialogOrchestrator({ type: 'generation_bump_reply' });
      deps.dispatchDialogOrchestrator({ type: 'session_stopped' });
      deps.resetRealtimeCallState();
      void deps.updateConversationRuntimeStatus('idle', { refreshConversations: true });
      return true;
    case 'error': {
      if (
        event.sessionId &&
        deps.androidDialogSessionIdRef.current &&
        event.sessionId !== deps.androidDialogSessionIdRef.current
      ) {
        return true;
      }
      const message = event.errorMessage ?? event.raw ?? '未知错误';
      deps.androidPlayerSpeakingRef.current = false;
      deps.androidCustomClientTtsStreamStartedRef.current = false;
      deps.setConnectivityHint(`Android Dialog SDK 错误：${message}`);
      deps.dispatchDialogOrchestrator({ type: 'session_error' });
      void deps.updateConversationRuntimeStatus('error', { refreshConversations: true });
      if (deps.voiceLoopActiveRef.current) {
        deps.updateRealtimeCallPhase('idle');
        deps.updateRealtimeListeningState('ready');
        deps.setIsVoiceActive(false);
        deps.voiceLoopActiveRef.current = false;
      }
      return true;
    }
    default:
      return false;
  }
}

export function handleAndroidDialogPayloadEvent(
  event: DialogEngineEvent,
  semanticEvent: string | undefined,
  deps: any,
): boolean {
  switch (event.type) {
    case 'player_start':
      if (semanticEvent !== 'assistant_playback_started') {
        return true;
      }
      if (
        deps.replyChainMode === 'custom_llm' &&
        deps.androidDialogModeRef.current === 'voice' &&
        !deps.androidCustomClientTtsStreamStartedRef.current
      ) {
        deps.providers.observability.log(
          'info',
          'ignore player_start before custom client tts stream starts',
          deps.buildDialogLogContext({
            semanticEvent,
          }),
        );
        return true;
      }
      deps.androidPlayerSpeakingRef.current = true;
      deps.recordAudit('tts.playback_start', {
        extra: { semanticEvent },
      });
      if (!deps.voiceLoopActiveRef.current || deps.androidDialogModeRef.current !== 'voice') {
        return true;
      }
      deps.updateRealtimeCallPhase('speaking');
      deps.dispatchDialogOrchestrator({ type: 'turn_phase', phase: 'speaking' });
      void deps.updateConversationRuntimeStatus('speaking', { refreshConversations: true });
      return true;
    case 'player_finish': {
      if (semanticEvent !== 'assistant_playback_finished') {
        return true;
      }
      const shouldIgnoreCustomFinishBeforeStreamStart =
        deps.replyChainMode === 'custom_llm' &&
        deps.androidDialogModeRef.current === 'voice' &&
        !deps.androidCustomClientTtsStreamStartedRef.current;
      const isCurrentlySpeaking =
        deps.realtimeCallPhaseRef.current === 'speaking' || deps.androidPlayerSpeakingRef.current;
      if (shouldIgnoreCustomFinishBeforeStreamStart && !isCurrentlySpeaking) {
        deps.providers.observability.log(
          'info',
          'ignore player_finish before custom client tts stream starts',
          deps.buildDialogLogContext({
            semanticEvent,
          }),
        );
        return true;
      }
      deps.androidPlayerSpeakingRef.current = false;
      deps.recordAudit('tts.playback_finish', {
        extra: { semanticEvent },
      });
      deps.updateRealtimeListeningState('ready');
      deps.updateRealtimeCallPhase('listening');
      deps.dispatchDialogOrchestrator({ type: 'turn_phase', phase: 'listening' });
      void deps.updateConversationRuntimeStatus('listening', { refreshConversations: true });
      return true;
    }
    case 'asr_start': {
      if (semanticEvent !== 'user_speech_started' || deps.isVoiceInputMutedRef.current) {
        return true;
      }
      const wasSpeaking = deps.realtimeCallPhaseRef.current === 'speaking';
      if (deps.replyChainMode === 'custom_llm') {
        deps.androidDialogClientTtsEnabledRef.current = false;
        deps.androidObservedPlatformReplyInCustomRef.current = false;
        deps.beginAndroidClientTtsSelectionForTurn();
      }
      deps.maybeInterruptOnBargeIn({ eventType: 'asr_start' });
      if (wasSpeaking) {
        return true;
      }
      if (deps.replyChainMode === 'custom_llm') {
        deps.androidCustomClientTtsStreamStartedRef.current = false;
      }
      deps.androidDialogInterruptedRef.current = false;
      deps.setLiveUserTranscript('');
      deps.setPendingAssistantReply('');
      deps.androidAssistantDraftRef.current = '';
      if (!deps.androidDialogConversationIdRef.current && deps.activeConversationId) {
        deps.androidDialogConversationIdRef.current = deps.activeConversationId;
      }
      deps.dispatchDialogOrchestrator({
        type: 'turn_started',
        assistantMessageType: 'audio',
        platformReplyAllowed: deps.replyChainMode !== 'custom_llm',
      });
      deps.dispatchDialogOrchestrator({ type: 'draft_clear' });
      deps.clearTurnTrace();
      deps.ensureTurnTrace({
        questionId: event.questionId,
        replyId: event.replyId,
        sdkTraceId: event.traceId,
        traceId: deps.createTurnTraceId({
          turnId: deps.orchestratorStateRef.current.turn.turnId,
          sessionEpoch: deps.orchestratorStateRef.current.session.sessionEpoch,
        }),
      });
      deps.recordAudit('turn.started', {
        extra: { sourceEventType: event.type, semanticEvent },
      });
      if (deps.voiceLoopActiveRef.current) {
        deps.updateRealtimeListeningState('ready');
        deps.updateRealtimeCallPhase('listening');
        void deps.updateConversationRuntimeStatus('listening', { refreshConversations: true });
      }
      return true;
    }
    case 'asr_partial': {
      if (deps.isVoiceInputMutedRef.current) {
        return true;
      }
      deps.maybeInterruptOnBargeIn({ eventType: 'asr_partial', text: event.text });
      if (!deps.voiceLoopActiveRef.current) {
        return true;
      }
      const waitingForInterruptWhileSpeaking =
        deps.realtimeCallPhaseRef.current === 'speaking' && !deps.androidDialogInterruptedRef.current;
      deps.setLiveUserTranscript(event.text);
      deps.dispatchDialogOrchestrator({ type: 'draft_live_transcript', text: event.text });
      if (waitingForInterruptWhileSpeaking) {
        deps.updateRealtimeListeningState('hearing');
        return true;
      }
      deps.updateRealtimeListeningState('hearing');
      void deps.updateConversationRuntimeStatus('listening', { refreshConversations: true });
      return true;
    }
    case 'asr_final': {
      if (semanticEvent !== 'user_speech_finalized' || deps.isVoiceInputMutedRef.current) {
        return true;
      }
      if (deps.realtimeCallPhaseRef.current === 'speaking' && !deps.androidDialogInterruptedRef.current) {
        return true;
      }
      const turnConversationId = deps.androidDialogConversationIdRef.current ?? deps.activeConversationId;
      if (!deps.voiceLoopActiveRef.current || !turnConversationId) {
        return true;
      }
      const finalUserText = event.text.trim();
      if (!finalUserText) {
        deps.setLiveUserTranscript('');
        deps.updateRealtimeListeningState('ready');
        deps.updateRealtimeCallPhase('listening');
        void deps.updateConversationRuntimeStatus('listening', { refreshConversations: true });
        return true;
      }
      deps.androidDialogInterruptedRef.current = false;
      deps.setLiveUserTranscript(finalUserText);
      deps.dispatchDialogOrchestrator({ type: 'turn_user_text', text: finalUserText });
      deps.recordAudit('turn.user_final', {
        extra: { textLength: finalUserText.length, semanticEvent },
      });
      deps.updateRealtimeListeningState('awaiting_reply');
      const replyGeneration = deps.androidReplyGenerationRef.current + 1;
      deps.androidReplyGenerationRef.current = replyGeneration;
      deps.dispatchDialogOrchestrator({ type: 'generation_bump_reply' });
      void (async () => {
        try {
          await deps.repo.appendMessage(turnConversationId, {
            conversationId: turnConversationId,
            role: 'user',
            content: finalUserText,
            type: 'audio',
          });
          if (turnConversationId === deps.activeConversationId) {
            await deps.syncConversationState();
          } else {
            deps.setConversations(await deps.repo.listConversations());
          }
          if (replyGeneration !== deps.androidReplyGenerationRef.current) {
            return;
          }
          if (deps.replyChainMode === 'custom_llm') {
            if (!deps.androidDialogClientTtsSelectionPromiseRef.current) {
              deps.beginAndroidClientTtsSelectionForTurn();
            }
            const clientTtsSelected = await deps.awaitAndroidClientTtsSelectionForTurn();
            if (!clientTtsSelected) {
              deps.providers.observability.log(
                'warn',
                'custom llm voice turn aborted: client tts was not selected',
                deps.buildDialogLogContext({ replyGeneration }),
              );
              deps.androidReplyGenerationRef.current += 1;
              deps.dispatchDialogOrchestrator({ type: 'generation_bump_reply' });
              deps.dispatchDialogOrchestrator({ type: 'turn_phase', phase: 'interrupted' });
              deps.setPendingAssistantReply('');
              deps.setLiveUserTranscript('');
              await deps.repo.appendMessage(turnConversationId, {
                conversationId: turnConversationId,
                role: 'assistant',
                content: '当前语音链路未完成自定义接管，本轮已取消，请重试。',
                type: 'text',
              });
              deps.setConnectivityHint('本轮自定义语音接管失败，正在重置会话。');
              if (turnConversationId === deps.activeConversationId) {
                await deps.syncConversationState();
              } else {
                deps.setConversations(await deps.repo.listConversations());
              }
              await deps.withCallLifecycleLock(async () => {
                await deps.stopAndroidDialogConversation({ persistPendingAssistantDraft: false });
                if (deps.voiceLoopActiveRef.current) {
                  await deps.ensureAndroidDialogConversation('voice', { forceRestart: true });
                }
              }, { waitIfLocked: true });
              if (deps.voiceLoopActiveRef.current) {
                deps.updateRealtimeListeningState('ready');
                deps.updateRealtimeCallPhase('listening');
                await deps.updateConversationRuntimeStatus('listening', { refreshConversations: true });
                deps.setConnectivityHint('本轮自定义语音接管失败，已重置会话后继续监听。');
              } else {
                await deps.updateConversationRuntimeStatus('idle', { refreshConversations: true });
              }
              return;
            }
            await deps.runAndroidReplyFlow({
              userText: finalUserText,
              mode: 'voice',
              assistantMessageType: 'audio',
              resumeVoiceAfterReply: true,
              conversationId: turnConversationId,
            });
            return;
          }
          await deps.updateConversationRuntimeStatus('thinking', { refreshConversations: true });
        } catch (error) {
          const message = error instanceof Error ? error.message : 'unknown error';
          deps.providers.observability.log('warn', 'failed to process android asr_final turn', {
            message,
            replyChainMode: deps.replyChainMode,
          });
          if (deps.replyChainMode === 'custom_llm') {
            const fallbackMessage = '当前语音链路未完成自定义接管，本轮已取消，请重试。';
            const existingMessages = await deps.repo.listMessages(turnConversationId);
            const lastMessage = existingMessages[existingMessages.length - 1];
            if (!(lastMessage?.role === 'assistant' && isSameAssistantText(lastMessage.content, fallbackMessage))) {
              await deps.repo.appendMessage(turnConversationId, {
                conversationId: turnConversationId,
                role: 'assistant',
                content: fallbackMessage,
                type: 'text',
              });
            }
            deps.setConnectivityHint('本轮自定义语音接管失败，已回到监听状态。');
          } else {
            deps.setConnectivityHint(`语音回合失败：${message}`);
          }
          deps.setPendingAssistantReply('');
          if (deps.voiceLoopActiveRef.current) {
            deps.updateRealtimeListeningState('ready');
            deps.updateRealtimeCallPhase('listening');
            await deps.updateConversationRuntimeStatus('listening', { refreshConversations: true });
          } else {
            await deps.updateConversationRuntimeStatus('idle', { refreshConversations: true });
          }
          await deps.syncConversationState();
        }
      })();
      return true;
    }
    case 'chat_partial':
    case 'chat_final': {
      if (
        shouldDropPlatformReplyInCustomTurn({
          replyChainMode: deps.replyChainMode,
          replyOwner: deps.orchestratorStateRef.current.turn.replyOwner,
        })
      ) {
        if (!deps.androidObservedPlatformReplyInCustomRef.current) {
          deps.androidObservedPlatformReplyInCustomRef.current = true;
          deps.providers.observability.log(
            'warn',
            `dialog.leak_guard platform ${event.type} received while custom_llm is active`,
            deps.buildDialogLogContext({ textLength: event.text.length }),
          );
          deps.recordAudit('guard.platform_leak', {
            level: 'warn',
            message: `platform ${event.type} received while custom_llm is active`,
            extra: { eventType: event.type, textLength: event.text.length },
          });
          void deps.recoverFromPlatformReplyLeakInCustomMode(event.type);
        }
        return true;
      }
      if (deps.androidDialogInterruptedRef.current) {
        return true;
      }
      if (event.type === 'chat_partial') {
        const shouldExposePlatformPartial =
          deps.replyChainMode !== 'official_s2s' || deps.replyStreamMode !== 'force_non_stream';
        deps.setLiveUserTranscript('');
        deps.dispatchDialogOrchestrator({ type: 'turn_reply_owner', owner: 'platform' });
        deps.androidAssistantDraftRef.current = deps.mergeAssistantDraft(
          deps.androidAssistantDraftRef.current,
          event.text,
        );
        if (shouldExposePlatformPartial) {
          deps.dispatchDialogOrchestrator({
            type: 'draft_reply_delta',
            text: event.text,
            source: 'platform',
          });
          deps.setPendingAssistantReply(deps.androidAssistantDraftRef.current);
        }
        deps.recordAudit('reply.platform.partial', { extra: { textLength: event.text.length } });
        if (deps.voiceLoopActiveRef.current) {
          deps.updateRealtimeCallPhase('speaking');
          deps.dispatchDialogOrchestrator({ type: 'turn_phase', phase: 'speaking' });
        }
        void deps.updateConversationRuntimeStatus('speaking', { refreshConversations: true });
        return true;
      }

      const finalConversationId = deps.androidDialogConversationIdRef.current ?? deps.activeConversationId;
      const draftText = finalizeOfficialS2SReply(
        event.text,
        deps.androidAssistantDraftRef.current,
        deps.pendingAssistantReply,
      ).trim();
      const finalText = sanitizeAssistantText(draftText);
      const finalTurnKey = resolvePlatformReplyTurnKey(event, finalConversationId);
      if (finalTurnKey) {
        const inFlightTurnKeys = deps.androidPlatformFinalInFlightTurnKeysRef.current as Set<string>;
        const pendingTextByTurnKey = deps.androidPlatformFinalPendingTextByTurnKeyRef.current as Map<string, string>;
        const mergedPendingText = mergePlatformFinalTextCandidate(
          pendingTextByTurnKey.get(finalTurnKey) ?? '',
          finalText,
        );
        pendingTextByTurnKey.set(finalTurnKey, mergedPendingText);
        if (inFlightTurnKeys.has(finalTurnKey)) {
          deps.providers.observability.log('info', 'coalesce platform chat_final while finalization is in-flight', {
            ...deps.buildDialogLogContext({
              finalTurnKey,
              textLength: finalText.length,
              mergedTextLength: mergedPendingText.length,
            }),
          });
          return true;
        }
        const previousFinalText = (deps.androidPlatformFinalTextByTurnKeyRef.current as Map<string, string>).get(finalTurnKey);
        if (
          previousFinalText &&
          (!finalText ||
            isSameAssistantText(previousFinalText, finalText) ||
            previousFinalText.includes(finalText))
        ) {
          deps.providers.observability.log('info', 'drop duplicate platform chat_final after turn has already been finalized', {
            ...deps.buildDialogLogContext({
              finalTurnKey,
              textLength: finalText.length,
              previousTextLength: previousFinalText.length,
            }),
          });
          return true;
        }
        inFlightTurnKeys.add(finalTurnKey);
      }

      void (async () => {
        try {
          deps.androidReplyGenerationRef.current += 1;
          deps.dispatchDialogOrchestrator({ type: 'generation_bump_reply' });
          const mergedFinalText = sanitizeAssistantText(
            (finalTurnKey
              ? deps.androidPlatformFinalPendingTextByTurnKeyRef.current.get(finalTurnKey)
              : finalText) ?? finalText,
          );
          deps.recordAudit('reply.platform.final', { extra: { textLength: mergedFinalText.length } });
          deps.setLiveUserTranscript('');
          deps.setPendingAssistantReply('');
          deps.androidAssistantDraftRef.current = '';
          if (finalConversationId && mergedFinalText) {
            const currentMessages = await deps.repo.listMessages(finalConversationId);
            const lastMessage = currentMessages[currentMessages.length - 1];
            if (!(lastMessage?.role === 'assistant' && isSameAssistantText(lastMessage.content, mergedFinalText))) {
              await deps.repo.appendMessage(finalConversationId, {
                conversationId: finalConversationId,
                role: 'assistant',
                content: mergedFinalText,
                type: deps.voiceLoopActiveRef.current ? 'audio' : 'text',
              });
            }
          }
          if (finalTurnKey && mergedFinalText) {
            rememberPlatformFinalTextByTurnKey(
              deps.androidPlatformFinalTextByTurnKeyRef.current,
              finalTurnKey,
              mergedFinalText,
            );
          }
          deps.dispatchDialogOrchestrator({
            type: 'draft_reply_finalized',
            persisted: Boolean(finalConversationId && mergedFinalText),
          });
          if (deps.voiceLoopActiveRef.current && deps.androidDialogModeRef.current === 'voice') {
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
            deps.resetRealtimeCallState();
            await deps.updateConversationRuntimeStatus('idle', { refreshConversations: true });
          }
          if (finalConversationId === deps.activeConversationId && deps.activeConversationId) {
            await deps.syncConversationState();
          } else {
            deps.setConversations(await deps.repo.listConversations());
          }
        } finally {
          if (finalTurnKey) {
            deps.androidPlatformFinalPendingTextByTurnKeyRef.current.delete(finalTurnKey);
            deps.androidPlatformFinalInFlightTurnKeysRef.current.delete(finalTurnKey);
          }
        }
      })();
      return true;
    }
    default:
      return false;
  }
}

export function createAndroidDialogEventHandler(deps: any) {
  return (event: DialogEngineEvent) => {
    deps.setVoiceDebugLastEvent(deps.toVoiceDebugEventTag(event));
    const semanticEvent = deps.resolveSemanticEventFromDialogEvent(event);
    const logIgnoredAndroidDialogEvent = (reason: string) => {
      deps.providers.observability.log(
        'info',
        'dialog.stale_drop',
        deps.buildDialogLogContext({
          reason,
          eventType: event.type,
          eventSessionId: event.sessionId,
          activeSessionId: deps.androidDialogSessionIdRef.current,
        }),
      );
    };

    deps.providers.observability.log(
      'info',
      'dialog.event',
      deps.buildDialogLogContext({
        type: event.type,
        semanticEvent,
        textLength: 'text' in event ? event.text.length : undefined,
        nativeMessageType: event.nativeMessageType,
        textMode: event.textMode,
        directiveName: event.directiveName,
        directiveRet: event.directiveRet,
        eventQuestionId: event.questionId,
        eventReplyId: event.replyId,
        eventTraceId: event.traceId,
      }),
    );

    if (
      guardAndroidDialogSession(event, {
        androidDialogSessionIdRef: deps.androidDialogSessionIdRef,
        androidRetiredSessionIdsRef: deps.androidRetiredSessionIdsRef,
        logIgnoredAndroidDialogEvent,
      })
    ) {
      return;
    }
    if (
      event.type === 'session_ready' &&
      event.sessionId &&
      deps.androidDialogSessionIdRef.current &&
      event.sessionId !== deps.androidDialogSessionIdRef.current
    ) {
      deps.providers.observability.log('warn', 'android session_ready id differs from engine_start id', {
        readySessionId: event.sessionId,
        activeSessionId: deps.androidDialogSessionIdRef.current,
      });
    }

    if (
      handleAndroidLifecycleEvent(event, {
        androidDialogSessionIdRef: deps.androidDialogSessionIdRef,
        androidDialogConversationIdRef: deps.androidDialogConversationIdRef,
        androidDialogSessionReadyRef: deps.androidDialogSessionReadyRef,
        androidPlayerSpeakingRef: deps.androidPlayerSpeakingRef,
        androidDialogClientTtsEnabledRef: deps.androidDialogClientTtsEnabledRef,
        androidDialogClientTtsSelectionEpochRef: deps.androidDialogClientTtsSelectionEpochRef,
        androidDialogClientTtsSelectionPromiseRef: deps.androidDialogClientTtsSelectionPromiseRef,
        androidDialogClientTtsSelectionReadyRef: deps.androidDialogClientTtsSelectionReadyRef,
        androidCustomClientTtsStreamStartedRef: deps.androidCustomClientTtsStreamStartedRef,
        androidReplyGenerationRef: deps.androidReplyGenerationRef,
        androidPlatformFinalTextByTurnKeyRef: deps.androidPlatformFinalTextByTurnKeyRef,
        androidPlatformFinalInFlightTurnKeysRef: deps.androidPlatformFinalInFlightTurnKeysRef,
        androidPlatformFinalPendingTextByTurnKeyRef: deps.androidPlatformFinalPendingTextByTurnKeyRef,
        androidRetiredSessionIdsRef: deps.androidRetiredSessionIdsRef,
        voiceLoopActiveRef: deps.voiceLoopActiveRef,
        rememberRetiredAndroidDialogSession: deps.rememberRetiredAndroidDialogSession,
        setConnectivityHint: deps.setConnectivityHint,
        clearTurnTrace: deps.clearTurnTrace,
        recordAudit: deps.recordAudit,
        dispatchDialogOrchestrator: deps.dispatchDialogOrchestrator,
        resetRealtimeCallState: deps.resetRealtimeCallState,
        updateRealtimeCallPhase: deps.updateRealtimeCallPhase,
        updateRealtimeListeningState: deps.updateRealtimeListeningState,
        setIsVoiceActive: deps.setIsVoiceActive,
        updateConversationRuntimeStatus: deps.updateConversationRuntimeStatus,
        logIgnoredAndroidDialogEvent,
      })
    ) {
      deps.mergeTurnTraceFromDialogEvent(event);
      return;
    }

    if (!deps.androidDialogSessionIdRef.current) {
      return;
    }
    if (event.sessionId && event.sessionId !== deps.androidDialogSessionIdRef.current) {
      logIgnoredAndroidDialogEvent('payload_session_mismatch');
      return;
    }
    deps.mergeTurnTraceFromDialogEvent(event);
    handleAndroidDialogPayloadEvent(event, semanticEvent, deps);
  };
}
