import type { VoiceSession, VoiceSessionEvent } from '../types/storage';

export type StartVoiceSessionInput = {
  id: string;
  chatSessionId: string;
  sdkSessionId?: string | null;
  interactionMode: VoiceSession['interactionMode'];
  replyChain: VoiceSession['replyChain'];
  startedAt: number;
};

export type AppendVoiceSessionEventInput = {
  voiceSessionId: string;
  eventType: string;
  turnId?: number | null;
  traceId?: string | null;
  payloadJson?: string | null;
  createdAt: number;
};

export interface VoiceSessionLogRepo {
  startSession(input: StartVoiceSessionInput): Promise<VoiceSession>;
  updateSessionPhase(
    voiceSessionId: string,
    phase: VoiceSession['phase'],
    options?: { endedAt?: number | null; errorCode?: string | null; errorMessage?: string | null },
  ): Promise<void>;
  appendEvent(input: AppendVoiceSessionEventInput): Promise<VoiceSessionEvent>;
  listSessionsByChatSession(chatSessionId: string): Promise<VoiceSession[]>;
  listEventsBySession(voiceSessionId: string): Promise<VoiceSessionEvent[]>;
}
