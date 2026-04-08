import type { ConversationStatus } from '../types/model';
import type { ChatSession } from '../types/storage';

export type CreateSessionInput = {
  id: string;
  title: string;
  status: ConversationStatus;
  systemPromptSnapshot?: string | null;
  createdAt: number;
};

export interface SessionRepo {
  create(input: CreateSessionInput): Promise<ChatSession>;
  list(): Promise<ChatSession[]>;
  getById(sessionId: string): Promise<ChatSession | null>;
  renameTitle(sessionId: string, title: string, updatedAt: number): Promise<boolean>;
  updateStatus(sessionId: string, status: ConversationStatus, updatedAt: number): Promise<void>;
  updateSystemPromptSnapshot(sessionId: string, snapshot: string): Promise<void>;
  delete(sessionId: string): Promise<boolean>;
}
