import { Platform } from 'react-native';
import { MockAudioProvider } from '../../../core/providers/audio/mock';
import type { AudioProvider } from '../../../core/providers/audio/types';
import { ConsoleAuditProvider } from '../../../core/providers/audit/console';
import type { AuditProvider } from '../../../core/providers/audit/types';
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
import { isCompleteLLMConfig, isCompleteS2SConfig, type RuntimeConfig } from '../config/runtimeConfig';
import { LocalReplyProvider } from '../service/localReplyProvider';

export type VoiceAssistantProviders = {
  audio: AudioProvider;
  s2s: S2SProvider;
  dialogEngine: DialogEngineProvider;
  reply: ReplyProvider;
  observability: ObservabilityProvider;
  audit: AuditProvider;
};

export function createVoiceAssistantProviders(runtimeConfig: RuntimeConfig): VoiceAssistantProviders {
  const hasS2SConfig = isCompleteS2SConfig(runtimeConfig.s2s);
  const replyChainMode = runtimeConfig.replyChainMode;
  const hasLLMConfig = isCompleteLLMConfig(runtimeConfig.llm);
  const androidDialogCandidate: DialogEngineProvider =
    Platform.OS === 'android' && hasS2SConfig
      ? new AndroidDialogEngineProvider({
          appId: runtimeConfig.s2s.appId.trim(),
          appKey: runtimeConfig.androidDialog.appKeyOverride.trim(),
          accessToken: runtimeConfig.s2s.accessToken.trim(),
          wsUrl: runtimeConfig.s2s.wsUrl.trim(),
        })
      : new MockDialogEngineProvider();
  const hasAndroidDialogCapability =
    Platform.OS === 'android' &&
    hasS2SConfig &&
    process.env.NODE_ENV !== 'test' &&
    androidDialogCandidate.isSupported();
  const useAndroidDialogRuntime = hasAndroidDialogCapability && replyChainMode === 'official_s2s';
  // Keep runtime/test boundaries explicit so the hook can instantiate providers once
  // without accidentally pulling native implementations into Jest.
  const useRealS2S =
    !useAndroidDialogRuntime &&
    hasS2SConfig &&
    typeof WebSocket !== 'undefined' &&
    process.env.NODE_ENV !== 'test';
  const useRealAudio =
    process.env.NODE_ENV !== 'test' && (!hasAndroidDialogCapability || replyChainMode !== 'official_s2s');
  const s2sProvider: S2SProvider = useRealS2S
    ? new WebSocketS2SProvider({
        wsUrl: runtimeConfig.s2s.wsUrl.trim(),
        appId: runtimeConfig.s2s.appId.trim(),
        accessToken: runtimeConfig.s2s.accessToken.trim(),
      })
    : new MockS2SProvider();
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
    process.env.NODE_ENV !== 'test' && replyChainMode === 'custom_llm' && hasLLMConfig
      ? new OpenAICompatibleReplyProvider({
          ...runtimeConfig.llm,
          streamMode: runtimeConfig.replyStreamMode,
        })
      : new LocalReplyProvider();
  return {
    audio: audioProvider,
    s2s: s2sProvider,
    dialogEngine,
    reply: replyProvider,
    observability: new ConsoleObservabilityProvider(),
    audit: new ConsoleAuditProvider(),
  };
}
