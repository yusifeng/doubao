import { normalizeNativeEvent } from '../android';

describe('android native event contract', () => {
  it('normalizes session_ready mismatch payload and keeps dialog id metadata', () => {
    const event = normalizeNativeEvent({
      type: 'session_ready',
      sessionId: 'dialog-id',
      nativeMessageType: 3003,
      dialogId: 'dialog-id',
      textMode: 'none',
      dialogWorkMode: 'delegate_chat_tts_text',
      inputMode: 'audio',
      turnIndex: 2,
    });

    expect(event).toEqual({
      type: 'session_ready',
      sessionId: 'dialog-id',
      nativeMessageType: '3003',
      dialogId: 'dialog-id',
      textMode: 'none',
      dialogWorkMode: 'delegate_chat_tts_text',
      inputMode: 'audio',
      turnIndex: 2,
      directiveName: undefined,
      directiveRet: undefined,
      raw: undefined,
    });
  });

  it('keeps chat_final text even when payload has empty event text fallback is handled by runtime', () => {
    const event = normalizeNativeEvent({
      type: 'chat_final',
      sessionId: 's1',
      text: '',
      nativeMessageType: 'MESSAGE_TYPE_DIALOG_CHAT_ENDED',
      textMode: 'final_from_last_partial',
    });

    expect(event?.type).toBe('chat_final');
    expect(event && 'text' in event ? event.text : null).toBe('');
    expect(event?.textMode).toBe('final_from_last_partial');
  });

  it('returns null for unknown event type to enforce strict adapter boundary', () => {
    expect(
      normalizeNativeEvent({
        type: 'unknown_event',
      }),
    ).toBeNull();
  });

  it('accepts stale/retired session payload shape for runtime drop rules', () => {
    const event = normalizeNativeEvent({
      type: 'engine_stop',
      sessionId: 'retired-s',
      nativeMessageType: 'MESSAGE_TYPE_ENGINE_STOP',
    });

    expect(event?.type).toBe('engine_stop');
    expect(event?.sessionId).toBe('retired-s');
  });
});
