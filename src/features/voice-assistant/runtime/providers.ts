import { Platform } from 'react-native';
import { MockAudioProvider } from '../../../core/providers/audio/mock';
import type { AudioProvider } from '../../../core/providers/audio/types';
import { AndroidDialogEngineProvider } from '../../../core/providers/dialog-engine/android';
import { MockDialogEngineProvider } from '../../../core/providers/dialog-engine/mock';
import type { DialogEngineProvider } from '../../../core/providers/dialog-engine/types';
import { ConsoleObservabilityProvider } from '../../../core/providers/observability/console';
import type { ObservabilityProvider } from '../../../core/providers/observability/types';
import { OpenAICompatibleReplyProvider } from '../../../core/providers/reply/openaiCompatible';
import type { ReplyProvider } from '../../../core/providers/reply/types';
import { MockS2SProvider } from '../../../core/providers/s2s/mock';
import type { S2SProvider } from '../../../core/providers/s2s/types';
import { WebSocketS2SProvider } from '../../../core/providers/s2s/websocket';
import { readLLMEnv, readReplyChainMode, readS2SEnv } from '../config/env';
import { LocalReplyProvider } from '../service/localReplyProvider';

export type VoiceAssistantProviders = {
  audio: AudioProvider;
  s2s: S2SProvider;
  dialogEngine: DialogEngineProvider;
  reply: ReplyProvider;
  observability: ObservabilityProvider;
};

export function createVoiceAssistantProviders(): VoiceAssistantProviders {
  const env = readS2SEnv();
  const replyChainMode = readReplyChainMode();
  const llmEnv = readLLMEnv();
  const androidDialogCandidate: DialogEngineProvider =
    Platform.OS === 'android' && env ? new AndroidDialogEngineProvider(env) : new MockDialogEngineProvider();
  const hasAndroidDialogCapability =
    Platform.OS === 'android' &&
    Boolean(env) &&
    process.env.NODE_ENV !== 'test' &&
    androidDialogCandidate.isSupported();
  const useAndroidDialogRuntime = hasAndroidDialogCapability && replyChainMode === 'official_s2s';
  // Keep runtime/test boundaries explicit so the hook can instantiate providers once
  // without accidentally pulling native implementations into Jest.
  const useRealS2S =
    !useAndroidDialogRuntime &&
    Boolean(env) &&
    typeof WebSocket !== 'undefined' &&
    process.env.NODE_ENV !== 'test';
  const useRealAudio =
    process.env.NODE_ENV !== 'test' && (!hasAndroidDialogCapability || replyChainMode !== 'official_s2s');
  const s2sProvider: S2SProvider = useRealS2S && env ? new WebSocketS2SProvider(env) : new MockS2SProvider();
  const audioProvider: AudioProvider = useRealAudio
    ? // Lazy import avoids loading native modules in Jest environment.
      new (require('../../../core/providers/audio/expoRealtime').ExpoRealtimeAudioProvider as {
        new (): AudioProvider;
      })()
    : new MockAudioProvider();
  const dialogEngine: DialogEngineProvider = hasAndroidDialogCapability
    ? androidDialogCandidate
    : new MockDialogEngineProvider();
  const replyProvider: ReplyProvider =
    process.env.NODE_ENV !== 'test' && replyChainMode === 'custom_llm' && llmEnv
      ? new OpenAICompatibleReplyProvider(llmEnv)
      : new LocalReplyProvider();
  return {
    audio: audioProvider,
    s2s: s2sProvider,
    dialogEngine,
    reply: replyProvider,
    observability: new ConsoleObservabilityProvider(),
  };
}
