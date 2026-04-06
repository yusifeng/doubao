import type {
  DialogConversationInputMode,
  DialogEventBase,
  DialogEngineEvent,
  DialogEventTextMode,
} from './types';

function normalizeTextMode(value: unknown): DialogEventTextMode | undefined {
  if (value === 'none' || value === 'delta' || value === 'aggregate' || value === 'final_from_last_partial') {
    return value;
  }
  return undefined;
}

function normalizeInputMode(value: unknown): DialogConversationInputMode | undefined {
  return value === 'audio' || value === 'text' ? value : undefined;
}

function buildBaseEvent(event: Record<string, unknown>) {
  const semanticEvent: DialogEventBase['semanticEvent'] =
    event.semanticEvent === 'assistant_playback_started' ||
    event.semanticEvent === 'assistant_playback_finished' ||
    event.semanticEvent === 'assistant_playback_interrupted' ||
    event.semanticEvent === 'user_speech_started' ||
    event.semanticEvent === 'user_speech_finalized'
      ? event.semanticEvent
      : undefined;
  return {
    sessionId: typeof event.sessionId === 'string' ? event.sessionId : undefined,
    raw: typeof event.raw === 'string' ? event.raw : undefined,
    questionId: typeof event.questionId === 'string' ? event.questionId : undefined,
    replyId: typeof event.replyId === 'string' ? event.replyId : undefined,
    traceId: typeof event.traceId === 'string' ? event.traceId : undefined,
    nativeMessageType:
      typeof event.nativeMessageType === 'string'
        ? event.nativeMessageType
        : typeof event.nativeMessageType === 'number'
        ? String(event.nativeMessageType)
        : undefined,
    dialogWorkMode:
      event.dialogWorkMode === 'default' || event.dialogWorkMode === 'delegate_chat_tts_text'
        ? event.dialogWorkMode
        : undefined,
    inputMode: normalizeInputMode(event.inputMode),
    textMode: normalizeTextMode(event.textMode),
    directiveName: typeof event.directiveName === 'string' ? event.directiveName : undefined,
    directiveRet: typeof event.directiveRet === 'number' ? event.directiveRet : undefined,
    dialogId: typeof event.dialogId === 'string' ? event.dialogId : undefined,
    turnIndex: typeof event.turnIndex === 'number' ? event.turnIndex : undefined,
    ...(semanticEvent ? { semanticEvent } : {}),
  } as const;
}

export function normalizeNativeEvent(event: Record<string, unknown>): DialogEngineEvent | null {
  const type = typeof event.type === 'string' ? event.type : '';
  const base = buildBaseEvent(event);
  switch (type) {
    case 'engine_start':
      return {
        type,
        ...base,
      };
    case 'session_ready':
      return {
        type,
        ...base,
      };
    case 'engine_stop':
      return {
        type,
        ...base,
      };
    case 'player_start':
      return {
        type,
        ...base,
      };
    case 'player_finish':
      return {
        type,
        ...base,
      };
    case 'asr_start':
      return {
        type,
        ...base,
      };
    case 'asr_partial':
      return {
        type,
        ...base,
        text: typeof event.text === 'string' ? event.text : '',
      };
    case 'asr_final':
      return {
        type,
        ...base,
        text: typeof event.text === 'string' ? event.text : '',
      };
    case 'chat_partial':
      return {
        type,
        ...base,
        text: typeof event.text === 'string' ? event.text : '',
      };
    case 'chat_final':
      return {
        type,
        ...base,
        text: typeof event.text === 'string' ? event.text : '',
      };
    case 'error':
      return {
        type,
        ...base,
        errorCode: typeof event.errorCode === 'number' ? event.errorCode : undefined,
        errorMessage: typeof event.errorMessage === 'string' ? event.errorMessage : undefined,
      };
    default:
      return null;
  }
}
