import * as AsyncStorageModule from '@react-native-async-storage/async-storage';
import * as SecureStore from 'expo-secure-store';
import {
  type RuntimeConfig,
  type RuntimeConfigDraft,
  mergeRuntimeConfig,
  normalizeRuntimePersonaConfig,
  readRuntimeConfigFromEnv,
  validateRuntimeConfig,
} from './runtimeConfig';

const RUNTIME_CONFIG_STORAGE_KEY = 'voice_assistant.runtime_config.v1';
const SECURE_LLM_API_KEY = 'voice_assistant.runtime_config.llm_api_key.v1';
const SECURE_S2S_ACCESS_TOKEN = 'voice_assistant.runtime_config.s2s_access_token.v1';
const SECURE_ANDROID_APP_KEY = 'voice_assistant.runtime_config.android_app_key.v1';

const AsyncStorage = ((AsyncStorageModule as unknown as { default?: typeof AsyncStorageModule }).default ??
  AsyncStorageModule) as Partial<{
  getItem(key: string): Promise<string | null>;
  setItem(key: string, value: string): Promise<void>;
}>;

const defaultAsyncStorageAdapter = {
  getItem: async (key: string) => {
    if (typeof AsyncStorage.getItem === 'function') {
      return AsyncStorage.getItem(key);
    }
    return null;
  },
  setItem: async (key: string, value: string) => {
    if (typeof AsyncStorage.setItem === 'function') {
      await AsyncStorage.setItem(key, value);
    }
  },
};

const defaultSecureStoreAdapter = {
  getItemAsync: SecureStore.getItemAsync,
  setItemAsync: SecureStore.setItemAsync,
  deleteItemAsync: SecureStore.deleteItemAsync,
};

let asyncStorageAdapter = defaultAsyncStorageAdapter;
let secureStoreAdapter = defaultSecureStoreAdapter;

type StoredRuntimeConfig = {
  replyChainMode?: RuntimeConfig['replyChainMode'];
  llm?: {
    baseUrl?: string;
    model?: string;
    provider?: string;
  };
  s2s?: {
    appId?: string;
  };
  persona?: Partial<RuntimeConfig['persona']> & {
    systemPrompt?: string;
    source?: 'default' | 'custom';
  };
  voice?: RuntimeConfig['voice'];
};

async function readStoredRuntimeConfig(): Promise<StoredRuntimeConfig> {
  try {
    const raw = await asyncStorageAdapter.getItem(RUNTIME_CONFIG_STORAGE_KEY);
    if (!raw) {
      return {};
    }
    const parsed = JSON.parse(raw) as StoredRuntimeConfig;
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch {
    return {};
  }
}

async function writeStoredRuntimeConfig(value: StoredRuntimeConfig): Promise<void> {
  await asyncStorageAdapter.setItem(RUNTIME_CONFIG_STORAGE_KEY, JSON.stringify(value));
}

async function readSecureValue(key: string): Promise<string> {
  try {
    return (await secureStoreAdapter.getItemAsync(key)) ?? '';
  } catch {
    return '';
  }
}

async function writeSecureValue(key: string, value: string): Promise<void> {
  if (!value.trim()) {
    try {
      await secureStoreAdapter.deleteItemAsync(key);
    } catch {
      // Ignore storage errors to avoid blocking save of other fields.
    }
    return;
  }
  await secureStoreAdapter.setItemAsync(key, value);
}

export async function getEffectiveRuntimeConfig(): Promise<RuntimeConfig> {
  const env = readRuntimeConfigFromEnv();
  const stored = await readStoredRuntimeConfig();
  const [llmApiKey, s2sAccessToken, androidAppKey] = await Promise.all([
    readSecureValue(SECURE_LLM_API_KEY),
    readSecureValue(SECURE_S2S_ACCESS_TOKEN),
    readSecureValue(SECURE_ANDROID_APP_KEY),
  ]);

  const normalizedPersona = normalizeRuntimePersonaConfig({
    ...stored.persona,
    roles: stored.persona?.roles,
    activeRoleId: stored.persona?.activeRoleId,
  });

  return mergeRuntimeConfig(env, {
    replyChainMode: stored.replyChainMode,
    llm: {
      baseUrl: stored.llm?.baseUrl,
      apiKey: llmApiKey || undefined,
      model: stored.llm?.model,
      provider: stored.llm?.provider,
    },
    s2s: {
      appId: stored.s2s?.appId,
      accessToken: s2sAccessToken || undefined,
    },
    persona: normalizedPersona,
    androidDialog: {
      appKeyOverride: androidAppKey || undefined,
    },
    voice: stored.voice,
  });
}

export async function saveRuntimeConfig(nextConfig: RuntimeConfig): Promise<RuntimeConfig> {
  await writeStoredRuntimeConfig({
    replyChainMode: nextConfig.replyChainMode,
    llm: {
      baseUrl: nextConfig.llm.baseUrl,
      model: nextConfig.llm.model,
      provider: nextConfig.llm.provider,
    },
    s2s: {
      appId: nextConfig.s2s.appId,
    },
    persona: {
      activeRoleId: nextConfig.persona.activeRoleId,
      roles: nextConfig.persona.roles,
      systemPrompt: nextConfig.persona.systemPrompt,
      source: nextConfig.persona.source,
    },
    voice: nextConfig.voice,
  });

  await Promise.all([
    writeSecureValue(SECURE_LLM_API_KEY, nextConfig.llm.apiKey),
    writeSecureValue(SECURE_S2S_ACCESS_TOKEN, nextConfig.s2s.accessToken),
    writeSecureValue(SECURE_ANDROID_APP_KEY, nextConfig.androidDialog.appKeyOverride),
  ]);

  return nextConfig;
}

export function buildRuntimeConfigForSave(current: RuntimeConfig, draft: RuntimeConfigDraft): RuntimeConfig {
  return mergeRuntimeConfig(current, draft);
}

export function validateRuntimeConfigForSave(current: RuntimeConfig, draft: RuntimeConfigDraft): string[] {
  return validateRuntimeConfig(buildRuntimeConfigForSave(current, draft));
}

export function __setRuntimeConfigRepoAdaptersForTest(
  overrides?: Partial<{
    asyncStorage: typeof defaultAsyncStorageAdapter;
    secureStore: typeof defaultSecureStoreAdapter;
  }>,
): void {
  asyncStorageAdapter = overrides?.asyncStorage ?? defaultAsyncStorageAdapter;
  secureStoreAdapter = overrides?.secureStore ?? defaultSecureStoreAdapter;
}
