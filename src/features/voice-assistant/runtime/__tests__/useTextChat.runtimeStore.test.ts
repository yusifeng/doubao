import { createVoiceAssistantRuntimeStore } from '../useTextChat.runtimeStore';
import type { RuntimeConfig } from '../../config/runtimeConfig';

const baseConfig: RuntimeConfig = {
  replyChainMode: 'official_s2s',
  replyStreamMode: 'auto',
  llm: {
    baseUrl: '',
    apiKey: '',
    model: '',
    provider: 'openai-compatible',
  },
  s2s: {
    appId: '',
    accessToken: '',
    wsUrl: 'wss://openspeech.bytedance.com/api/v3/realtime/dialogue',
  },
  persona: {
    activeRoleId: 'persona-default-konan',
    roles: [
      {
        id: 'persona-default-konan',
        name: '江户川柯南',
        systemPrompt: 'default prompt',
        source: 'default',
      },
    ],
    systemPrompt: 'default prompt',
    source: 'default',
  },
  androidDialog: {
    appKeyOverride: '',
  },
  voice: {
    speakerId: 'S_mXRP7Y5M1',
    speakerLabel: '默认音色',
    sourceType: 'default',
  },
};

describe('createVoiceAssistantRuntimeStore', () => {
  it('supports value and updater style mutations', () => {
    const store = createVoiceAssistantRuntimeStore(baseConfig);

    store.getState().setConnectivityHint('initial');
    store.getState().setConnectivityHint((current) => `${current}-next`);

    expect(store.getState().connectivityHint).toBe('initial-next');
  });

  it('creates isolated store instances', () => {
    const storeA = createVoiceAssistantRuntimeStore(baseConfig);
    const storeB = createVoiceAssistantRuntimeStore(baseConfig);

    storeA.getState().setLiveUserTranscript('only-a');

    expect(storeA.getState().liveUserTranscript).toBe('only-a');
    expect(storeB.getState().liveUserTranscript).toBe('');
  });
});
