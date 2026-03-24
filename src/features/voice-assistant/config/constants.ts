import type { ConversationStatus } from '../types/model';

export const VOICE_ASSISTANT_DEFAULT_STATUS: ConversationStatus = 'idle';

export const VOICE_ASSISTANT_STATUS_LABEL: Record<ConversationStatus, string> = {
  idle: '待命中',
  listening: '正在听你说',
  thinking: '正在思考',
  speaking: '正在播报',
  error: '发生错误',
};
