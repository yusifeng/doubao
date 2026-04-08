export const VOICE_FAULT_SIGNATURES = {
  F1_STALE_SESSION_DROP: 'F1_STALE_SESSION_DROP',
  F2_CLIENT_TTS_NOT_READY: 'F2_CLIENT_TTS_NOT_READY',
  F3_PLATFORM_LEAK_IN_CUSTOM: 'F3_PLATFORM_LEAK_IN_CUSTOM',
  F4_MODE_SWITCH_RACE: 'F4_MODE_SWITCH_RACE',
  F5_COLD_START_NOT_READY: 'F5_COLD_START_NOT_READY',
  F6_PLAYER_LIFECYCLE_GAP: 'F6_PLAYER_LIFECYCLE_GAP',
  F7_TEXT_ROUND_FAILED: 'F7_TEXT_ROUND_FAILED',
  F8_REPLY_CHAIN_CONFIG_INCOMPLETE: 'F8_REPLY_CHAIN_CONFIG_INCOMPLETE',
  F9_ANDROID_CALL_START_FAILED: 'F9_ANDROID_CALL_START_FAILED',
  F10_ANDROID_DIALOG_RUNTIME_ERROR: 'F10_ANDROID_DIALOG_RUNTIME_ERROR',
  F11_CUSTOM_REPLY_ROUND_FAILED: 'F11_CUSTOM_REPLY_ROUND_FAILED',
} as const;

export type VoiceFaultSignature =
  (typeof VOICE_FAULT_SIGNATURES)[keyof typeof VOICE_FAULT_SIGNATURES];

export function withFaultSignature(signature: VoiceFaultSignature, message: string): string {
  const normalizedMessage = message.trim();
  const prefix = `[${signature}]`;
  if (!normalizedMessage) {
    return prefix;
  }
  if (normalizedMessage.startsWith(prefix)) {
    return normalizedMessage;
  }
  return `${prefix} ${normalizedMessage}`;
}
