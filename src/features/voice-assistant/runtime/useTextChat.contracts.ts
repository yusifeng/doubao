import type { DialogEngineEvent } from '../../../core/providers/dialog-engine/types';
import type { Message } from '../types/model';

export type TextRoundInput = {
  content: string;
  userMessageType: Message['type'];
  assistantMessageType: Message['type'];
};

export type GenerateReplyInput = {
  userText: string;
  mode: 'text' | 'voice';
  conversationId: string;
  fallbackToS2S: boolean;
};

export type AndroidDialogRuntimeApi = {
  ensureAndroidDialogConversation: (mode: 'voice' | 'text', options?: { forceRestart?: boolean }) => Promise<void>;
  stopAndroidDialogConversation: (options?: { persistPendingAssistantDraft?: boolean }) => Promise<void>;
  runAndroidReplyFlow: (input: {
    userText: string;
    mode: 'text' | 'voice';
    assistantMessageType: Message['type'];
    resumeVoiceAfterReply: boolean;
    conversationId?: string;
  }) => Promise<void>;
  performAndroidDialogInterrupt: (source: 'manual' | 'barge_in') => Promise<void>;
};

export type AndroidDialogEventHandler = (event: DialogEngineEvent) => void;
