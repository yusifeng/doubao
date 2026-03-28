export type TtsArmingResult = 'enabled' | 'already_enabled' | 'not_ready' | 'unsupported' | 'failed';

export function classifyClientTriggeredTtsError(message: string): TtsArmingResult {
  if (message.includes('400061')) {
    return 'already_enabled';
  }
  if (message.includes('400060')) {
    return 'not_ready';
  }
  if (message.toLowerCase().includes('unsupported')) {
    return 'unsupported';
  }
  return 'failed';
}

export function parseDirectiveRet(message: string): number | null {
  const matched = message.match(/\b(400060|400061|\d{3,6})\b/);
  if (!matched) {
    return null;
  }
  const value = Number.parseInt(matched[1], 10);
  return Number.isNaN(value) ? null : value;
}
