import type { Conversation, Message } from '../../../features/voice-assistant/types/model';

export type ReplyGenerationInput = {
  userText: string;
  mode: 'text' | 'voice';
  conversation: Conversation | null;
  messages: Message[];
};

export interface ReplyProvider {
  generateReplyStream(input: ReplyGenerationInput): AsyncIterable<string>;
}
