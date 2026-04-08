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
const mockDialogSendTextQuery = jest.fn<Promise<void>, [string]>();
const mockDialogInterruptCurrentDialog = jest.fn<Promise<void>, []>();
const mockDialogSetListener = jest.fn<void, [((event: { type: string; text?: string; sessionId?: string }) => void) | null]>();
const mockReplyGenerateReplyStream = jest.fn();
let mockDialogListener: ((event: { type: string; text?: string; sessionId?: string }) => void) | null = null;
const DEFAULT_S2S_WS_URL = 'wss://openspeech.bytedance.com/api/v3/realtime/dialogue';
const runtimeConfig = {
  replyChainMode: 'custom_llm' as const,
  replyStreamMode: 'auto' as const,
  llm: { baseUrl: 'https://api.deepseek.com/v1', apiKey: 'test-api-key', model: 'deepseek-chat', provider: 'deepseek' },
  s2s: { appId: '7948119309', accessToken: 'test-access-token', wsUrl: DEFAULT_S2S_WS_URL },
  persona: {
    activeRoleId: 'persona-default-konan',
    roles: [{ id: 'persona-default-konan', name: '江户川柯南', systemPrompt: 'default prompt', source: 'default' as const }],
    systemPrompt: 'default prompt',
    source: 'default' as const,
  },
  androidDialog: { appKeyOverride: 'test-app-key' },
  voice: { speakerId: 'S_mXRP7Y5M1', speakerLabel: '默认音色', sourceType: 'default' as const },
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
      interruptCurrentDialog: mockDialogInterruptCurrentDialog,
      sendTextQuery: mockDialogSendTextQuery,
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
      marker: 'reply-provider',
      generateReplyStream: mockReplyGenerateReplyStream,
    },
    observability: { log: jest.fn() },
    audit: { record: jest.fn() },
  }),
}));

jest.mock('../../config/env', () => ({
  readVoicePipelineMode: () => 'realtime_audio',
  readS2SEnv: () => ({ appId: '7948119309', appKey: 'test-app-key', accessToken: 'test-access-token' }),
  readLLMEnv: () => ({ baseUrl: 'https://api.deepseek.com/v1', apiKey: 'test-api-key', model: 'deepseek-chat', provider: 'deepseek' }),
  readReplyChainMode: () => 'custom_llm',
  readReplyStreamMode: () => 'auto',
  maskSecret: (value: string) => value,
}));

jest.mock('../../config/runtimeConfigRepo', () => ({
  getEffectiveRuntimeConfig: jest.fn(async () => runtimeConfig),
  saveRuntimeConfig: jest.fn(async (nextConfig) => nextConfig),
  buildRuntimeConfigForSave: jest.fn((currentConfig, draft) => ({ ...currentConfig, ...draft })),
  validateRuntimeConfigForSave: jest.fn(() => []),
}));

describe('useTextChat custom_llm client tts selection guard', () => {
  const originalPlatformOs = Platform.OS;
  const originalNodeEnv = process.env.NODE_ENV;

  beforeEach(() => {
    jest.clearAllMocks();
    mockDialogListener = null;
    process.env.NODE_ENV = 'development';
    Object.defineProperty(Platform, 'OS', { configurable: true, value: 'android' });
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
    mockDialogSendTextQuery.mockResolvedValue();
    mockDialogInterruptCurrentDialog.mockResolvedValue();
    mockAudioWaitForRecognitionResult.mockResolvedValue('你好');
    mockReplyGenerateReplyStream.mockImplementation(async function* stream(this: { marker?: string }) {
      if (this?.marker !== 'reply-provider') {
        throw new Error('reply provider context missing');
      }
      yield '这是 custom_llm 的回复';
    });
  });

  afterAll(() => {
    process.env.NODE_ENV = originalNodeEnv;
    Object.defineProperty(Platform, 'OS', { configurable: true, value: originalPlatformOs });
  });

  it('fails closed and resets the voice turn when client tts selection is not ready', async () => {
    mockDialogUseClientTriggeredTts.mockRejectedValue(new Error('trigger mode switch failed'));
    const { result } = renderHook(() => useTextChat());
    await waitFor(() => expect(result.current.activeConversationId).not.toBeNull());
    await act(async () => {
      await result.current.toggleVoice();
      mockDialogListener?.({ type: 'engine_start', sessionId: 'voice-custom-fallback' });
      mockDialogListener?.({ type: 'session_ready', sessionId: 'voice-custom-fallback' });
      mockDialogListener?.({ type: 'asr_start', sessionId: 'voice-custom-fallback' });
      mockDialogListener?.({ type: 'asr_final', text: '你好', sessionId: 'voice-custom-fallback' });
    });
    await waitFor(() => {
      expect(
        result.current.messages.some((m) => m.role === 'assistant' && m.content === '当前语音链路未完成自定义接管，本轮已取消，请重试。'),
      ).toBe(true);
    });
    expect(mockDialogUseClientTriggeredTts).toHaveBeenCalled();
    expect(mockDialogStreamClientTts).not.toHaveBeenCalled();
  });

  it('treats 400061 as already-enabled client tts and continues s2s playback', async () => {
    mockDialogUseClientTriggeredTts.mockRejectedValueOnce(new Error('Use client triggered tts failed: 400061'));
    const { result } = renderHook(() => useTextChat());
    await waitFor(() => expect(result.current.activeConversationId).not.toBeNull());
    await act(async () => {
      await result.current.toggleVoice();
      mockDialogListener?.({ type: 'engine_start', sessionId: 'voice-custom-400061' });
      mockDialogListener?.({ type: 'session_ready', sessionId: 'voice-custom-400061' });
      mockDialogListener?.({ type: 'asr_final', text: '你好', sessionId: 'voice-custom-400061' });
    });
    await waitFor(() => {
      expect(result.current.messages.some((m) => m.role === 'assistant' && m.content.includes('custom_llm'))).toBe(true);
    });
    expect(mockDialogStreamClientTts).toHaveBeenCalled();
    expect(mockAudioSpeak).not.toHaveBeenCalled();
  });

  it('treats 400060 as not-ready and retries client tts selection', async () => {
    mockDialogUseClientTriggeredTts.mockRejectedValueOnce(new Error('Use client triggered tts failed: 400060'));
    const { result } = renderHook(() => useTextChat());
    await waitFor(() => expect(result.current.activeConversationId).not.toBeNull());
    await act(async () => {
      await result.current.toggleVoice();
      mockDialogListener?.({ type: 'engine_start', sessionId: 'voice-custom-400060' });
      mockDialogListener?.({ type: 'session_ready', sessionId: 'voice-custom-400060' });
      mockDialogListener?.({ type: 'asr_start', sessionId: 'voice-custom-400060' });
      mockDialogListener?.({ type: 'asr_final', text: '你好', sessionId: 'voice-custom-400060' });
    });
    await waitFor(() => {
      expect(
        result.current.messages.some((m) => m.role === 'assistant' && m.content.includes('custom_llm')),
      ).toBe(true);
    });
    expect(mockDialogUseClientTriggeredTts).toHaveBeenCalledTimes(2);
    expect(mockDialogStreamClientTts).toHaveBeenCalled();
    expect(mockAudioSpeak).not.toHaveBeenCalled();
  });
});
