import type { VoiceSession, VoiceSessionEvent } from '../types/storage';
import type {
  AppendVoiceSessionEventInput,
  StartVoiceSessionInput,
  VoiceSessionLogRepo,
} from './voiceSessionLogRepo';

export class InMemoryVoiceSessionLogRepo implements VoiceSessionLogRepo {
  private sessions: VoiceSession[] = [];

  private events: VoiceSessionEvent[] = [];

  private nextEventId = 1;

  async startSession(input: StartVoiceSessionInput): Promise<VoiceSession> {
    const session: VoiceSession = {
      id: input.id,
      chatSessionId: input.chatSessionId,
      sdkSessionId: input.sdkSessionId ?? null,
      interactionMode: input.interactionMode,
      replyChain: input.replyChain,
      phase: 'starting',
      startedAt: input.startedAt,
      endedAt: null,
      errorCode: null,
      errorMessage: null,
    };
    this.sessions = [session, ...this.sessions.filter((item) => item.id !== session.id)];
    return session;
  }

  async updateSessionPhase(
    voiceSessionId: string,
    phase: VoiceSession['phase'],
    options?: { endedAt?: number | null; errorCode?: string | null; errorMessage?: string | null },
  ): Promise<void> {
    this.sessions = this.sessions.map((session) => {
      if (session.id !== voiceSessionId) {
        return session;
      }
      return {
        ...session,
        phase,
        endedAt: options?.endedAt ?? session.endedAt,
        errorCode: options?.errorCode ?? session.errorCode,
        errorMessage: options?.errorMessage ?? session.errorMessage,
      };
    });
  }

  async appendEvent(input: AppendVoiceSessionEventInput): Promise<VoiceSessionEvent> {
    const next: VoiceSessionEvent = {
      id: this.nextEventId,
      voiceSessionId: input.voiceSessionId,
      eventType: input.eventType,
      turnId: input.turnId ?? null,
      traceId: input.traceId ?? null,
      payloadJson: input.payloadJson ?? null,
      createdAt: input.createdAt,
    };
    this.nextEventId += 1;
    this.events.push(next);
    return next;
  }

  async listSessionsByChatSession(chatSessionId: string): Promise<VoiceSession[]> {
    return this.sessions
      .filter((session) => session.chatSessionId === chatSessionId)
      .sort((left, right) => right.startedAt - left.startedAt);
  }

  async listEventsBySession(voiceSessionId: string): Promise<VoiceSessionEvent[]> {
    return this.events
      .filter((event) => event.voiceSessionId === voiceSessionId)
      .sort((left, right) => (left.createdAt === right.createdAt ? left.id - right.id : left.createdAt - right.createdAt));
  }
}
