import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Platform } from 'react-native';
import type { Conversation, Message } from '../types/model';
import { InMemoryConversationRepo } from '../repo/conversationRepo';
import { buildAssistantReply } from '../service/useCases';
import { isSameAssistantText, sanitizeAssistantText } from '../service/assistantText';
import { maskSecret, readVoicePipelineMode } from '../config/env';
import {
  buildRuntimeConfigForSave,
  getEffectiveRuntimeConfig,
  saveRuntimeConfig as persistRuntimeConfig,
  validateRuntimeConfigForSave,
} from '../config/runtimeConfigRepo';
import {
  isCompleteLLMConfig,
  isCompleteS2SConfig,
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
import { OpenAICompatibleReplyProvider } from '../../../core/providers/reply/openaiCompatible';
import {
  VOICE_ASSISTANT_DIALOG_BOT_NAME,
  VOICE_ASSISTANT_DIALOG_MODEL,
} from '../config/constants';
import type {
  DialogConversationInputMode,
  DialogEngineEvent,
  DialogWorkMode,
} from '../../../core/providers/dialog-engine/types';

export type UseTextChatResult = {
  status: Conversation['status'];
  conversations: Conversation[];
  activeConversationId: string | null;
  messages: Message[];
  liveUserTranscript: string;
  pendingAssistantReply: string;
  createConversation: (title?: string) => Promise<string>;
  selectConversation: (conversationId: string) => Promise<boolean>;
  sendText: (text: string) => Promise<void>;
  isVoiceActive: boolean;
  supportsVoiceInputMute: boolean;
  isVoiceInputMuted: boolean;
  toggleVoice: () => Promise<void>;
  toggleVoiceInputMuted: () => Promise<void>;
  interruptVoiceOutput: () => Promise<void>;
  voiceModeLabel: string;
  textReplySourceLabel: string;
  voiceToggleLabel: string;
  voiceRuntimeHint: string;
  connectivityHint: string;
  runtimeConfig: RuntimeConfig;
  saveRuntimeConfig: (draft: RuntimeConfigDraft) => Promise<{ ok: boolean; message: string }>;
  testLLMConfig: (input?: Partial<RuntimeLLMConfig>) => Promise<{ ok: boolean; message: string }>;
  testS2SConnection: (input?: Partial<RuntimeS2SConfig>) => Promise<{ ok: boolean; message: string }>;
};

type RealtimeCallPhase = 'idle' | 'starting' | 'listening' | 'speaking' | 'stopping';
type RealtimeListeningState = 'ready' | 'hearing' | 'awaiting_reply';
type AndroidDialogMode = 'voice' | 'text';

const AUDIO_HINT_DEDUPE_WINDOW_MS = 8000;
const ANDROID_DIALOG_START_WAIT_MS = 2500;
const ANDROID_DIALOG_READY_WAIT_MS = 2000;
const ANDROID_DIALOG_CLIENT_TTS_ARM_COOLDOWN_MS = 120;
const ANDROID_DIALOG_CLIENT_TTS_RETRY_DELAY_MS = 120;
const ANDROID_DIALOG_CLIENT_TTS_MAX_RETRIES = 3;
const ANDROID_DIALOG_CLIENT_TTS_BACKGROUND_MAX_RETRIES = 8;
const VOICE_RUNTIME_CONFIG = {
  micInputHintCooldownMs: 10000,
  micRetryDelayMs: 1200,
  emptyRoundRetryDelayMs: 1200,
  emptyRoundHintThreshold: 3,
  voiceRoundErrorBackoffMs: 700,
  voiceRoundErrorStopThreshold: 5,
  recognitionPollTimeoutMs: 65000,
  realtimeAudioPollMs: 100,
  realtimeTextPollMs: 40,
  realtimeIdleBackoffMs: 30,
  realtimeSpeakingCooldownMs: 700,
  realtimeBatchMinPlayBytes: 9600,
  realtimeBatchFlushIdleMs: 120,
  realtimeUpstreamMuteHoldMs: 450,
  realtimeUpstreamMuteAfterSpeakMs: 320,
  realtimePcmBytesPerSecond: 24000 * 2,
  realtimeUpstreamMutePlaybackMarginMs: 220,
  realtimeLoopErrorBackoffMs: 300,
  realtimeSilenceGateHoldFrames: 2,
  realtimeSilenceGatePeakThreshold: 0.018,
  realtimeSilenceGateRmsThreshold: 0.0035,
  realtimeSpeechDetectArmFrames: 4,
  realtimeSpeechDetectPeakThreshold: 0.045,
  realtimeSpeechDetectRmsThreshold: 0.01,
  realtimeEndpointAssistArmFrames: 4,
  realtimeEndpointAssistSilenceFrames: 9,
  realtimeEndpointAssistMuteMs: 1250,
} as const;

function withTimeout<T>(promise: Promise<T>, timeoutMs: number, timeoutMessage: string): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timeoutId = setTimeout(() => {
      reject(new Error(timeoutMessage));
    }, timeoutMs);
    promise
      .then((value) => {
        clearTimeout(timeoutId);
        resolve(value);
      })
      .catch((error) => {
        clearTimeout(timeoutId);
        reject(error);
      });
  });
}

function analyzePcm16Energy(frame: Uint8Array): { peak: number; rms: number } {
  if (frame.length < 2) {
    return { peak: 0, rms: 0 };
  }

  const view = new DataView(frame.buffer, frame.byteOffset, frame.byteLength);
  let peak = 0;
  let sumSquares = 0;
  let sampleCount = 0;

  for (let offset = 0; offset + 1 < frame.length; offset += 2) {
    const sample = view.getInt16(offset, true) / 32768;
    const amplitude = Math.abs(sample);
    if (amplitude > peak) {
      peak = amplitude;
    }
    sumSquares += sample * sample;
    sampleCount += 1;
  }

  if (sampleCount === 0) {
    return { peak: 0, rms: 0 };
  }

  return {
    peak,
    rms: Math.sqrt(sumSquares / sampleCount),
  };
}

function concatAudioChunks(chunks: Uint8Array[]): Uint8Array {
  const total = chunks.reduce((sum, chunk) => sum + chunk.length, 0);
  const merged = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    merged.set(chunk, offset);
    offset += chunk.length;
  }
  return merged;
}

function mergeAssistantDraft(currentDraft: string, incomingText: string): string {
  if (!incomingText) {
    return currentDraft;
  }
  if (!currentDraft) {
    return incomingText;
  }
  if (incomingText.startsWith(currentDraft) || incomingText.includes(currentDraft)) {
    return incomingText;
  }
  if (
    currentDraft.startsWith(incomingText) ||
    currentDraft.includes(incomingText) ||
    currentDraft.endsWith(incomingText)
  ) {
    return currentDraft;
  }

  const maxOverlap = Math.min(currentDraft.length, incomingText.length);
  for (let overlap = maxOverlap; overlap > 0; overlap -= 1) {
    if (currentDraft.slice(-overlap) === incomingText.slice(0, overlap)) {
      return `${currentDraft}${incomingText.slice(overlap)}`;
    }
  }

  return `${currentDraft}${incomingText}`;
}

function resolveConversationSystemPrompt(
  conversation: Conversation | null,
): string {
  const conversationPrompt = conversation?.systemPromptSnapshot?.trim();
  if (conversationPrompt) {
    return conversationPrompt;
  }
  return KONAN_CHARACTER_MANIFEST;
}

