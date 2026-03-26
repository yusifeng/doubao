import type { ReplyGenerationInput, ReplyProvider } from '../../../core/providers/reply/types';
import { buildAssistantReply } from './useCases';

export class LocalReplyProvider implements ReplyProvider {
  async *generateReplyStream(input: ReplyGenerationInput): AsyncIterable<string> {
    yield buildAssistantReply(input.userText);
  }
}
