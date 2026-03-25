import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { Conversation, Message } from '../types/model';
import { InMemoryConversationRepo } from '../repo/conversationRepo';
import { buildAssistantReply } from '../service/useCases';
import { isSameAssistantText, sanitizeAssistantText } from '../service/assistantText';
import { maskSecret, readS2SEnv, readVoicePipelineMode } from '../config/env';
import { createVoiceAssistantProviders } from './providers';
import { useSessionMachine } from './sessionMachine';

export type UseTextChatResult = {
  status: Conversation['status'];
  conversations: Conversation[];
  activeConversationId: string | null;
  messages: Message[];
  sendText: (text: string) => Promise<void>;
  isVoiceActive: boolean;
  toggleVoice: () => Promise<void>;
  voiceModeLabel: string;
  voiceToggleLabel: string;
  voiceRuntimeHint: string;
  connectivityHint: string;
  testS2SConnection: () => Promise<void>;
};

type RealtimeCallPhase = 'idle' | 'starting' | 'listening' | 'speaking' | 'stopping';
type RealtimeListeningState = 'ready' | 'hearing' | 'awaiting_reply';

const AUDIO_HINT_DEDUPE_WINDOW_MS = 8000;
const VOICE_RUNTIME_CONFIG = {
  micInputHintCooldownMs: 10000,
  micRetryDelayMs: 1200,
  emptyRoundRetryDelayMs: 1200,
  emptyRoundHintThreshold: 3,
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

export function useTextChat(): UseTextChatResult {
  const isTestEnv = process.env.NODE_ENV === 'test';
  const repo = useMemo(() => new InMemoryConversationRepo(), []);
  const providers = useMemo(() => createVoiceAssistantProviders(), []);
  const machine = useSessionMachine();
  const voicePipelineMode = useMemo(() => readVoicePipelineMode(), []);
  const voiceModeLabel = voicePipelineMode === 'realtime_audio'
    ? 'Demo实时通话模式（连续语音上行）'
    : '稳定通话模式（自动听说）';
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
  const micIssueLastHintAtRef = useRef(0);
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [activeConversationId, setActiveConversationId] = useState<string | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [isVoiceActive, setIsVoiceActive] = useState(false);
  const [realtimeCallPhase, setRealtimeCallPhase] = useState<RealtimeCallPhase>('idle');
  const [realtimeListeningState, setRealtimeListeningState] = useState<RealtimeListeningState>('ready');
  const [connectivityHint, setConnectivityHint] = useState('尚未测试连接');
  const [s2sSessionReady, setS2SSessionReady] = useState(false);
  const lastAssistantAudioHintRef = useRef<{ content: string; at: number } | null>(null);

  useEffect(() => {
    let mounted = true;
    async function bootstrap() {
      const conversation = await repo.createConversation('默认会话');
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
  }, [repo]);

  const syncConversationState = useCallback(async () => {
    if (!activeConversationId) {
      return;
    }
    const refreshedMessages = await repo.listMessages(activeConversationId);
    const refreshedConversations = await repo.listConversations();
    setMessages(refreshedMessages);
    setConversations(refreshedConversations);
  }, [activeConversationId, repo]);

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
    setIsVoiceActive(false);
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
      void providers.audio.stopCapture();
      void providers.audio.stopPlayback();
      void providers.audio.abortRecognition();
      void providers.s2s.disconnect();
    },
    [providers.audio, providers.s2s, resetRealtimeCallState],
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

      await ensureS2SSession();
      const serverReply = await providers.s2s.sendTextQuery(clean);
      const assistantText = sanitizeAssistantText(serverReply ?? buildAssistantReply(clean));
      await repo.appendMessage(activeConversationId, {
        conversationId: activeConversationId,
        role: 'assistant',
        content: assistantText,
        type: assistantMessageType,
      });

      await updateConversationRuntimeStatus('speaking');
      await providers.audio.speak(assistantText);
    },
    [activeConversationId, ensureS2SSession, providers.audio, providers.s2s, repo, updateConversationRuntimeStatus],
  );

  const sendText = useCallback(
    async (text: string) => {
      const content = text.trim();
      if (!content || !activeConversationId) {
        return;
      }

      providers.observability.log('info', 'send text query', { content });
      try {
        await runTextRound({
          content,
          userMessageType: 'text',
          assistantMessageType: 'text',
        });
      } catch (error) {
        const message = error instanceof Error ? error.message : 'unknown error';
        providers.observability.log('warn', 'failed to process text round', { message });
        await updateConversationRuntimeStatus('error');
        await repo.appendMessage(activeConversationId, {
          conversationId: activeConversationId,
          role: 'assistant',
          content: '本轮文本对话失败，请检查网络后重试。',
          type: 'text',
        });
      } finally {
        await updateConversationRuntimeStatus('idle');
        await syncConversationState();
      }
    },
    [
      activeConversationId,
      providers.observability,
      repo,
      runTextRound,
      syncConversationState,
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
    providers.observability.log('info', 'handsfree voice loop started', { mode: voicePipelineMode });
    let consecutiveEmptyRounds = 0;
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
            providers.observability.log('info', 'voice round returned empty transcript', {
              mode: voicePipelineMode,
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
          providers.observability.log('info', 'voice transcript ready', {
            mode: voicePipelineMode,
            transcriptLength: normalizedText.length,
          });
          // Pause local ASR while assistant TTS is speaking, otherwise the assistant voice may be re-recognized as user input.
          await providers.audio.abortRecognition();
          await runTextRound({
            content: normalizedText,
            userMessageType: 'audio',
            assistantMessageType: 'audio',
          });
          if (voiceLoopActiveRef.current) {
            await providers.audio.startRecognition('zh-CN');
          }
        } catch (error) {
          if (!voiceLoopActiveRef.current) {
            break;
          }
          const message = error instanceof Error ? error.message : 'unknown error';
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
          }
        } finally {
          await syncConversationState();
        }
      }
    } finally {
      voiceLoopRunningRef.current = false;
      await stopHandsFreeVoiceLoop();
      providers.observability.log('info', 'handsfree voice loop stopped', { mode: voicePipelineMode });
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
    voicePipelineMode,
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

    if (voicePipelineMode === 'realtime_audio') {
      await withCallLifecycleLock(async () => {
        if (!isVoiceActive) {
          await startRealtimeDemoCall();
          return;
        }
        await stopRealtimeDemoCall();
      });
      return;
    }

    if (!isTestEnv && voicePipelineMode === 'asr_text') {
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
        providers.observability.log('info', 'voice asr session started', { mode: voicePipelineMode });
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
        mode: voicePipelineMode,
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
    isVoiceActive,
    runRealtimeDemoLoop,
    providers.audio,
    providers.observability,
    providers.s2s,
    runHandsFreeVoiceLoop,
    runTextRound,
    stopRealtimeDemoCall,
    stopHandsFreeVoiceLoop,
    syncConversationState,
    toAudioErrorMessage,
    updateConversationRuntimeStatus,
    voicePipelineMode,
  ]);

  const testS2SConnection = useCallback(async () => {
    const env = readS2SEnv();
    if (!env) {
      setConnectivityHint('缺少 EXPO_PUBLIC_S2S_APP_ID / EXPO_PUBLIC_S2S_ACCESS_TOKEN / EXPO_PUBLIC_S2S_WS_URL');
      return;
    }
    try {
      await providers.s2s.connect();
      if (!s2sSessionReady) {
        await providers.s2s.startSession();
        setS2SSessionReady(true);
      }
      await providers.s2s.disconnect();
      setS2SSessionReady(false);
      setConnectivityHint(`连接成功，app=${env.appId} token=${maskSecret(env.accessToken)}`);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'unknown error';
      setConnectivityHint(`连接失败：${message}`);
    }
  }, [providers.s2s, s2sSessionReady]);

  const voiceToggleLabel = useMemo(() => {
    if (voicePipelineMode !== 'realtime_audio') {
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
  }, [isVoiceActive, realtimeCallPhase, voicePipelineMode]);

  const voiceRuntimeHint = useMemo(() => {
    if (voicePipelineMode !== 'realtime_audio') {
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
  }, [isVoiceActive, realtimeCallPhase, realtimeListeningState, voicePipelineMode]);

  return {
    status: machine.status,
    conversations,
    activeConversationId,
    messages,
    sendText,
    isVoiceActive,
    toggleVoice,
    voiceModeLabel,
    voiceToggleLabel,
    voiceRuntimeHint,
    connectivityHint,
    testS2SConnection,
  };
}
