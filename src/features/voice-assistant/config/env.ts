export type S2SEnvConfig = {
  appId: string;
  appKey: string;
  accessToken: string;
};

export type LLMEnvConfig = {
  baseUrl: string;
  apiKey: string;
  model: string;
  provider: string;
};

export type VoicePipelineMode = 'asr_text' | 'realtime_audio';
export type ReplyChainMode = 'official_s2s' | 'custom_llm';
export type ReplyStreamMode = 'auto' | 'force_stream' | 'force_non_stream';
export type RemoteLogCollectorEnvConfig = {
  endpointUrl: string;
  authToken?: string;
  batchSize: number;
  flushIntervalMs: number;
  maxQueueSize: number;
  deviceLabel: string;
};

function readPositiveIntegerEnv(value: string | undefined, fallback: number): number {
  const parsed = Number(value?.trim() ?? '');
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return fallback;
  }
  return Math.floor(parsed);
}

export function readS2SEnv(): S2SEnvConfig | null {
  const appId = process.env.EXPO_PUBLIC_S2S_APP_ID?.trim() ?? '';
  const appKey = process.env.EXPO_PUBLIC_S2S_APP_KEY?.trim() ?? '';
  const accessToken = process.env.EXPO_PUBLIC_S2S_ACCESS_TOKEN?.trim() ?? '';
  if (!appId || !accessToken) {
    return null;
  }
  return { appId, appKey, accessToken };
}

export function maskSecret(secret: string): string {
  if (secret.length <= 8) {
    return '****';
  }
  return `${secret.slice(0, 4)}****${secret.slice(-4)}`;
}

export function readVoicePipelineMode(): VoicePipelineMode {
  const value = process.env.EXPO_PUBLIC_VOICE_PIPELINE_MODE?.trim().toLowerCase();
  if (value === 'realtime_audio') {
    return 'realtime_audio';
  }
  return 'asr_text';
}

export function readLLMEnv(): LLMEnvConfig | null {
  const baseUrl = process.env.EXPO_PUBLIC_LLM_BASE_URL?.trim() ?? '';
  const apiKey = process.env.EXPO_PUBLIC_LLM_API_KEY?.trim() ?? '';
  const model = process.env.EXPO_PUBLIC_LLM_MODEL?.trim() ?? '';
  const provider = process.env.EXPO_PUBLIC_LLM_PROVIDER?.trim() ?? 'openai-compatible';
  if (!baseUrl || !apiKey || !model) {
    return null;
  }
  return { baseUrl, apiKey, model, provider };
}

export function readReplyChainMode(): ReplyChainMode {
  const value = process.env.EXPO_PUBLIC_REPLY_CHAIN_MODE?.trim().toLowerCase();
  if (value === 'custom_llm') {
    return 'custom_llm';
  }
  return 'official_s2s';
}

export function readReplyStreamMode(): ReplyStreamMode {
  const value = process.env.EXPO_PUBLIC_REPLY_STREAM_MODE?.trim().toLowerCase();
  if (value === 'force_stream') {
    return 'force_stream';
  }
  if (value === 'force_non_stream') {
    return 'force_non_stream';
  }
  return 'auto';
}

export function readRemoteLogCollectorEnv(): RemoteLogCollectorEnvConfig | null {
  const endpointUrl = process.env.EXPO_PUBLIC_DEBUG_LOG_SINK_URL?.trim() ?? '';
  if (!endpointUrl) {
    return null;
  }
  if (typeof URL === 'function') {
    try {
      const parsed = new URL(endpointUrl);
      if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
        return null;
      }
    } catch {
      return null;
    }
  } else if (!endpointUrl.startsWith('http://') && !endpointUrl.startsWith('https://')) {
    return null;
  }
  const authToken = process.env.EXPO_PUBLIC_DEBUG_LOG_SINK_TOKEN?.trim() ?? '';
  const deviceLabel = process.env.EXPO_PUBLIC_DEBUG_DEVICE_LABEL?.trim() ?? '';
  return {
    endpointUrl,
    authToken: authToken || undefined,
    batchSize: readPositiveIntegerEnv(process.env.EXPO_PUBLIC_DEBUG_LOG_BATCH_SIZE, 20),
    flushIntervalMs: readPositiveIntegerEnv(process.env.EXPO_PUBLIC_DEBUG_LOG_FLUSH_MS, 800),
    maxQueueSize: readPositiveIntegerEnv(process.env.EXPO_PUBLIC_DEBUG_LOG_MAX_QUEUE, 2000),
    deviceLabel: deviceLabel || 'mobile-device',
  };
}
