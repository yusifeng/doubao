import type { LLMEnvConfig, ReplyStreamMode } from '../../../features/voice-assistant/config/env';
import type { ReplyGenerationInput, ReplyProvider } from './types';

type OpenAICompatibleReplyConfig = LLMEnvConfig & {
  streamMode?: ReplyStreamMode;
};

export class OpenAICompatibleReplyProvider implements ReplyProvider {
  constructor(private readonly config: OpenAICompatibleReplyConfig) {}

  async *generateReplyStream(input: ReplyGenerationInput): AsyncIterable<string> {
    const { generateText, streamText } = require('ai') as typeof import('ai');
    const { createOpenAI } = require('@ai-sdk/openai') as typeof import('@ai-sdk/openai');
    const traceId = typeof input.trace?.traceId === 'string' ? input.trace.traceId.trim() : '';
    const traceFetch = traceId
      ? async (...args: Parameters<typeof fetch>): Promise<Response> => {
          const [url, init] = args;
          const mergedHeaders = new Headers(init?.headers ?? undefined);
          mergedHeaders.set('X-Trace-Id', traceId);
          return fetch(url, {
            ...init,
            headers: mergedHeaders,
          });
        }
      : undefined;
    const provider = createOpenAI({
      apiKey: this.config.apiKey,
      baseURL: this.config.baseUrl,
      fetch: traceFetch,
    });
    try {
      const streamMode = this.config.streamMode ?? 'auto';
      const request = {
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
      } as const;

      const runGenerateText = async (): Promise<string> => {
        const response = await generateText(request);
        return response.text.trim();
      };

      if (streamMode === 'force_non_stream') {
        const nonStreamText = await runGenerateText();
        if (nonStreamText) {
          yield nonStreamText;
        }
        return;
      }

      let streamedAnyChunk = false;
      try {
        const streamResult = streamText(request);
        for await (const chunk of streamResult.textStream) {
          if (!chunk) {
            continue;
          }
          streamedAnyChunk = true;
          yield chunk;
        }
        const finalText = (await streamResult.text).trim();
        if (!streamedAnyChunk && finalText) {
          yield finalText;
        }
        return;
      } catch (streamError) {
        if (streamMode === 'auto' && !streamedAnyChunk) {
          const nonStreamText = await runGenerateText();
          if (nonStreamText) {
            yield nonStreamText;
          }
          return;
        }
        if (streamMode === 'auto' && streamedAnyChunk) {
          // Keep partial stream output as usable assistant text in auto mode.
          return;
        }
        throw streamError;
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
