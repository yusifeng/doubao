import { Platform } from 'react-native';
import { MockAudioProvider } from '../../../core/providers/audio/mock';
import type { AudioProvider } from '../../../core/providers/audio/types';
import { AndroidDialogEngineProvider } from '../../../core/providers/dialog-engine/android';
import { MockDialogEngineProvider } from '../../../core/providers/dialog-engine/mock';
import type { DialogEngineProvider } from '../../../core/providers/dialog-engine/types';
import { ConsoleObservabilityProvider } from '../../../core/providers/observability/console';
import type { ObservabilityProvider } from '../../../core/providers/observability/types';
import type { ReplyProvider } from '../../../core/providers/reply/types';
import { MockS2SProvider } from '../../../core/providers/s2s/mock';
import type { S2SProvider } from '../../../core/providers/s2s/types';
import { WebSocketS2SProvider } from '../../../core/providers/s2s/websocket';
import { readS2SEnv } from '../config/env';
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
  const androidDialogCandidate: DialogEngineProvider =
    Platform.OS === 'android' && env ? new AndroidDialogEngineProvider(env) : new MockDialogEngineProvider();
  const useAndroidDialog =
    Platform.OS === 'android' &&
    Boolean(env) &&
    process.env.NODE_ENV !== 'test' &&
    androidDialogCandidate.isSupported();
  // Keep runtime/test boundaries explicit so the hook can instantiate providers once
  // without accidentally pulling native implementations into Jest.
  const useRealS2S =
    !useAndroidDialog &&
    Boolean(env) &&
    typeof WebSocket !== 'undefined' &&
    process.env.NODE_ENV !== 'test';
  const useRealAudio = !useAndroidDialog && process.env.NODE_ENV !== 'test';
  const s2sProvider: S2SProvider = useRealS2S && env ? new WebSocketS2SProvider(env) : new MockS2SProvider();
  const audioProvider: AudioProvider = useRealAudio
    ? // Lazy import avoids loading native modules in Jest environment.
      new (require('../../../core/providers/audio/expoRealtime').ExpoRealtimeAudioProvider as {
        new (): AudioProvider;
      })()
    : new MockAudioProvider();
  const dialogEngine: DialogEngineProvider = useAndroidDialog ? androidDialogCandidate : new MockDialogEngineProvider();
  return {
    audio: audioProvider,
    s2s: s2sProvider,
    dialogEngine,
    reply: new LocalReplyProvider(),
    observability: new ConsoleObservabilityProvider(),
  };
}
