import { MockAudioProvider } from '../../../core/providers/audio/mock';
import type { AudioProvider } from '../../../core/providers/audio/types';
import { ConsoleObservabilityProvider } from '../../../core/providers/observability/console';
import type { ObservabilityProvider } from '../../../core/providers/observability/types';
import { MockS2SProvider } from '../../../core/providers/s2s/mock';
import type { S2SProvider } from '../../../core/providers/s2s/types';
import { WebSocketS2SProvider } from '../../../core/providers/s2s/websocket';
import { readS2SEnv } from '../config/env';

export type VoiceAssistantProviders = {
  audio: AudioProvider;
  s2s: S2SProvider;
  observability: ObservabilityProvider;
};

export function createVoiceAssistantProviders(): VoiceAssistantProviders {
  const env = readS2SEnv();
  // Keep runtime/test boundaries explicit so the hook can instantiate providers once
  // without accidentally pulling native implementations into Jest.
  const useRealS2S = Boolean(env) && typeof WebSocket !== 'undefined' && process.env.NODE_ENV !== 'test';
  const useRealAudio = process.env.NODE_ENV !== 'test';
  const s2sProvider: S2SProvider = useRealS2S && env ? new WebSocketS2SProvider(env) : new MockS2SProvider();
  const audioProvider: AudioProvider = useRealAudio
    ? // Lazy import avoids loading native modules in Jest environment.
      new (require('../../../core/providers/audio/expoRealtime').ExpoRealtimeAudioProvider as {
        new (): AudioProvider;
      })()
    : new MockAudioProvider();
  return {
    audio: audioProvider,
    s2s: s2sProvider,
    observability: new ConsoleObservabilityProvider(),
  };
}
