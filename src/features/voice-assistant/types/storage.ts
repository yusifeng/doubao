import type { ConversationStatus, MessageRole, MessageType } from './model';

export type ChatSession = {
  id: string;
  title: string;
  status: ConversationStatus;
  systemPromptSnapshot: string | null;
  lastMessagePreview: string;
  lastMessageAt: number | null;
  createdAt: number;
  updatedAt: number;
};

export type ChatMessage = {
  id: string;
  sessionId: string;
  role: MessageRole;
  type: MessageType;
  content: string;
  streamState: 'partial' | 'final';
  idempotencyKey: string | null;
  createdAt: number;
};

export type VoiceSession = {
  id: string;
  chatSessionId: string;
  sdkSessionId: string | null;
  interactionMode: 'voice' | 'text';
  replyChain: 'official_s2s' | 'custom_llm';
  phase: 'starting' | 'ready' | 'stopping' | 'stopped' | 'error';
  startedAt: number;
  endedAt: number | null;
  errorCode: string | null;
  errorMessage: string | null;
};

export type VoiceSessionEvent = {
  id: number;
  voiceSessionId: string;
  eventType: string;
  turnId: number | null;
  traceId: string | null;
  payloadJson: string | null;
  createdAt: number;
};
