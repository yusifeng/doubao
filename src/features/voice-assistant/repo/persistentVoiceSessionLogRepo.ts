import type { VoiceSession, VoiceSessionEvent } from '../types/storage';
import type {
  AppendVoiceSessionEventInput,
  StartVoiceSessionInput,
  VoiceSessionLogRepo,
} from './voiceSessionLogRepo';
import { InMemoryVoiceSessionLogRepo } from './inMemoryVoiceSessionLogRepo';
import { isVoiceAssistantSqliteAvailable } from './sqlite/client';
import { SqliteVoiceAssistantStorageRepo } from './sqlite/sqliteVoiceAssistantStorageRepo';

export class PersistentVoiceSessionLogRepo implements VoiceSessionLogRepo {
  private sqliteStorage = new SqliteVoiceAssistantStorageRepo();

  private fallbackStorage = new InMemoryVoiceSessionLogRepo();

  private useFallback(): boolean {
    return !isVoiceAssistantSqliteAvailable();
  }

  async startSession(input: StartVoiceSessionInput): Promise<VoiceSession> {
    if (this.useFallback()) {
      return this.fallbackStorage.startSession(input);
    }
    return this.sqliteStorage.startSession(input);
  }

  async updateSessionPhase(
    voiceSessionId: string,
    phase: VoiceSession['phase'],
    options?: { endedAt?: number | null; errorCode?: string | null; errorMessage?: string | null },
  ): Promise<void> {
    if (this.useFallback()) {
      await this.fallbackStorage.updateSessionPhase(voiceSessionId, phase, options);
      return;
    }
    await this.sqliteStorage.updateSessionPhase(voiceSessionId, phase, options);
  }

  async appendEvent(input: AppendVoiceSessionEventInput): Promise<VoiceSessionEvent> {
    if (this.useFallback()) {
      return this.fallbackStorage.appendEvent(input);
    }
    return this.sqliteStorage.appendEvent(input);
  }

  async listSessionsByChatSession(chatSessionId: string): Promise<VoiceSession[]> {
    if (this.useFallback()) {
      return this.fallbackStorage.listSessionsByChatSession(chatSessionId);
    }
    return this.sqliteStorage.listSessionsByChatSession(chatSessionId);
  }

  async listEventsBySession(voiceSessionId: string): Promise<VoiceSessionEvent[]> {
    if (this.useFallback()) {
      return this.fallbackStorage.listEventsBySession(voiceSessionId);
    }
    return this.sqliteStorage.listEventsBySession(voiceSessionId);
  }
}