export function useTextChat(): UseTextChatResult {
  const isTestEnv = process.env.NODE_ENV === 'test';
  const repo = useMemo(() => new InMemoryConversationRepo(), []);
  const [runtimeConfig, setRuntimeConfig] = useState<RuntimeConfig>(() => readRuntimeConfigFromEnv());
  const [runtimeConfigHydrated, setRuntimeConfigHydrated] = useState(false);
  const runtimeConfigRef = useRef(runtimeConfig);
  const runtimeConfigHydratedRef = useRef(runtimeConfigHydrated);
  const providers = useMemo(() => createVoiceAssistantProviders(runtimeConfig), [runtimeConfig]);
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
  const androidDialogModeRef = useRef<AndroidDialogMode | null>(null);
  const androidDialogInterruptedRef = useRef(false);
  const androidDialogInterruptInFlightRef = useRef(false);
  const androidReplyGenerationRef = useRef(0);
  const androidAssistantDraftRef = useRef('');
  const androidDialogSessionIdRef = useRef<string | null>(null);
  const androidDialogConversationIdRef = useRef<string | null>(null);
  const androidDialogSessionReadyRef = useRef(false);
  const androidDialogClientTtsEnabledRef = useRef(false);
  const androidDialogClientTtsArmingRef = useRef(false);
  const androidDialogClientTtsLastAttemptAtRef = useRef(0);
  const androidObservedPlatformReplyInCustomRef = useRef(false);
  const androidRetiredSessionIdsRef = useRef<string[]>([]);
  const micIssueLastHintAtRef = useRef(0);
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
  const [s2sSessionReady, setS2SSessionReady] = useState(false);
  const lastAssistantAudioHintRef = useRef<{ content: string; at: number } | null>(null);

  useEffect(() => {
    runtimeConfigRef.current = runtimeConfig;
  }, [runtimeConfig]);

  useEffect(() => {
    runtimeConfigHydratedRef.current = runtimeConfigHydrated;
  }, [runtimeConfigHydrated]);

  useEffect(() => {
    let mounted = true;
    void (async () => {
      let nextRuntimeConfig: RuntimeConfig;
      try {
        nextRuntimeConfig = await getEffectiveRuntimeConfig();
      } catch {
        nextRuntimeConfig = readRuntimeConfigFromEnv();
      }
      if (mounted) {
        setRuntimeConfig((current) =>
          isRuntimeConfigEqual(current, nextRuntimeConfig) ? current : nextRuntimeConfig,
        );
        runtimeConfigRef.current = nextRuntimeConfig;
        runtimeConfigHydratedRef.current = true;
        setRuntimeConfigHydrated(true);
      }
    })();
    return () => {
      mounted = false;
    };
  }, []);

  useEffect(() => {
    if (!runtimeConfigHydrated || hasBootstrappedConversationRef.current) {
      return;
    }
    hasBootstrappedConversationRef.current = true;
    let mounted = true;
    async function bootstrap() {
      const existingConversations = await repo.listConversations();
      if (existingConversations.length > 0) {
        return;
      }
      const conversation = await repo.createConversation('默认会话', {
        systemPromptSnapshot: runtimeConfig.persona.systemPrompt,
      });
      const allConversations = await repo.listConversations();
      const allMessages = await repo.listMessages(conversation.id);
      if (!mounted) {
        return;
      }
      setConversations(allConversations);
      setActiveConversationId(conversation.id);
      setMessages(allMessages);
    }
    bootstrap();
    return () => {
      mounted = false;
    };
  }, [repo, runtimeConfigHydrated, runtimeConfig.persona.systemPrompt]);

  useEffect(() => {
    if (replyChainMode !== 'custom_llm' || isCompleteLLMConfig(llmConfig)) {
      return;
    }
    setConnectivityHint('当前为 custom_llm 模式，但缺少 Base URL / API Key / Model 配置，已回退默认回复。');
  }, [llmConfig, replyChainMode]);

  const syncConversationState = useCallback(async () => {
    if (!activeConversationId) {
      return;
    }
    const refreshedMessages = await repo.listMessages(activeConversationId);
    const refreshedConversations = await repo.listConversations();
    setMessages(refreshedMessages);
    setConversations(refreshedConversations);
  }, [activeConversationId, repo]);

  const selectConversation = useCallback(
    async (conversationId: string) => {
      const refreshedConversations = await repo.listConversations();
      const nextConversation = refreshedConversations.find((conversation) => conversation.id === conversationId);
      if (!nextConversation) {
        return false;
      }
      const refreshedMessages = await repo.listMessages(conversationId);
      setActiveConversationId(conversationId);
      setMessages(refreshedMessages);
      setConversations(refreshedConversations);
      setLiveUserTranscript('');
      setPendingAssistantReply('');
      return true;
    },
    [repo],
  );

  const createConversation = useCallback(
    async (title = '新会话') => {
      let systemPromptSnapshot = runtimeConfigRef.current.persona.systemPrompt;
      if (!runtimeConfigHydratedRef.current) {
        try {
          const hydratedRuntimeConfig = await getEffectiveRuntimeConfig();
          systemPromptSnapshot = hydratedRuntimeConfig.persona.systemPrompt;
          runtimeConfigRef.current = hydratedRuntimeConfig;
          runtimeConfigHydratedRef.current = true;
          setRuntimeConfig((current) =>
            isRuntimeConfigEqual(current, hydratedRuntimeConfig) ? current : hydratedRuntimeConfig,
          );
          setRuntimeConfigHydrated(true);
        } catch {
          // Keep env snapshot as a safe fallback when hydration is unavailable.
        }
      }
      const conversation = await repo.createConversation(title, {
        systemPromptSnapshot,
      });
      const refreshedConversations = await repo.listConversations();
      const refreshedMessages = await repo.listMessages(conversation.id);
      setActiveConversationId(conversation.id);
      setMessages(refreshedMessages);
      setConversations(refreshedConversations);
      setLiveUserTranscript('');
      setPendingAssistantReply('');
      return conversation.id;
    },
    [repo],
  );

  const appendAssistantAudioMessage = useCallback(
    async (content: string, options?: { dedupeWindowMs?: number }) => {
      if (!activeConversationId) {
        return;
      }
      const dedupeWindowMs = options?.dedupeWindowMs ?? 0;
      const lastHint = lastAssistantAudioHintRef.current;
      const now = Date.now();
      if (
        dedupeWindowMs > 0 &&
        lastHint &&
        lastHint.content === content &&
        now - lastHint.at <= dedupeWindowMs
      ) {
        return;
      }
      await repo.appendMessage(activeConversationId, {
        conversationId: activeConversationId,
        role: 'assistant',
        content,
        type: 'audio',
      });
      lastAssistantAudioHintRef.current = {
        content,
        at: now,
      };
    },
    [activeConversationId, repo],
  );

  const resetRealtimeCallState = useCallback(() => {
    voiceLoopActiveRef.current = false;
    realtimeCallGenerationRef.current += 1;
    realtimeCallPhaseRef.current = 'idle';
    setRealtimeCallPhase('idle');
    realtimeUpstreamMutedUntilRef.current = 0;
    realtimePlaybackQueueEndAtRef.current = 0;
    realtimeSilentFramesRef.current = 0;
    realtimeDroppedNoiseFramesRef.current = 0;
    realtimeSpeechFramesRef.current = 0;
    realtimeSpeechDetectedRef.current = false;
    realtimePostSpeechSilentFramesRef.current = 0;
    realtimeListeningStateRef.current = 'ready';
    setRealtimeListeningState('ready');
    lastRealtimeAssistantTextRef.current = '';
    lastAssistantAudioHintRef.current = null;
    androidDialogModeRef.current = null;
    androidDialogInterruptedRef.current = false;
    androidDialogInterruptInFlightRef.current = false;
    androidAssistantDraftRef.current = '';
    androidDialogSessionIdRef.current = null;
    androidDialogConversationIdRef.current = null;
    androidDialogSessionReadyRef.current = false;
    androidDialogClientTtsEnabledRef.current = false;
    androidDialogClientTtsArmingRef.current = false;
    androidDialogClientTtsLastAttemptAtRef.current = 0;
    setLiveUserTranscript('');
    setPendingAssistantReply('');
    setIsVoiceActive(false);
    isVoiceInputMutedRef.current = false;
    setIsVoiceInputMuted(false);
  }, []);

  const setVoiceInputMutedRuntime = useCallback((muted: boolean) => {
    isVoiceInputMutedRef.current = muted;
    setIsVoiceInputMuted(muted);
  }, []);

  const rememberRetiredAndroidDialogSession = useCallback((sessionId?: string | null) => {
    if (!sessionId) {
      return;
    }
    androidRetiredSessionIdsRef.current = [
      sessionId,
      ...androidRetiredSessionIdsRef.current.filter((item) => item !== sessionId),
    ].slice(0, 8);
  }, []);

  const toAudioErrorMessage = useCallback((message: string, fallback: string): string => {
    if (message.includes('未检测到麦克风输入')) {
      return '没有检测到麦克风声音输入。若使用模拟器，请在 Extended controls > Microphone 中开启 Host audio input，或执行 adb emu avd hostmicon；建议优先用真机测试语音识别。';
    }
    return fallback;
  }, []);

  const updateRealtimeCallPhase = useCallback((phase: RealtimeCallPhase) => {
    realtimeCallPhaseRef.current = phase;
    setRealtimeCallPhase(phase);
  }, []);

  const updateRealtimeListeningState = useCallback((state: RealtimeListeningState) => {
    if (realtimeListeningStateRef.current === state) {
      return;
    }
    realtimeListeningStateRef.current = state;
    setRealtimeListeningState(state);
  }, []);

  useEffect(
    () => () => {
      resetRealtimeCallState();
      androidReplyGenerationRef.current += 1;
      void providers.audio.stopCapture();
      void providers.audio.stopPlayback();
      void providers.audio.abortRecognition();
      void providers.s2s.disconnect();
      void providers.dialogEngine.destroy();
    },
    [providers.audio, providers.dialogEngine, providers.s2s, resetRealtimeCallState],
  );

  const ensureS2SSession = useCallback(async () => {
    if (s2sSessionReady) {
      return;
    }
    await providers.s2s.connect();
    await providers.s2s.startSession();
    setS2SSessionReady(true);
  }, [providers.s2s, s2sSessionReady]);

  const updateConversationRuntimeStatus = useCallback(
    async (
      nextStatus: Conversation['status'],
      options?: {
        refreshConversations?: boolean;
      },
    ) => {
      switch (nextStatus) {
        case 'idle':
          machine.toIdle();
          break;
        case 'listening':
          machine.toListening();
          break;
        case 'thinking':
          machine.toThinking();
          break;
        case 'speaking':
          machine.toSpeaking();
          break;
        case 'error':
          machine.toError();
          break;
        default:
          break;
      }
      if (activeConversationId) {
        await repo.updateConversationStatus(activeConversationId, nextStatus);
      }
      if (options?.refreshConversations) {
        setConversations(await repo.listConversations());
      }
    },
    [activeConversationId, machine, repo],
  );

  const ensureAndroidDialogPrepared = useCallback(async () => {
    if (!useAndroidDialogRuntime) {
      return;
    }
    if (androidDialogPreparedRef.current) {
      return;
    }
    await providers.dialogEngine.prepare({ dialogWorkMode: androidDialogWorkMode });
    androidDialogPreparedRef.current = true;
  }, [androidDialogWorkMode, providers.dialogEngine, useAndroidDialogRuntime]);

  const persistPendingAndroidAssistantDraft = useCallback(async (options?: { conversationId?: string | null }) => {
    const targetConversationId =
      options?.conversationId ?? androidDialogConversationIdRef.current ?? activeConversationId;
    if (!targetConversationId) {
      return;
    }
    const draftText = sanitizeAssistantText(
      (androidAssistantDraftRef.current || pendingAssistantReply).trim(),
    );
    if (!draftText) {
      return;
    }
    const currentMessages = await repo.listMessages(targetConversationId);
    const lastMessage = currentMessages[currentMessages.length - 1];
    if (
      lastMessage?.role === 'assistant' &&
      isSameAssistantText(lastMessage.content, draftText)
    ) {
      return;
    }
    await repo.appendMessage(targetConversationId, {
      conversationId: targetConversationId,
      role: 'assistant',
      content: draftText,
      type: androidDialogModeRef.current === 'voice' ? 'audio' : 'text',
    });
  }, [activeConversationId, pendingAssistantReply, repo]);

  const ensureAndroidDialogConversation = useCallback(
    async (mode: AndroidDialogMode, options?: { forceRestart?: boolean }) => {
      if (!useAndroidDialogRuntime) {
        return;
      }
      const nextConversationId = activeConversationId;
      if (!nextConversationId) {
        return;
      }
      await ensureAndroidDialogPrepared();
      const shouldRestart =
        options?.forceRestart || !androidDialogModeRef.current || androidDialogModeRef.current !== mode;
      if (shouldRestart && androidDialogModeRef.current) {
        await persistPendingAndroidAssistantDraft();
        rememberRetiredAndroidDialogSession(androidDialogSessionIdRef.current);
        androidDialogSessionIdRef.current = null;
        androidDialogConversationIdRef.current = null;
        await providers.dialogEngine.stopConversation();
        androidDialogModeRef.current = null;
        androidAssistantDraftRef.current = '';
        setPendingAssistantReply('');
        setLiveUserTranscript('');
      }
      if (!shouldRestart && androidDialogModeRef.current === mode) {
        return;
      }
      const inputMode: DialogConversationInputMode = mode === 'voice' ? 'audio' : 'text';
      // Reset readiness before startup so incoming lifecycle events can only move state forward.
      androidDialogSessionReadyRef.current = false;
      androidDialogClientTtsEnabledRef.current = false;
      androidDialogClientTtsArmingRef.current = false;
      androidDialogClientTtsLastAttemptAtRef.current = 0;
      await providers.dialogEngine.startConversation({
        inputMode,
        model: VOICE_ASSISTANT_DIALOG_MODEL,
        speaker: runtimeConfig.voice.speakerId,
        characterManifest: KONAN_CHARACTER_MANIFEST,
        botName: VOICE_ASSISTANT_DIALOG_BOT_NAME,
      });
      if (!isTestEnv) {
        const waitStartDeadline = Date.now() + ANDROID_DIALOG_START_WAIT_MS;
        while (!androidDialogSessionIdRef.current && Date.now() < waitStartDeadline) {
          await new Promise<void>((resolve) => {
            setTimeout(resolve, 30);
          });
        }
      }
      // Do not switch TTS trigger mode during startup.
      // The Dialog SDK may reject trigger-mode directives before session is fully ready (400060).
      // We switch trigger mode at turn-level events (`asr_start` / `voice_round`).
      androidDialogModeRef.current = mode;
      androidDialogConversationIdRef.current = nextConversationId;
    },
    [
      activeConversationId,
      ensureAndroidDialogPrepared,
      useAndroidDialogRuntime,
      providers.dialogEngine,
      persistPendingAndroidAssistantDraft,
      rememberRetiredAndroidDialogSession,
      runtimeConfig.voice.speakerId,
    ],
  );

  const stopAndroidDialogConversation = useCallback(
    async (options?: { persistPendingAssistantDraft?: boolean }) => {
      if (!useAndroidDialogRuntime) {
        return;
      }
      if (options?.persistPendingAssistantDraft ?? true) {
        await persistPendingAndroidAssistantDraft();
      }
      androidReplyGenerationRef.current += 1;
      rememberRetiredAndroidDialogSession(androidDialogSessionIdRef.current);
      androidDialogSessionIdRef.current = null;
      androidDialogConversationIdRef.current = null;
      androidDialogSessionReadyRef.current = false;
      androidDialogClientTtsEnabledRef.current = false;
      androidDialogClientTtsArmingRef.current = false;
      androidDialogClientTtsLastAttemptAtRef.current = 0;
      await providers.dialogEngine.stopConversation();
      androidDialogModeRef.current = null;
      androidAssistantDraftRef.current = '';
      setPendingAssistantReply('');
      setLiveUserTranscript('');
    },
    [
      persistPendingAndroidAssistantDraft,
      providers.dialogEngine,
      rememberRetiredAndroidDialogSession,
      useAndroidDialogRuntime,
    ],
  );

  const ensureAndroidClientTriggeredTts = useCallback(
    async ({
      generation,
      source,
      maxRetries = ANDROID_DIALOG_CLIENT_TTS_MAX_RETRIES,
      throwOnFailure = true,
      waitForReady = true,
    }: {
      generation?: number;
      source: 'asr_start' | 'voice_round';
      maxRetries?: number;
      throwOnFailure?: boolean;
      waitForReady?: boolean;
    }): Promise<boolean> => {
      if (!useAndroidDialogRuntime || replyChainMode !== 'custom_llm') {
        return false;
      }

      if (waitForReady) {
        const waitReadyDeadline = Date.now() + ANDROID_DIALOG_READY_WAIT_MS;
        while (!androidDialogSessionReadyRef.current && Date.now() < waitReadyDeadline) {
          await new Promise<void>((resolve) => {
            setTimeout(resolve, 30);
          });
        }
      }

      if (!androidDialogSessionReadyRef.current) {
        androidDialogClientTtsEnabledRef.current = false;
        providers.observability.log('warn', 'custom llm voice setup failed: dialog session not ready', {
          generation,
          source,
        });
        if (throwOnFailure) {
          throw new Error('custom llm voice chain not ready');
        }
        return false;
      }

      if (androidDialogClientTtsEnabledRef.current) {
        return true;
      }

      let lastMessage = 'unknown error';
      for (let attempt = 1; attempt <= maxRetries; attempt += 1) {
        try {
          await providers.dialogEngine.useClientTriggeredTts();
          androidDialogClientTtsEnabledRef.current = true;
          providers.observability.log('info', 'custom llm client tts enabled', {
            generation,
            source,
            attempt,
          });
          return true;
        } catch (error) {
          const message = error instanceof Error ? error.message : 'unknown error';
          lastMessage = message;
          androidDialogClientTtsEnabledRef.current = false;
          const lower = message.toLowerCase();
          const shouldRetry =
            message.includes('400060') ||
            lower.includes('without init') ||
            lower.includes('not ready');
          providers.observability.log('warn', 'custom llm voice setup failed: cannot enable client tts', {
            message,
            generation,
            source,
            attempt,
            shouldRetry,
          });
          if (!shouldRetry || attempt >= maxRetries) {
            break;
          }
          await new Promise<void>((resolve) => {
            setTimeout(resolve, ANDROID_DIALOG_CLIENT_TTS_RETRY_DELAY_MS);
          });
        }
      }
      if (throwOnFailure) {
        throw new Error(`enable client tts failed: ${lastMessage}`);
      }
      return false;
    },
    [providers.dialogEngine, providers.observability, replyChainMode, useAndroidDialogRuntime],
  );

  const armAndroidClientTriggeredTtsInBackground = useCallback(
    (source: 'asr_start') => {
      if (!useAndroidDialogRuntime || replyChainMode !== 'custom_llm') {
        return;
      }
      if (androidDialogModeRef.current !== 'voice') {
        return;
      }
      if (androidDialogClientTtsEnabledRef.current || androidDialogClientTtsArmingRef.current) {
        return;
      }
      const now = Date.now();
      if (now - androidDialogClientTtsLastAttemptAtRef.current < ANDROID_DIALOG_CLIENT_TTS_ARM_COOLDOWN_MS) {
        return;
      }
      androidDialogClientTtsLastAttemptAtRef.current = now;
      androidDialogClientTtsArmingRef.current = true;
      void (async () => {
        try {
          await ensureAndroidClientTriggeredTts({
            source,
            maxRetries: ANDROID_DIALOG_CLIENT_TTS_BACKGROUND_MAX_RETRIES,
            throwOnFailure: false,
          });
        } finally {
          androidDialogClientTtsArmingRef.current = false;
        }
      })();
    },
    [ensureAndroidClientTriggeredTts, replyChainMode, useAndroidDialogRuntime],
  );

  const runAndroidReplyFlow = useCallback(
    async ({
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
      const targetConversationId =
        conversationId ?? androidDialogConversationIdRef.current ?? activeConversationId;
      if (!targetConversationId || !useAndroidDialogRuntime) {
        return;
      }

      const generation = androidReplyGenerationRef.current + 1;
      androidReplyGenerationRef.current = generation;
      const conversation = conversations.find((item) => item.id === targetConversationId) ?? null;
      if (conversation && !conversation.systemPromptSnapshot?.trim()) {
        await repo.updateConversationSystemPromptSnapshot(targetConversationId, KONAN_CHARACTER_MANIFEST);
        setConversations(await repo.listConversations());
      }
      const currentMessages = await repo.listMessages(targetConversationId);
      const effectiveSystemPrompt =
        conversation?.systemPromptSnapshot?.trim() || KONAN_CHARACTER_MANIFEST;

      await updateConversationRuntimeStatus('thinking', { refreshConversations: true });

      let assistantText = '';
      let started = false;
      setPendingAssistantReply('');
      let assistantPersisted = false;
      const persistAssistantText = async (raw: string) => {
        const normalized = sanitizeAssistantText(raw.trim());
        if (!normalized) {
          return;
        }
        await repo.appendMessage(targetConversationId, {
          conversationId: targetConversationId,
          role: 'assistant',
          content: normalized,
          type: assistantMessageType,
        });
        assistantPersisted = true;
      };

      try {
        let canStreamViaClientTts = false;
        if (replyChainMode === 'custom_llm') {
          canStreamViaClientTts = await ensureAndroidClientTriggeredTts({
            generation,
            source: 'voice_round',
            throwOnFailure: false,
            maxRetries: ANDROID_DIALOG_CLIENT_TTS_BACKGROUND_MAX_RETRIES,
          });
          if (!canStreamViaClientTts) {
            providers.observability.log(
              'warn',
              'custom llm voice round proceeding without s2s tts; text will still be generated',
              { generation },
            );
            try {
              await providers.dialogEngine.interruptCurrentDialog();
            } catch (interruptError) {
              const interruptMessage =
                interruptError instanceof Error ? interruptError.message : 'unknown error';
              providers.observability.log('warn', 'failed to interrupt platform voice before custom fallback', {
                message: interruptMessage,
              });
            }
            setConnectivityHint('自定义LLM文本已生成，S2S语音播报未就绪。');
          }
        }

        for await (const chunk of providers.reply.generateReplyStream({
          userText,
          mode,
          conversation,
          messages: currentMessages,
          systemPrompt: effectiveSystemPrompt,
        })) {
          if (generation !== androidReplyGenerationRef.current) {
            if (assistantText.trim()) {
              await persistAssistantText(assistantText);
            }
            setPendingAssistantReply('');
            await syncConversationState();
            return;
          }
          if (!chunk) {
            continue;
          }
          assistantText += chunk;
          setPendingAssistantReply(assistantText);
          if (!started) {
            providers.observability.log('info', 'custom llm voice round started', {
              provider: llmConfig.provider || 'openai-compatible',
              model: llmConfig.model || 'unknown',
              streamToS2SVoice: canStreamViaClientTts,
            });
            if (canStreamViaClientTts) {
              setConnectivityHint(
                `语音回复来源：自定义LLM（${llmConfig.provider || 'openai-compatible'} / ${llmConfig.model || 'unknown'}）`,
              );
            }
          }
          if (canStreamViaClientTts) {
            updateRealtimeCallPhase('speaking');
            await updateConversationRuntimeStatus('speaking', { refreshConversations: true });
            try {
              await providers.dialogEngine.streamClientTtsText({
                start: !started,
                content: chunk,
                end: false,
              });
              started = true;
            } catch (error) {
              const message = error instanceof Error ? error.message : 'unknown error';
              providers.observability.log('warn', 'stream client tts failed; continue with custom text only', {
                message,
                generation,
              });
              canStreamViaClientTts = false;
              androidDialogClientTtsEnabledRef.current = false;
              setConnectivityHint('自定义LLM文本已生成，S2S语音播报中断。');
              try {
                await providers.dialogEngine.interruptCurrentDialog();
              } catch {
                // Best effort: platform voice may already be stopped.
              }
            }
          }
        }

        if (generation !== androidReplyGenerationRef.current) {
          if (assistantText.trim()) {
            await persistAssistantText(assistantText);
          }
          setPendingAssistantReply('');
          await syncConversationState();
          return;
        }

        if (canStreamViaClientTts) {
          await providers.dialogEngine.streamClientTtsText({
            start: !started,
            content: '',
            end: true,
          });
        }

        const finalAssistantText = sanitizeAssistantText(
          assistantText.trim() || (replyChainMode === 'custom_llm' ? '' : buildAssistantReply(userText)),
        );
        if (!finalAssistantText) {
          throw new Error('custom llm returned empty response');
        }
        setPendingAssistantReply('');
        await persistAssistantText(finalAssistantText);
      } catch (error) {
        const message = error instanceof Error ? error.message : 'unknown error';
        providers.observability.log('warn', 'custom llm voice round failed after partial stream', {
          message,
          streamedLength: assistantText.length,
        });
        const partialText = sanitizeAssistantText(assistantText.trim());
        if (partialText) {
          await persistAssistantText(partialText);
        }
        if (replyChainMode === 'custom_llm' && !partialText && !assistantPersisted) {
          androidDialogClientTtsEnabledRef.current = false;
          try {
            await providers.dialogEngine.interruptCurrentDialog();
          } catch (interruptError) {
            const interruptErrorMessage =
              interruptError instanceof Error ? interruptError.message : 'unknown error';
            providers.observability.log('warn', 'failed to interrupt platform voice after custom failure', {
              message: interruptErrorMessage,
            });
          }
          setConnectivityHint('自定义LLM语音回复失败，请重试。');
          await repo.appendMessage(targetConversationId, {
            conversationId: targetConversationId,
            role: 'assistant',
            content: '自定义LLM语音回复失败，请重试。',
            type: 'text',
          });
          assistantPersisted = true;
        }
        setPendingAssistantReply('');
      }

      if (resumeVoiceAfterReply && voiceLoopActiveRef.current) {
        updateRealtimeListeningState('ready');
        updateRealtimeCallPhase('listening');
        await updateConversationRuntimeStatus('listening', { refreshConversations: true });
      } else {
        await stopAndroidDialogConversation();
        await updateConversationRuntimeStatus('idle', { refreshConversations: true });
      }

      if (!assistantPersisted && assistantText.trim().length > 0) {
        const fallbackPartialText = sanitizeAssistantText(assistantText.trim());
        if (fallbackPartialText) {
          await persistAssistantText(fallbackPartialText);
        }
      }
      await syncConversationState();
    },
    [
      activeConversationId,
      conversations,
      useAndroidDialogRuntime,
      replyChainMode,
      llmConfig,
      providers.dialogEngine,
      providers.observability,
      providers.reply,
      repo,
      ensureAndroidClientTriggeredTts,
      stopAndroidDialogConversation,
      syncConversationState,
      updateConversationRuntimeStatus,
      updateRealtimeCallPhase,
      updateRealtimeListeningState,
    ],
  );

  const performAndroidDialogInterrupt = useCallback(
    async (source: 'manual' | 'barge_in') => {
      const targetConversationId = androidDialogConversationIdRef.current ?? activeConversationId;
      if (!targetConversationId || !useAndroidDialogRuntime || !isVoiceActive) {
        return;
      }
      if (realtimeCallPhaseRef.current !== 'speaking') {
        return;
      }
      if (androidDialogInterruptInFlightRef.current) {
        return;
      }

      androidDialogInterruptInFlightRef.current = true;
      const interruptedText = sanitizeAssistantText(
        (androidAssistantDraftRef.current || pendingAssistantReply).trim(),
      );

      try {
        await providers.dialogEngine.interruptCurrentDialog();
        androidDialogInterruptedRef.current = true;
        if (interruptedText) {
          const currentMessages = await repo.listMessages(targetConversationId);
          const lastMessage = currentMessages[currentMessages.length - 1];
          if (
            !(
              lastMessage?.role === 'assistant' &&
              isSameAssistantText(lastMessage.content, interruptedText)
            )
          ) {
            await repo.appendMessage(targetConversationId, {
              conversationId: targetConversationId,
              role: 'assistant',
              content: interruptedText,
              type: 'audio',
            });
          }
        }
        if (source === 'manual') {
          setLiveUserTranscript('');
        }
        setPendingAssistantReply('');
        androidAssistantDraftRef.current = '';
        if (source === 'manual') {
          updateRealtimeListeningState('ready');
        }
        updateRealtimeCallPhase('listening');
        await updateConversationRuntimeStatus('listening', { refreshConversations: true });
        if (targetConversationId === activeConversationId) {
          await syncConversationState();
        } else {
          setConversations(await repo.listConversations());
        }
        providers.observability.log('info', 'android dialog interrupted', {
          source,
          interruptedTextLength: interruptedText.length,
        });
      } catch (error) {
        const message = error instanceof Error ? error.message : 'unknown error';
        providers.observability.log('warn', 'failed to interrupt android dialog output', {
          message,
          source,
        });
        androidDialogInterruptedRef.current = false;
      } finally {
        androidDialogInterruptInFlightRef.current = false;
      }
    },
    [
      activeConversationId,
      useAndroidDialogRuntime,
      isVoiceActive,
      pendingAssistantReply,
      providers.dialogEngine,
      providers.observability,
      repo,
      syncConversationState,
      updateConversationRuntimeStatus,
      updateRealtimeCallPhase,
      updateRealtimeListeningState,
    ],
  );

  const maybeInterruptOnBargeIn = useCallback(
    (eventType: 'asr_start' | 'asr_partial') => {
      if (!useAndroidDialogRuntime || !isVoiceActive || !voiceLoopActiveRef.current) {
        return;
      }
      if (realtimeCallPhaseRef.current !== 'speaking') {
        return;
      }
      if (androidDialogInterruptedRef.current || androidDialogInterruptInFlightRef.current) {
        return;
      }
      providers.observability.log('info', 'android barge-in detected while speaking', {
        eventType,
      });
      void performAndroidDialogInterrupt('barge_in');
    },
    [useAndroidDialogRuntime, isVoiceActive, performAndroidDialogInterrupt, providers.observability],
  );

  const handleAndroidDialogEvent = useCallback(
    (event: DialogEngineEvent) => {
      const logIgnoredAndroidDialogEvent = (reason: string) => {
        providers.observability.log('info', 'ignore stale android dialog event', {
          reason,
          eventType: event.type,
          eventSessionId: event.sessionId,
          activeSessionId: androidDialogSessionIdRef.current,
        });
      };

      providers.observability.log('info', 'android dialog event', {
        type: event.type,
        textLength: 'text' in event ? event.text.length : undefined,
      });

      switch (event.type) {
        case 'engine_start':
          if (event.sessionId && androidRetiredSessionIdsRef.current.includes(event.sessionId)) {
            logIgnoredAndroidDialogEvent('retired_session');
            return;
          }
          if (
            event.sessionId &&
            androidDialogSessionIdRef.current &&
            event.sessionId !== androidDialogSessionIdRef.current
          ) {
            logIgnoredAndroidDialogEvent('lifecycle_session_mismatch');
            return;
          }
          androidDialogSessionIdRef.current = event.sessionId ?? null;
          androidDialogSessionReadyRef.current = false;
          androidDialogClientTtsEnabledRef.current = false;
          androidDialogClientTtsArmingRef.current = false;
          androidDialogClientTtsLastAttemptAtRef.current = 0;
          setConnectivityHint('Android Dialog SDK 引擎已启动');
          break;
        case 'session_ready':
          if (
            event.sessionId &&
            androidDialogSessionIdRef.current &&
            event.sessionId !== androidDialogSessionIdRef.current
          ) {
            // Some Dialog SDK builds emit `session_ready` with `dialog_id` while
            // subsequent payload events keep using the `engine_start` session id.
            // Treat this as ready instead of stale, otherwise custom voice flow
            // never reaches client-triggered TTS.
            providers.observability.log('warn', 'android session_ready id differs from engine_start id', {
              readySessionId: event.sessionId,
              activeSessionId: androidDialogSessionIdRef.current,
            });
          }
          if (event.sessionId && !androidDialogSessionIdRef.current) {
            androidDialogSessionIdRef.current = event.sessionId;
          }
          androidDialogSessionReadyRef.current = true;
          break;
        case 'engine_stop':
          if (event.sessionId) {
            rememberRetiredAndroidDialogSession(event.sessionId);
          }
          if (
            event.sessionId &&
            (!androidDialogSessionIdRef.current ||
              event.sessionId !== androidDialogSessionIdRef.current)
          ) {
            logIgnoredAndroidDialogEvent('lifecycle_session_mismatch');
            return;
          }
          androidDialogSessionIdRef.current = null;
          androidDialogConversationIdRef.current = null;
          androidDialogSessionReadyRef.current = false;
          androidDialogClientTtsEnabledRef.current = false;
          androidDialogClientTtsArmingRef.current = false;
          androidDialogClientTtsLastAttemptAtRef.current = 0;
          setConnectivityHint('Android Dialog SDK 引擎已停止');
          androidReplyGenerationRef.current += 1;
          resetRealtimeCallState();
          void updateConversationRuntimeStatus('idle', { refreshConversations: true });
          break;
        case 'error': {
          if (
            event.sessionId &&
            androidDialogSessionIdRef.current &&
            event.sessionId !== androidDialogSessionIdRef.current
          ) {
            return;
          }
          const message = event.errorMessage ?? event.raw ?? '未知错误';
          setConnectivityHint(`Android Dialog SDK 错误：${message}`);
          void updateConversationRuntimeStatus('error', { refreshConversations: true });
          if (voiceLoopActiveRef.current) {
            updateRealtimeCallPhase('idle');
            updateRealtimeListeningState('ready');
            setIsVoiceActive(false);
            voiceLoopActiveRef.current = false;
          }
          break;
        }
        default: {
          if (!androidDialogSessionIdRef.current) {
            return;
          }
          if (event.sessionId && event.sessionId !== androidDialogSessionIdRef.current) {
            logIgnoredAndroidDialogEvent('payload_session_mismatch');
            return;
          }
        }
      }

      switch (event.type) {
        case 'asr_start':
          if (isVoiceInputMutedRef.current) {
            return;
          }
          maybeInterruptOnBargeIn('asr_start');
          if (realtimeCallPhaseRef.current !== 'speaking') {
            androidDialogInterruptedRef.current = false;
          }
          setLiveUserTranscript('');
          setPendingAssistantReply('');
          androidAssistantDraftRef.current = '';
          if (!androidDialogConversationIdRef.current && activeConversationId) {
            androidDialogConversationIdRef.current = activeConversationId;
          }
          androidObservedPlatformReplyInCustomRef.current = false;
          if (replyChainMode === 'custom_llm') {
            armAndroidClientTriggeredTtsInBackground('asr_start');
          }
          if (voiceLoopActiveRef.current) {
            updateRealtimeListeningState('ready');
            updateRealtimeCallPhase('listening');
            void updateConversationRuntimeStatus('listening', { refreshConversations: true });
          }
          break;
        case 'asr_partial':
          if (isVoiceInputMutedRef.current) {
            return;
          }
          maybeInterruptOnBargeIn('asr_partial');
          if (!voiceLoopActiveRef.current) {
            return;
          }
          setLiveUserTranscript(event.text);
          updateRealtimeListeningState('hearing');
          void updateConversationRuntimeStatus('listening', { refreshConversations: true });
          break;
        case 'asr_final':
          if (isVoiceInputMutedRef.current) {
            return;
          }
          const turnConversationId = androidDialogConversationIdRef.current ?? activeConversationId;
          if (!voiceLoopActiveRef.current || !turnConversationId) {
            return;
          }
          const finalUserText = event.text.trim();
          if (!finalUserText) {
            setLiveUserTranscript('');
            updateRealtimeListeningState('ready');
            updateRealtimeCallPhase('listening');
            void updateConversationRuntimeStatus('listening', { refreshConversations: true });
            return;
          }
          // A completed user utterance starts a new turn; clear the interrupt latch
          // so the next assistant reply can flow through.
          androidDialogInterruptedRef.current = false;
          setLiveUserTranscript(finalUserText);
          updateRealtimeListeningState('awaiting_reply');
          const replyGeneration = androidReplyGenerationRef.current + 1;
          androidReplyGenerationRef.current = replyGeneration;
          void (async () => {
            try {
              await repo.appendMessage(turnConversationId, {
                conversationId: turnConversationId,
                role: 'user',
                content: finalUserText,
                type: 'audio',
              });
              if (turnConversationId === activeConversationId) {
                await syncConversationState();
              } else {
                setConversations(await repo.listConversations());
              }
              if (replyGeneration !== androidReplyGenerationRef.current) {
                return;
              }
              if (replyChainMode === 'custom_llm') {
                await runAndroidReplyFlow({
                  userText: finalUserText,
                  mode: 'voice',
                  assistantMessageType: 'audio',
                  resumeVoiceAfterReply: true,
                  conversationId: turnConversationId,
                });
                return;
              }
              await updateConversationRuntimeStatus('thinking', { refreshConversations: true });
            } catch (error) {
              const message = error instanceof Error ? error.message : 'unknown error';
              providers.observability.log('warn', 'failed to process android asr_final turn', {
                message,
                replyChainMode,
              });
              setConnectivityHint(`语音回合失败：${message}`);
              setPendingAssistantReply('');
              if (voiceLoopActiveRef.current) {
                updateRealtimeListeningState('ready');
                updateRealtimeCallPhase('listening');
                await updateConversationRuntimeStatus('listening', { refreshConversations: true });
              } else {
                await updateConversationRuntimeStatus('idle', { refreshConversations: true });
              }
              await syncConversationState();
            }
          })();
          break;
        case 'chat_partial':
          if (replyChainMode === 'custom_llm') {
            if (!androidObservedPlatformReplyInCustomRef.current) {
              androidObservedPlatformReplyInCustomRef.current = true;
              providers.observability.log('warn', 'platform chat_partial received while custom_llm is active', {
                textLength: event.text.length,
              });
              void (async () => {
                try {
                  await providers.dialogEngine.interruptCurrentDialog();
                } catch (error) {
                  const message = error instanceof Error ? error.message : 'unknown error';
                  providers.observability.log(
                    'warn',
                    'failed to interrupt platform voice after platform chat_partial',
                    { message },
                  );
                }
              })();
            }
            return;
          }
          if (androidDialogInterruptedRef.current) {
            return;
          }
          setLiveUserTranscript('');
          androidAssistantDraftRef.current = mergeAssistantDraft(
            androidAssistantDraftRef.current,
            event.text,
          );
          setPendingAssistantReply(androidAssistantDraftRef.current);
          if (voiceLoopActiveRef.current) {
            updateRealtimeCallPhase('speaking');
          }
          void updateConversationRuntimeStatus('speaking', { refreshConversations: true });
          break;
        case 'chat_final':
          if (replyChainMode === 'custom_llm') {
            if (!androidObservedPlatformReplyInCustomRef.current) {
              androidObservedPlatformReplyInCustomRef.current = true;
              providers.observability.log('warn', 'platform chat_final received while custom_llm is active', {
                textLength: event.text.length,
              });
            }
            return;
          }
          if (androidDialogInterruptedRef.current) {
            return;
          }
          void (async () => {
            const finalConversationId = androidDialogConversationIdRef.current ?? activeConversationId;
            androidReplyGenerationRef.current += 1;
            const draftText = (event.text || androidAssistantDraftRef.current || pendingAssistantReply).trim();
            const finalText = sanitizeAssistantText(draftText);
            setLiveUserTranscript('');
            setPendingAssistantReply('');
            androidAssistantDraftRef.current = '';
            if (finalConversationId && finalText) {
              const currentMessages = await repo.listMessages(finalConversationId);
              const lastMessage = currentMessages[currentMessages.length - 1];
              if (
                !(
                  lastMessage?.role === 'assistant' &&
                  isSameAssistantText(lastMessage.content, finalText)
                )
              ) {
                await repo.appendMessage(finalConversationId, {
                  conversationId: finalConversationId,
                  role: 'assistant',
                  content: finalText,
                  type: voiceLoopActiveRef.current ? 'audio' : 'text',
                });
              }
            }
            if (voiceLoopActiveRef.current && androidDialogModeRef.current === 'voice') {
              updateRealtimeListeningState('ready');
              updateRealtimeCallPhase('listening');
              await updateConversationRuntimeStatus('listening', { refreshConversations: true });
            } else {
              await stopAndroidDialogConversation();
              resetRealtimeCallState();
              await updateConversationRuntimeStatus('idle', { refreshConversations: true });
            }
            if (finalConversationId === activeConversationId && activeConversationId) {
              await syncConversationState();
            } else {
              setConversations(await repo.listConversations());
            }
          })();
          break;
      }
    },
    [
      activeConversationId,
      maybeInterruptOnBargeIn,
      pendingAssistantReply,
      replyChainMode,
      providers.dialogEngine,
      providers.observability,
      repo,
      runAndroidReplyFlow,
      syncConversationState,
      stopAndroidDialogConversation,
      updateConversationRuntimeStatus,
      updateRealtimeCallPhase,
      updateRealtimeListeningState,
      resetRealtimeCallState,
      rememberRetiredAndroidDialogSession,
      armAndroidClientTriggeredTtsInBackground,
    ],
  );

  const androidDialogEventHandlerRef = useRef(handleAndroidDialogEvent);

  useEffect(() => {
    androidDialogEventHandlerRef.current = handleAndroidDialogEvent;
  }, [handleAndroidDialogEvent]);

  useEffect(() => {
    if (!useAndroidDialogRuntime) {
      return;
    }
    providers.dialogEngine.setListener((event) => {
      androidDialogEventHandlerRef.current(event);
    });
    return () => {
      providers.dialogEngine.setListener(null);
    };
  }, [providers.dialogEngine, useAndroidDialogRuntime]);

  const generateAssistantReplyFromProvider = useCallback(
    async ({
      userText,
      mode,
      conversationId,
      fallbackToS2S,
    }: {
      userText: string;
      mode: 'text' | 'voice';
      conversationId: string;
      fallbackToS2S: boolean;
    }): Promise<string> => {
      const conversation = conversations.find((item) => item.id === conversationId) ?? null;
      if (conversation && !conversation.systemPromptSnapshot?.trim()) {
        await repo.updateConversationSystemPromptSnapshot(conversationId, KONAN_CHARACTER_MANIFEST);
        setConversations(await repo.listConversations());
      }
      const currentMessages = await repo.listMessages(conversationId);
      const effectiveSystemPrompt = resolveConversationSystemPrompt(conversation);
      let assistantText = '';
      let emittedChunk = false;

      try {
        for await (const chunk of providers.reply.generateReplyStream({
          userText,
          mode,
          conversation,
          messages: currentMessages,
          systemPrompt: effectiveSystemPrompt,
        })) {
          if (!chunk) {
            continue;
          }
          emittedChunk = true;
          assistantText += chunk;
          setPendingAssistantReply(assistantText);
          await updateConversationRuntimeStatus('speaking');
        }
      } finally {
        setPendingAssistantReply('');
      }

      if (emittedChunk) {
        return sanitizeAssistantText(assistantText.trim());
      }

      if (!fallbackToS2S) {
        return '';
      }

      await ensureS2SSession();
      const serverReply = await providers.s2s.sendTextQuery(userText);
      return sanitizeAssistantText(serverReply?.trim() ?? '');
    },
    [
      conversations,
      ensureS2SSession,
      providers.reply,
      providers.s2s,
      repo,
      updateConversationRuntimeStatus,
    ],
  );

  const runTextRound = useCallback(
    async ({
      content,
      userMessageType,
      assistantMessageType,
    }: {
      content: string;
      userMessageType: Message['type'];
      assistantMessageType: Message['type'];
    }) => {
      if (!activeConversationId) {
        return;
      }
      const clean = content.trim();
      if (!clean) {
        return;
      }

      await updateConversationRuntimeStatus('thinking');

      await repo.appendMessage(activeConversationId, {
        conversationId: activeConversationId,
        role: 'user',
        content: clean,
        type: userMessageType,
      });
      await syncConversationState();
      setPendingAssistantReply('...');

      const assistantText = (
        await generateAssistantReplyFromProvider({
          userText: clean,
          mode: userMessageType === 'audio' ? 'voice' : 'text',
          conversationId: activeConversationId,
          fallbackToS2S: !useCustomReplyProvider,
        })
      ) || sanitizeAssistantText(buildAssistantReply(clean));
      if (useCustomReplyProvider) {
        setConnectivityHint(
          `回复来源：自定义LLM（${llmConfig.provider || 'openai-compatible'} / ${llmConfig.model || 'unknown'}）`,
        );
      }
      await repo.appendMessage(activeConversationId, {
        conversationId: activeConversationId,
        role: 'assistant',
        content: assistantText,
        type: assistantMessageType,
      });

      await updateConversationRuntimeStatus('speaking');
      if (assistantMessageType === 'audio') {
        if (useCustomVoiceS2STts) {
          let playedByS2SVoice = false;
          try {
            await providers.dialogEngine.prepare({ dialogWorkMode: 'delegate_chat_tts_text' });
            await providers.dialogEngine.startConversation({
              inputMode: 'text',
              model: VOICE_ASSISTANT_DIALOG_MODEL,
              speaker: runtimeConfig.voice.speakerId,
              characterManifest: KONAN_CHARACTER_MANIFEST,
              botName: VOICE_ASSISTANT_DIALOG_BOT_NAME,
            });
            await providers.dialogEngine.useClientTriggeredTts();
            await providers.dialogEngine.streamClientTtsText({
              start: true,
              content: assistantText,
              end: true,
            });
            playedByS2SVoice = true;
            setConnectivityHint('语音播报来源：S2S Voice（custom_llm 文本）');
          } catch (error) {
            const message = error instanceof Error ? error.message : 'unknown error';
            providers.observability.log('warn', 'failed to speak assistant text via s2s voice', { message });
          } finally {
            try {
              await providers.dialogEngine.stopConversation();
            } catch {
              // Best effort: playback session may already be stopped.
            }
          }
          if (!playedByS2SVoice) {
            await providers.audio.speak(assistantText);
          }
        } else {
          await providers.audio.speak(assistantText);
        }
      }
    },
    [
      activeConversationId,
      generateAssistantReplyFromProvider,
      providers.dialogEngine,
      llmConfig,
      providers.audio,
      providers.observability,
      repo,
      syncConversationState,
      useCustomReplyProvider,
      useCustomVoiceS2STts,
      updateConversationRuntimeStatus,
      runtimeConfig.voice.speakerId,
    ],
  );

  const sendText = useCallback(
    async (text: string) => {
      const content = text.trim();
      if (!content || !activeConversationId) {
        return;
      }
      let shouldFinalizeImmediately = true;

      providers.observability.log('info', 'send text query', { content });
      try {
        if (useAndroidDialogTextRuntime) {
          setLiveUserTranscript('');
          setPendingAssistantReply('');
          await repo.appendMessage(activeConversationId, {
            conversationId: activeConversationId,
            role: 'user',
            content,
            type: 'text',
          });
          await syncConversationState();
          await ensureAndroidDialogConversation('text', { forceRestart: true });
          await updateConversationRuntimeStatus('thinking', { refreshConversations: true });
          await providers.dialogEngine.sendTextQuery(content);
          shouldFinalizeImmediately = false;
          return;
        }
        await runTextRound({
          content,
          userMessageType: 'text',
          assistantMessageType: 'text',
        });
      } catch (error) {
        const message = error instanceof Error ? error.message : 'unknown error';
        providers.observability.log('warn', 'failed to process text round', { message });
        if (useAndroidDialogTextRuntime) {
          await stopAndroidDialogConversation();
          resetRealtimeCallState();
        }
        await updateConversationRuntimeStatus('error');
        await repo.appendMessage(activeConversationId, {
          conversationId: activeConversationId,
          role: 'assistant',
          content: '本轮文本对话失败，请检查网络后重试。',
          type: 'text',
        });
        await syncConversationState();
      } finally {
        if (shouldFinalizeImmediately) {
          await updateConversationRuntimeStatus('idle');
          await syncConversationState();
        }
      }
    },
    [
      activeConversationId,
      ensureAndroidDialogConversation,
      providers.observability,
      providers.dialogEngine,
      repo,
      resetRealtimeCallState,
      runTextRound,
      syncConversationState,
      stopAndroidDialogConversation,
      useAndroidDialogTextRuntime,
      useAndroidDialogRuntime,
      updateConversationRuntimeStatus,
    ],
  );

  const stopRealtimeDemoCall = useCallback(async () => {
    if (!activeConversationId) {
      return;
    }
    updateRealtimeCallPhase('stopping');
    voiceLoopActiveRef.current = false;
    await providers.audio.stopCapture();
    await providers.audio.stopPlayback();
    await providers.audio.abortRecognition();
    try {
      await providers.s2s.finishSession();
    } catch {
      // Best effort: ignore graceful-close failures.
    }
    try {
      await providers.s2s.finishConnection();
    } catch {
      // Best effort: ignore graceful-close failures.
    }
    try {
      await providers.s2s.interrupt();
    } catch {
      // Best effort: socket may already be disconnected.
    }
    await providers.s2s.disconnect();
    setS2SSessionReady(false);
    resetRealtimeCallState();
    await updateConversationRuntimeStatus('idle');
    await syncConversationState();
  }, [activeConversationId, providers.audio, providers.s2s, repo, resetRealtimeCallState, syncConversationState, updateConversationRuntimeStatus, updateRealtimeCallPhase]);

  const runRealtimeDemoLoop = useCallback(async (generation: number) => {
    if (!activeConversationId) {
      return;
    }
    if (voiceLoopRunningRef.current) {
      return;
    }
    voiceLoopRunningRef.current = true;
    providers.observability.log('info', 'demo realtime voice loop started', { mode: 'realtime_audio' });
    let lastAudioChunkAt = 0;
    let isSpeaking = false;
    const playRealtimeBatch = async (merged: Uint8Array): Promise<void> => {
      if (merged.length === 0) {
        return;
      }
      const now = Date.now();
      const playbackStartsAt = Math.max(now, realtimePlaybackQueueEndAtRef.current);
      const estimatedDurationMs = Math.ceil((merged.length / VOICE_RUNTIME_CONFIG.realtimePcmBytesPerSecond) * 1000);
      const playbackEndsAt = playbackStartsAt + estimatedDurationMs;
      realtimePlaybackQueueEndAtRef.current = playbackEndsAt;
      const muteUntil = playbackEndsAt + VOICE_RUNTIME_CONFIG.realtimeUpstreamMutePlaybackMarginMs;
      if (muteUntil > realtimeUpstreamMutedUntilRef.current) {
        realtimeUpstreamMutedUntilRef.current = muteUntil;
      }
      // Do not block polling loop on playback completion; provider keeps playback chained.
      void providers.audio.play(merged);
    };
    try {
      let audioBatch: Uint8Array[] = [];
      let audioBatchBytes = 0;
      while (voiceLoopActiveRef.current && generation === realtimeCallGenerationRef.current) {
        let hasActivity = false;
        try {
          const chunk = await providers.s2s.waitForAssistantAudioChunk(VOICE_RUNTIME_CONFIG.realtimeAudioPollMs);
          if (chunk) {
            hasActivity = true;
            lastAudioChunkAt = Date.now();
            const chunkMuteUntil = Date.now() + VOICE_RUNTIME_CONFIG.realtimeUpstreamMuteHoldMs;
            if (chunkMuteUntil > realtimeUpstreamMutedUntilRef.current) {
              realtimeUpstreamMutedUntilRef.current = chunkMuteUntil;
            }
            if (!isSpeaking) {
              isSpeaking = true;
              updateRealtimeCallPhase('speaking');
              await updateConversationRuntimeStatus('speaking', { refreshConversations: true });
            }
            audioBatch.push(chunk);
            audioBatchBytes += chunk.length;
            if (audioBatchBytes >= VOICE_RUNTIME_CONFIG.realtimeBatchMinPlayBytes) {
              const merged = concatAudioChunks(audioBatch);
              audioBatch = [];
              audioBatchBytes = 0;
              await playRealtimeBatch(merged);
            }
          } else if (
            audioBatchBytes > 0 &&
            Date.now() - lastAudioChunkAt >= VOICE_RUNTIME_CONFIG.realtimeBatchFlushIdleMs
          ) {
            const merged = concatAudioChunks(audioBatch);
            audioBatch = [];
            audioBatchBytes = 0;
            await playRealtimeBatch(merged);
          }

          const assistantText = await providers.s2s.waitForAssistantText(VOICE_RUNTIME_CONFIG.realtimeTextPollMs);
          const cleanAssistantText = sanitizeAssistantText(assistantText?.trim() ?? '');
          if (cleanAssistantText && !isSameAssistantText(cleanAssistantText, lastRealtimeAssistantTextRef.current)) {
            hasActivity = true;
            lastRealtimeAssistantTextRef.current = cleanAssistantText;
            await repo.appendMessage(activeConversationId, {
              conversationId: activeConversationId,
              role: 'assistant',
              content: cleanAssistantText,
              type: 'audio',
            });
            await syncConversationState();
          }

          if (
            isSpeaking &&
            Date.now() - lastAudioChunkAt >= VOICE_RUNTIME_CONFIG.realtimeSpeakingCooldownMs
          ) {
            if (audioBatchBytes > 0) {
              const merged = concatAudioChunks(audioBatch);
              audioBatch = [];
              audioBatchBytes = 0;
              await playRealtimeBatch(merged);
            }
            isSpeaking = false;
            const afterSpeakMuteUntil = Math.max(
              realtimePlaybackQueueEndAtRef.current,
              Date.now(),
            ) + VOICE_RUNTIME_CONFIG.realtimeUpstreamMuteAfterSpeakMs;
            if (afterSpeakMuteUntil > realtimeUpstreamMutedUntilRef.current) {
              realtimeUpstreamMutedUntilRef.current = afterSpeakMuteUntil;
            }
            updateRealtimeListeningState('ready');
            updateRealtimeCallPhase('listening');
            await updateConversationRuntimeStatus('listening', { refreshConversations: true });
          }

          if (!hasActivity) {
            await new Promise<void>((resolve) => {
              setTimeout(resolve, VOICE_RUNTIME_CONFIG.realtimeIdleBackoffMs);
            });
          }
        } catch (error) {
          if (!voiceLoopActiveRef.current || generation !== realtimeCallGenerationRef.current) {
            break;
          }
          const message = error instanceof Error ? error.message : 'unknown error';
          const isIdleTimeout =
            message.includes('DialogAudioIdleTimeoutError') || message.includes('52000042');
          if (isIdleTimeout) {
            providers.observability.log('info', 'realtime idle timeout, try to resume session', { message });
            try {
              await providers.s2s.disconnect();
            } catch {
              // Best effort: ignore close failures during recovery.
            }
            try {
              await providers.s2s.connect();
              await providers.s2s.startSession();
              setS2SSessionReady(true);
              updateRealtimeListeningState('ready');
              updateRealtimeCallPhase('listening');
              await updateConversationRuntimeStatus('listening', { refreshConversations: true });
              continue;
            } catch (resumeError) {
              const resumeMessage = resumeError instanceof Error ? resumeError.message : 'unknown error';
              providers.observability.log('warn', 'realtime idle timeout recovery failed', { resumeMessage });
            }
          }
          providers.observability.log('warn', 'demo realtime voice loop error', { message });
          await appendAssistantAudioMessage('实时语音通话暂时中断，请挂断后重试。', {
            dedupeWindowMs: AUDIO_HINT_DEDUPE_WINDOW_MS,
          });
          await syncConversationState();
          await new Promise<void>((resolve) => {
            setTimeout(resolve, VOICE_RUNTIME_CONFIG.realtimeLoopErrorBackoffMs);
          });
        }
      }
    } finally {
      voiceLoopRunningRef.current = false;
      if (realtimeCallPhaseRef.current !== 'stopping') {
        updateRealtimeCallPhase('idle');
      }
      providers.observability.log('info', 'demo realtime voice loop stopped', { mode: 'realtime_audio' });
    }
  }, [
    activeConversationId,
    machine,
    providers.audio,
    providers.observability,
    providers.s2s,
    repo,
    appendAssistantAudioMessage,
    syncConversationState,
    updateRealtimeListeningState,
    updateConversationRuntimeStatus,
    updateRealtimeCallPhase,
  ]);

  const stopHandsFreeVoiceLoop = useCallback(async () => {
    if (!activeConversationId) {
      return;
    }
    voiceLoopActiveRef.current = false;
    await providers.audio.stopPlayback();
    await providers.audio.abortRecognition();
    setIsVoiceActive(false);
    await updateConversationRuntimeStatus('idle');
    await syncConversationState();
  }, [activeConversationId, providers.audio, syncConversationState, updateConversationRuntimeStatus]);

  const runHandsFreeVoiceLoop = useCallback(async () => {
    if (!activeConversationId) {
      return;
    }
    if (voiceLoopRunningRef.current) {
      return;
    }
    voiceLoopRunningRef.current = true;
    providers.observability.log('info', 'handsfree voice loop started', { mode: effectiveVoicePipelineMode });
    let consecutiveEmptyRounds = 0;
    let consecutiveErrorRounds = 0;
    try {
      while (voiceLoopActiveRef.current) {
        try {
          await updateConversationRuntimeStatus('listening', { refreshConversations: true });

          await providers.audio.startRecognition('zh-CN');
          const recognizedText = await providers.audio.waitForRecognitionResult(VOICE_RUNTIME_CONFIG.recognitionPollTimeoutMs);
          if (!voiceLoopActiveRef.current) {
            break;
          }
          const normalizedText = recognizedText?.trim() ?? '';
          if (!normalizedText) {
            consecutiveEmptyRounds += 1;
            consecutiveErrorRounds = 0;
            providers.observability.log('info', 'voice round returned empty transcript', {
              mode: effectiveVoicePipelineMode,
              consecutiveEmptyRounds,
            });
            if (consecutiveEmptyRounds >= VOICE_RUNTIME_CONFIG.emptyRoundHintThreshold) {
              const now = Date.now();
              if (now - micIssueLastHintAtRef.current >= VOICE_RUNTIME_CONFIG.micInputHintCooldownMs) {
                micIssueLastHintAtRef.current = now;
                await appendAssistantAudioMessage(
                  '我还没听到可识别的语音，通话会保持开启并继续监听。若在模拟器测试，请确认 Extended controls > Microphone 已开启 Host audio input，或优先使用真机。',
                  { dedupeWindowMs: AUDIO_HINT_DEDUPE_WINDOW_MS },
                );
              }
            }
            await new Promise<void>((resolve) => {
              setTimeout(resolve, VOICE_RUNTIME_CONFIG.emptyRoundRetryDelayMs);
            });
            continue;
          }
          consecutiveEmptyRounds = 0;
          consecutiveErrorRounds = 0;
          providers.observability.log('info', 'voice transcript ready', {
            mode: effectiveVoicePipelineMode,
            transcriptLength: normalizedText.length,
          });
          // Pause local ASR while assistant TTS is speaking, otherwise the assistant voice may be re-recognized as user input.
          await providers.audio.abortRecognition();
          await runTextRound({
            content: normalizedText,
            userMessageType: 'audio',
            assistantMessageType: 'audio',
          });
        } catch (error) {
          if (!voiceLoopActiveRef.current) {
            break;
          }
          const message = error instanceof Error ? error.message : 'unknown error';
          consecutiveErrorRounds += 1;
          providers.observability.log('warn', 'failed to process voice round', { message });
          const isMicInputIssue = message.includes('未检测到麦克风输入');
          if (isMicInputIssue) {
            const now = Date.now();
            if (now - micIssueLastHintAtRef.current >= VOICE_RUNTIME_CONFIG.micInputHintCooldownMs) {
              micIssueLastHintAtRef.current = now;
              await appendAssistantAudioMessage(
                '当前一轮没有采到有效语音，我会保持通话并继续监听。若你在模拟器上测试，请确认 Extended controls > Microphone 已开启 Host audio input。',
                { dedupeWindowMs: AUDIO_HINT_DEDUPE_WINDOW_MS },
              );
            }
            await providers.audio.abortRecognition();
            await new Promise<void>((resolve) => {
              setTimeout(resolve, VOICE_RUNTIME_CONFIG.micRetryDelayMs);
            });
          } else {
            await appendAssistantAudioMessage('语音识别失败，请稍后重试。', {
              dedupeWindowMs: AUDIO_HINT_DEDUPE_WINDOW_MS,
            });
            await new Promise<void>((resolve) => {
              setTimeout(resolve, VOICE_RUNTIME_CONFIG.voiceRoundErrorBackoffMs);
            });
          }
          if (consecutiveErrorRounds >= VOICE_RUNTIME_CONFIG.voiceRoundErrorStopThreshold) {
            voiceLoopActiveRef.current = false;
            await appendAssistantAudioMessage('语音通话已暂停，请点击麦克风重新开始。', {
              dedupeWindowMs: AUDIO_HINT_DEDUPE_WINDOW_MS,
            });
          }
        } finally {
          await syncConversationState();
        }
      }
    } finally {
      voiceLoopRunningRef.current = false;
      await stopHandsFreeVoiceLoop();
      providers.observability.log('info', 'handsfree voice loop stopped', { mode: effectiveVoicePipelineMode });
    }
  }, [
    activeConversationId,
    machine,
    providers.audio,
    providers.observability,
    appendAssistantAudioMessage,
    runTextRound,
    stopHandsFreeVoiceLoop,
    syncConversationState,
    updateConversationRuntimeStatus,
    effectiveVoicePipelineMode,
  ]);

  const interruptVoiceOutput = useCallback(async () => {
    await performAndroidDialogInterrupt('manual');
  }, [
    performAndroidDialogInterrupt,
  ]);

  const toggleVoiceInputMuted = useCallback(async () => {
    if (!supportsVoiceInputMute || !isVoiceActive) {
      return;
    }

    const previousMuted = isVoiceInputMutedRef.current;
    const nextMuted = !previousMuted;
    setVoiceInputMutedRuntime(nextMuted);

    const isStillInActiveVoiceCall = () =>
      voiceLoopActiveRef.current &&
      androidDialogModeRef.current === 'voice' &&
      realtimeCallPhaseRef.current !== 'stopping' &&
      realtimeCallPhaseRef.current !== 'idle';
    const shouldRollbackMuteState = () =>
      realtimeCallPhaseRef.current !== 'stopping' && realtimeCallPhaseRef.current !== 'idle';

    try {
      if (nextMuted) {
        await providers.dialogEngine.pauseTalking();
        if (!isStillInActiveVoiceCall()) {
          return;
        }
        setLiveUserTranscript('');
        setPendingAssistantReply('');
        updateRealtimeListeningState('ready');
      } else {
        await providers.dialogEngine.resumeTalking();
        if (!isStillInActiveVoiceCall()) {
          return;
        }
        updateRealtimeListeningState('ready');
        updateRealtimeCallPhase('listening');
        await updateConversationRuntimeStatus('listening', { refreshConversations: true });
      }
      providers.observability.log('info', 'android voice input mute toggled', { muted: nextMuted });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'unknown error';
      providers.observability.log('warn', 'failed to toggle android voice input mute', { message, nextMuted });
      if (shouldRollbackMuteState()) {
        setVoiceInputMutedRuntime(previousMuted);
      }
    }
  }, [
    supportsVoiceInputMute,
    isVoiceActive,
    providers.dialogEngine,
    providers.observability,
    setVoiceInputMutedRuntime,
    updateConversationRuntimeStatus,
    updateRealtimeCallPhase,
    updateRealtimeListeningState,
  ]);

  const withCallLifecycleLock = useCallback(async (task: () => Promise<void>) => {
    if (callLifecycleLockRef.current) {
      return;
    }
    callLifecycleLockRef.current = true;
    try {
      await task();
    } finally {
      callLifecycleLockRef.current = false;
    }
  }, []);

  const startRealtimeDemoCall = useCallback(async () => {
    if (!activeConversationId) {
      return;
    }
    if (voiceLoopActiveRef.current || voiceLoopRunningRef.current) {
      setIsVoiceActive(true);
      return;
    }
    const generation = realtimeCallGenerationRef.current + 1;
    realtimeCallGenerationRef.current = generation;
    try {
      updateRealtimeCallPhase('starting');
      lastRealtimeAssistantTextRef.current = '';
      realtimeUpstreamMutedUntilRef.current = 0;
      realtimePlaybackQueueEndAtRef.current = 0;
      realtimeSilentFramesRef.current = 0;
      realtimeDroppedNoiseFramesRef.current = 0;
      realtimeSpeechFramesRef.current = 0;
      realtimeSpeechDetectedRef.current = false;
      realtimePostSpeechSilentFramesRef.current = 0;
      updateRealtimeListeningState('ready');
      voiceLoopActiveRef.current = true;
      setIsVoiceActive(true);
      await providers.audio.abortRecognition();
      await ensureS2SSession();
      await providers.audio.startCapture(async (frame) => {
        if (generation !== realtimeCallGenerationRef.current) {
          return;
        }
        if (Date.now() < realtimeUpstreamMutedUntilRef.current) {
          return;
        }
        const { peak, rms } = analyzePcm16Energy(frame);
        const isSpeechLike =
          peak >= VOICE_RUNTIME_CONFIG.realtimeSilenceGatePeakThreshold ||
          rms >= VOICE_RUNTIME_CONFIG.realtimeSilenceGateRmsThreshold;
        const isSpeechEvidence =
          peak >= VOICE_RUNTIME_CONFIG.realtimeSpeechDetectPeakThreshold ||
          rms >= VOICE_RUNTIME_CONFIG.realtimeSpeechDetectRmsThreshold;
        if (isSpeechLike) {
          if (isSpeechEvidence) {
            realtimeSpeechFramesRef.current += 1;
            if (
              realtimeSpeechFramesRef.current >= VOICE_RUNTIME_CONFIG.realtimeSpeechDetectArmFrames
            ) {
              updateRealtimeListeningState('hearing');
            }
            if (
              !realtimeSpeechDetectedRef.current &&
              realtimeSpeechFramesRef.current >= VOICE_RUNTIME_CONFIG.realtimeEndpointAssistArmFrames
            ) {
              realtimeSpeechDetectedRef.current = true;
            }
          } else {
            realtimeSpeechFramesRef.current = 0;
          }
          realtimePostSpeechSilentFramesRef.current = 0;
          realtimeSilentFramesRef.current = 0;
        } else {
          realtimeSpeechFramesRef.current = 0;
          if (realtimeSpeechDetectedRef.current) {
            realtimePostSpeechSilentFramesRef.current += 1;
            if (
              realtimePostSpeechSilentFramesRef.current >=
              VOICE_RUNTIME_CONFIG.realtimeEndpointAssistSilenceFrames
            ) {
              const muteUntil =
                Date.now() + VOICE_RUNTIME_CONFIG.realtimeEndpointAssistMuteMs;
              if (muteUntil > realtimeUpstreamMutedUntilRef.current) {
                realtimeUpstreamMutedUntilRef.current = muteUntil;
              }
              providers.observability.log('info', 'realtime local endpoint assist armed', {
                silentFrames: realtimePostSpeechSilentFramesRef.current,
                muteMs: VOICE_RUNTIME_CONFIG.realtimeEndpointAssistMuteMs,
              });
              updateRealtimeListeningState('awaiting_reply');
              realtimeSpeechDetectedRef.current = false;
              realtimePostSpeechSilentFramesRef.current = 0;
              realtimeSilentFramesRef.current = 0;
              return;
            }
          }
          realtimeSilentFramesRef.current += 1;
          if (realtimeSilentFramesRef.current > VOICE_RUNTIME_CONFIG.realtimeSilenceGateHoldFrames) {
            realtimeDroppedNoiseFramesRef.current += 1;
            if (
              realtimeDroppedNoiseFramesRef.current === 1 ||
              realtimeDroppedNoiseFramesRef.current % 40 === 0
            ) {
              providers.observability.log('info', 'realtime upstream silence gate dropped frame', {
                peak,
                rms,
                droppedFrames: realtimeDroppedNoiseFramesRef.current,
              });
            }
            return;
          }
        }
        await providers.s2s.sendAudioFrame(frame);
      });
      updateRealtimeListeningState('ready');
      updateRealtimeCallPhase('listening');
      await updateConversationRuntimeStatus('listening', { refreshConversations: true });
      providers.observability.log('info', 'demo realtime call started', { mode: 'realtime_audio', generation });
      void runRealtimeDemoLoop(generation);
    } catch (error) {
      resetRealtimeCallState();
      updateRealtimeCallPhase('idle');
      const message = error instanceof Error ? error.message : 'unknown error';
      providers.observability.log('warn', 'failed to start demo realtime call', { message, generation });
      await appendAssistantAudioMessage('开始通话失败，请重试（建议等待 1 秒后再点）。', {
        dedupeWindowMs: AUDIO_HINT_DEDUPE_WINDOW_MS,
      });
      await providers.s2s.disconnect();
      setS2SSessionReady(false);
      await updateConversationRuntimeStatus('idle');
      await syncConversationState();
    }
  }, [
    activeConversationId,
    appendAssistantAudioMessage,
    ensureS2SSession,
    providers.audio,
    providers.observability,
    providers.s2s,
    resetRealtimeCallState,
    runRealtimeDemoLoop,
    syncConversationState,
    updateRealtimeListeningState,
    updateConversationRuntimeStatus,
    updateRealtimeCallPhase,
  ]);

  const toggleVoice = useCallback(async () => {
    if (!activeConversationId) {
      return;
    }

    if (useAndroidDialogRuntime) {
      await withCallLifecycleLock(async () => {
        if (!isVoiceActive) {
          try {
            updateRealtimeCallPhase('starting');
            setIsVoiceActive(true);
            setVoiceInputMutedRuntime(false);
            voiceLoopActiveRef.current = true;
            setLiveUserTranscript('');
            setPendingAssistantReply('');
            await ensureAndroidDialogConversation('voice', { forceRestart: true });
            updateRealtimeListeningState('ready');
            updateRealtimeCallPhase('listening');
            await updateConversationRuntimeStatus('listening', { refreshConversations: true });
            setConnectivityHint('Android Dialog SDK 通话已接通');
          } catch (error) {
            const message = error instanceof Error ? error.message : 'unknown error';
            providers.observability.log('warn', 'failed to start android dialog voice call', { message });
            resetRealtimeCallState();
            setConnectivityHint(`Android Dialog SDK 通话启动失败：${message}`);
            await updateConversationRuntimeStatus('idle', { refreshConversations: true });
            await syncConversationState();
          }
          return;
        }

        updateRealtimeCallPhase('stopping');
        voiceLoopActiveRef.current = false;
        await stopAndroidDialogConversation();
        resetRealtimeCallState();
        setConnectivityHint('Android Dialog SDK 通话已挂断');
        await updateConversationRuntimeStatus('idle', { refreshConversations: true });
        await syncConversationState();
      });
      return;
    }

    if (effectiveVoicePipelineMode === 'realtime_audio') {
      await withCallLifecycleLock(async () => {
        if (!isVoiceActive) {
          await startRealtimeDemoCall();
          return;
        }
        await stopRealtimeDemoCall();
      });
      return;
    }

    if (!isTestEnv && effectiveVoicePipelineMode === 'asr_text') {
      if (!isVoiceActive) {
        if (voiceLoopActiveRef.current || voiceLoopRunningRef.current) {
          setIsVoiceActive(true);
          return;
        }
        voiceLoopActiveRef.current = true;
        setIsVoiceActive(true);
        void runHandsFreeVoiceLoop();
        return;
      }
      await stopHandsFreeVoiceLoop();
      return;
    }

    if (!isVoiceActive) {
      try {
        await providers.audio.startRecognition('zh-CN');
        await updateConversationRuntimeStatus('listening', { refreshConversations: true });
        providers.observability.log('info', 'voice asr session started', { mode: effectiveVoicePipelineMode });
        setIsVoiceActive(true);
      } catch (error) {
        const message = error instanceof Error ? error.message : 'unknown error';
        providers.observability.log('warn', 'failed to start voice recognition', { message });
        await appendAssistantAudioMessage('语音识别启动失败，请检查麦克风权限后重试。', {
          dedupeWindowMs: AUDIO_HINT_DEDUPE_WINDOW_MS,
        });
        await updateConversationRuntimeStatus('idle');
        await syncConversationState();
      }
      return;
    }

    setIsVoiceActive(false);
    try {
      const recognizedText = await providers.audio.stopRecognition();
      if (!recognizedText) {
        await appendAssistantAudioMessage('没有识别到有效语音，请再试一次并连续说 2-3 秒（尽量靠近麦克风）。', {
          dedupeWindowMs: AUDIO_HINT_DEDUPE_WINDOW_MS,
        });
        return;
      }
      providers.observability.log('info', 'voice transcript ready', {
        mode: effectiveVoicePipelineMode,
        transcriptLength: recognizedText.length,
      });
      await runTextRound({
        content: recognizedText,
        userMessageType: 'audio',
        assistantMessageType: 'audio',
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'unknown error';
      providers.observability.log('warn', 'failed to process voice round', { message });
      await appendAssistantAudioMessage(
        toAudioErrorMessage(message, '语音识别失败，请稍后重试。'),
        { dedupeWindowMs: AUDIO_HINT_DEDUPE_WINDOW_MS },
      );
    } finally {
      await providers.audio.abortRecognition();
      await updateConversationRuntimeStatus('idle');
      await syncConversationState();
    }
  }, [
    activeConversationId,
    appendAssistantAudioMessage,
    isTestEnv,
    useAndroidDialogRuntime,
    isVoiceActive,
    ensureAndroidDialogConversation,
    runRealtimeDemoLoop,
    providers.audio,
    providers.observability,
    providers.s2s,
    resetRealtimeCallState,
    runHandsFreeVoiceLoop,
    runTextRound,
    setVoiceInputMutedRuntime,
    stopAndroidDialogConversation,
    stopRealtimeDemoCall,
    stopHandsFreeVoiceLoop,
    syncConversationState,
    toAudioErrorMessage,
    updateConversationRuntimeStatus,
    effectiveVoicePipelineMode,
  ]);

  const saveRuntimeConfig = useCallback(
    async (draft: RuntimeConfigDraft) => {
      const validationErrors = validateRuntimeConfigForSave(runtimeConfig, draft);
      if (validationErrors.length > 0) {
        const message = validationErrors[0] ?? '配置校验失败';
        setConnectivityHint(message);
        return { ok: false, message };
      }
      const nextConfig = buildRuntimeConfigForSave(runtimeConfig, draft);
      await persistRuntimeConfig(nextConfig);
      setRuntimeConfig(nextConfig);
      const message = isVoiceActive
        ? '配置已保存。当前语音通话请先挂断后重连生效。'
        : '配置已保存，后续请求将使用新配置。';
      setConnectivityHint(message);
      return { ok: true, message };
    },
    [isVoiceActive, runtimeConfig],
  );

  const testLLMConfig = useCallback(
    async (input?: Partial<RuntimeLLMConfig>) => {
      const llmConfigToTest: RuntimeLLMConfig = {
        ...runtimeConfig.llm,
        ...input,
        provider: (input?.provider ?? runtimeConfig.llm.provider ?? 'openai-compatible').trim() || 'openai-compatible',
      };
      if (!isCompleteLLMConfig(llmConfigToTest)) {
        const message = '请先补全 Base URL / API Key / Model。';
        setConnectivityHint(message);
        return { ok: false, message };
      }
      try {
        const provider = new OpenAICompatibleReplyProvider(llmConfigToTest);
        await withTimeout(
          (async () => {
            let generated = '';
            for await (const chunk of provider.generateReplyStream({
              userText: 'ping',
              mode: 'text',
              conversation: null,
              messages: [],
              systemPrompt: runtimeConfig.persona.systemPrompt,
            })) {
              generated += chunk;
              if (generated.trim().length > 0) {
                break;
              }
            }
          })(),
          12000,
          '请求超时（12s）',
        );
        const message = `LLM 连接成功（${llmConfigToTest.provider || 'openai-compatible'} / ${llmConfigToTest.model}）`;
        setConnectivityHint(message);
        return { ok: true, message };
      } catch (error) {
        const reason = error instanceof Error ? error.message : 'unknown error';
        const message = `LLM 连接失败：${reason}`;
        setConnectivityHint(message);
        return { ok: false, message };
      }
    },
    [runtimeConfig.llm],
  );

  const testS2SConnection = useCallback(
    async (input?: Partial<RuntimeS2SConfig>) => {
      const s2sConfigToTest: RuntimeS2SConfig = {
        ...runtimeConfig.s2s,
        ...input,
      };
      if (!isCompleteS2SConfig(s2sConfigToTest)) {
        const message = '缺少 App ID / Access Token';
        setConnectivityHint(message);
        return { ok: false, message };
      }
      const configToTest = buildRuntimeConfigForSave(runtimeConfig, { s2s: s2sConfigToTest });
      const tempProviders = createVoiceAssistantProviders(configToTest);
      const tempAndroidDialogSupported = Platform.OS === 'android' && tempProviders.dialogEngine.isSupported();
      try {
        if (tempAndroidDialogSupported && configToTest.replyChainMode === 'official_s2s') {
          await tempProviders.dialogEngine.prepare({
            dialogWorkMode: 'default',
          });
          await tempProviders.dialogEngine.startConversation({
            inputMode: 'text',
            model: VOICE_ASSISTANT_DIALOG_MODEL,
            speaker: configToTest.voice.speakerId,
            characterManifest: KONAN_CHARACTER_MANIFEST,
            botName: VOICE_ASSISTANT_DIALOG_BOT_NAME,
          });
          await tempProviders.dialogEngine.stopConversation();
          const message = `Android Dialog SDK 可用，app=${s2sConfigToTest.appId} token=${maskSecret(s2sConfigToTest.accessToken)}`;
          setConnectivityHint(message);
          return { ok: true, message };
        }

        await tempProviders.s2s.connect();
        await tempProviders.s2s.startSession();
        await tempProviders.s2s.disconnect();
        const message = `S2S 连接成功，app=${s2sConfigToTest.appId} token=${maskSecret(s2sConfigToTest.accessToken)}`;
        setConnectivityHint(message);
        return { ok: true, message };
      } catch (error) {
        const reason = error instanceof Error ? error.message : 'unknown error';
        const message = `S2S 连接失败：${reason}`;
        setConnectivityHint(message);
        return { ok: false, message };
      } finally {
        if (tempProviders.s2s !== providers.s2s) {
          await tempProviders.s2s.disconnect().catch(() => undefined);
        }
        await tempProviders.dialogEngine.destroy().catch(() => undefined);
      }
    },
    [providers.s2s, runtimeConfig],
  );

  const voiceToggleLabel = useMemo(() => {
    if (useAndroidDialogRuntime) {
      switch (realtimeCallPhase) {
        case 'starting':
          return '正在接通';
        case 'stopping':
          return '正在挂断';
        case 'listening':
        case 'speaking':
          return '挂断通话';
        case 'idle':
        default:
          return '开始通话';
      }
    }
    if (effectiveVoicePipelineMode !== 'realtime_audio') {
      return isVoiceActive ? '结束语音' : '开始语音';
    }
    switch (realtimeCallPhase) {
      case 'starting':
        return '正在接通';
      case 'stopping':
        return '正在挂断';
      case 'listening':
      case 'speaking':
        return '挂断通话';
      case 'idle':
      default:
        return '开始通话';
    }
  }, [useAndroidDialogRuntime, isVoiceActive, realtimeCallPhase, effectiveVoicePipelineMode]);

  const voiceRuntimeHint = useMemo(() => {
    if (useAndroidDialogRuntime) {
      if (isVoiceActive && isVoiceInputMuted && realtimeCallPhase !== 'speaking') {
        return '你已静音';
      }
      switch (realtimeCallPhase) {
        case 'starting':
          return '正在接通';
        case 'listening':
          switch (realtimeListeningState) {
            case 'hearing':
              return '已听到你在说话';
            case 'awaiting_reply':
              return '已发送，等待回复';
            case 'ready':
            default:
              return '正在听你说';
          }
        case 'speaking':
          return '助手播报中，稍后继续听';
        case 'stopping':
          return '正在挂断';
        case 'idle':
        default:
          return '实时通话未开启';
      }
    }
    if (effectiveVoicePipelineMode !== 'realtime_audio') {
      return isVoiceActive ? '本机识别已开启' : '本机识别未开启';
    }
    switch (realtimeCallPhase) {
      case 'starting':
        return '实时上行准备中';
      case 'listening':
        switch (realtimeListeningState) {
          case 'hearing':
            return '已听到你在说话';
          case 'awaiting_reply':
            return '已发送，等待回复';
          case 'ready':
          default:
            return '正在听你说';
        }
      case 'speaking':
        return '助手播报中，稍后继续听';
      case 'stopping':
        return '实时通话关闭中';
      case 'idle':
      default:
        return '实时通话未开启';
    }
  }, [useAndroidDialogRuntime, isVoiceActive, isVoiceInputMuted, realtimeCallPhase, realtimeListeningState, effectiveVoicePipelineMode]);

  return {
    status: machine.status,
    conversations,
    activeConversationId,
    messages,
    liveUserTranscript,
    pendingAssistantReply,
    createConversation,
    selectConversation,
    sendText,
    isVoiceActive,
    supportsVoiceInputMute,
    isVoiceInputMuted,
    toggleVoice,
    toggleVoiceInputMuted,
    interruptVoiceOutput,
    voiceModeLabel,
    textReplySourceLabel,
    voiceToggleLabel,
    voiceRuntimeHint,
    connectivityHint,
    runtimeConfig,
    saveRuntimeConfig,
    testLLMConfig,
    testS2SConnection,
  };
}
