export type DialogConversationInputMode = 'audio' | 'text';

export type DialogEventTextMode = 'none' | 'delta' | 'aggregate' | 'final_from_last_partial';

export type DialogEventBase = {
  sessionId?: string;
  raw?: string;
  nativeMessageType?: string;
  dialogWorkMode?: DialogWorkMode;
  inputMode?: DialogConversationInputMode;
  textMode?: DialogEventTextMode;
  directiveName?: string;
  directiveRet?: number;
  dialogId?: string;
  turnIndex?: number;
};

export type DialogEngineEvent =
  | ({ type: 'engine_start' } & DialogEventBase)
  | ({ type: 'session_ready' } & DialogEventBase)
  | ({ type: 'engine_stop' } & DialogEventBase)
  | ({ type: 'error'; errorCode?: number; errorMessage?: string } & DialogEventBase)
  | ({ type: 'asr_start' } & DialogEventBase)
  | ({ type: 'asr_partial'; text: string } & DialogEventBase)
  | ({ type: 'asr_final'; text: string } & DialogEventBase)
  | ({ type: 'chat_partial'; text: string } & DialogEventBase)
  | ({ type: 'chat_final'; text: string } & DialogEventBase);

export type DialogPrepareConfig = {
  appId: string;
  appKey: string;
  accessToken: string;
  wsUrl: string;
  dialogWorkMode?: DialogWorkMode;
  resourceId?: string;
  uid?: string;
  requestHeaders?: Record<string, string>;
  enableAec?: boolean;
};

export type DialogWorkMode = 'default' | 'delegate_chat_tts_text';

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
