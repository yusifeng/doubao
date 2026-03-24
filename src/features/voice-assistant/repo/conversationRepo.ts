import type { Conversation, Message } from '../types/model';

export interface ConversationRepo {
  createConversation(title?: string): Promise<Conversation>;
  listConversations(): Promise<Conversation[]>;
  appendMessage(conversationId: string, message: Omit<Message, 'id' | 'createdAt'>): Promise<Message>;
  listMessages(conversationId: string): Promise<Message[]>;
  updateConversationStatus(conversationId: string, status: Conversation['status']): Promise<void>;
}

// M1 skeleton: in-memory placeholder, will be replaced by SQLite provider in M5.
export class InMemoryConversationRepo implements ConversationRepo {
  private conversations: Conversation[] = [];

  private messagesByConversation: Record<string, Message[]> = {};

  private idSeed = 0;

  async createConversation(title = '新会话'): Promise<Conversation> {
    const now = Date.now();
    const conversation: Conversation = {
      id: this.nextId('conv'),
      title,
      lastMessage: '',
      updatedAt: now,
      status: 'idle',
    };
    this.conversations = [conversation, ...this.conversations];
    this.messagesByConversation[conversation.id] = [];
    return conversation;
  }

  async listConversations(): Promise<Conversation[]> {
    return this.conversations;
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

  async updateConversationStatus(conversationId: string, status: Conversation['status']): Promise<void> {
    this.conversations = this.conversations.map((conversation) =>
      conversation.id === conversationId ? { ...conversation, status } : conversation,
    );
  }

  private nextId(prefix: string): string {
    this.idSeed += 1;
    return `${prefix}-${this.idSeed}`;
  }
}
