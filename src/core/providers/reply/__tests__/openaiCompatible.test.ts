import { OpenAICompatibleReplyProvider } from '../openaiCompatible';

const mockGenerateText = jest.fn();
const mockStreamText = jest.fn();
const mockProviderChat = jest.fn();
const mockCreateOpenAI = jest.fn();

jest.mock('ai', () => ({
  generateText: (...args: unknown[]) => mockGenerateText(...args),
  streamText: (...args: unknown[]) => mockStreamText(...args),
}));

jest.mock('@ai-sdk/openai', () => ({
  createOpenAI: (...args: unknown[]) => mockCreateOpenAI(...args),
}));

function createInput() {
  return {
    userText: '你好',
    mode: 'text' as const,
    conversation: null,
    messages: [],
    systemPrompt: '你是助手',
  };
}

async function collect(stream: AsyncIterable<string>): Promise<string[]> {
  const chunks: string[] = [];
  for await (const chunk of stream) {
    chunks.push(chunk);
  }
  return chunks;
}

describe('OpenAICompatibleReplyProvider', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockProviderChat.mockImplementation((model: string) => `chat:${model}`);
    mockCreateOpenAI.mockReturnValue({
      chat: mockProviderChat,
    });
  });

  it('uses non-stream generation when stream mode is force_non_stream', async () => {
    mockGenerateText.mockResolvedValue({ text: '完整回复' });
    const provider = new OpenAICompatibleReplyProvider({
      baseUrl: 'https://example.com/v1',
      apiKey: 'test-key',
      model: 'test-model',
      provider: 'openai-compatible',
      streamMode: 'force_non_stream',
    });

    const chunks = await collect(provider.generateReplyStream(createInput()));

    expect(chunks).toEqual(['完整回复']);
    expect(mockStreamText).not.toHaveBeenCalled();
    expect(mockGenerateText).toHaveBeenCalledTimes(1);
  });

  it('streams chunks when streamText succeeds', async () => {
    mockStreamText.mockReturnValue({
      textStream: (async function* textStream() {
        yield '这';
        yield '是';
        yield '流式';
        yield '回复';
      })(),
      text: Promise.resolve('这是流式回复'),
    });

    const provider = new OpenAICompatibleReplyProvider({
      baseUrl: 'https://example.com/v1',
      apiKey: 'test-key',
      model: 'test-model',
      provider: 'openai-compatible',
      streamMode: 'auto',
    });

    const chunks = await collect(provider.generateReplyStream(createInput()));

    expect(chunks).toEqual(['这', '是', '流式', '回复']);
    expect(mockStreamText).toHaveBeenCalledTimes(1);
    expect(mockGenerateText).not.toHaveBeenCalled();
  });

  it('falls back to non-stream mode when stream fails in auto mode', async () => {
    mockStreamText.mockImplementation(() => {
      throw new Error('stream failed');
    });
    mockGenerateText.mockResolvedValue({ text: '自动降级回复' });

    const provider = new OpenAICompatibleReplyProvider({
      baseUrl: 'https://example.com/v1',
      apiKey: 'test-key',
      model: 'test-model',
      provider: 'openai-compatible',
      streamMode: 'auto',
    });

    const chunks = await collect(provider.generateReplyStream(createInput()));

    expect(chunks).toEqual(['自动降级回复']);
    expect(mockStreamText).toHaveBeenCalledTimes(1);
    expect(mockGenerateText).toHaveBeenCalledTimes(1);
  });

  it('keeps partial chunks when stream fails after first chunk in auto mode', async () => {
    mockStreamText.mockReturnValue({
      textStream: (async function* textStream() {
        yield '前半句';
        throw new Error('stream interrupted');
      })(),
      text: Promise.resolve(''),
    });
    mockGenerateText.mockResolvedValue({ text: '不应触发降级' });

    const provider = new OpenAICompatibleReplyProvider({
      baseUrl: 'https://example.com/v1',
      apiKey: 'test-key',
      model: 'test-model',
      provider: 'openai-compatible',
      streamMode: 'auto',
    });

    const chunks = await collect(provider.generateReplyStream(createInput()));

    expect(chunks).toEqual(['前半句']);
    expect(mockStreamText).toHaveBeenCalledTimes(1);
    expect(mockGenerateText).not.toHaveBeenCalled();
  });

  it('does not fallback when stream mode is force_stream', async () => {
    mockStreamText.mockImplementation(() => {
      throw new Error('stream unavailable');
    });
    mockGenerateText.mockResolvedValue({ text: '不应调用' });

    const provider = new OpenAICompatibleReplyProvider({
      baseUrl: 'https://example.com/v1',
      apiKey: 'test-key',
      model: 'test-model',
      provider: 'openai-compatible',
      streamMode: 'force_stream',
    });

    await expect(collect(provider.generateReplyStream(createInput()))).rejects.toThrow('stream unavailable');
    expect(mockGenerateText).not.toHaveBeenCalled();
  });
});
