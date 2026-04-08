import { eq } from 'drizzle-orm';
import * as AsyncStorageModule from '@react-native-async-storage/async-storage';
import * as SecureStore from 'expo-secure-store';
import type { RuntimeConfigEntry } from '../types/storage';
import { getVoiceAssistantDb, isVoiceAssistantSqliteAvailable } from './sqlite/client';
import { runtimeConfigTable } from './sqlite/schema';
import {
  type RuntimeConfig,
  type RuntimeConfigDraft,
  mergeRuntimeConfig,
  normalizeRuntimePersonaConfig,
  readRuntimeConfigFromEnv,
  validateRuntimeConfig,
} from '../config/runtimeConfig';

const RUNTIME_CONFIG_PUBLIC_ENTRY_KEY = 'runtime_config_public_v1';
const RUNTIME_CONFIG_FALLBACK_STORAGE_KEY = 'voice_assistant.runtime_config.v1';
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
  replyStreamMode?: RuntimeConfig['replyStreamMode'];
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

export interface RuntimeConfigRepo {
  getEntry(key: string): Promise<RuntimeConfigEntry | null>;
  upsertEntry(entry: RuntimeConfigEntry): Promise<void>;
}

const sqliteRuntimeConfigRepo: RuntimeConfigRepo = {
  async getEntry(key: string) {
    const database = await getVoiceAssistantDb();
    const rows = await database
      .select()
      .from(runtimeConfigTable)
      .where(eq(runtimeConfigTable.key, key))
      .limit(1);
    const row = rows[0];
    if (!row) {
      if (key !== RUNTIME_CONFIG_PUBLIC_ENTRY_KEY) {
        return null;
      }
      const legacyValue = await asyncStorageAdapter.getItem(RUNTIME_CONFIG_FALLBACK_STORAGE_KEY);
      if (!legacyValue) {
        return null;
      }
      const migrated: RuntimeConfigEntry = {
        key,
        valueJson: legacyValue,
        updatedAt: Date.now(),
      };
      try {
        await database
          .insert(runtimeConfigTable)
          .values({
            key: migrated.key,
            valueJson: migrated.valueJson,
            updatedAt: migrated.updatedAt,
          })
          .onConflictDoUpdate({
            target: runtimeConfigTable.key,
            set: {
              valueJson: migrated.valueJson,
              updatedAt: migrated.updatedAt,
            },
          });
      } catch {
        // Keep read-through behavior even if backfill write fails.
      }
      return migrated;
    }
    return {
      key: row.key,
      valueJson: row.valueJson,
      updatedAt: row.updatedAt,
    };
  },
  async upsertEntry(entry: RuntimeConfigEntry) {
    const database = await getVoiceAssistantDb();
    await database
      .insert(runtimeConfigTable)
      .values({
        key: entry.key,
        valueJson: entry.valueJson,
        updatedAt: entry.updatedAt,
      })
      .onConflictDoUpdate({
        target: runtimeConfigTable.key,
        set: {
          valueJson: entry.valueJson,
          updatedAt: entry.updatedAt,
        },
      });
  },
};

const asyncStorageRuntimeConfigRepo: RuntimeConfigRepo = {
  async getEntry(key: string) {
    if (key !== RUNTIME_CONFIG_PUBLIC_ENTRY_KEY) {
      return null;
    }
    const raw = await asyncStorageAdapter.getItem(RUNTIME_CONFIG_FALLBACK_STORAGE_KEY);
    if (!raw) {
      return null;
    }
    return {
      key: RUNTIME_CONFIG_PUBLIC_ENTRY_KEY,
      valueJson: raw,
      updatedAt: Date.now(),
    };
  },
  async upsertEntry(entry: RuntimeConfigEntry) {
    if (entry.key !== RUNTIME_CONFIG_PUBLIC_ENTRY_KEY) {
      return;
    }
    await asyncStorageAdapter.setItem(RUNTIME_CONFIG_FALLBACK_STORAGE_KEY, entry.valueJson);
  },
};

let runtimeConfigRepoOverride: RuntimeConfigRepo | null = null;

function shouldUseSqliteRuntimeConfigRepo(): boolean {
  if (process.env.NODE_ENV === 'test') {
    return false;
  }
  return isVoiceAssistantSqliteAvailable();
}

function getNonSensitiveRuntimeConfigRepo(): RuntimeConfigRepo {
  if (runtimeConfigRepoOverride) {
    return runtimeConfigRepoOverride;
  }
  if (shouldUseSqliteRuntimeConfigRepo()) {
    return sqliteRuntimeConfigRepo;
  }
  return asyncStorageRuntimeConfigRepo;
}

async function readStoredRuntimeConfig(): Promise<StoredRuntimeConfig> {
  try {
    const repo = getNonSensitiveRuntimeConfigRepo();
    const entry = await repo.getEntry(RUNTIME_CONFIG_PUBLIC_ENTRY_KEY);
    if (!entry?.valueJson) {
      return {};
    }
    const parsed = JSON.parse(entry.valueJson) as StoredRuntimeConfig;
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch {
    return {};
  }
}

async function writeStoredRuntimeConfig(value: StoredRuntimeConfig): Promise<void> {
  const repo = getNonSensitiveRuntimeConfigRepo();
  await repo.upsertEntry({
    key: RUNTIME_CONFIG_PUBLIC_ENTRY_KEY,
    valueJson: JSON.stringify(value),
    updatedAt: Date.now(),
  });
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
    replyStreamMode: stored.replyStreamMode,
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
    replyStreamMode: nextConfig.replyStreamMode,
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
    runtimeConfigRepo: RuntimeConfigRepo | null;
  }>,
): void {
  asyncStorageAdapter = overrides?.asyncStorage ?? defaultAsyncStorageAdapter;
  secureStoreAdapter = overrides?.secureStore ?? defaultSecureStoreAdapter;
  runtimeConfigRepoOverride =
    overrides && Object.prototype.hasOwnProperty.call(overrides, 'runtimeConfigRepo')
      ? (overrides.runtimeConfigRepo ?? null)
      : null;
}
