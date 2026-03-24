export type ConversationStatus = 'idle' | 'listening' | 'thinking' | 'speaking' | 'error';

export type MessageRole = 'user' | 'assistant';

export type MessageType = 'text' | 'audio';

export type Conversation = {
  id: string;
  title: string;
  lastMessage: string;
  updatedAt: number;
  status: ConversationStatus;
};

export type Message = {
  id: string;
  conversationId: string;
  role: MessageRole;
  content: string;
  type: MessageType;
  createdAt: number;
};
