export type DialogConversationInputMode = 'audio' | 'text';

export type DialogEngineEvent =
  | { type: 'engine_start'; sessionId?: string; raw?: string }
  | { type: 'engine_stop'; sessionId?: string; raw?: string }
  | { type: 'error'; sessionId?: string; raw?: string; errorCode?: number; errorMessage?: string }
  | { type: 'asr_start'; sessionId?: string; raw?: string }
  | { type: 'asr_partial'; sessionId?: string; text: string; raw?: string }
  | { type: 'asr_final'; sessionId?: string; text: string; raw?: string }
  | { type: 'chat_partial'; sessionId?: string; text: string; raw?: string }
  | { type: 'chat_final'; sessionId?: string; text: string; raw?: string };

export type DialogPrepareConfig = {
  appId: string;
  appKey: string;
  accessToken: string;
  wsUrl: string;
  resourceId?: string;
  uid?: string;
  requestHeaders?: Record<string, string>;
  enableAec?: boolean;
};

export type DialogStartConversationConfig = {
  inputMode: DialogConversationInputMode;
  model: string;
  speaker: string;
  characterManifest?: string;
  botName?: string;
};

export type DialogTtsChunk = {
  start: boolean;
  content: string;
  end: boolean;
};

export type DialogEngineListener = (event: DialogEngineEvent) => void;

export interface DialogEngineProvider {
  isSupported(): boolean;
  prepare(config?: Partial<DialogPrepareConfig>): Promise<void>;
  startConversation(config: DialogStartConversationConfig): Promise<void>;
  stopConversation(): Promise<void>;
  pauseTalking(): Promise<void>;
  resumeTalking(): Promise<void>;
  interruptCurrentDialog(): Promise<void>;
  sendTextQuery(text: string): Promise<void>;
  useClientTriggeredTts(): Promise<void>;
  useServerTriggeredTts(): Promise<void>;
  streamClientTtsText(chunk: DialogTtsChunk): Promise<void>;
  setListener(listener: DialogEngineListener | null): void;
  destroy(): Promise<void>;
}
