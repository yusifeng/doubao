import { act, renderHook, waitFor } from '@testing-library/react-native';
import { Platform } from 'react-native';
import { useTextChat } from '../useTextChat';

const mockAudioStartRecognition = jest.fn<Promise<void>, [string]>();
const mockAudioWaitForRecognitionResult = jest.fn<Promise<string | null>, [number]>();
const mockAudioStopRecognition = jest.fn<Promise<string | null>, []>();
const mockAudioAbortRecognition = jest.fn<Promise<void>, []>();
const mockAudioSpeak = jest.fn<Promise<void>, [string]>();
const mockDialogPrepare = jest.fn<Promise<void>, [Record<string, unknown>?]>();
const mockDialogStartConversation = jest.fn<Promise<void>, [unknown]>();
const mockDialogStopConversation = jest.fn<Promise<void>, []>();
const mockDialogUseClientTriggeredTts = jest.fn<Promise<void>, []>();
const mockDialogUseServerTriggeredTts = jest.fn<Promise<void>, []>();
const mockDialogStreamClientTts = jest.fn<Promise<void>, [{ start: boolean; content: string; end: boolean }]>();
const mockDialogSetListener = jest.fn<
  void,
  [((event: { type: string; text?: string; sessionId?: string }) => void) | null]
>();
const mockReplyGenerateReplyStream = jest.fn();
let mockDialogListener: ((event: { type: string; text?: string; sessionId?: string }) => void) | null = null;
const DEFAULT_S2S_WS_URL = 'wss://openspeech.bytedance.com/api/v3/realtime/dialogue';
const runtimeConfig = {
  replyChainMode: 'custom_llm' as const,
  llm: {
    baseUrl: 'https://api.deepseek.com/v1',
    apiKey: 'test-api-key',
    model: 'deepseek-chat',
    provider: 'deepseek',
  },
  s2s: {
    appId: '7948119309',
    accessToken: 'test-access-token',
    wsUrl: DEFAULT_S2S_WS_URL,
  },
  persona: {
    activeRoleId: 'persona-default-konan',
    roles: [
      {
        id: 'persona-default-konan',
        name: '江户川柯南',
        systemPrompt: 'default prompt',
        source: 'default' as const,
      },
    ],
    systemPrompt: 'default prompt',
    source: 'default' as const,
  },
  androidDialog: {
    appKeyOverride: 'test-app-key',
  },
  voice: {
    speakerId: 'S_mXRP7Y5M1',
    speakerLabel: '默认音色',
    sourceType: 'default' as const,
  },
};

jest.mock('../providers', () => ({
  createVoiceAssistantProviders: () => ({
    audio: {
      startCapture: jest.fn(),
      stopCapture: jest.fn(),
      consumeCapturedAudioFrame: jest.fn(),
      startRecognition: mockAudioStartRecognition,
      waitForRecognitionResult: mockAudioWaitForRecognitionResult,
      stopRecognition: mockAudioStopRecognition,
      abortRecognition: mockAudioAbortRecognition,
      play: jest.fn(),
      speak: mockAudioSpeak,
      stopPlayback: jest.fn(),
    },
    s2s: {
      connect: jest.fn(),
      disconnect: jest.fn(),
      startSession: jest.fn(),
      finishSession: jest.fn(),
      finishConnection: jest.fn(),
      sendAudioFrame: jest.fn(),
      sendTextQuery: jest.fn(),
      waitForAssistantText: jest.fn(),
      waitForAssistantAudioChunk: jest.fn(),
      interrupt: jest.fn(),
    },
    dialogEngine: {
      isSupported: () => true,
      prepare: mockDialogPrepare,
      startConversation: mockDialogStartConversation,
      stopConversation: mockDialogStopConversation,
      pauseTalking: jest.fn(),
      resumeTalking: jest.fn(),
      interruptCurrentDialog: jest.fn(),
      sendTextQuery: jest.fn(),
      useClientTriggeredTts: mockDialogUseClientTriggeredTts,
      useServerTriggeredTts: mockDialogUseServerTriggeredTts,
      streamClientTtsText: mockDialogStreamClientTts,
      setListener: (listener: typeof mockDialogListener) => {
        mockDialogSetListener(listener);
        mockDialogListener = listener;
      },
      destroy: jest.fn(),
    },
    reply: {
      generateReplyStream: mockReplyGenerateReplyStream,
    },
    observability: {
      log: jest.fn(),
    },
  }),
}));

