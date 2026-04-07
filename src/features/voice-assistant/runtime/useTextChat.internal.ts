import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Platform } from 'react-native';
import type { Conversation, Message } from '../types/model';
import { InMemoryConversationRepo } from '../repo/conversationRepo';
import { PersistentConversationRepo } from '../repo/persistentConversationRepo';
import { isSameAssistantText, sanitizeAssistantText } from '../service/assistantText';
import { readVoicePipelineMode } from '../config/env';
import { getEffectiveRuntimeConfig } from '../config/runtimeConfigRepo';
import {
  isCompleteLLMConfig,
  isRuntimeConfigEqual,
  readRuntimeConfigFromEnv,
  type RuntimeConfig,
  type RuntimeConfigDraft,
  type RuntimeLLMConfig,
  type RuntimeS2SConfig,
} from '../config/runtimeConfig';
import { createVoiceAssistantProviders } from './providers';
import { useSessionMachine } from './sessionMachine';
import { KONAN_CHARACTER_MANIFEST } from '../../../character/konanManifest';
import {
  VOICE_ASSISTANT_DIALOG_BOT_NAME,
  VOICE_ASSISTANT_DIALOG_MODEL,
} from '../config/constants';
import type {
  DialogConversationInputMode,
  DialogEngineEvent,
  DialogWorkMode,
} from '../../../core/providers/dialog-engine/types';
import type { AuditStage } from '../../../core/providers/audit/types';
import { SessionController } from './dialog-orchestrator/sessionController';
import { createInitialDialogOrchestratorState } from './dialog-orchestrator/state';
import { reduceDialogOrchestratorState } from './dialog-orchestrator/reducer';
import type { DialogOrchestratorAction } from './dialog-orchestrator/types';
import {
  finalizeOfficialS2SReply,
  mergeOfficialS2SReplyDraft,
} from './dialog-orchestrator/replyDrivers/officialS2SReplyDriver';
import { shouldDropPlatformReplyInCustomTurn } from './dialog-orchestrator/replyDrivers/customLlmReplyDriver';
import { ensureAndroidClientTriggeredTts as ensureAndroidClientTriggeredTtsFlow } from './useTextChat.androidClientTts';
import {
  createAndroidDialogEventHandler,
} from './useTextChat.androidDialogEvents';
import { createAndroidConversationHandlers } from './useTextChat.androidConversation';
import { createAndroidDialogRuntimeHandlers } from './useTextChat.androidDialogRuntime';
import { createHandsFreeVoiceLoopHandlers } from './useTextChat.handsFreeVoiceLoop';
import { createRealtimeS2SDemoHandlers } from './useTextChat.realtimeS2SDemo';
import { createRuntimeStateHandlers } from './useTextChat.runtimeState';
import { createTextPipelineHandlers } from './useTextChat.textPipeline';
import { createVoiceToggleHandlers } from './useTextChat.voiceToggle';
import {
  useAndroidDialogListenerEffect,
  useBootstrapConversationEffect,
  useCustomReplyConfigHintEffect,
  useRuntimeConfigHydrationEffect,
} from './useTextChat.effects';
import {
  AUDIO_HINT_DEDUPE_WINDOW_MS,
  ANDROID_DIALOG_CLIENT_TTS_BACKGROUND_MAX_RETRIES,
  ANDROID_DIALOG_CLIENT_TTS_MAX_RETRIES,
  ANDROID_DIALOG_CLIENT_TTS_RETRY_DELAY_MS,
  ANDROID_DIALOG_CLIENT_TTS_SELECTION_WAIT_MS,
  ANDROID_DIALOG_READY_WAIT_MS,
  ANDROID_DIALOG_START_WAIT_MS,
  CALL_LIFECYCLE_LOCK_POLL_INTERVAL_MS,
  CALL_LIFECYCLE_LOCK_WAIT_TIMEOUT_MS,
  VOICE_RUNTIME_CONFIG,
  createTurnTraceId,
  resolveSemanticEventFromDialogEvent,
  toVoiceDebugEventTag,
  withTimeout,
  type AndroidDialogMode,
  type RealtimeCallPhase,
  type RealtimeListeningState,
  type TurnTraceContext,
} from './useTextChat.shared';
export type UseTextChatResult = {
  status: Conversation['status'];
  voiceCallPhase?: RealtimeCallPhase;
  conversations: Conversation[];
  activeConversationId: string | null;
  messages: Message[];
  liveUserTranscript: string;
  pendingAssistantReply: string;
  createConversation: (title?: string) => Promise<string>;
  selectConversation: (conversationId: string) => Promise<boolean>;
  renameConversationTitle?: (conversationId: string, title: string) => Promise<boolean>;
  deleteConversation?: (conversationId: string) => Promise<{ ok: boolean; nextConversationId: string | null }>;
  sendText: (text: string) => Promise<void>;
  isVoiceActive: boolean;
  supportsVoiceInputMute: boolean;
  isVoiceInputMuted: boolean;
  toggleVoice: () => Promise<void>;
  ensureVoiceStopped?: () => Promise<void>;
  toggleVoiceInputMuted: () => Promise<void>;
  interruptVoiceOutput: () => Promise<void>;
  voiceModeLabel: string;
  textReplySourceLabel: string;
  voiceToggleLabel: string;
  voiceRuntimeHint: string;
  voiceDebugLastEvent?: string;
  connectivityHint: string;
  runtimeConfig: RuntimeConfig;
  saveRuntimeConfig: (draft: RuntimeConfigDraft) => Promise<{ ok: boolean; message: string }>;
  testLLMConfig: (input?: Partial<RuntimeLLMConfig>) => Promise<{ ok: boolean; message: string }>;
  testS2SConnection: (input?: Partial<RuntimeS2SConfig>) => Promise<{ ok: boolean; message: string }>;
};

