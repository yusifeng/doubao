import type { Conversation, Message } from '../types/model';
import type { ConversationAppendMessageInput, ConversationRepo } from './conversationRepo';
import { AsyncStorageConversationRepo } from './asyncStorageConversationRepo';
import { generateUuidV7Like } from './sqlite/id';
import { SqliteVoiceAssistantStorageRepo } from './sqlite/sqliteVoiceAssistantStorageRepo';
import { isVoiceAssistantSqliteAvailable } from './sqlite/client';

function toConversation(session: {
  id: string;
  title: string;
  status: Conversation['status'];
  systemPromptSnapshot: string | null;
  lastMessagePreview: string;
  updatedAt: number;
}): Conversation {
  return {
    id: session.id,
    title: session.title,
    status: session.status,
    systemPromptSnapshot: session.systemPromptSnapshot ?? undefined,
    lastMessage: session.lastMessagePreview,
    updatedAt: session.updatedAt,
  };
}

function toMessage(message: {
  id: string;
  sessionId: string;
  role: Message['role'];
  type: Message['type'];
  content: string;
  createdAt: number;
}): Message {
  return {
    id: message.id,
    conversationId: message.sessionId,
    role: message.role,
    type: message.type,
    content: message.content,
    createdAt: message.createdAt,
  };
}

export class PersistentConversationRepo implements ConversationRepo {
  private storage = new SqliteVoiceAssistantStorageRepo();
  private asyncStorageFallback = new AsyncStorageConversationRepo();

  private useAsyncStorageFallback(): boolean {
    return !isVoiceAssistantSqliteAvailable();
  }

  async createConversation(title = '新会话', options?: { systemPromptSnapshot?: string }): Promise<Conversation> {
    if (this.useAsyncStorageFallback()) {
      return this.asyncStorageFallback.createConversation(title, options);
    }
    const created = await this.storage.create({
      id: generateUuidV7Like(),
      title,
      status: 'idle',
      systemPromptSnapshot: options?.systemPromptSnapshot ?? null,
      createdAt: Date.now(),
    });
    return toConversation(created);
  }

  async listConversations(): Promise<Conversation[]> {
    if (this.useAsyncStorageFallback()) {
      return this.asyncStorageFallback.listConversations();
    }
    const sessions = await this.storage.list();
    return sessions.map(toConversation);
  }

  async appendMessage(
    conversationId: string,
    message: ConversationAppendMessageInput,
  ): Promise<Message> {
    if (this.useAsyncStorageFallback()) {
      return this.asyncStorageFallback.appendMessage(conversationId, message);
    }
    const createdAt = Date.now();
    const inserted = await this.storage.append({
      id: generateUuidV7Like(),
      sessionId: conversationId,
      role: message.role,
      type: message.type,
      content: message.content,
      createdAt,
      streamState: 'final',
      idempotencyKey: message.idempotencyKey ?? null,
    });
    return toMessage(inserted);
  }

  async listMessages(conversationId: string): Promise<Message[]> {
    if (this.useAsyncStorageFallback()) {
      return this.asyncStorageFallback.listMessages(conversationId);
    }
    const rows = await this.storage.listBySession(conversationId);
    return rows.map(toMessage);
  }

  async renameConversationTitle(conversationId: string, title: string): Promise<boolean> {
    if (this.useAsyncStorageFallback()) {
      return this.asyncStorageFallback.renameConversationTitle(conversationId, title);
    }
    const normalized = title.trim();
    if (!normalized) {
      return false;
    }
    return this.storage.renameTitle(conversationId, normalized, Date.now());
  }

  async deleteConversation(conversationId: string): Promise<boolean> {
    if (this.useAsyncStorageFallback()) {
      return this.asyncStorageFallback.deleteConversation(conversationId);
    }
    return this.storage.delete(conversationId);
  }

  async updateConversationStatus(conversationId: string, status: Conversation['status']): Promise<void> {
    if (this.useAsyncStorageFallback()) {
      await this.asyncStorageFallback.updateConversationStatus(conversationId, status);
      return;
    }
    await this.storage.updateStatus(conversationId, status, Date.now());
  }

  async updateConversationSystemPromptSnapshot(conversationId: string, snapshot: string): Promise<void> {
    if (this.useAsyncStorageFallback()) {
      await this.asyncStorageFallback.updateConversationSystemPromptSnapshot(conversationId, snapshot);
      return;
    }
    await this.storage.updateSystemPromptSnapshot(conversationId, snapshot);
  }
}