jest.mock('../../config/env', () => ({
  readVoicePipelineMode: () => 'realtime_audio',
  readS2SEnv: () => ({
    appId: '7948119309',
    appKey: 'test-app-key',
    accessToken: 'test-access-token',
  }),
  readLLMEnv: () => ({
    baseUrl: 'https://api.deepseek.com/v1',
    apiKey: 'test-api-key',
    model: 'deepseek-chat',
    provider: 'deepseek',
  }),
  readReplyChainMode: () => 'custom_llm',
  maskSecret: (value: string) => value,
}));

jest.mock('../../config/runtimeConfigRepo', () => ({
  getEffectiveRuntimeConfig: jest.fn(async () => runtimeConfig),
  saveRuntimeConfig: jest.fn(async (nextConfig) => nextConfig),
  buildRuntimeConfigForSave: jest.fn((currentConfig, draft) => ({
    ...currentConfig,
    ...draft,
  })),
  validateRuntimeConfigForSave: jest.fn(() => []),
}));

describe('useTextChat custom_llm voice mode with s2s voice synthesis', () => {
  const originalPlatformOs = Platform.OS;
  const originalNodeEnv = process.env.NODE_ENV;

  beforeEach(() => {
    jest.clearAllMocks();
    mockDialogListener = null;
    process.env.NODE_ENV = 'development';
    Object.defineProperty(Platform, 'OS', {
      configurable: true,
      value: 'android',
    });
    mockAudioStartRecognition.mockResolvedValue();
    mockAudioStopRecognition.mockResolvedValue(null);
    mockAudioAbortRecognition.mockResolvedValue();
    mockAudioSpeak.mockResolvedValue();
    mockDialogPrepare.mockResolvedValue();
    mockDialogStartConversation.mockResolvedValue();
    mockDialogStopConversation.mockResolvedValue();
    mockDialogUseClientTriggeredTts.mockResolvedValue();
    mockDialogUseServerTriggeredTts.mockResolvedValue();
    mockDialogStreamClientTts.mockResolvedValue();
    mockAudioWaitForRecognitionResult
      .mockResolvedValueOnce('你好')
      .mockImplementation(() => new Promise<string | null>(() => {}));
    mockReplyGenerateReplyStream.mockImplementation(async function* generateReplyStream() {
      yield '这是 custom_llm 的回复';
    });
  });

  afterAll(() => {
    process.env.NODE_ENV = originalNodeEnv;
    Object.defineProperty(Platform, 'OS', {
      configurable: true,
      value: originalPlatformOs,
    });
  });

  it('uses dialog client-triggered tts in voice rounds instead of local speak', async () => {
    const { result } = renderHook(() => useTextChat());

    await waitFor(() => {
      expect(result.current.activeConversationId).not.toBeNull();
    });

    await act(async () => {
      await result.current.toggleVoice();
    });

    await act(async () => {
      mockDialogListener?.({ type: 'engine_start', sessionId: 'voice-custom-1' });
      mockDialogListener?.({ type: 'session_ready', sessionId: 'voice-custom-1' });
      mockDialogListener?.({ type: 'asr_final', text: '你好', sessionId: 'voice-custom-1' });
    });

    await waitFor(() => {
      expect(
        result.current.messages.some((message) => message.role === 'assistant' && message.content.includes('custom_llm')),
      ).toBe(true);
    });

    expect(mockDialogPrepare).toHaveBeenCalled();
    expect(mockDialogPrepare).toHaveBeenCalledWith({ dialogWorkMode: 'delegate_chat_tts_text' });
    expect(mockDialogStartConversation).toHaveBeenCalled();
    expect(mockDialogUseClientTriggeredTts).toHaveBeenCalled();
    expect(mockDialogStreamClientTts).toHaveBeenNthCalledWith(1, {
      start: true,
      content: '这是 custom_llm 的回复',
      end: false,
    });
    expect(mockDialogStreamClientTts).toHaveBeenNthCalledWith(2, {
      start: false,
      content: '',
      end: true,
    });
    expect(mockAudioSpeak).not.toHaveBeenCalled();
  });

  it('pre-arms client-triggered tts at asr_start in delegate mode', async () => {
    const { result } = renderHook(() => useTextChat());

    await waitFor(() => {
      expect(result.current.activeConversationId).not.toBeNull();
    });

    await act(async () => {
      await result.current.toggleVoice();
    });

    await act(async () => {
      mockDialogListener?.({ type: 'engine_start', sessionId: 'voice-custom-prearm' });
      mockDialogListener?.({ type: 'session_ready', sessionId: 'voice-custom-prearm' });
      mockDialogListener?.({ type: 'asr_start', sessionId: 'voice-custom-prearm' });
    });

    await waitFor(() => {
      expect(mockDialogUseClientTriggeredTts).toHaveBeenCalledTimes(1);
    });
    expect(mockDialogStreamClientTts).not.toHaveBeenCalled();

    await act(async () => {
      mockDialogListener?.({ type: 'asr_final', text: '你好', sessionId: 'voice-custom-prearm' });
    });

    await waitFor(() => {
      expect(
        result.current.messages.some((message) => message.role === 'assistant' && message.content.includes('custom_llm')),
      ).toBe(true);
    });
  });

  it('persists partial assistant text when a newer voice turn preempts the current round', async () => {
    let releaseFirstRound: (() => void) | null = null;
    const firstRoundBlocked = new Promise<void>((resolve) => {
      releaseFirstRound = resolve;
    });

    mockReplyGenerateReplyStream
      .mockImplementationOnce(async function* firstRound() {
        yield '第一轮前半句';
        await firstRoundBlocked;
        yield '第一轮后半句（应被抢占）';
      })
      .mockImplementationOnce(async function* secondRound() {
        yield '第二轮完整回复';
      });

    const { result } = renderHook(() => useTextChat());

    await waitFor(() => {
      expect(result.current.activeConversationId).not.toBeNull();
    });

    await act(async () => {
      await result.current.toggleVoice();
    });

    await act(async () => {
      mockDialogListener?.({ type: 'engine_start', sessionId: 'voice-custom-2' });
      mockDialogListener?.({ type: 'session_ready', sessionId: 'voice-custom-2' });
      mockDialogListener?.({ type: 'asr_final', text: '第一轮问题', sessionId: 'voice-custom-2' });
    });

    await waitFor(() => {
      expect(result.current.pendingAssistantReply).toContain('第一轮前半句');
    });

    await act(async () => {
      mockDialogListener?.({ type: 'asr_final', text: '第二轮问题', sessionId: 'voice-custom-2' });
    });

    await act(async () => {
      releaseFirstRound?.();
      await Promise.resolve();
    });

    await waitFor(() => {
      const assistantMessages = result.current.messages.filter((message) => message.role === 'assistant');
      expect(assistantMessages.some((message) => message.content.includes('第一轮前半句'))).toBe(true);
      expect(assistantMessages.some((message) => message.content.includes('第二轮完整回复'))).toBe(true);
    });
  });

  it('keeps custom_llm text generation even when client tts mode cannot be enabled', async () => {
    mockDialogUseClientTriggeredTts.mockRejectedValue(new Error('trigger mode switch failed'));

    const { result } = renderHook(() => useTextChat());

    await waitFor(() => {
      expect(result.current.activeConversationId).not.toBeNull();
    });

    await act(async () => {
      await result.current.toggleVoice();
    });

    await act(async () => {
      mockDialogListener?.({ type: 'engine_start', sessionId: 'voice-custom-fallback' });
      mockDialogListener?.({ type: 'session_ready', sessionId: 'voice-custom-fallback' });
      mockDialogListener?.({ type: 'asr_final', text: '你好', sessionId: 'voice-custom-fallback' });
    });

    await waitFor(() => {
      expect(
        result.current.messages.some(
          (message) => message.role === 'assistant' && message.content.includes('custom_llm'),
        ),
      ).toBe(true);
      expect(result.current.connectivityHint).toContain('S2S语音播报未就绪');
    });

    await act(async () => {
      mockDialogListener?.({ type: 'chat_partial', text: '这是平台回退回复', sessionId: 'voice-custom-fallback' });
      mockDialogListener?.({ type: 'chat_final', text: '这是平台回退回复', sessionId: 'voice-custom-fallback' });
    });

    expect(
      result.current.messages.some(
        (message) => message.role === 'assistant' && message.content === '这是平台回退回复',
      ),
    ).toBe(false);
    expect(
      result.current.messages.some(
        (message) => message.role === 'assistant' && message.content === '自定义LLM语音回复失败，请重试。',
      ),
    ).toBe(false);
    expect(mockDialogStreamClientTts).not.toHaveBeenCalled();
    expect(mockDialogUseServerTriggeredTts).not.toHaveBeenCalled();
    expect(mockDialogUseClientTriggeredTts).toHaveBeenCalled();
  });

  it('keeps custom_llm-only behavior when custom generation fails without partial text', async () => {
    mockReplyGenerateReplyStream.mockImplementationOnce(async function* brokenRound() {
      throw new Error('custom llm request failed');
    });

    const { result } = renderHook(() => useTextChat());

    await waitFor(() => {
      expect(result.current.activeConversationId).not.toBeNull();
    });

    await act(async () => {
      await result.current.toggleVoice();
    });

    await act(async () => {
      mockDialogListener?.({ type: 'engine_start', sessionId: 'voice-custom-fallback-2' });
      mockDialogListener?.({ type: 'session_ready', sessionId: 'voice-custom-fallback-2' });
      mockDialogListener?.({ type: 'asr_final', text: '你是谁', sessionId: 'voice-custom-fallback-2' });
    });

    await waitFor(() => {
      expect(
        result.current.messages.some(
          (message) => message.role === 'assistant' && message.content === '自定义LLM语音回复失败，请重试。',
        ),
      ).toBe(true);
      expect(result.current.connectivityHint).toBe('自定义LLM语音回复失败，请重试。');
    });

    await act(async () => {
      mockDialogListener?.({
        type: 'chat_partial',
        text: '这是custom失败后的官方回复',
        sessionId: 'voice-custom-fallback-2',
      });
      mockDialogListener?.({
        type: 'chat_final',
        text: '这是custom失败后的官方回复',
        sessionId: 'voice-custom-fallback-2',
      });
    });

    expect(
      result.current.messages.some(
        (message) => message.role === 'assistant' && message.content === '这是custom失败后的官方回复',
      ),
    ).toBe(false);
    expect(mockDialogUseClientTriggeredTts).toHaveBeenCalled();
    expect(mockDialogUseServerTriggeredTts).not.toHaveBeenCalled();
  });

  it('treats session_ready as ready even when its id differs from engine_start', async () => {
    const { result } = renderHook(() => useTextChat());

    await waitFor(() => {
      expect(result.current.activeConversationId).not.toBeNull();
    });

    await act(async () => {
      await result.current.toggleVoice();
    });

    await act(async () => {
      mockDialogListener?.({ type: 'engine_start', sessionId: 'engine-session-id' });
      mockDialogListener?.({ type: 'session_ready', sessionId: 'dialog-id-from-sdk' });
      mockDialogListener?.({ type: 'asr_final', text: '你好', sessionId: 'engine-session-id' });
    });

    await waitFor(() => {
      expect(
        result.current.messages.some(
          (message) => message.role === 'assistant' && message.content.includes('custom_llm'),
        ),
      ).toBe(true);
    });

    expect(mockDialogUseClientTriggeredTts).toHaveBeenCalled();
  });
});