function mergeAssistantDraft(currentDraft: string, incomingText: string): string {
  return mergeOfficialS2SReplyDraft(currentDraft, incomingText);
}

export function useTextChat(): UseTextChatResult {
  const isTestEnv = process.env.NODE_ENV === 'test';
  const repo = useMemo(
    () => (isTestEnv ? new InMemoryConversationRepo() : new PersistentConversationRepo()),
    [isTestEnv],
  );
  const [runtimeConfig, setRuntimeConfig] = useState<RuntimeConfig>(() => readRuntimeConfigFromEnv());
  const [runtimeConfigHydrated, setRuntimeConfigHydrated] = useState(false);
  const runtimeConfigRef = useRef(runtimeConfig);
  const runtimeConfigHydratedRef = useRef(runtimeConfigHydrated);
  const providers = useMemo(() => createVoiceAssistantProviders(runtimeConfig), [runtimeConfig]);
  const androidSessionController = useMemo(
    () => new SessionController(providers.dialogEngine),
    [providers.dialogEngine],
  );
  const machine = useSessionMachine();
  const isAndroidDialogMode = Platform.OS === 'android' && providers.dialogEngine.isSupported();
  const replyChainMode = runtimeConfig.replyChainMode;
  const llmConfig = runtimeConfig.llm;
  const useCustomReplyProvider = replyChainMode === 'custom_llm' && isCompleteLLMConfig(llmConfig);
  const useAndroidDialogRuntime =
    isAndroidDialogMode && (replyChainMode === 'official_s2s' || useCustomReplyProvider);
  const useAndroidDialogTextRuntime = isAndroidDialogMode && replyChainMode === 'official_s2s';
  const supportsVoiceInputMute = useAndroidDialogRuntime;
  const useCustomVoiceS2STts = Platform.OS === 'android' && useCustomReplyProvider && isAndroidDialogMode;
  const androidDialogWorkMode = useMemo<DialogWorkMode>(
    () => (useCustomReplyProvider ? 'delegate_chat_tts_text' : 'default'),
    [useCustomReplyProvider],
  );
  const voicePipelineMode = useMemo(() => readVoicePipelineMode(), []);
  const effectiveVoicePipelineMode = useCustomReplyProvider ? 'asr_text' : voicePipelineMode;
  const voiceModeLabel = useAndroidDialogRuntime && replyChainMode === 'official_s2s'
    ? 'Android Dialog SDK 模式（官方S2S链路）'
    : useCustomReplyProvider
    ? '自定义LLM模式（客户端回复链路）'
    : effectiveVoicePipelineMode === 'realtime_audio'
    ? 'Demo实时通话模式（连续语音上行）'
    : '稳定通话模式（自动听说）';
  const textReplySourceLabel = useAndroidDialogTextRuntime
    ? '官方 S2S / Dialog SDK'
    : useCustomReplyProvider
    ? `${llmConfig.provider || 'openai-compatible'} / ${llmConfig.model || 'unknown'}`
    : '本地 Fallback';
  const voiceLoopActiveRef = useRef(false);
  const voiceLoopRunningRef = useRef(false);
  const realtimeCallPhaseRef = useRef<RealtimeCallPhase>('idle');
  const realtimeCallGenerationRef = useRef(0);
  const callLifecycleLockRef = useRef(false);
  const lastRealtimeAssistantTextRef = useRef('');
  const realtimeUpstreamMutedUntilRef = useRef(0);
  const realtimePlaybackQueueEndAtRef = useRef(0);
  const realtimeSilentFramesRef = useRef(0);
  const realtimeDroppedNoiseFramesRef = useRef(0);
  const realtimeSpeechFramesRef = useRef(0);
  const realtimeSpeechDetectedRef = useRef(false);
  const realtimePostSpeechSilentFramesRef = useRef(0);
  const realtimeListeningStateRef = useRef<RealtimeListeningState>('ready');
  const hasBootstrappedConversationRef = useRef(false);
  const androidDialogPreparedRef = useRef(false);
  const androidDialogPreparedWorkModeRef = useRef<DialogWorkMode | null>(null);
  const androidDialogModeRef = useRef<AndroidDialogMode | null>(null);
  const androidDialogInterruptedRef = useRef(false);
  const androidDialogInterruptInFlightRef = useRef(false);
  const androidReplyGenerationRef = useRef(0);
  const androidAssistantDraftRef = useRef('');
  const androidDialogSessionIdRef = useRef<string | null>(null);
  const androidDialogConversationIdRef = useRef<string | null>(null);
  const androidDialogSessionReadyRef = useRef(false);
  const androidPlayerSpeakingRef = useRef(false);
  const androidDialogClientTtsEnabledRef = useRef(false);
  const androidDialogClientTtsSelectionEpochRef = useRef(0);
  const androidDialogClientTtsSelectionPromiseRef = useRef<Promise<boolean> | null>(null);
  const androidDialogClientTtsSelectionReadyRef = useRef(false);
  const androidCustomClientTtsStreamStartedRef = useRef(false);
  const androidObservedPlatformReplyInCustomRef = useRef(false);
  const androidRetiredSessionIdsRef = useRef<string[]>([]);
  const micIssueLastHintAtRef = useRef(0);
  const orchestratorStateRef = useRef(createInitialDialogOrchestratorState());
  const dialogSessionEpochRef = useRef(0);
  const turnTraceRef = useRef<TurnTraceContext | null>(null);
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [activeConversationId, setActiveConversationId] = useState<string | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [isVoiceActive, setIsVoiceActive] = useState(false);
  const [isVoiceInputMuted, setIsVoiceInputMuted] = useState(false);
  const isVoiceInputMutedRef = useRef(false);
  const [realtimeCallPhase, setRealtimeCallPhase] = useState<RealtimeCallPhase>('idle');
  const [realtimeListeningState, setRealtimeListeningState] = useState<RealtimeListeningState>('ready');
  const [liveUserTranscript, setLiveUserTranscript] = useState('');
  const [pendingAssistantReply, setPendingAssistantReply] = useState('');
  const [connectivityHint, setConnectivityHint] = useState('尚未测试连接');
  const [voiceDebugLastEvent, setVoiceDebugLastEvent] = useState('none');
  const [s2sSessionReady, setS2SSessionReady] = useState(false);
  const lastAssistantAudioHintRef = useRef<{ content: string; at: number } | null>(null);
  const conversationSelectionEpochRef = useRef(0);

  useEffect(() => {
    runtimeConfigRef.current = runtimeConfig;
  }, [runtimeConfig]);

  useEffect(() => {
    runtimeConfigHydratedRef.current = runtimeConfigHydrated;
  }, [runtimeConfigHydrated]);

  useRuntimeConfigHydrationEffect({
    setRuntimeConfig,
    setRuntimeConfigHydrated,
    runtimeConfigRef,
    runtimeConfigHydratedRef,
  });
  useBootstrapConversationEffect({
    runtimeConfigHydrated,
    hasBootstrappedConversationRef,
    repo,
    setConversations,
    setMessages,
    setActiveConversationId,
    runtimeConfigRef,
  });
  useCustomReplyConfigHintEffect({
    replyChainMode,
    llmConfig,
    setConnectivityHint,
  });

  const runtimeStateHandlers = useMemo(
    () =>
      createRuntimeStateHandlers({
        activeConversationId,
        repo,
        providers,
        machine,
        runtimeConfigRef,
        runtimeConfigHydratedRef,
        getEffectiveRuntimeConfig,
        isRuntimeConfigEqual,
        setRuntimeConfig,
        setRuntimeConfigHydrated,
        setActiveConversationId,
        setMessages,
        setConversations,
        setLiveUserTranscript,
        setPendingAssistantReply,
        setRealtimeCallPhase,
        setRealtimeListeningState,
        setIsVoiceActive,
        setIsVoiceInputMuted,
        setS2SSessionReady,
        realtimeCallGenerationRef,
        voiceLoopActiveRef,
        voiceLoopRunningRef,
        realtimePlaybackQueueEndAtRef,
        realtimeUpstreamMutedUntilRef,
        realtimeSilentFramesRef,
        realtimeDroppedNoiseFramesRef,
        realtimeSpeechFramesRef,
        realtimeSpeechDetectedRef,
        realtimePostSpeechSilentFramesRef,
        lastRealtimeAssistantTextRef,
        lastAssistantAudioHintRef,
        androidDialogModeRef,
        androidDialogInterruptedRef,
        androidDialogInterruptInFlightRef,
        androidAssistantDraftRef,
        androidDialogSessionIdRef,
        androidDialogConversationIdRef,
        androidDialogSessionReadyRef,
        androidPlayerSpeakingRef,
        androidDialogClientTtsEnabledRef,
        androidDialogClientTtsSelectionEpochRef,
        androidDialogClientTtsSelectionPromiseRef,
        androidDialogClientTtsSelectionReadyRef,
        androidCustomClientTtsStreamStartedRef,
        isVoiceInputMutedRef,
        androidRetiredSessionIdsRef,
        realtimeCallPhaseRef,
        realtimeListeningStateRef,
        s2sSessionReady,
        callLifecycleLockRef,
        withTimeout,
        CALL_LIFECYCLE_LOCK_WAIT_TIMEOUT_MS,
        CALL_LIFECYCLE_LOCK_POLL_INTERVAL_MS,
        orchestratorStateRef,
        reduceDialogOrchestratorState,
        turnTraceRef,
        createTurnTraceId,
        androidDialogWorkMode,
        replyChainMode,
        androidReplyGenerationRef,
        conversationSelectionEpochRef,
      }),
    [activeConversationId, androidDialogWorkMode, machine, providers, replyChainMode, repo, s2sSessionReady],
  );

  const syncConversationState = useCallback(() => runtimeStateHandlers.syncConversationState(), [runtimeStateHandlers]);
  const selectConversation = useCallback((conversationId: string) => runtimeStateHandlers.selectConversation(conversationId), [runtimeStateHandlers]);
  const createConversation = useCallback((title = '新会话') => runtimeStateHandlers.createConversation(title), [runtimeStateHandlers]);
  const renameConversationTitle = useCallback(
    (conversationId: string, title: string) => runtimeStateHandlers.renameConversationTitle(conversationId, title),
    [runtimeStateHandlers],
  );
  const deleteConversation = useCallback(
    (conversationId: string) => runtimeStateHandlers.deleteConversation(conversationId),
    [runtimeStateHandlers],
  );
  const appendAssistantAudioMessage = useCallback(
    (content: string, options?: { dedupeWindowMs?: number }) => runtimeStateHandlers.appendAssistantAudioMessage(content, options),
    [runtimeStateHandlers],
  );
  const resetRealtimeCallState = useCallback(() => runtimeStateHandlers.resetRealtimeCallState(), [runtimeStateHandlers]);
  const setVoiceInputMutedRuntime = useCallback((muted: boolean) => runtimeStateHandlers.setVoiceInputMutedRuntime(muted), [runtimeStateHandlers]);
  const rememberRetiredAndroidDialogSession = useCallback((sessionId?: string | null) => runtimeStateHandlers.rememberRetiredAndroidDialogSession(sessionId), [runtimeStateHandlers]);
  const toAudioErrorMessage = useCallback((message: string, fallback: string) => runtimeStateHandlers.toAudioErrorMessage(message, fallback), [runtimeStateHandlers]);
  const updateRealtimeCallPhase = useCallback((phase: RealtimeCallPhase) => runtimeStateHandlers.updateRealtimeCallPhase(phase), [runtimeStateHandlers]);
  const updateRealtimeListeningState = useCallback((state: RealtimeListeningState) => runtimeStateHandlers.updateRealtimeListeningState(state), [runtimeStateHandlers]);

  const resetRealtimeCallStateRef = useRef(resetRealtimeCallState);
  useEffect(() => {
    resetRealtimeCallStateRef.current = resetRealtimeCallState;
  }, [resetRealtimeCallState]);

  useEffect(
    () => () => {
      resetRealtimeCallStateRef.current();
      androidReplyGenerationRef.current += 1;
      void providers.audio.stopCapture();
      void providers.audio.stopPlayback();
      void providers.audio.abortRecognition();
      void providers.s2s.disconnect();
      void androidSessionController.destroy();
    },
    [androidSessionController, providers.audio, providers.s2s],
  );

  const ensureS2SSession = useCallback(() => runtimeStateHandlers.ensureS2SSession(), [runtimeStateHandlers]);
  const updateConversationRuntimeStatus = useCallback(
    (nextStatus: Conversation['status'], options?: { refreshConversations?: boolean }) =>
      runtimeStateHandlers.updateConversationRuntimeStatus(nextStatus, options),
    [runtimeStateHandlers],
  );
  const withCallLifecycleLock = useCallback(
    (task: () => Promise<void>, options?: { waitIfLocked?: boolean; waitTimeoutMs?: number }) =>
      runtimeStateHandlers.withCallLifecycleLock(task, options),
    [runtimeStateHandlers],
  );
  const dispatchDialogOrchestrator = useCallback(
    (action: DialogOrchestratorAction) => runtimeStateHandlers.dispatchDialogOrchestrator(action),
    [runtimeStateHandlers],
  );
  const ensureTurnTrace = useCallback(
    (seed?: Partial<TurnTraceContext>) => runtimeStateHandlers.ensureTurnTrace(seed),
    [runtimeStateHandlers],
  );
  const mergeTurnTraceFromDialogEvent = useCallback(
    (event?: DialogEngineEvent | null) => runtimeStateHandlers.mergeTurnTraceFromDialogEvent(event),
    [runtimeStateHandlers],
  );
  const clearTurnTrace = useCallback(() => runtimeStateHandlers.clearTurnTrace(), [runtimeStateHandlers]);
  const buildDialogLogContext = useCallback(
    (extra?: Record<string, unknown>) => runtimeStateHandlers.buildDialogLogContext(extra),
    [runtimeStateHandlers],
  );
  const recordAudit = useCallback(
    (
      stage: AuditStage,
      options?: {
        level?: 'info' | 'warn' | 'error';
        message?: string;
        traceSeed?: Partial<TurnTraceContext>;
        extra?: Record<string, unknown>;
      },
    ) => runtimeStateHandlers.recordAudit(stage, options),
    [runtimeStateHandlers],
  );

  const androidConversationHandlers = useMemo(
    () =>
      createAndroidConversationHandlers({
        useAndroidDialogRuntime,
        activeConversationId,
        pendingAssistantReply,
        repo,
        providers,
        runtimeConfig,
        replyChainMode,
        isTestEnv,
        withTimeout,
        buildDialogLogContext,
        recordAudit,
        dispatchDialogOrchestrator,
        rememberRetiredAndroidDialogSession,
        clearTurnTrace,
        setPendingAssistantReply,
        setLiveUserTranscript,
        androidSessionController,
        androidDialogWorkMode,
        androidDialogPreparedRef,
        androidDialogPreparedWorkModeRef,
        androidDialogSessionIdRef,
        androidDialogConversationIdRef,
        androidDialogModeRef,
        androidDialogSessionReadyRef,
        androidDialogClientTtsEnabledRef,
        androidDialogClientTtsSelectionEpochRef,
        androidDialogClientTtsSelectionPromiseRef,
        androidDialogClientTtsSelectionReadyRef,
        androidPlayerSpeakingRef,
        androidAssistantDraftRef,
        androidReplyGenerationRef,
        dialogSessionEpochRef,
        VOICE_ASSISTANT_DIALOG_MODEL,
        VOICE_ASSISTANT_DIALOG_BOT_NAME,
        KONAN_CHARACTER_MANIFEST,
        ANDROID_DIALOG_START_WAIT_MS,
        ANDROID_DIALOG_READY_WAIT_MS,
        ANDROID_DIALOG_CLIENT_TTS_RETRY_DELAY_MS,
        ANDROID_DIALOG_CLIENT_TTS_MAX_RETRIES,
        ANDROID_DIALOG_CLIENT_TTS_BACKGROUND_MAX_RETRIES,
        ANDROID_DIALOG_CLIENT_TTS_SELECTION_WAIT_MS,
      }),
    [
      activeConversationId,
      androidDialogWorkMode,
      androidSessionController,
      buildDialogLogContext,
      dispatchDialogOrchestrator,
      isTestEnv,
      pendingAssistantReply,
      providers,
      recordAudit,
      rememberRetiredAndroidDialogSession,
      replyChainMode,
      repo,
      runtimeConfig,
      useAndroidDialogRuntime,
    ],
  );

  const ensureAndroidDialogPrepared = useCallback(
    () => androidConversationHandlers.ensureAndroidDialogPrepared(),
    [androidConversationHandlers],
  );
  const persistPendingAndroidAssistantDraft = useCallback(
    (options?: { conversationId?: string | null }) =>
      androidConversationHandlers.persistPendingAndroidAssistantDraft(options),
    [androidConversationHandlers],
  );
  const ensureAndroidDialogConversation = useCallback(
    (mode: AndroidDialogMode, options?: { forceRestart?: boolean }) =>
      androidConversationHandlers.ensureAndroidDialogConversation(mode, options),
    [androidConversationHandlers],
  );
  const stopAndroidDialogConversation = useCallback(
    (options?: { persistPendingAssistantDraft?: boolean }) =>
      androidConversationHandlers.stopAndroidDialogConversation(options),
    [androidConversationHandlers],
  );
  const ensureAndroidClientTriggeredTts = useCallback(
    (options: {
      generation?: number;
      source: 'asr_start';
      maxRetries?: number;
      throwOnFailure?: boolean;
      waitForReady?: boolean;
    }) => androidConversationHandlers.ensureAndroidClientTriggeredTts(options),
    [androidConversationHandlers],
  );
  const beginAndroidClientTtsSelectionForTurn = useCallback(
    () => androidConversationHandlers.beginAndroidClientTtsSelectionForTurn(),
    [androidConversationHandlers],
  );
  const awaitAndroidClientTtsSelectionForTurn = useCallback(
    () => androidConversationHandlers.awaitAndroidClientTtsSelectionForTurn(),
    [androidConversationHandlers],
  );

  const androidRuntimeHandlers = useMemo(() => createAndroidDialogRuntimeHandlers({
    activeConversationId,
    useAndroidDialogRuntime,
    isVoiceActive,
    replyChainMode,
    llmConfig,
    conversations,
    repo,
    providers,
    orchestratorStateRef,
    turnTraceRef,
    androidDialogSessionIdRef,
    androidDialogConversationIdRef,
    androidDialogModeRef,
    androidReplyGenerationRef,
    androidDialogClientTtsSelectionReadyRef,
    androidDialogClientTtsEnabledRef,
    androidCustomClientTtsStreamStartedRef,
    androidDialogInterruptedRef,
    androidDialogInterruptInFlightRef,
    androidPlayerSpeakingRef,
    realtimeCallPhaseRef,
    voiceLoopActiveRef,
    pendingAssistantReply,
    androidAssistantDraftRef,
    ensureTurnTrace,
    dispatchDialogOrchestrator,
    setPendingAssistantReply,
    setLiveUserTranscript,
    setConnectivityHint,
    setConversations,
    updateConversationRuntimeStatus,
    updateRealtimeCallPhase,
    updateRealtimeListeningState,
    resetRealtimeCallState,
    syncConversationState,
    buildDialogLogContext,
    recordAudit,
    stopAndroidDialogConversation,
    ensureAndroidDialogConversation,
    withCallLifecycleLock,
    androidSessionController,
  }), [
    activeConversationId,
    androidSessionController,
    buildDialogLogContext,
    conversations,
    dispatchDialogOrchestrator,
    ensureAndroidDialogConversation,
    ensureTurnTrace,
    isVoiceActive,
    llmConfig,
    pendingAssistantReply,
    providers,
    recordAudit,
    replyChainMode,
    repo,
    resetRealtimeCallState,
    stopAndroidDialogConversation,
    syncConversationState,
    updateConversationRuntimeStatus,
    updateRealtimeCallPhase,
    updateRealtimeListeningState,
    useAndroidDialogRuntime,
    withCallLifecycleLock,
  ]);

  const runAndroidReplyFlow = useCallback(
    (input: Parameters<typeof androidRuntimeHandlers.runAndroidReplyFlow>[0]) =>
      androidRuntimeHandlers.runAndroidReplyFlow(input),
    [androidRuntimeHandlers],
  );

  const performAndroidDialogInterrupt = useCallback(
    (source: 'manual' | 'barge_in') => androidRuntimeHandlers.performAndroidDialogInterrupt(source),
    [androidRuntimeHandlers],
  );

  const maybeInterruptOnBargeIn = useCallback(
    (input: { eventType: 'asr_start' | 'asr_partial'; text?: string }) =>
      androidRuntimeHandlers.maybeInterruptOnBargeIn(input),
    [androidRuntimeHandlers],
  );

  const recoverFromPlatformReplyLeakInCustomMode = useCallback(
    (eventType: 'chat_partial' | 'chat_final') =>
      androidRuntimeHandlers.recoverFromPlatformReplyLeakInCustomMode(eventType),
    [androidRuntimeHandlers],
  );

  const handleAndroidDialogEvent = useMemo(
    () =>
      createAndroidDialogEventHandler({
        providers,
        setVoiceDebugLastEvent,
        toVoiceDebugEventTag,
        resolveSemanticEventFromDialogEvent,
        buildDialogLogContext,
        androidDialogSessionIdRef,
        androidRetiredSessionIdsRef,
        androidDialogConversationIdRef,
        androidDialogSessionReadyRef,
        androidPlayerSpeakingRef,
        androidDialogClientTtsEnabledRef,
        androidDialogClientTtsSelectionEpochRef,
        androidDialogClientTtsSelectionPromiseRef,
        androidDialogClientTtsSelectionReadyRef,
        androidCustomClientTtsStreamStartedRef,
        androidReplyGenerationRef,
        voiceLoopActiveRef,
        rememberRetiredAndroidDialogSession,
        setConnectivityHint,
        clearTurnTrace,
        recordAudit,
        dispatchDialogOrchestrator,
        resetRealtimeCallState,
        updateRealtimeCallPhase,
        updateRealtimeListeningState,
        setIsVoiceActive,
        updateConversationRuntimeStatus,
        mergeTurnTraceFromDialogEvent,
        replyChainMode,
        realtimeCallPhaseRef,
        isVoiceInputMutedRef,
        androidDialogModeRef,
        androidObservedPlatformReplyInCustomRef,
        beginAndroidClientTtsSelectionForTurn,
        maybeInterruptOnBargeIn,
        androidDialogInterruptedRef,
        setLiveUserTranscript,
        setPendingAssistantReply,
        androidAssistantDraftRef,
        activeConversationId,
        ensureTurnTrace,
        createTurnTraceId,
        orchestratorStateRef,
        repo,
        syncConversationState,
        setConversations,
        awaitAndroidClientTtsSelectionForTurn,
        withCallLifecycleLock,
        stopAndroidDialogConversation,
        ensureAndroidDialogConversation,
        runAndroidReplyFlow,
        recoverFromPlatformReplyLeakInCustomMode,
        mergeAssistantDraft,
        pendingAssistantReply,
      }),
    [
      activeConversationId,
      awaitAndroidClientTtsSelectionForTurn,
      beginAndroidClientTtsSelectionForTurn,
      buildDialogLogContext,
      clearTurnTrace,
      dispatchDialogOrchestrator,
      ensureAndroidDialogConversation,
      ensureTurnTrace,
      maybeInterruptOnBargeIn,
      mergeTurnTraceFromDialogEvent,
      pendingAssistantReply,
      providers,
      recordAudit,
      recoverFromPlatformReplyLeakInCustomMode,
      replyChainMode,
      repo,
      runAndroidReplyFlow,
      stopAndroidDialogConversation,
      syncConversationState,
      updateConversationRuntimeStatus,
      updateRealtimeCallPhase,
      updateRealtimeListeningState,
      withCallLifecycleLock,
    ],
  );

  const androidDialogEventHandlerRef = useRef(handleAndroidDialogEvent);

  useEffect(() => {
    androidDialogEventHandlerRef.current = handleAndroidDialogEvent;
  }, [handleAndroidDialogEvent]);

  useAndroidDialogListenerEffect({
    useAndroidDialogRuntime,
    dialogEngine: providers.dialogEngine,
    androidDialogEventHandlerRef,
  });

  const textPipeline = useMemo(() => createTextPipelineHandlers({
    conversations,
    repo,
    providers,
    runtimeConfig,
    llmConfig,
    useCustomReplyProvider,
    useCustomVoiceS2STts,
    useAndroidDialogTextRuntime,
    activeConversationId,
    isVoiceActive,
    ensureS2SSession,
    ensureTurnTrace,
    clearTurnTrace,
    createTurnTraceId,
    setPendingAssistantReply,
    setLiveUserTranscript,
    setConnectivityHint,
    setConversations,
    updateConversationRuntimeStatus,
    syncConversationState,
    resetRealtimeCallState,
    withCallLifecycleLock,
    ensureAndroidDialogConversation,
    stopAndroidDialogConversation: async () => stopAndroidDialogConversation(),
    androidSessionController,
    orchestratorStateRef,
    androidDialogSessionIdRef,
    recordAudit,
    toAudioErrorMessage,
  }), [
    activeConversationId,
    androidSessionController,
    clearTurnTrace,
    conversations,
    ensureAndroidDialogConversation,
    ensureS2SSession,
    ensureTurnTrace,
    isVoiceActive,
    llmConfig,
    providers,
    recordAudit,
    repo,
    resetRealtimeCallState,
    runtimeConfig,
    stopAndroidDialogConversation,
    syncConversationState,
    toAudioErrorMessage,
    updateConversationRuntimeStatus,
    useAndroidDialogTextRuntime,
    useCustomReplyProvider,
    useCustomVoiceS2STts,
    withCallLifecycleLock,
  ]);

  const generateAssistantReplyFromProvider = useCallback(
    (input: Parameters<typeof textPipeline.generateAssistantReplyFromProvider>[0]) =>
      textPipeline.generateAssistantReplyFromProvider(input),
    [textPipeline],
  );
  const runTextRound = useCallback(
    (input: Parameters<typeof textPipeline.runTextRound>[0]) => textPipeline.runTextRound(input),
    [textPipeline],
  );
  const sendText = useCallback(
    (text: string) => textPipeline.sendText(text),
    [textPipeline],
  );

  const realtimeDemoHandlers = useMemo(() => createRealtimeS2SDemoHandlers({
    activeConversationId,
    providers,
    repo,
    VOICE_RUNTIME_CONFIG,
    AUDIO_HINT_DEDUPE_WINDOW_MS,
    voiceLoopActiveRef,
    voiceLoopRunningRef,
    realtimeCallGenerationRef,
    realtimeCallPhaseRef,
    realtimePlaybackQueueEndAtRef,
    realtimeUpstreamMutedUntilRef,
    realtimeSilentFramesRef,
    realtimeDroppedNoiseFramesRef,
    realtimeSpeechFramesRef,
    realtimeSpeechDetectedRef,
    realtimePostSpeechSilentFramesRef,
    lastRealtimeAssistantTextRef,
    setIsVoiceActive,
    setS2SSessionReady,
    updateRealtimeCallPhase,
    updateRealtimeListeningState,
    updateConversationRuntimeStatus,
    syncConversationState,
    appendAssistantAudioMessage,
    resetRealtimeCallState,
    ensureS2SSession,
  }), [
    activeConversationId,
    appendAssistantAudioMessage,
    ensureS2SSession,
    providers,
    repo,
    resetRealtimeCallState,
    syncConversationState,
    updateConversationRuntimeStatus,
    updateRealtimeCallPhase,
    updateRealtimeListeningState,
  ]);

  const stopRealtimeDemoCall = useCallback(
    () => realtimeDemoHandlers.stopRealtimeDemoCall(),
    [realtimeDemoHandlers],
  );
  const runRealtimeDemoLoop = useCallback(
    (generation: number) => realtimeDemoHandlers.runRealtimeDemoLoop(generation),
    [realtimeDemoHandlers],
  );

  const handsFreeHandlers = useMemo(() => createHandsFreeVoiceLoopHandlers({
    activeConversationId,
    providers,
    effectiveVoicePipelineMode,
    VOICE_RUNTIME_CONFIG,
    AUDIO_HINT_DEDUPE_WINDOW_MS,
    voiceLoopActiveRef,
    voiceLoopRunningRef,
    micIssueLastHintAtRef,
    setIsVoiceActive,
    appendAssistantAudioMessage,
    runTextRound,
    updateConversationRuntimeStatus,
    syncConversationState,
  }), [
    activeConversationId,
    appendAssistantAudioMessage,
    effectiveVoicePipelineMode,
    providers,
    runTextRound,
    syncConversationState,
    updateConversationRuntimeStatus,
  ]);

  const stopHandsFreeVoiceLoop = useCallback(
    () => handsFreeHandlers.stopHandsFreeVoiceLoop(),
    [handsFreeHandlers],
  );
  const runHandsFreeVoiceLoop = useCallback(
    () => handsFreeHandlers.runHandsFreeVoiceLoop(),
    [handsFreeHandlers],
  );

  const startRealtimeDemoCall = useCallback(
    () => realtimeDemoHandlers.startRealtimeDemoCall(),
    [realtimeDemoHandlers],
  );
  const voiceToggleHandlers = useMemo(
    () =>
      createVoiceToggleHandlers({
        activeConversationId,
        isVoiceActive,
        isTestEnv,
        supportsVoiceInputMute,
        isVoiceInputMuted,
        effectiveVoicePipelineMode,
        realtimeCallPhase,
        realtimeListeningState,
        useAndroidDialogRuntime,
        AUDIO_HINT_DEDUPE_WINDOW_MS,
        providers,
        androidSessionController,
        runHandsFreeVoiceLoop,
        stopHandsFreeVoiceLoop,
        startRealtimeDemoCall,
        stopRealtimeDemoCall,
        runTextRound,
        appendAssistantAudioMessage,
        toAudioErrorMessage,
        updateConversationRuntimeStatus,
        syncConversationState,
        withCallLifecycleLock,
        ensureAndroidDialogConversation,
        stopAndroidDialogConversation: async () => stopAndroidDialogConversation(),
        resetRealtimeCallState,
        updateRealtimeCallPhase,
        updateRealtimeListeningState,
        setIsVoiceActive,
        setVoiceInputMutedRuntime,
        setLiveUserTranscript,
        setPendingAssistantReply,
        setConnectivityHint,
        performAndroidDialogInterrupt,
        dispatchDialogOrchestrator,
        voiceLoopActiveRef,
        voiceLoopRunningRef,
        androidDialogModeRef,
        realtimeCallPhaseRef,
        androidPlayerSpeakingRef,
        isVoiceInputMutedRef,
      }),
    [
      activeConversationId,
      appendAssistantAudioMessage,
      androidSessionController,
      dispatchDialogOrchestrator,
      effectiveVoicePipelineMode,
      ensureAndroidDialogConversation,
      isTestEnv,
      isVoiceActive,
      isVoiceInputMuted,
      performAndroidDialogInterrupt,
      providers,
      realtimeCallPhase,
      realtimeListeningState,
      resetRealtimeCallState,
      runHandsFreeVoiceLoop,
      runTextRound,
      startRealtimeDemoCall,
      stopAndroidDialogConversation,
      stopHandsFreeVoiceLoop,
      stopRealtimeDemoCall,
      supportsVoiceInputMute,
      syncConversationState,
      toAudioErrorMessage,
      updateConversationRuntimeStatus,
      updateRealtimeCallPhase,
      updateRealtimeListeningState,
      useAndroidDialogRuntime,
      withCallLifecycleLock,
    ],
  );

  const interruptVoiceOutput = useCallback(
    () => voiceToggleHandlers.interruptVoiceOutput(),
    [voiceToggleHandlers],
  );
  const toggleVoiceInputMuted = useCallback(
    () => voiceToggleHandlers.toggleVoiceInputMuted(),
    [voiceToggleHandlers],
  );
  const toggleVoice = useCallback(
    () => voiceToggleHandlers.toggleVoice(),
    [voiceToggleHandlers],
  );
  const ensureVoiceStopped = useCallback(
    () => voiceToggleHandlers.ensureVoiceStopped(),
    [voiceToggleHandlers],
  );

  const saveRuntimeConfig = useCallback(
    async (draft: RuntimeConfigDraft) => {
      const result = await textPipeline.saveRuntimeConfig(draft);
      if (result.ok && 'nextConfig' in result && result.nextConfig) {
        runtimeConfigRef.current = result.nextConfig;
        runtimeConfigHydratedRef.current = true;
        setRuntimeConfigHydrated(true);
        setRuntimeConfig((current) =>
          isRuntimeConfigEqual(current, result.nextConfig) ? current : result.nextConfig,
        );
      }
      return { ok: result.ok, message: result.message };
    },
    [textPipeline],
  );

  const testLLMConfig = useCallback(
    (input?: Partial<RuntimeLLMConfig>) => textPipeline.testLLMConfig(input),
    [textPipeline],
  );

  const testS2SConnection = useCallback(
    (input?: Partial<RuntimeS2SConfig>) => textPipeline.testS2SConnection(input),
    [textPipeline],
  );

  const voiceToggleLabel = voiceToggleHandlers.voiceToggleLabel;
  const voiceRuntimeHint = voiceToggleHandlers.voiceRuntimeHint;

  return {
    status: machine.status,
    voiceCallPhase: realtimeCallPhase,
    conversations,
    activeConversationId,
    messages,
    liveUserTranscript,
    pendingAssistantReply,
    createConversation,
    selectConversation,
    renameConversationTitle,
    deleteConversation,
    sendText,
    isVoiceActive,
    supportsVoiceInputMute,
    isVoiceInputMuted,
    toggleVoice,
    ensureVoiceStopped,
    toggleVoiceInputMuted,
    interruptVoiceOutput,
    voiceModeLabel,
    textReplySourceLabel,
    voiceToggleLabel,
    voiceRuntimeHint,
    voiceDebugLastEvent,
    connectivityHint,
    runtimeConfig,
    saveRuntimeConfig,
    testLLMConfig,
    testS2SConnection,
  };
}
