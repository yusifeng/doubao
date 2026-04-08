import type { Conversation, Message } from '../types/model';
import { generateUuidV7Like } from './sqlite/id';

export interface ConversationRepo {
  createConversation(title?: string, options?: { systemPromptSnapshot?: string }): Promise<Conversation>;
  listConversations(): Promise<Conversation[]>;
  appendMessage(conversationId: string, message: Omit<Message, 'id' | 'createdAt'>): Promise<Message>;
  listMessages(conversationId: string): Promise<Message[]>;
  renameConversationTitle(conversationId: string, title: string): Promise<boolean>;
  deleteConversation(conversationId: string): Promise<boolean>;
  updateConversationStatus(conversationId: string, status: Conversation['status']): Promise<void>;
  updateConversationSystemPromptSnapshot(conversationId: string, snapshot: string): Promise<void>;
}

// In-memory test repo: keeps deterministic behavior for unit tests.
export class InMemoryConversationRepo implements ConversationRepo {
  private conversations: Conversation[] = [];

  private messagesByConversation: Record<string, Message[]> = {};

  async createConversation(title = '新会话', options?: { systemPromptSnapshot?: string }): Promise<Conversation> {
    const now = Date.now();
    const conversation: Conversation = {
      id: this.nextId('conv'),
      title,
      lastMessage: '',
      updatedAt: now,
      status: 'idle',
      systemPromptSnapshot: options?.systemPromptSnapshot,
    };
    this.conversations = [conversation, ...this.conversations];
    this.messagesByConversation[conversation.id] = [];
    return conversation;
  }

  async listConversations(): Promise<Conversation[]> {
    return this.sortConversations(this.conversations);
  }

  async appendMessage(
    conversationId: string,
    message: Omit<Message, 'id' | 'createdAt'>,
  ): Promise<Message> {
    const nextMessage: Message = {
      ...message,
      id: this.nextId('msg'),
      createdAt: Date.now(),
    };
    const current = this.messagesByConversation[conversationId] ?? [];
    this.messagesByConversation[conversationId] = [...current, nextMessage];

    this.conversations = this.conversations.map((conversation) =>
      conversation.id === conversationId
        ? {
            ...conversation,
            lastMessage: nextMessage.content,
            updatedAt: nextMessage.createdAt,
          }
        : conversation,
    );

    return nextMessage;
  }

  async listMessages(conversationId: string): Promise<Message[]> {
    return this.messagesByConversation[conversationId] ?? [];
  }

  async renameConversationTitle(conversationId: string, title: string): Promise<boolean> {
    const normalized = title.trim();
    if (!normalized) {
      return false;
    }
    const now = Date.now();
    let updated = false;
    this.conversations = this.conversations.map((conversation) => {
      if (conversation.id !== conversationId) {
        return conversation;
      }
      updated = true;
      return {
        ...conversation,
        title: normalized,
        updatedAt: now,
      };
    });
    this.conversations = this.sortConversations(this.conversations);
    return updated;
  }

  async deleteConversation(conversationId: string): Promise<boolean> {
    const existingCount = this.conversations.length;
    this.conversations = this.conversations.filter((conversation) => conversation.id !== conversationId);
    delete this.messagesByConversation[conversationId];
    return this.conversations.length < existingCount;
  }

  async updateConversationStatus(conversationId: string, status: Conversation['status']): Promise<void> {
    this.conversations = this.conversations.map((conversation) =>
      conversation.id === conversationId ? { ...conversation, status } : conversation,
    );
  }

  async updateConversationSystemPromptSnapshot(conversationId: string, snapshot: string): Promise<void> {
    this.conversations = this.conversations.map((conversation) =>
      conversation.id === conversationId
        ? {
            ...conversation,
            systemPromptSnapshot: snapshot,
          }
        : conversation,
    );
  }

  private nextId(prefix: string): string {
    const uuid = generateUuidV7Like();
    return prefix === 'conv' || prefix === 'msg' ? uuid : `${prefix}-${uuid}`;
  }

  private sortConversations(conversations: Conversation[]): Conversation[] {
    return [...conversations].sort((left, right) => right.updatedAt - left.updatedAt);
  }
}
