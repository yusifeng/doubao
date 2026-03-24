import type { ConversationStatus } from '../types/model';
import { VOICE_ASSISTANT_DEFAULT_STATUS } from '../config/constants';

export function getInitialStatus(): ConversationStatus {
  return VOICE_ASSISTANT_DEFAULT_STATUS;
}

export function buildAssistantReply(userText: string): string {
  const cleanText = userText.trim();
  if (!cleanText) {
    return '我在，随时可以聊。';
  }
  return `收到：${cleanText}。这是 M3 文本链路回包。`;
}
