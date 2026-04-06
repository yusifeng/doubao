import { act, renderHook, waitFor } from '@testing-library/react-native';
import { Platform } from 'react-native';
import { useTextChat } from '../useTextChat';

type DialogTestEvent = {
  type: string;
  text?: string;
  sessionId?: string;
  questionId?: string;
  replyId?: string;
  traceId?: string;
  nativeMessageType?: string | number;
};

const mockDialogPrepare = jest.fn<Promise<void>, [Record<string, unknown>?]>();
const mockDialogStartConversation = jest.fn<Promise<void>, [unknown]>();
const mockDialogStopConversation = jest.fn<Promise<void>, []>();
const mockDialogPauseTalking = jest.fn<Promise<void>, []>();
const mockDialogResumeTalking = jest.fn<Promise<void>, []>();
const mockDialogInterruptCurrentDialog = jest.fn<Promise<void>, []>();
const mockDialogSendTextQuery = jest.fn<Promise<void>, [string]>();
const mockDialogDestroy = jest.fn<Promise<void>, []>();
const mockDialogSetListener = jest.fn<void, [((event: DialogTestEvent) => void) | null]>();
const mockAudioSpeak = jest.fn();
const mockObservabilityLog = jest.fn();
const mockAuditRecord = jest.fn();
let mockDialogListener: ((event: DialogTestEvent) => void) | null = null;
const mockReadVoicePipelineMode = jest.fn(() => 'realtime_audio');
const DEFAULT_S2S_WS_URL = 'wss://openspeech.bytedance.com/api/v3/realtime/dialogue';
const runtimeConfig = {
  replyChainMode: 'official_s2s' as const,
  llm: {
    baseUrl: '',
    apiKey: '',
    model: '',
    provider: 'openai-compatible',
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

function emitEngineStart(sessionId = 'session-1') {
  mockDialogListener?.({ type: 'engine_start', sessionId });
  return sessionId;
}

jest.mock('../providers', () => ({
  createVoiceAssistantProviders: () => ({
    audio: {
      startCapture: jest.fn(),
      stopCapture: jest.fn(),
      consumeCapturedAudioFrame: jest.fn(),
      startRecognition: jest.fn(),
      waitForRecognitionResult: jest.fn(),
      stopRecognition: jest.fn(),
      abortRecognition: jest.fn(),
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
      pauseTalking: mockDialogPauseTalking,
      resumeTalking: mockDialogResumeTalking,
      interruptCurrentDialog: mockDialogInterruptCurrentDialog,
      sendTextQuery: mockDialogSendTextQuery,
      useClientTriggeredTts: jest.fn(),
      useServerTriggeredTts: jest.fn(),
      streamClientTtsText: jest.fn(),
      setListener: (listener: typeof mockDialogListener) => {
        mockDialogSetListener(listener);
        mockDialogListener = listener;
      },
      destroy: mockDialogDestroy,
    },
    reply: { generateReplyStream: jest.fn() },
    observability: {
      log: mockObservabilityLog,
    },
    audit: {
      record: mockAuditRecord,
    },
  }),
}));

jest.mock('../../config/env', () => ({
  readVoicePipelineMode: () => mockReadVoicePipelineMode(),
  readS2SEnv: () => ({
    appId: '7948119309',
    appKey: 'test-app-key',
    accessToken: 'test-access-token',
  }),
  readLLMEnv: () => null,
  readReplyChainMode: () => 'official_s2s',
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

describe('useTextChat android stale-session isolation', () => {
  const originalPlatformOs = Platform.OS;

  beforeEach(() => {
    jest.clearAllMocks();
    mockDialogListener = null;
    mockReadVoicePipelineMode.mockReturnValue('realtime_audio');
    Object.defineProperty(Platform, 'OS', {
      configurable: true,
      value: 'android',
    });
    mockDialogPrepare.mockResolvedValue();
    mockDialogStartConversation.mockResolvedValue();
    mockDialogStopConversation.mockResolvedValue();
    mockDialogPauseTalking.mockResolvedValue();
    mockDialogResumeTalking.mockResolvedValue();
    mockDialogInterruptCurrentDialog.mockResolvedValue();
    mockDialogSendTextQuery.mockResolvedValue();
    mockDialogDestroy.mockResolvedValue();
    mockAuditRecord.mockReset();
  });

  afterAll(() => {
    Object.defineProperty(Platform, 'OS', {
      configurable: true,
      value: originalPlatformOs,
    });
  });

  it('ignores stale engine_stop events from a previous android dialog session', async () => {
    const { result } = renderHook(() => useTextChat());

    await waitFor(() => {
      expect(result.current.activeConversationId).not.toBeNull();
    });

    await act(async () => {
      await result.current.sendText('当前文本轮');
    });

    await act(async () => {
      emitEngineStart('text-session-current');
      mockDialogListener?.({ type: 'engine_stop', sessionId: 'text-session-stale' });
      mockDialogListener?.({ type: 'chat_final', text: '当前会话回复', sessionId: 'text-session-current' });
    });

    await waitFor(() => {
      expect(result.current.messages.some((message) => message.role === 'assistant' && message.content === '当前会话回复')).toBe(true);
      expect(result.current.status).toBe('idle');
    });
  });

  it('ignores chat_final that arrives after active session has already stopped', async () => {
    const { result } = renderHook(() => useTextChat());

    await waitFor(() => {
      expect(result.current.activeConversationId).not.toBeNull();
    });

    await act(async () => {
      await result.current.sendText('当前文本轮');
    });

    await act(async () => {
      emitEngineStart('text-session-disorder');
      mockDialogListener?.({ type: 'engine_stop', sessionId: 'text-session-disorder' });
      mockDialogListener?.({
        type: 'chat_final',
        text: '乱序晚到回复',
        sessionId: 'text-session-disorder',
      });
    });

    await waitFor(() => {
      expect(result.current.messages.some((message) => message.content === '乱序晚到回复')).toBe(false);
      expect(result.current.status).toBe('idle');
    });
  });

  it('ignores stale engine_start events that arrive after a new session is active', async () => {
    const { result } = renderHook(() => useTextChat());

    await waitFor(() => {
      expect(result.current.activeConversationId).not.toBeNull();
    });

    await act(async () => {
      await result.current.sendText('当前文本轮');
    });

    await act(async () => {
      emitEngineStart('text-session-current');
      mockDialogListener?.({ type: 'engine_start', sessionId: 'text-session-stale' });
      mockDialogListener?.({ type: 'chat_final', text: '当前会话回复', sessionId: 'text-session-current' });
    });

    await waitFor(() => {
      expect(result.current.messages.some((message) => message.role === 'assistant' && message.content === '当前会话回复')).toBe(true);
      expect(result.current.status).toBe('idle');
    });
  });

  it('does not relatch a retired session when stale engine_start arrives before the new session starts', async () => {
    const { result } = renderHook(() => useTextChat());

    await waitFor(() => {
      expect(result.current.activeConversationId).not.toBeNull();
    });

    await act(async () => {
      await result.current.toggleVoice();
    });

    await act(async () => {
      emitEngineStart('voice-session-retired');
      mockDialogListener?.({ type: 'asr_start', sessionId: 'voice-session-retired' });
    });

    await waitFor(() => {
      expect(result.current.voiceRuntimeHint).toBe('正在听你说');
    });

    await act(async () => {
      await result.current.sendText('切到文本轮');
    });

    await act(async () => {
      mockDialogListener?.({ type: 'engine_start', sessionId: 'voice-session-retired' });
      emitEngineStart('text-session-current');
      mockDialogListener?.({ type: 'chat_final', text: '当前会话回复', sessionId: 'text-session-current' });
    });

    await waitFor(() => {
      expect(result.current.messages.some((message) => message.role === 'assistant' && message.content === '当前会话回复')).toBe(true);
      expect(result.current.status).toBe('idle');
    });
  });
});
