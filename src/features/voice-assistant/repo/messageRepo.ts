import type { MessageRole, MessageType } from '../types/model';
import type { ChatMessage } from '../types/storage';

export type AppendMessageInput = {
  id: string;
  sessionId: string;
  role: MessageRole;
  type: MessageType;
  content: string;
  createdAt: number;
  streamState?: 'partial' | 'final';
  idempotencyKey?: string | null;
};

export interface MessageRepo {
  append(input: AppendMessageInput): Promise<ChatMessage>;
  listBySession(sessionId: string): Promise<ChatMessage[]>;
}
