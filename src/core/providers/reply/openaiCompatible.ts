import type { LLMEnvConfig } from '../../../features/voice-assistant/config/env';
import type { ReplyGenerationInput, ReplyProvider } from './types';

export class OpenAICompatibleReplyProvider implements ReplyProvider {
  constructor(private readonly config: LLMEnvConfig) {}

  async *generateReplyStream(input: ReplyGenerationInput): AsyncIterable<string> {
    const { generateText } = require('ai') as typeof import('ai');
    const { createOpenAI } = require('@ai-sdk/openai') as typeof import('@ai-sdk/openai');
    const provider = createOpenAI({
      apiKey: this.config.apiKey,
      baseURL: this.config.baseUrl,
    });
    try {
      const response = await generateText({
        model: provider.chat(this.config.model),
        system: input.systemPrompt,
        messages: this.buildMessages(input),
        maxRetries: 1,
        maxOutputTokens: 800,
        temperature: 0.7,
        providerOptions: {
          openai: {
            // OpenAI-compatible providers (DeepSeek/OpenRouter/etc.) often reject the developer role.
            systemMessageMode: 'system',
          },
        },
      });
      const content = response.text.trim();
      if (content) {
        yield content;
      }
    } catch (error) {
      const normalized =
        error instanceof Error
          ? [error.name, error.message, (error as { cause?: { message?: string } }).cause?.message]
              .filter((part) => typeof part === 'string' && part.trim().length > 0)
              .join(' | ')
          : JSON.stringify(error);
      throw new Error(normalized || 'custom_llm request failed');
    }
  }

  private buildMessages(input: ReplyGenerationInput): Array<{ role: 'user' | 'assistant'; content: string }> {
    const history = input.messages
      .slice(-12)
      .filter((message) => message.role === 'user' || message.role === 'assistant')
      .map((message) => ({
        role: message.role,
        content: message.content,
      }));
    const userText = input.userText.trim();
    const lastMessage = history[history.length - 1];
    const hasTrailingCurrentUserTurn =
      lastMessage?.role === 'user' && lastMessage.content.trim() === userText;
    if (userText && !hasTrailingCurrentUserTurn) {
      history.push({
        role: 'user',
        content: userText,
      });
    }
    return history;
  }
}
