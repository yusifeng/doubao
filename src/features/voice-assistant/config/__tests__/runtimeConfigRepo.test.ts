jest.mock('@react-native-async-storage/async-storage', () => ({
  __esModule: true,
  default: {
    getItem: jest.fn(),
    setItem: jest.fn(),
  },
  getItem: jest.fn(),
  setItem: jest.fn(),
}));

import {
  __setRuntimeConfigRepoAdaptersForTest,
  buildRuntimeConfigForSave,
  getEffectiveRuntimeConfig,
  saveRuntimeConfig,
  validateRuntimeConfigForSave,
} from '../runtimeConfigRepo';
import { readRuntimeConfigFromEnv } from '../runtimeConfig';

const mockAsyncStorage = {
  getItem: jest.fn<Promise<string | null>, [string]>(),
  setItem: jest.fn<Promise<void>, [string, string]>(),
};

const mockSecureStore = {
  getItemAsync: jest.fn<Promise<string | null>, [string]>(),
  setItemAsync: jest.fn<Promise<void>, [string, string]>(),
  deleteItemAsync: jest.fn<Promise<void>, [string]>(),
};

describe('runtimeConfigRepo', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    jest.clearAllMocks();
    process.env = {
      ...originalEnv,
      EXPO_PUBLIC_REPLY_CHAIN_MODE: 'official_s2s',
      EXPO_PUBLIC_S2S_APP_ID: 'env-app-id',
      EXPO_PUBLIC_S2S_ACCESS_TOKEN: 'env-access-token',
      EXPO_PUBLIC_S2S_WS_URL: 'wss://env.example.com/dialogue',
      EXPO_PUBLIC_S2S_APP_KEY: 'env-app-key',
      EXPO_PUBLIC_LLM_BASE_URL: 'https://env.llm/v1',
      EXPO_PUBLIC_LLM_API_KEY: 'env-llm-api-key',
      EXPO_PUBLIC_LLM_MODEL: 'env-model',
      EXPO_PUBLIC_LLM_PROVIDER: 'env-provider',
    };
    mockAsyncStorage.getItem.mockResolvedValue(null);
    mockSecureStore.getItemAsync.mockResolvedValue(null);
    mockAsyncStorage.setItem.mockResolvedValue(undefined);
    mockSecureStore.setItemAsync.mockResolvedValue(undefined);
    mockSecureStore.deleteItemAsync.mockResolvedValue(undefined);
    __setRuntimeConfigRepoAdaptersForTest({
      asyncStorage: mockAsyncStorage,
      secureStore: mockSecureStore,
    });
  });

  afterAll(() => {
    process.env = originalEnv;
    __setRuntimeConfigRepoAdaptersForTest();
  });

  it('uses persisted values to override env defaults', async () => {
    mockAsyncStorage.getItem.mockResolvedValue(
      JSON.stringify({
        replyChainMode: 'custom_llm',
        llm: {
          baseUrl: 'https://stored.llm/v1',
          model: 'stored-model',
          provider: 'stored-provider',
        },
        s2s: {
          appId: 'stored-app-id',
          wsUrl: 'wss://stored.example.com/dialogue',
        },
        voice: {
          speakerId: 'custom_voice_id_1',
          speakerLabel: 'custom_voice_id_1',
          sourceType: 'remote',
        },
      }),
    );
    mockSecureStore.getItemAsync.mockImplementation(async (key: string) => {
      switch (key) {
        case 'voice_assistant.runtime_config.llm_api_key.v1':
          return 'stored-llm-api-key';
        case 'voice_assistant.runtime_config.s2s_access_token.v1':
          return 'stored-access-token';
        case 'voice_assistant.runtime_config.android_app_key.v1':
          return 'stored-android-app-key';
        default:
          return null;
      }
    });

    const config = await getEffectiveRuntimeConfig();

    expect(config.replyChainMode).toBe('custom_llm');
    expect(config.llm).toEqual({
      baseUrl: 'https://stored.llm/v1',
      apiKey: 'stored-llm-api-key',
      model: 'stored-model',
      provider: 'stored-provider',
    });
    expect(config.s2s).toEqual({
      appId: 'stored-app-id',
      accessToken: 'stored-access-token',
      wsUrl: 'wss://stored.example.com/dialogue',
    });
    expect(config.androidDialog.appKeyOverride).toBe('stored-android-app-key');
    expect(config.voice.speakerId).toBe('custom_voice_id_1');
  });

  it('stores sensitive and non-sensitive fields separately', async () => {
    const envConfig = readRuntimeConfigFromEnv();
    const nextConfig = buildRuntimeConfigForSave(envConfig, {
      replyChainMode: 'custom_llm',
      llm: {
        baseUrl: 'https://save.llm/v1',
        apiKey: 'save-llm-key',
        model: 'save-model',
        provider: 'save-provider',
      },
      s2s: {
        appId: 'save-app-id',
        accessToken: 'save-access-token',
        wsUrl: 'wss://save.example.com/dialogue',
      },
      androidDialog: {
        appKeyOverride: 'save-app-key',
      },
      voice: {
        speakerId: 'saturn_zh_female_nuanxinxuejie_tob',
        speakerLabel: '暖心学姐（内置）',
        sourceType: 'default',
      },
    });

    await saveRuntimeConfig(nextConfig);

    expect(mockAsyncStorage.setItem).toHaveBeenCalledTimes(1);
    const storedPayload = JSON.parse(mockAsyncStorage.setItem.mock.calls[0][1]);
    expect(storedPayload.llm.apiKey).toBeUndefined();
    expect(storedPayload.s2s.accessToken).toBeUndefined();

    expect(mockSecureStore.setItemAsync).toHaveBeenCalledWith(
      'voice_assistant.runtime_config.llm_api_key.v1',
      'save-llm-key',
    );
    expect(mockSecureStore.setItemAsync).toHaveBeenCalledWith(
      'voice_assistant.runtime_config.s2s_access_token.v1',
      'save-access-token',
    );
    expect(mockSecureStore.setItemAsync).toHaveBeenCalledWith(
      'voice_assistant.runtime_config.android_app_key.v1',
      'save-app-key',
    );
  });

  it('validates required fields for custom_llm mode', () => {
    const envConfig = readRuntimeConfigFromEnv();
    const errors = validateRuntimeConfigForSave(envConfig, {
      replyChainMode: 'custom_llm',
      llm: {
        baseUrl: '',
        apiKey: '',
        model: '',
      },
    });

    expect(errors.length).toBeGreaterThan(0);
    expect(errors.join(' ')).toContain('custom_llm');
  });
});
