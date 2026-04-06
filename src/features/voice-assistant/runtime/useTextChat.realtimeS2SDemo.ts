import { analyzePcm16Energy, concatAudioChunks } from './useRealtimeDemoLoop';
import { isSameAssistantText, sanitizeAssistantText } from '../service/assistantText';

export function createRealtimeS2SDemoHandlers(deps: {
  activeConversationId: string | null;
  providers: any;
  repo: any;
  VOICE_RUNTIME_CONFIG: any;
  AUDIO_HINT_DEDUPE_WINDOW_MS: number;
  voiceLoopActiveRef: { current: boolean };
  voiceLoopRunningRef: { current: boolean };
  realtimeCallGenerationRef: { current: number };
  realtimeCallPhaseRef: { current: string };
  realtimePlaybackQueueEndAtRef: { current: number };
  realtimeUpstreamMutedUntilRef: { current: number };
  realtimeSilentFramesRef: { current: number };
  realtimeDroppedNoiseFramesRef: { current: number };
  realtimeSpeechFramesRef: { current: number };
  realtimeSpeechDetectedRef: { current: boolean };
  realtimePostSpeechSilentFramesRef: { current: number };
  lastRealtimeAssistantTextRef: { current: string };
  setIsVoiceActive: (v: boolean) => void;
  setS2SSessionReady: (v: boolean) => void;
  updateRealtimeCallPhase: (phase: any) => void;
  updateRealtimeListeningState: (state: any) => void;
  updateConversationRuntimeStatus: (status: any, options?: { refreshConversations?: boolean }) => Promise<void>;
  syncConversationState: () => Promise<void>;
  appendAssistantAudioMessage: (text: string, options?: { dedupeWindowMs?: number }) => Promise<void>;
  resetRealtimeCallState: () => void;
  ensureS2SSession: () => Promise<void>;
}) {
  const stopRealtimeDemoCall = async () => {
    if (!deps.activeConversationId) {
      return;
    }
    deps.updateRealtimeCallPhase('stopping');
    deps.voiceLoopActiveRef.current = false;
    await deps.providers.audio.stopCapture();
    await deps.providers.audio.stopPlayback();
    await deps.providers.audio.abortRecognition();
    try {
      await deps.providers.s2s.finishSession();
    } catch {}
    try {
      await deps.providers.s2s.finishConnection();
    } catch {}
    try {
      await deps.providers.s2s.interrupt();
    } catch {}
    await deps.providers.s2s.disconnect();
    deps.setS2SSessionReady(false);
    deps.resetRealtimeCallState();
    await deps.updateConversationRuntimeStatus('idle');
    await deps.syncConversationState();
  };

  const runRealtimeDemoLoop = async (generation: number) => {
    if (!deps.activeConversationId) {
      return;
    }
    if (deps.voiceLoopRunningRef.current) {
      return;
    }
    deps.voiceLoopRunningRef.current = true;
    deps.providers.observability.log('info', 'demo realtime voice loop started', { mode: 'realtime_audio' });
    let lastAudioChunkAt = 0;
    let isSpeaking = false;
    const playRealtimeBatch = async (merged: Uint8Array): Promise<void> => {
      if (merged.length === 0) {
        return;
      }
      const now = Date.now();
      const playbackStartsAt = Math.max(now, deps.realtimePlaybackQueueEndAtRef.current);
      const estimatedDurationMs = Math.ceil((merged.length / deps.VOICE_RUNTIME_CONFIG.realtimePcmBytesPerSecond) * 1000);
      const playbackEndsAt = playbackStartsAt + estimatedDurationMs;
      deps.realtimePlaybackQueueEndAtRef.current = playbackEndsAt;
      const muteUntil = playbackEndsAt + deps.VOICE_RUNTIME_CONFIG.realtimeUpstreamMutePlaybackMarginMs;
      if (muteUntil > deps.realtimeUpstreamMutedUntilRef.current) {
        deps.realtimeUpstreamMutedUntilRef.current = muteUntil;
      }
      void deps.providers.audio.play(merged);
    };
    try {
      let audioBatch: Uint8Array[] = [];
      let audioBatchBytes = 0;
      while (deps.voiceLoopActiveRef.current && generation === deps.realtimeCallGenerationRef.current) {
        let hasActivity = false;
        try {
          const chunk = await deps.providers.s2s.waitForAssistantAudioChunk(deps.VOICE_RUNTIME_CONFIG.realtimeAudioPollMs);
          if (chunk) {
            hasActivity = true;
            lastAudioChunkAt = Date.now();
            const chunkMuteUntil = Date.now() + deps.VOICE_RUNTIME_CONFIG.realtimeUpstreamMuteHoldMs;
            if (chunkMuteUntil > deps.realtimeUpstreamMutedUntilRef.current) {
              deps.realtimeUpstreamMutedUntilRef.current = chunkMuteUntil;
            }
            if (!isSpeaking) {
              isSpeaking = true;
              deps.updateRealtimeCallPhase('speaking');
              await deps.updateConversationRuntimeStatus('speaking', { refreshConversations: true });
            }
            audioBatch.push(chunk);
            audioBatchBytes += chunk.length;
            if (audioBatchBytes >= deps.VOICE_RUNTIME_CONFIG.realtimeBatchMinPlayBytes) {
              const merged = concatAudioChunks(audioBatch);
              audioBatch = [];
              audioBatchBytes = 0;
              await playRealtimeBatch(merged);
            }
          } else if (
            audioBatchBytes > 0 &&
            Date.now() - lastAudioChunkAt >= deps.VOICE_RUNTIME_CONFIG.realtimeBatchFlushIdleMs
          ) {
            const merged = concatAudioChunks(audioBatch);
            audioBatch = [];
            audioBatchBytes = 0;
            await playRealtimeBatch(merged);
          }

          const assistantText = await deps.providers.s2s.waitForAssistantText(deps.VOICE_RUNTIME_CONFIG.realtimeTextPollMs);
          const cleanAssistantText = sanitizeAssistantText(assistantText?.trim() ?? '');
          if (cleanAssistantText && !isSameAssistantText(cleanAssistantText, deps.lastRealtimeAssistantTextRef.current)) {
            hasActivity = true;
            deps.lastRealtimeAssistantTextRef.current = cleanAssistantText;
            await deps.repo.appendMessage(deps.activeConversationId, {
              conversationId: deps.activeConversationId,
              role: 'assistant',
              content: cleanAssistantText,
              type: 'audio',
            });
            await deps.syncConversationState();
          }

          if (
            isSpeaking &&
            Date.now() - lastAudioChunkAt >= deps.VOICE_RUNTIME_CONFIG.realtimeSpeakingCooldownMs
          ) {
            if (audioBatchBytes > 0) {
              const merged = concatAudioChunks(audioBatch);
              audioBatch = [];
              audioBatchBytes = 0;
              await playRealtimeBatch(merged);
            }
            isSpeaking = false;
            const afterSpeakMuteUntil = Math.max(
              deps.realtimePlaybackQueueEndAtRef.current,
              Date.now(),
            ) + deps.VOICE_RUNTIME_CONFIG.realtimeUpstreamMuteAfterSpeakMs;
            if (afterSpeakMuteUntil > deps.realtimeUpstreamMutedUntilRef.current) {
              deps.realtimeUpstreamMutedUntilRef.current = afterSpeakMuteUntil;
            }
            deps.updateRealtimeListeningState('ready');
            deps.updateRealtimeCallPhase('listening');
            await deps.updateConversationRuntimeStatus('listening', { refreshConversations: true });
          }

          if (!hasActivity) {
            await new Promise<void>((resolve) => {
              setTimeout(resolve, deps.VOICE_RUNTIME_CONFIG.realtimeIdleBackoffMs);
            });
          }
        } catch (error) {
          if (!deps.voiceLoopActiveRef.current || generation !== deps.realtimeCallGenerationRef.current) {
            break;
          }
          const message = error instanceof Error ? error.message : 'unknown error';
          const isIdleTimeout =
            message.includes('DialogAudioIdleTimeoutError') || message.includes('52000042');
          if (isIdleTimeout) {
            deps.providers.observability.log('info', 'realtime idle timeout, try to resume session', { message });
            try {
              await deps.providers.s2s.disconnect();
            } catch {}
            try {
              await deps.providers.s2s.connect();
              await deps.providers.s2s.startSession();
              deps.setS2SSessionReady(true);
              deps.updateRealtimeListeningState('ready');
              deps.updateRealtimeCallPhase('listening');
              await deps.updateConversationRuntimeStatus('listening', { refreshConversations: true });
              continue;
            } catch (resumeError) {
              const resumeMessage = resumeError instanceof Error ? resumeError.message : 'unknown error';
              deps.providers.observability.log('warn', 'realtime idle timeout recovery failed', { resumeMessage });
            }
          }
          deps.providers.observability.log('warn', 'demo realtime voice loop error', { message });
          await deps.appendAssistantAudioMessage('实时语音通话暂时中断，请挂断后重试。', {
            dedupeWindowMs: deps.AUDIO_HINT_DEDUPE_WINDOW_MS,
          });
          await deps.syncConversationState();
          await new Promise<void>((resolve) => {
            setTimeout(resolve, deps.VOICE_RUNTIME_CONFIG.realtimeLoopErrorBackoffMs);
          });
        }
      }
    } finally {
      deps.voiceLoopRunningRef.current = false;
      if (deps.realtimeCallPhaseRef.current !== 'stopping') {
        deps.updateRealtimeCallPhase('idle');
      }
      deps.providers.observability.log('info', 'demo realtime voice loop stopped', { mode: 'realtime_audio' });
    }
  };

  const startRealtimeDemoCall = async () => {
    if (!deps.activeConversationId) {
      return;
    }
    if (deps.voiceLoopActiveRef.current || deps.voiceLoopRunningRef.current) {
      deps.setIsVoiceActive(true);
      return;
    }
    const generation = deps.realtimeCallGenerationRef.current + 1;
    deps.realtimeCallGenerationRef.current = generation;
    try {
      deps.updateRealtimeCallPhase('starting');
      deps.lastRealtimeAssistantTextRef.current = '';
      deps.realtimeUpstreamMutedUntilRef.current = 0;
      deps.realtimePlaybackQueueEndAtRef.current = 0;
      deps.realtimeSilentFramesRef.current = 0;
      deps.realtimeDroppedNoiseFramesRef.current = 0;
      deps.realtimeSpeechFramesRef.current = 0;
      deps.realtimeSpeechDetectedRef.current = false;
      deps.realtimePostSpeechSilentFramesRef.current = 0;
      deps.updateRealtimeListeningState('ready');
      deps.voiceLoopActiveRef.current = true;
      deps.setIsVoiceActive(true);
      await deps.providers.audio.abortRecognition();
      await deps.ensureS2SSession();
      await deps.providers.audio.startCapture(async (frame: Uint8Array) => {
        if (generation !== deps.realtimeCallGenerationRef.current) {
          return;
        }
        if (Date.now() < deps.realtimeUpstreamMutedUntilRef.current) {
          return;
        }
        const { peak, rms } = analyzePcm16Energy(frame);
        const isSpeechLike =
          peak >= deps.VOICE_RUNTIME_CONFIG.realtimeSilenceGatePeakThreshold ||
          rms >= deps.VOICE_RUNTIME_CONFIG.realtimeSilenceGateRmsThreshold;
        const isSpeechEvidence =
          peak >= deps.VOICE_RUNTIME_CONFIG.realtimeSpeechDetectPeakThreshold ||
          rms >= deps.VOICE_RUNTIME_CONFIG.realtimeSpeechDetectRmsThreshold;
        if (isSpeechLike) {
          if (isSpeechEvidence) {
            deps.realtimeSpeechFramesRef.current += 1;
            if (deps.realtimeSpeechFramesRef.current >= deps.VOICE_RUNTIME_CONFIG.realtimeSpeechDetectArmFrames) {
              deps.updateRealtimeListeningState('hearing');
            }
            if (
              !deps.realtimeSpeechDetectedRef.current &&
              deps.realtimeSpeechFramesRef.current >= deps.VOICE_RUNTIME_CONFIG.realtimeEndpointAssistArmFrames
            ) {
              deps.realtimeSpeechDetectedRef.current = true;
            }
          } else {
            deps.realtimeSpeechFramesRef.current = 0;
          }
          deps.realtimePostSpeechSilentFramesRef.current = 0;
          deps.realtimeSilentFramesRef.current = 0;
        } else {
          deps.realtimeSpeechFramesRef.current = 0;
          if (deps.realtimeSpeechDetectedRef.current) {
            deps.realtimePostSpeechSilentFramesRef.current += 1;
            if (
              deps.realtimePostSpeechSilentFramesRef.current >=
              deps.VOICE_RUNTIME_CONFIG.realtimeEndpointAssistSilenceFrames
            ) {
              const muteUntil = Date.now() + deps.VOICE_RUNTIME_CONFIG.realtimeEndpointAssistMuteMs;
              if (muteUntil > deps.realtimeUpstreamMutedUntilRef.current) {
                deps.realtimeUpstreamMutedUntilRef.current = muteUntil;
              }
              deps.providers.observability.log('info', 'realtime local endpoint assist armed', {
                silentFrames: deps.realtimePostSpeechSilentFramesRef.current,
                muteMs: deps.VOICE_RUNTIME_CONFIG.realtimeEndpointAssistMuteMs,
              });
              deps.updateRealtimeListeningState('awaiting_reply');
              deps.realtimeSpeechDetectedRef.current = false;
              deps.realtimePostSpeechSilentFramesRef.current = 0;
              deps.realtimeSilentFramesRef.current = 0;
              return;
            }
          }
          deps.realtimeSilentFramesRef.current += 1;
          if (deps.realtimeSilentFramesRef.current > deps.VOICE_RUNTIME_CONFIG.realtimeSilenceGateHoldFrames) {
            deps.realtimeDroppedNoiseFramesRef.current += 1;
            if (
              deps.realtimeDroppedNoiseFramesRef.current === 1 ||
              deps.realtimeDroppedNoiseFramesRef.current % 40 === 0
            ) {
              deps.providers.observability.log('info', 'realtime upstream silence gate dropped frame', {
                peak,
                rms,
                droppedFrames: deps.realtimeDroppedNoiseFramesRef.current,
              });
            }
            return;
          }
        }
        await deps.providers.s2s.sendAudioFrame(frame);
      });
      deps.updateRealtimeListeningState('ready');
      deps.updateRealtimeCallPhase('listening');
      await deps.updateConversationRuntimeStatus('listening', { refreshConversations: true });
      deps.providers.observability.log('info', 'demo realtime call started', { mode: 'realtime_audio', generation });
      void runRealtimeDemoLoop(generation);
    } catch (error) {
      deps.resetRealtimeCallState();
      deps.updateRealtimeCallPhase('idle');
      const message = error instanceof Error ? error.message : 'unknown error';
      deps.providers.observability.log('warn', 'failed to start demo realtime call', { message, generation });
      await deps.appendAssistantAudioMessage('开始通话失败，请重试（建议等待 1 秒后再点）。', {
        dedupeWindowMs: deps.AUDIO_HINT_DEDUPE_WINDOW_MS,
      });
      await deps.providers.s2s.disconnect();
      deps.setS2SSessionReady(false);
      await deps.updateConversationRuntimeStatus('idle');
      await deps.syncConversationState();
    }
  };

  return {
    stopRealtimeDemoCall,
    runRealtimeDemoLoop,
    startRealtimeDemoCall,
  };
}
