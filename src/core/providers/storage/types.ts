import type { Conversation, Message } from '../../../features/voice-assistant/types/model';

export interface StorageProvider {
  createConversation(title?: string): Promise<Conversation>;
  listConversations(): Promise<Conversation[]>;
  appendMessage(conversationId: string, message: Omit<Message, 'id' | 'createdAt'>): Promise<Message>;
  listMessages(conversationId: string): Promise<Message[]>;
}
