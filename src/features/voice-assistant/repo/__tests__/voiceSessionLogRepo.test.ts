import { InMemoryVoiceSessionLogRepo } from '../inMemoryVoiceSessionLogRepo';

describe('InMemoryVoiceSessionLogRepo', () => {
  it('stores lifecycle phase changes and event timeline for one voice session', async () => {
    const repo = new InMemoryVoiceSessionLogRepo();

    await repo.startSession({
      id: 'voice-session-1',
      chatSessionId: 'conv-1',
      sdkSessionId: 'sdk-session-1',
      interactionMode: 'voice',
      replyChain: 'official_s2s',
      startedAt: 100,
    });

    await repo.updateSessionPhase('voice-session-1', 'ready');
    await repo.appendEvent({
      voiceSessionId: 'voice-session-1',
      eventType: 'engine_start',
      turnId: null,
      traceId: 'trace-start',
      payloadJson: '{"type":"engine_start"}',
      createdAt: 101,
    });
    await repo.appendEvent({
      voiceSessionId: 'voice-session-1',
      eventType: 'chat_final',
      turnId: 1,
      traceId: 'trace-final',
      payloadJson: '{"type":"chat_final"}',
      createdAt: 120,
    });
    await repo.updateSessionPhase('voice-session-1', 'stopped', { endedAt: 130 });

    const sessions = await repo.listSessionsByChatSession('conv-1');
    expect(sessions).toHaveLength(1);
    expect(sessions[0]).toEqual(
      expect.objectContaining({
        id: 'voice-session-1',
        phase: 'stopped',
        endedAt: 130,
        errorCode: null,
        errorMessage: null,
      }),
    );

    const events = await repo.listEventsBySession('voice-session-1');
    expect(events).toHaveLength(2);
    expect(events.map((event) => event.eventType)).toEqual(['engine_start', 'chat_final']);
    expect(events[0].id).toBeLessThan(events[1].id);
    expect(events[0].createdAt).toBeLessThan(events[1].createdAt);
  });

  it('returns sessions in startedAt desc order for one chat session', async () => {
    const repo = new InMemoryVoiceSessionLogRepo();

    await repo.startSession({
      id: 'voice-session-older',
      chatSessionId: 'conv-2',
      sdkSessionId: 'sdk-older',
      interactionMode: 'text',
      replyChain: 'custom_llm',
      startedAt: 10,
    });
    await repo.startSession({
      id: 'voice-session-newer',
      chatSessionId: 'conv-2',
      sdkSessionId: 'sdk-newer',
      interactionMode: 'voice',
      replyChain: 'official_s2s',
      startedAt: 20,
    });

    const sessions = await repo.listSessionsByChatSession('conv-2');
    expect(sessions.map((session) => session.id)).toEqual(['voice-session-newer', 'voice-session-older']);
  });
});
