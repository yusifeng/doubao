import type { Conversation, Message } from '../types/model';
import type { ConversationRepo } from './conversationRepo';
import { generateUuidV7Like } from './sqlite/id';

const STORAGE_KEY = 'voice_assistant.conversation_repo.v1';

type StoredConversationState = {
  conversations: Conversation[];
  messagesByConversation: Record<string, Message[]>;
};

type AsyncStorageLike = {
  getItem: (key: string) => Promise<string | null>;
  setItem: (key: string, value: string) => Promise<void>;
};

function resolveAsyncStorage(): AsyncStorageLike | null {
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const module = require('@react-native-async-storage/async-storage');
    const candidate: AsyncStorageLike | undefined = module?.default ?? module;
    if (
      candidate &&
      typeof candidate.getItem === 'function' &&
      typeof candidate.setItem === 'function'
    ) {
      return candidate;
    }
    return null;
  } catch {
    return null;
  }
}

function createEmptyState(): StoredConversationState {
  return {
    conversations: [],
    messagesByConversation: {},
  };
}

function isStoredConversationState(input: unknown): input is StoredConversationState {
  if (!input || typeof input !== 'object') {
    return false;
  }
  const candidate = input as Partial<StoredConversationState>;
  return (
    Array.isArray(candidate.conversations) &&
    typeof candidate.messagesByConversation === 'object' &&
    candidate.messagesByConversation !== null
  );
}

export class AsyncStorageConversationRepo implements ConversationRepo {
  private state: StoredConversationState = createEmptyState();

  private hydrated = false;

  private asyncStorage = resolveAsyncStorage();

  private async hydrateIfNeeded() {
    if (this.hydrated) {
      return;
    }
    try {
      if (!this.asyncStorage) {
        this.hydrated = true;
        return;
      }
      const raw = await this.asyncStorage.getItem(STORAGE_KEY);
      if (!raw) {
        this.hydrated = true;
        return;
      }
      const parsed: unknown = JSON.parse(raw);
      if (!isStoredConversationState(parsed)) {
        this.state = createEmptyState();
        this.hydrated = true;
        return;
      }
      this.state = {
        conversations: this.sortConversations(parsed.conversations),
        messagesByConversation: parsed.messagesByConversation,
      };
    } catch {
      this.state = createEmptyState();
    } finally {
      this.hydrated = true;
    }
  }

  private async persistState() {
    if (!this.asyncStorage) {
      return;
    }
    await this.asyncStorage.setItem(STORAGE_KEY, JSON.stringify(this.state));
  }

  private nextId(): string {
    return generateUuidV7Like();
  }

  private sortConversations(conversations: Conversation[]): Conversation[] {
    return [...conversations].sort((left, right) => right.updatedAt - left.updatedAt);
  }

  async createConversation(title = '新会话', options?: { systemPromptSnapshot?: string }): Promise<Conversation> {
    await this.hydrateIfNeeded();
    const now = Date.now();
    const conversation: Conversation = {
      id: this.nextId(),
      title,
      lastMessage: '',
      updatedAt: now,
      status: 'idle',
      systemPromptSnapshot: options?.systemPromptSnapshot,
    };
    this.state.conversations = this.sortConversations([conversation, ...this.state.conversations]);
    this.state.messagesByConversation[conversation.id] = [];
    await this.persistState();
    return conversation;
  }

  async listConversations(): Promise<Conversation[]> {
    await this.hydrateIfNeeded();
    return this.sortConversations(this.state.conversations);
  }

  async appendMessage(
    conversationId: string,
    message: Omit<Message, 'id' | 'createdAt'>,
  ): Promise<Message> {
    await this.hydrateIfNeeded();
    const nextMessage: Message = {
      ...message,
      id: this.nextId(),
      createdAt: Date.now(),
    };
    const current = this.state.messagesByConversation[conversationId] ?? [];
    this.state.messagesByConversation[conversationId] = [...current, nextMessage];

    this.state.conversations = this.state.conversations.map((conversation) =>
      conversation.id === conversationId
        ? {
            ...conversation,
            lastMessage: nextMessage.content,
            updatedAt: nextMessage.createdAt,
          }
        : conversation,
    );
    this.state.conversations = this.sortConversations(this.state.conversations);
    await this.persistState();
    return nextMessage;
  }

  async listMessages(conversationId: string): Promise<Message[]> {
    await this.hydrateIfNeeded();
    return this.state.messagesByConversation[conversationId] ?? [];
  }

  async renameConversationTitle(conversationId: string, title: string): Promise<boolean> {
    await this.hydrateIfNeeded();
    const normalized = title.trim();
    if (!normalized) {
      return false;
    }
    const now = Date.now();
    let updated = false;
    this.state.conversations = this.state.conversations.map((conversation) => {
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
    if (!updated) {
      return false;
    }
    this.state.conversations = this.sortConversations(this.state.conversations);
    await this.persistState();
    return true;
  }

  async deleteConversation(conversationId: string): Promise<boolean> {
    await this.hydrateIfNeeded();
    const previousLength = this.state.conversations.length;
    this.state.conversations = this.state.conversations.filter((conversation) => conversation.id !== conversationId);
    delete this.state.messagesByConversation[conversationId];
    const deleted = this.state.conversations.length < previousLength;
    if (!deleted) {
      return false;
    }
    await this.persistState();
    return true;
  }

  async updateConversationStatus(conversationId: string, status: Conversation['status']): Promise<void> {
    await this.hydrateIfNeeded();
    this.state.conversations = this.state.conversations.map((conversation) =>
      conversation.id === conversationId ? { ...conversation, status } : conversation,
    );
    this.state.conversations = this.sortConversations(this.state.conversations);
    await this.persistState();
  }

  async updateConversationSystemPromptSnapshot(conversationId: string, snapshot: string): Promise<void> {
    await this.hydrateIfNeeded();
    this.state.conversations = this.state.conversations.map((conversation) =>
      conversation.id === conversationId
        ? {
            ...conversation,
            systemPromptSnapshot: snapshot,
          }
        : conversation,
    );
    await this.persistState();
  }
}
