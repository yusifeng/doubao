describe('createVoiceAssistantProviders platform routing', () => {
  const DEFAULT_S2S_WS_URL = 'wss://openspeech.bytedance.com/api/v3/realtime/dialogue';
  const originalNodeEnv = process.env.NODE_ENV;
  const originalWebSocket = global.WebSocket;
  const runtimeConfig = {
    replyChainMode: 'official_s2s' as const,
    replyStreamMode: 'auto' as const,
    llm: {
      baseUrl: '',
      apiKey: '',
      model: '',
      provider: 'openai-compatible',
    },
    s2s: {
      appId: '7948119309',
      accessToken: 'test-access-token',
      wsUrl: DEFAULT_S2S_WS_URL,
    },
    persona: {
      activeRoleId: 'persona-default-konan',
      roles: [
        {
          id: 'persona-default-konan',
          name: '江户川柯南',
          systemPrompt: 'default prompt',
          source: 'default' as const,
        },
      ],
      systemPrompt: 'default prompt',
      source: 'default' as const,
    },
    androidDialog: {
      appKeyOverride: 'test-app-key',
    },
    voice: {
      speakerId: 'S_mXRP7Y5M1',
      speakerLabel: '默认音色',
      sourceType: 'default' as const,
    },
  };

  afterEach(() => {
    process.env.NODE_ENV = originalNodeEnv;
    delete process.env.EXPO_PUBLIC_DEBUG_LOG_SINK_URL;
    global.WebSocket = originalWebSocket;
    jest.resetModules();
    jest.clearAllMocks();
  });

  it('falls back to JS providers when Android dialog native module is unavailable', () => {
    process.env.NODE_ENV = 'development';
    global.WebSocket = function MockWebSocket() {} as unknown as typeof WebSocket;
    jest.doMock('../../../../core/providers/audio/expoRealtime', () => ({
      ExpoRealtimeAudioProvider: class ExpoRealtimeAudioProvider {},
    }));

    jest.isolateModules(() => {
      const reactNative = require('react-native');
      Object.defineProperty(reactNative.Platform, 'OS', {
        configurable: true,
        value: 'android',
      });
      delete reactNative.NativeModules.RNDialogEngine;

      const { createVoiceAssistantProviders } = require('../providers');
      const providers = createVoiceAssistantProviders(runtimeConfig);

      expect(providers.dialogEngine.isSupported()).toBe(false);
      expect(providers.s2s.constructor.name).toBe('WebSocketS2SProvider');
      expect(providers.audio.constructor.name).toBe('ExpoRealtimeAudioProvider');
    });
  });

  it('uses Android dialog provider when native module is available', () => {
    process.env.NODE_ENV = 'development';
    global.WebSocket = function MockWebSocket() {} as unknown as typeof WebSocket;

    jest.isolateModules(() => {
      const reactNative = require('react-native');
      Object.defineProperty(reactNative.Platform, 'OS', {
        configurable: true,
        value: 'android',
      });
      reactNative.NativeModules.RNDialogEngine = {
        prepare: jest.fn(),
        startConversation: jest.fn(),
        stopConversation: jest.fn(),
        pauseTalking: jest.fn(),
        resumeTalking: jest.fn(),
        sendTextQuery: jest.fn(),
        useClientTriggeredTts: jest.fn(),
        useServerTriggeredTts: jest.fn(),
        streamClientTtsText: jest.fn(),
        destroy: jest.fn(),
        addListener: jest.fn(),
        removeListeners: jest.fn(),
      };

      const { createVoiceAssistantProviders } = require('../providers');
      const providers = createVoiceAssistantProviders(runtimeConfig);

      expect(providers.dialogEngine.isSupported()).toBe(true);
      expect(providers.s2s.constructor.name).toBe('MockS2SProvider');
      expect(providers.audio.constructor.name).toBe('MockAudioProvider');
    });
  });

  it('enables remote log fanout providers when collector url is configured', () => {
    process.env.NODE_ENV = 'development';
    process.env.EXPO_PUBLIC_DEBUG_LOG_SINK_URL = 'http://127.0.0.1:7357/ingest';
    global.WebSocket = function MockWebSocket() {} as unknown as typeof WebSocket;
    jest.doMock('../../../../core/providers/audio/expoRealtime', () => ({
      ExpoRealtimeAudioProvider: class ExpoRealtimeAudioProvider {},
    }));

    jest.isolateModules(() => {
      const reactNative = require('react-native');
      Object.defineProperty(reactNative.Platform, 'OS', {
        configurable: true,
        value: 'android',
      });
      delete reactNative.NativeModules.RNDialogEngine;

      const { createVoiceAssistantProviders } = require('../providers');
      const providers = createVoiceAssistantProviders(runtimeConfig);

      expect(providers.observability.constructor.name).toBe('CompositeObservabilityProvider');
      expect(providers.audit.constructor.name).toBe('CompositeAuditProvider');
    });
  });
});
