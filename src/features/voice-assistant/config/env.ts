export type S2SEnvConfig = {
  appId: string;
  appKey: string;
  accessToken: string;
  wsUrl: string;
};

export type LLMEnvConfig = {
  baseUrl: string;
  apiKey: string;
  model: string;
  provider: string;
};

export type VoicePipelineMode = 'asr_text' | 'realtime_audio';
export type ReplyChainMode = 'official_s2s' | 'custom_llm';

export function readS2SEnv(): S2SEnvConfig | null {
  const appId = process.env.EXPO_PUBLIC_S2S_APP_ID?.trim() ?? '';
  const appKey = process.env.EXPO_PUBLIC_S2S_APP_KEY?.trim() ?? '';
  const accessToken = process.env.EXPO_PUBLIC_S2S_ACCESS_TOKEN?.trim() ?? '';
  const wsUrl = process.env.EXPO_PUBLIC_S2S_WS_URL?.trim() ?? '';
  if (!appId || !accessToken || !wsUrl) {
    return null;
  }
  return { appId, appKey, accessToken, wsUrl };
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
