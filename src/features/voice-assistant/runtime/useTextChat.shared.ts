import type { Conversation } from '../types/model';
import { KONAN_CHARACTER_MANIFEST } from '../../../character/konanManifest';
import type { DialogEngineEvent } from '../../../core/providers/dialog-engine/types';

export type RealtimeCallPhase = 'idle' | 'starting' | 'listening' | 'speaking' | 'stopping';
export type RealtimeListeningState = 'ready' | 'hearing' | 'awaiting_reply';
export type AndroidDialogMode = 'voice' | 'text';
export type TurnTraceContext = {
  traceId: string;
  questionId?: string;
  replyId?: string;
  sdkTraceId?: string;
};
export type VoiceSemanticEvent =
  | 'assistant_playback_started'
  | 'assistant_playback_finished'
  | 'assistant_playback_interrupted'
  | 'user_speech_started'
  | 'user_speech_finalized';

export const AUDIO_HINT_DEDUPE_WINDOW_MS = 8000;
export const ANDROID_DIALOG_START_WAIT_MS = 2500;
export const ANDROID_DIALOG_READY_WAIT_MS = 2000;
export const ANDROID_DIALOG_CLIENT_TTS_SELECTION_WAIT_MS = 2400;
export const ANDROID_DIALOG_CLIENT_TTS_RETRY_DELAY_MS = 120;
export const ANDROID_DIALOG_CLIENT_TTS_MAX_RETRIES = 3;
export const ANDROID_DIALOG_CLIENT_TTS_BACKGROUND_MAX_RETRIES = 8;
export const CALL_LIFECYCLE_LOCK_WAIT_TIMEOUT_MS = 3000;
export const CALL_LIFECYCLE_LOCK_POLL_INTERVAL_MS = 16;

export const VOICE_RUNTIME_CONFIG = {
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

export function createTurnTraceId(seed: { turnId: number; sessionEpoch: number }): string {
  const nowPart = Date.now().toString(36);
  const randomPart = Math.random().toString(36).slice(2, 8);
  return `va-${seed.sessionEpoch}-${seed.turnId}-${nowPart}-${randomPart}`;
}

export function withTimeout<T>(
  promise: Promise<T>,
  timeoutMs: number,
  timeoutMessage: string,
): Promise<T> {
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

export function resolveConversationSystemPrompt(conversation: Conversation | null): string {
  const conversationPrompt = conversation?.systemPromptSnapshot?.trim();
  if (conversationPrompt) {
    return conversationPrompt;
  }
  return KONAN_CHARACTER_MANIFEST;
}

export function resolveSemanticEventFromDialogEvent(
  event: DialogEngineEvent,
): VoiceSemanticEvent | undefined {
  if (event.semanticEvent) {
    return event.semanticEvent;
  }
  switch (event.type) {
    case 'player_start':
      return 'assistant_playback_started';
    case 'player_finish':
      return 'assistant_playback_finished';
    case 'asr_start':
      return 'user_speech_started';
    case 'asr_final':
      return 'user_speech_finalized';
    default:
      return undefined;
  }
}

export function toVoiceDebugEventTag(event: DialogEngineEvent): string {
  const typeTag = event.type === 'player_finish'
    ? 'pf'
    : event.type === 'player_start'
    ? 'ps'
    : event.type === 'asr_start'
    ? 'as'
    : event.type === 'asr_final'
    ? 'af'
    : event.type === 'chat_partial'
    ? 'cp'
    : event.type === 'chat_final'
    ? 'cf'
    : event.type === 'engine_start'
    ? 'es'
    : event.type === 'engine_stop'
    ? 'ep'
    : event.type === 'error'
    ? 'er'
    : 'na';
  const semanticTag = event.semanticEvent === 'assistant_playback_finished'
    ? 'fin'
    : event.semanticEvent === 'assistant_playback_started'
    ? 'st'
    : event.semanticEvent === 'assistant_playback_interrupted'
    ? 'int'
    : event.semanticEvent === 'user_speech_started'
    ? 'usr_st'
    : event.semanticEvent === 'user_speech_finalized'
    ? 'usr_fin'
    : 'none';
  return `${typeTag}:${semanticTag}`;
}
