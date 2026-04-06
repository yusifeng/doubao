import { classifyClientTriggeredTtsError } from './ttsArmingPolicy';

export function shouldDropPlatformReplyInCustomTurn(params: {
  replyChainMode: 'official_s2s' | 'custom_llm';
  replyOwner: 'platform' | 'custom' | null;
}): boolean {
  if (params.replyChainMode !== 'custom_llm') {
    return false;
  }
  return true;
}

export function shouldPersistCustomTextWhenTtsUnavailable(errorMessage: string): boolean {
  const result = classifyClientTriggeredTtsError(errorMessage);
  return result === 'not_ready' || result === 'unsupported' || result === 'failed';
}

export function finalizeCustomLlmReplyText(chunks: string[]): string {
  return chunks.join('').trim();
}
