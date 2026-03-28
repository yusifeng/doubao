describe('createVoiceAssistantProviders platform routing', () => {
  const originalNodeEnv = process.env.NODE_ENV;
  const originalWebSocket = global.WebSocket;

  afterEach(() => {
    process.env.NODE_ENV = originalNodeEnv;
    global.WebSocket = originalWebSocket;
    jest.resetModules();
    jest.clearAllMocks();
  });

  it('falls back to JS providers when Android dialog native module is unavailable', () => {
    process.env.NODE_ENV = 'development';
    global.WebSocket = function MockWebSocket() {} as unknown as typeof WebSocket;

    jest.doMock('../../config/env', () => ({
      readS2SEnv: () => ({
        appId: '7948119309',
        appKey: 'test-app-key',
        accessToken: 'test-access-token',
        wsUrl: 'wss://openspeech.bytedance.com/api/v3/realtime/dialogue',
      }),
      readLLMEnv: () => null,
      readReplyChainMode: () => 'official_s2s',
    }));
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
      const providers = createVoiceAssistantProviders();

      expect(providers.dialogEngine.isSupported()).toBe(false);
      expect(providers.s2s.constructor.name).toBe('WebSocketS2SProvider');
      expect(providers.audio.constructor.name).toBe('ExpoRealtimeAudioProvider');
    });
  });

  it('uses Android dialog provider when native module is available', () => {
    process.env.NODE_ENV = 'development';
    global.WebSocket = function MockWebSocket() {} as unknown as typeof WebSocket;

    jest.doMock('../../config/env', () => ({
      readS2SEnv: () => ({
        appId: '7948119309',
        appKey: 'test-app-key',
        accessToken: 'test-access-token',
        wsUrl: 'wss://openspeech.bytedance.com/api/v3/realtime/dialogue',
      }),
      readLLMEnv: () => null,
      readReplyChainMode: () => 'official_s2s',
    }));

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
      const providers = createVoiceAssistantProviders();

      expect(providers.dialogEngine.isSupported()).toBe(true);
      expect(providers.s2s.constructor.name).toBe('MockS2SProvider');
      expect(providers.audio.constructor.name).toBe('MockAudioProvider');
    });
  });
});
