export type S2SEnvConfig = {
  appId: string;
  accessToken: string;
  wsUrl: string;
};

export type VoicePipelineMode = 'asr_text' | 'realtime_audio';

export function readS2SEnv(): S2SEnvConfig | null {
  const appId = process.env.EXPO_PUBLIC_S2S_APP_ID?.trim() ?? '';
  const accessToken = process.env.EXPO_PUBLIC_S2S_ACCESS_TOKEN?.trim() ?? '';
  const wsUrl = process.env.EXPO_PUBLIC_S2S_WS_URL?.trim() ?? '';
  if (!appId || !accessToken || !wsUrl) {
    return null;
  }
  return { appId, accessToken, wsUrl };
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
