import type { ConversationStatus } from '../types/model';

export const VOICE_ASSISTANT_DEFAULT_STATUS: ConversationStatus = 'idle';
export const VOICE_ASSISTANT_DIALOG_MODEL = '2.2.0.0';
export const VOICE_ASSISTANT_DIALOG_SPEAKER = 'S_mXRP7Y5M1';
export const VOICE_ASSISTANT_DIALOG_BOT_NAME = '江户川柯南';
export const VOICE_ASSISTANT_S2S_WS_URL = 'wss://openspeech.bytedance.com/api/v3/realtime/dialogue';

export const VOICE_ASSISTANT_STATUS_LABEL: Record<ConversationStatus, string> = {
  idle: '待命中',
  listening: '正在听你说',
  thinking: '正在思考',
  speaking: '正在播报',
  error: '发生错误',
};
