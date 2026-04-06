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
      questionId: undefined,
      replyId: undefined,
      traceId: undefined,
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

  it('normalizes player lifecycle callbacks for speaking state transitions', () => {
    const start = normalizeNativeEvent({
      type: 'player_start',
      sessionId: 's-player',
      nativeMessageType: 3008,
      textMode: 'none',
    });
    const finish = normalizeNativeEvent({
      type: 'player_finish',
      sessionId: 's-player',
      nativeMessageType: 3011,
      textMode: 'none',
    });

    expect(start).toEqual({
      type: 'player_start',
      sessionId: 's-player',
      nativeMessageType: '3008',
      questionId: undefined,
      replyId: undefined,
      traceId: undefined,
      textMode: 'none',
      dialogWorkMode: undefined,
      inputMode: undefined,
      directiveName: undefined,
      directiveRet: undefined,
      dialogId: undefined,
      turnIndex: undefined,
      raw: undefined,
    });
    expect(finish).toEqual({
      type: 'player_finish',
      sessionId: 's-player',
      nativeMessageType: '3011',
      questionId: undefined,
      replyId: undefined,
      traceId: undefined,
      textMode: 'none',
      dialogWorkMode: undefined,
      inputMode: undefined,
      directiveName: undefined,
      directiveRet: undefined,
      dialogId: undefined,
      turnIndex: undefined,
      raw: undefined,
    });
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

  it('maps question/reply/trace ids from native payload for audit correlation', () => {
    const event = normalizeNativeEvent({
      type: 'chat_partial',
      sessionId: 's-trace',
      text: '你好',
      questionId: 'q-1',
      replyId: 'r-1',
      traceId: 'trace-1',
      nativeMessageType: 550,
    });

    expect(event).toEqual({
      type: 'chat_partial',
      text: '你好',
      sessionId: 's-trace',
      nativeMessageType: '550',
      questionId: 'q-1',
      replyId: 'r-1',
      traceId: 'trace-1',
      dialogWorkMode: undefined,
      inputMode: undefined,
      textMode: undefined,
      directiveName: undefined,
      directiveRet: undefined,
      dialogId: undefined,
      turnIndex: undefined,
      raw: undefined,
    });
  });

  it('passes through semantic events so runtime can avoid native code branching', () => {
    const start = normalizeNativeEvent({
      type: 'player_start',
      sessionId: 's-sem',
      nativeMessageType: 3008,
      semanticEvent: 'assistant_playback_started',
    });
    const final = normalizeNativeEvent({
      type: 'asr_final',
      sessionId: 's-sem',
      text: '你好',
      semanticEvent: 'user_speech_finalized',
    });

    expect(start?.semanticEvent).toBe('assistant_playback_started');
    expect(final?.semanticEvent).toBe('user_speech_finalized');
  });

  it('keeps semantic timeline stable for mixed native message codes', () => {
    const normalized = [
      normalizeNativeEvent({
        type: 'player_start',
        sessionId: 's-mixed',
        nativeMessageType: 3008,
        semanticEvent: 'assistant_playback_started',
      }),
      normalizeNativeEvent({
        type: 'asr_start',
        sessionId: 's-mixed',
        nativeMessageType: 550,
        semanticEvent: 'user_speech_started',
      }),
      normalizeNativeEvent({
        type: 'asr_start',
        sessionId: 's-mixed',
        nativeMessageType: 559,
        semanticEvent: 'user_speech_started',
      }),
      normalizeNativeEvent({
        type: 'player_finish',
        sessionId: 's-mixed',
        nativeMessageType: 359,
        semanticEvent: 'assistant_playback_finished',
      }),
    ].filter(Boolean);

    expect(normalized.map((event) => event?.semanticEvent)).toEqual([
      'assistant_playback_started',
      'user_speech_started',
      'user_speech_started',
      'assistant_playback_finished',
    ]);
    expect(normalized.map((event) => event?.nativeMessageType)).toEqual(['3008', '550', '559', '359']);
  });
});
