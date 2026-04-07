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

function emitPlayerStart(sessionId: string) {
  mockDialogListener?.({ type: 'player_start', sessionId });
}

function emitPlayerFinish(sessionId: string) {
  mockDialogListener?.({ type: 'player_finish', sessionId });
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

describe('useTextChat android dialog sdk flow', () => {
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

  it('uses dialog sdk for android text rounds', async () => {
    const { result } = renderHook(() => useTextChat());

    await waitFor(() => {
      expect(result.current.activeConversationId).not.toBeNull();
    });

    await act(async () => {
      await result.current.sendText('测试文字模式');
    });

    expect(mockDialogPrepare).toHaveBeenCalledTimes(1);
    expect(mockDialogPrepare).toHaveBeenCalledWith({ dialogWorkMode: 'default' });
    expect(mockDialogStartConversation).toHaveBeenCalledTimes(1);
    expect(mockDialogStartConversation).toHaveBeenCalledWith(
      expect.objectContaining({
        inputMode: 'text',
        characterManifest: 'default prompt',
      }),
    );
    expect(mockDialogSendTextQuery).toHaveBeenCalledWith('测试文字模式');
    expect(result.current.messages.some((message) => message.role === 'user' && message.content === '测试文字模式')).toBe(true);

    await act(async () => {
      const sessionId = emitEngineStart('text-session-1');
      mockDialogListener?.({ type: 'chat_partial', text: '这是服务端', sessionId });
      mockDialogListener?.({ type: 'chat_final', text: '这是服务端回复', sessionId });
    });

    await waitFor(() => {
      expect(result.current.messages.some((message) => message.role === 'assistant' && message.content === '这是服务端回复')).toBe(true);
    });
    expect(mockDialogStopConversation).toHaveBeenCalledTimes(1);
  });

  it('waits for in-flight voice lifecycle before running android text rounds', async () => {
    let resolveStartConversation: (() => void) | null = null;
    mockDialogStartConversation.mockImplementationOnce(
      () =>
        new Promise<void>((resolve) => {
          resolveStartConversation = resolve;
        }),
    );

    const { result } = renderHook(() => useTextChat());

    await waitFor(() => {
      expect(result.current.activeConversationId).not.toBeNull();
    });

    let startVoicePromise: Promise<void> | null = null;
    await act(async () => {
      startVoicePromise = result.current.toggleVoice();
      await Promise.resolve();
    });

    let sendTextPromise: Promise<void> | null = null;
    await act(async () => {
      sendTextPromise = result.current.sendText('并发文本轮');
      await Promise.resolve();
    });

    expect(mockDialogStartConversation).toHaveBeenCalledTimes(1);
    expect(mockDialogSendTextQuery).not.toHaveBeenCalled();

    await act(async () => {
      resolveStartConversation?.();
      if (startVoicePromise) {
        await startVoicePromise;
      }
      if (sendTextPromise) {
        await sendTextPromise;
      }
    });

    expect(mockDialogStartConversation).toHaveBeenCalledTimes(2);
    expect(mockDialogSendTextQuery).toHaveBeenCalledWith('并发文本轮');
    expect(
      result.current.messages.some((message) => message.role === 'user' && message.content === '并发文本轮'),
    ).toBe(true);
  });

  it('maps sdk asr events into realtime transcript and final user message', async () => {
    const { result } = renderHook(() => useTextChat());

    await waitFor(() => {
      expect(result.current.activeConversationId).not.toBeNull();
    });

    await act(async () => {
      await result.current.toggleVoice();
    });

    expect(result.current.isVoiceActive).toBe(true);
    expect(result.current.voiceRuntimeHint).toBe('正在听你说');
    expect(typeof mockDialogListener).toBe('function');

    await act(async () => {
      const sessionId = emitEngineStart('voice-session-1');
      mockDialogListener?.({ type: 'asr_start', sessionId });
      mockDialogListener?.({ type: 'asr_partial', text: '你好', sessionId });
    });

    await waitFor(() => {
      expect(result.current.liveUserTranscript).toBe('你好');
      expect(result.current.voiceRuntimeHint).toBe('已听到你在说话');
    });

    await act(async () => {
      mockDialogListener?.({ type: 'asr_final', text: '你好', sessionId: 'voice-session-1' });
    });

    await waitFor(() => {
      expect(result.current.messages.some((message) => message.role === 'user' && message.content === '你好')).toBe(true);
      expect(result.current.voiceRuntimeHint).toBe('已发送，等待回复');
    });

    await act(async () => {
      mockDialogListener?.({ type: 'chat_partial', text: '这是服务端', sessionId: 'voice-session-1' });
      mockDialogListener?.({ type: 'chat_final', text: '这是服务端回复', sessionId: 'voice-session-1' });
    });

    await waitFor(() => {
      expect(result.current.messages.some((message) => message.role === 'assistant' && message.content === '这是服务端回复')).toBe(true);
      expect(result.current.voiceRuntimeHint).toBe('正在听你说');
    });
  });

  it('records audit events with trace and sdk ids for one platform reply turn', async () => {
    const { result } = renderHook(() => useTextChat());

    await waitFor(() => {
      expect(result.current.activeConversationId).not.toBeNull();
    });

    await act(async () => {
      await result.current.toggleVoice();
    });

    const sessionId = 'voice-session-audit-1';
    await act(async () => {
      emitEngineStart(sessionId);
      mockDialogListener?.({
        type: 'asr_start',
        sessionId,
        questionId: 'q-42',
        traceId: 'sdk-trace-42',
      });
      mockDialogListener?.({
        type: 'asr_partial',
        sessionId,
        text: '你是柯南吗',
        questionId: 'q-42',
      });
      mockDialogListener?.({
        type: 'asr_final',
        sessionId,
        text: '你是柯南吗',
        questionId: 'q-42',
      });
      mockDialogListener?.({
        type: 'chat_partial',
        sessionId,
        text: '当然',
        questionId: 'q-42',
        replyId: 'r-42',
      });
      mockDialogListener?.({
        type: 'chat_final',
        sessionId,
        text: '当然，我是江户川柯南。',
        questionId: 'q-42',
        replyId: 'r-42',
      });
    });

    await waitFor(() => {
      expect(
        result.current.messages.some(
          (message) => message.role === 'assistant' && message.content === '当然，我是江户川柯南。',
        ),
      ).toBe(true);
    });

    const auditEvents = mockAuditRecord.mock.calls.map((call) => call[0]);
    const stages = auditEvents.map((event) => event.stage);
    expect(stages).toEqual(
      expect.arrayContaining(['turn.started', 'turn.user_final', 'reply.platform.partial', 'reply.platform.final']),
    );

    const replyFinalAudit = auditEvents.find((event) => event.stage === 'reply.platform.final');
    expect(replyFinalAudit).toEqual(
      expect.objectContaining({
        traceId: expect.any(String),
        questionId: 'q-42',
        replyId: 'r-42',
      }),
    );
  });

  it('keeps speaking until player_finish even after chat_final is received', async () => {
    const { result } = renderHook(() => useTextChat());

    await waitFor(() => {
      expect(result.current.activeConversationId).not.toBeNull();
    });

    await act(async () => {
      await result.current.toggleVoice();
    });

    const sessionId = 'voice-session-player-lifecycle';
    await act(async () => {
      emitEngineStart(sessionId);
      mockDialogListener?.({ type: 'asr_start', sessionId });
      mockDialogListener?.({ type: 'asr_partial', text: '你好', sessionId });
      mockDialogListener?.({ type: 'asr_final', text: '你好', sessionId });
      mockDialogListener?.({ type: 'chat_partial', text: '这是服务端播报中', sessionId });
      emitPlayerStart(sessionId);
    });

    await waitFor(() => {
      expect(result.current.voiceRuntimeHint).toBe('助手播报中，稍后继续听');
    });

    await act(async () => {
      mockDialogListener?.({ type: 'chat_final', text: '这是服务端播报中', sessionId });
    });

    await waitFor(() => {
      expect(result.current.voiceRuntimeHint).toBe('助手播报中，稍后继续听');
    });

    await act(async () => {
      emitPlayerFinish(sessionId);
    });

    await waitFor(() => {
      expect(result.current.voiceRuntimeHint).toBe('正在听你说');
    });
  });

  it('does not fall back to listening while speaking when barge-in interrupt is still in-flight', async () => {
    let resolveInterrupt: (() => void) | null = null;
    mockDialogInterruptCurrentDialog.mockImplementationOnce(
      () =>
        new Promise<void>((resolve) => {
          resolveInterrupt = resolve;
        }),
    );

    const { result } = renderHook(() => useTextChat());

    await waitFor(() => {
      expect(result.current.activeConversationId).not.toBeNull();
    });

    await act(async () => {
      await result.current.toggleVoice();
    });

    const sessionId = 'voice-session-speaking-guard';
    await act(async () => {
      emitEngineStart(sessionId);
      mockDialogListener?.({ type: 'asr_start', sessionId });
      mockDialogListener?.({ type: 'asr_partial', text: '第一句', sessionId });
      mockDialogListener?.({ type: 'asr_final', text: '第一句', sessionId });
      mockDialogListener?.({ type: 'chat_partial', text: '助手正在播报中', sessionId });
      emitPlayerStart(sessionId);
    });

    await waitFor(() => {
      expect(result.current.voiceRuntimeHint).toBe('助手播报中，稍后继续听');
    });

    await act(async () => {
      mockDialogListener?.({ type: 'asr_start', sessionId });
      mockDialogListener?.({ type: 'asr_partial', text: '误触发插话', sessionId });
    });

    await waitFor(() => {
      expect(mockDialogInterruptCurrentDialog).toHaveBeenCalledTimes(1);
      expect(result.current.voiceRuntimeHint).toBe('助手播报中，稍后继续听');
    });

    await act(async () => {
      resolveInterrupt?.();
      await Promise.resolve();
    });
  });

  it('persists streamed assistant draft when hanging up before chat_final arrives', async () => {
    const { result } = renderHook(() => useTextChat());

    await waitFor(() => {
      expect(result.current.activeConversationId).not.toBeNull();
    });

    await act(async () => {
      await result.current.toggleVoice();
    });

    await act(async () => {
      const sessionId = emitEngineStart('voice-session-hangup-draft');
      mockDialogListener?.({ type: 'asr_start', sessionId });
      mockDialogListener?.({ type: 'asr_partial', text: '你好', sessionId });
      mockDialogListener?.({ type: 'asr_final', text: '你好', sessionId });
      mockDialogListener?.({ type: 'chat_partial', text: '这条回复已播报但尚未收到final事件', sessionId });
    });

    await waitFor(() => {
      expect(result.current.pendingAssistantReply).toBe('这条回复已播报但尚未收到final事件');
      expect(result.current.voiceRuntimeHint).toBe('助手播报中，稍后继续听');
    });

    await act(async () => {
      await result.current.toggleVoice();
    });

    await waitFor(() => {
      expect(result.current.isVoiceActive).toBe(false);
      expect(result.current.pendingAssistantReply).toBe('');
      expect(
        result.current.messages.some(
          (message) =>
            message.role === 'assistant' &&
            message.content === '这条回复已播报但尚未收到final事件',
        ),
      ).toBe(true);
    });

    await act(async () => {
      mockDialogListener?.({
        type: 'chat_final',
        text: '这条回复已播报但尚未收到final事件',
        sessionId: 'voice-session-hangup-draft',
      });
    });

    const persistedDraftMessages = result.current.messages.filter(
      (message) =>
        message.role === 'assistant' &&
        message.content === '这条回复已播报但尚未收到final事件',
    );
    expect(persistedDraftMessages).toHaveLength(1);
  });

  it('finalizes assistant text from streamed partial deltas even when chat_final text is empty', async () => {
    const { result } = renderHook(() => useTextChat());

    await waitFor(() => {
      expect(result.current.activeConversationId).not.toBeNull();
    });

    await act(async () => {
      await result.current.toggleVoice();
    });

    await act(async () => {
      const sessionId = emitEngineStart('voice-session-2');
      mockDialogListener?.({ type: 'asr_start', sessionId });
      mockDialogListener?.({ type: 'asr_partial', text: '你好', sessionId });
      mockDialogListener?.({ type: 'asr_final', text: '你好', sessionId });
      mockDialogListener?.({ type: 'chat_partial', text: '这是', sessionId });
      mockDialogListener?.({ type: 'chat_partial', text: '流式', sessionId });
      mockDialogListener?.({ type: 'chat_partial', text: '助手回复', sessionId });
      mockDialogListener?.({ type: 'chat_final', text: '', sessionId });
    });

    await waitFor(() => {
      expect(
        result.current.messages.some(
          (message) => message.role === 'assistant' && message.content === '这是流式助手回复',
        ),
      ).toBe(true);
      expect(result.current.voiceRuntimeHint).toBe('正在听你说');
    });
  });

  it('deduplicates repeated chat_final events for the same platform reply turn', async () => {
    const { result } = renderHook(() => useTextChat());

    await waitFor(() => {
      expect(result.current.activeConversationId).not.toBeNull();
    });

    await act(async () => {
      await result.current.toggleVoice();
    });

    await act(async () => {
      const sessionId = emitEngineStart('voice-session-chat-final-dedupe');
      mockDialogListener?.({
        type: 'asr_start',
        sessionId,
        questionId: 'q-dup',
      });
      mockDialogListener?.({
        type: 'asr_partial',
        text: '你好',
        sessionId,
        questionId: 'q-dup',
      });
      mockDialogListener?.({
        type: 'asr_final',
        text: '你好',
        sessionId,
        questionId: 'q-dup',
      });
      mockDialogListener?.({
        type: 'chat_partial',
        text: '这是完整回复',
        sessionId,
        questionId: 'q-dup',
        replyId: 'r-dup',
      });
      mockDialogListener?.({
        type: 'chat_final',
        text: '这是完整回复',
        sessionId,
        questionId: 'q-dup',
        replyId: 'r-dup',
        nativeMessageType: '559',
      });
      mockDialogListener?.({
        type: 'chat_final',
        text: '这是',
        sessionId,
        questionId: 'q-dup',
        replyId: 'r-dup',
        nativeMessageType: '559',
      });
    });

    await waitFor(() => {
      const assistantMessages = result.current.messages.filter((message) => message.role === 'assistant');
      expect(assistantMessages.filter((message) => message.content === '这是完整回复')).toHaveLength(1);
      expect(assistantMessages.some((message) => message.content === '这是')).toBe(false);
    });
  });

  it('merges snapshot-style partials without duplicating assistant text', async () => {
    const { result } = renderHook(() => useTextChat());

    await waitFor(() => {
      expect(result.current.activeConversationId).not.toBeNull();
    });

    await act(async () => {
      await result.current.toggleVoice();
    });

    await act(async () => {
      const sessionId = emitEngineStart('voice-session-2b');
      mockDialogListener?.({ type: 'asr_start', sessionId });
      mockDialogListener?.({ type: 'asr_partial', text: '你好', sessionId });
      mockDialogListener?.({ type: 'asr_final', text: '你好', sessionId });
      mockDialogListener?.({ type: 'chat_partial', text: '这是', sessionId });
      mockDialogListener?.({ type: 'chat_partial', text: '这是流式', sessionId });
      mockDialogListener?.({ type: 'chat_partial', text: '这是流式助手回复', sessionId });
      mockDialogListener?.({ type: 'chat_final', text: '', sessionId });
    });

    await waitFor(() => {
      const assistantMessages = result.current.messages.filter((message) => message.role === 'assistant');
      expect(assistantMessages.some((message) => message.content === '这是流式助手回复')).toBe(true);
      expect(
        assistantMessages.some((message) => message.content === '这是这是流式这是流式助手回复'),
      ).toBe(false);
    });
  });

  it('keeps one stable dialog listener across voice event rerenders', async () => {
    const { result } = renderHook(() => useTextChat());

    await waitFor(() => {
      expect(result.current.activeConversationId).not.toBeNull();
    });

    const initialListenerBindings = mockDialogSetListener.mock.calls.length;
    expect(initialListenerBindings).toBeGreaterThan(0);

    await act(async () => {
      await result.current.toggleVoice();
    });

    await act(async () => {
      const sessionId = emitEngineStart('voice-session-3');
      mockDialogListener?.({ type: 'asr_start', sessionId });
      mockDialogListener?.({ type: 'asr_partial', text: '你好', sessionId });
      mockDialogListener?.({ type: 'asr_final', text: '你好', sessionId });
      mockDialogListener?.({ type: 'chat_partial', text: '这是服务端', sessionId });
      mockDialogListener?.({ type: 'chat_final', text: '这是服务端回复', sessionId });
    });

    await waitFor(() => {
      expect(result.current.messages.some((message) => message.role === 'assistant' && message.content === '这是服务端回复')).toBe(true);
    });

    expect(mockDialogSetListener.mock.calls.length).toBe(initialListenerBindings);
  });

  it('interrupts current android assistant output and returns to listening', async () => {
    const { result } = renderHook(() => useTextChat());

    await waitFor(() => {
      expect(result.current.activeConversationId).not.toBeNull();
    });

    await act(async () => {
      await result.current.toggleVoice();
    });

    await act(async () => {
      const sessionId = emitEngineStart('voice-session-interrupt');
      mockDialogListener?.({ type: 'asr_start', sessionId });
      mockDialogListener?.({ type: 'asr_partial', text: '你好', sessionId });
      mockDialogListener?.({ type: 'asr_final', text: '你好', sessionId });
      mockDialogListener?.({ type: 'chat_partial', text: '这是会被打断的回复', sessionId });
    });

    await waitFor(() => {
      expect(result.current.voiceRuntimeHint).toBe('助手播报中，稍后继续听');
      expect(result.current.pendingAssistantReply).toBe('这是会被打断的回复');
    });

    await act(async () => {
      await result.current.interruptVoiceOutput();
    });

    expect(mockDialogInterruptCurrentDialog).toHaveBeenCalledTimes(1);

    await waitFor(() => {
      expect(result.current.voiceRuntimeHint).toBe('正在听你说');
      expect(result.current.pendingAssistantReply).toBe('');
      expect(
        result.current.messages.some(
          (message) => message.role === 'assistant' && message.content === '这是会被打断的回复',
        ),
      ).toBe(true);
    });

    await act(async () => {
      mockDialogListener?.({
        type: 'chat_final',
        text: '这是会被打断的回复后续内容',
        sessionId: 'voice-session-interrupt',
      });
    });

    expect(
      result.current.messages.some(
        (message) => message.role === 'assistant' && message.content === '这是会被打断的回复后续内容',
      ),
    ).toBe(false);
  });

  it('does not drop assistant output when android interrupt fails', async () => {
    mockDialogInterruptCurrentDialog.mockRejectedValueOnce(new Error('native interrupt failed'));

    const { result } = renderHook(() => useTextChat());

    await waitFor(() => {
      expect(result.current.activeConversationId).not.toBeNull();
    });

    await act(async () => {
      await result.current.toggleVoice();
    });

    await act(async () => {
      const sessionId = emitEngineStart('voice-session-interrupt-fail');
      mockDialogListener?.({ type: 'asr_start', sessionId });
      mockDialogListener?.({ type: 'asr_partial', text: '你好', sessionId });
      mockDialogListener?.({ type: 'asr_final', text: '你好', sessionId });
      mockDialogListener?.({ type: 'chat_partial', text: '这是仍应继续的回复', sessionId });
    });

    await waitFor(() => {
      expect(result.current.pendingAssistantReply).toBe('这是仍应继续的回复');
    });

    await act(async () => {
      await result.current.interruptVoiceOutput();
    });

    expect(mockDialogInterruptCurrentDialog).toHaveBeenCalledTimes(1);

    await act(async () => {
      mockDialogListener?.({
        type: 'chat_final',
        text: '这是仍应继续的回复完整版',
        sessionId: 'voice-session-interrupt-fail',
      });
    });

    await waitFor(() => {
      expect(
        result.current.messages.some(
          (message) => message.role === 'assistant' && message.content === '这是仍应继续的回复完整版',
        ),
      ).toBe(true);
      expect(result.current.pendingAssistantReply).toBe('');
      expect(result.current.voiceRuntimeHint).toBe('正在听你说');
    });
  });

  it('auto interrupts assistant output when user barges in while speaking', async () => {
    const { result } = renderHook(() => useTextChat());

    await waitFor(() => {
      expect(result.current.activeConversationId).not.toBeNull();
    });

    await act(async () => {
      await result.current.toggleVoice();
    });

    await act(async () => {
      const sessionId = emitEngineStart('voice-session-barge-in');
      mockDialogListener?.({ type: 'asr_start', sessionId });
      mockDialogListener?.({ type: 'asr_partial', text: '第一句', sessionId });
      mockDialogListener?.({ type: 'asr_final', text: '第一句', sessionId });
      mockDialogListener?.({ type: 'chat_partial', text: '这是一段正在播报的回复', sessionId });
    });

    await waitFor(() => {
      expect(result.current.voiceRuntimeHint).toBe('助手播报中，稍后继续听');
      expect(result.current.pendingAssistantReply).toBe('这是一段正在播报的回复');
    });

    await act(async () => {
      mockDialogListener?.({ type: 'asr_start', sessionId: 'voice-session-barge-in' });
      mockDialogListener?.({ type: 'asr_partial', text: '用户插话内容', sessionId: 'voice-session-barge-in' });
    });

    await waitFor(() => {
      expect(mockDialogInterruptCurrentDialog).toHaveBeenCalledTimes(1);
      expect(result.current.pendingAssistantReply).toBe('');
      expect(result.current.liveUserTranscript).toBe('用户插话内容');
      expect(result.current.voiceRuntimeHint).toBe('已听到你在说话');
      expect(
        result.current.messages.some(
          (message) => message.role === 'assistant' && message.content === '这是一段正在播报的回复',
        ),
      ).toBe(true);
    });

    await act(async () => {
      mockDialogListener?.({
        type: 'chat_final',
        text: '这是一段正在播报的回复后续内容',
        sessionId: 'voice-session-barge-in',
      });
    });

    expect(
      result.current.messages.some(
        (message) => message.role === 'assistant' && message.content === '这是一段正在播报的回复后续内容',
      ),
    ).toBe(false);
  });

  it('continues with the next assistant reply after auto barge-in interrupt', async () => {
    const { result } = renderHook(() => useTextChat());

    await waitFor(() => {
      expect(result.current.activeConversationId).not.toBeNull();
    });

    await act(async () => {
      await result.current.toggleVoice();
    });

    await act(async () => {
      const sessionId = emitEngineStart('voice-session-barge-in-follow-up');
      mockDialogListener?.({ type: 'asr_start', sessionId });
      mockDialogListener?.({ type: 'asr_partial', text: '第一句', sessionId });
      mockDialogListener?.({ type: 'asr_final', text: '第一句', sessionId });
      mockDialogListener?.({ type: 'chat_partial', text: '这是会被插话打断的播报', sessionId });
    });

    await waitFor(() => {
      expect(result.current.pendingAssistantReply).toBe('这是会被插话打断的播报');
    });

    await act(async () => {
      mockDialogListener?.({ type: 'asr_start', sessionId: 'voice-session-barge-in-follow-up' });
      mockDialogListener?.({ type: 'asr_partial', text: '第二句继续提问', sessionId: 'voice-session-barge-in-follow-up' });
      mockDialogListener?.({ type: 'asr_final', text: '第二句继续提问', sessionId: 'voice-session-barge-in-follow-up' });
      mockDialogListener?.({ type: 'chat_partial', text: '第二轮回复', sessionId: 'voice-session-barge-in-follow-up' });
      mockDialogListener?.({ type: 'chat_final', text: '第二轮回复完成', sessionId: 'voice-session-barge-in-follow-up' });
    });

    await waitFor(() => {
      expect(
        result.current.messages.some(
          (message) => message.role === 'assistant' && message.content === '第二轮回复完成',
        ),
      ).toBe(true);
      expect(result.current.voiceRuntimeHint).toBe('正在听你说');
    });
  });

  it('handles multiple voice turns with platform auto replies', async () => {
    const { result } = renderHook(() => useTextChat());

    await waitFor(() => {
      expect(result.current.activeConversationId).not.toBeNull();
    });

    await act(async () => {
      await result.current.toggleVoice();
    });

    await act(async () => {
      const sessionId = emitEngineStart('voice-session-4');
      mockDialogListener?.({ type: 'asr_start', sessionId });
      mockDialogListener?.({ type: 'asr_partial', text: '第一句', sessionId });
      mockDialogListener?.({ type: 'asr_final', text: '第一句', sessionId });
      mockDialogListener?.({ type: 'chat_partial', text: '第一轮回复', sessionId });
      mockDialogListener?.({ type: 'chat_final', text: '第一轮回复', sessionId });
    });

    await waitFor(() => {
      expect(result.current.messages.some((message) => message.role === 'assistant' && message.content === '第一轮回复')).toBe(true);
    });

    await act(async () => {
      mockDialogListener?.({ type: 'asr_start', sessionId: 'voice-session-4' });
      mockDialogListener?.({ type: 'asr_partial', text: '第二句', sessionId: 'voice-session-4' });
      mockDialogListener?.({ type: 'asr_final', text: '第二句', sessionId: 'voice-session-4' });
      mockDialogListener?.({ type: 'chat_partial', text: '第二轮回复', sessionId: 'voice-session-4' });
      mockDialogListener?.({ type: 'chat_final', text: '第二轮回复', sessionId: 'voice-session-4' });
    });

    await waitFor(() => {
      expect(result.current.messages.some((message) => message.role === 'assistant' && message.content === '第二轮回复')).toBe(true);
    });

    expect(result.current.voiceRuntimeHint).toBe('正在听你说');
  });

  it('tears down voice-call state after a text round finishes in android dialog mode', async () => {
    const { result } = renderHook(() => useTextChat());

    await waitFor(() => {
      expect(result.current.activeConversationId).not.toBeNull();
    });

    await act(async () => {
      await result.current.toggleVoice();
    });

    await act(async () => {
      emitEngineStart('voice-session-5');
      mockDialogListener?.({ type: 'asr_start', sessionId: 'voice-session-5' });
      mockDialogListener?.({ type: 'asr_partial', text: '语音草稿', sessionId: 'voice-session-5' });
    });

    await waitFor(() => {
      expect(result.current.voiceToggleLabel).toBe('挂断通话');
      expect(result.current.liveUserTranscript).toBe('语音草稿');
    });

    await act(async () => {
      await result.current.sendText('切到文本轮');
    });

    await waitFor(() => {
      expect(result.current.liveUserTranscript).toBe('');
    });

    await act(async () => {
      const sessionId = emitEngineStart('text-session-2');
      mockDialogListener?.({ type: 'chat_final', text: '文本轮回复', sessionId });
    });

    await waitFor(() => {
      expect(result.current.messages.some((message) => message.role === 'assistant' && message.content === '文本轮回复')).toBe(true);
      expect(result.current.isVoiceActive).toBe(false);
      expect(result.current.voiceToggleLabel).toBe('开始通话');
      expect(result.current.voiceRuntimeHint).toBe('实时通话未开启');
      expect(result.current.status).toBe('idle');
    });
  });

  it('uses android dialog hints even when env voice pipeline is not realtime audio', async () => {
    mockReadVoicePipelineMode.mockReturnValue('asr_text');

    const { result } = renderHook(() => useTextChat());

    await waitFor(() => {
      expect(result.current.activeConversationId).not.toBeNull();
      expect(result.current.voiceToggleLabel).toBe('开始通话');
      expect(result.current.voiceRuntimeHint).toBe('实时通话未开启');
    });

    await act(async () => {
      await result.current.toggleVoice();
    });

    expect(mockDialogStartConversation).toHaveBeenCalledTimes(1);

    await act(async () => {
      const sessionId = emitEngineStart('voice-session-6');
      mockDialogListener?.({ type: 'asr_start', sessionId });
      mockDialogListener?.({ type: 'asr_partial', text: '我在说话', sessionId });
      mockDialogListener?.({ type: 'asr_final', text: '我在说话', sessionId });
    });

    await waitFor(() => {
      expect(result.current.voiceToggleLabel).toBe('挂断通话');
      expect(result.current.voiceRuntimeHint).toBe('已发送，等待回复');
    });
  });

  it('mutes and unmutes voice input inside the same android dialog session', async () => {
    const { result } = renderHook(() => useTextChat());

    await waitFor(() => {
      expect(result.current.activeConversationId).not.toBeNull();
    });

    await act(async () => {
      await result.current.toggleVoice();
    });

    await act(async () => {
      const sessionId = emitEngineStart('voice-session-mute');
      mockDialogListener?.({ type: 'asr_start', sessionId });
      mockDialogListener?.({ type: 'asr_partial', text: '静音前识别', sessionId });
    });

    await waitFor(() => {
      expect(result.current.liveUserTranscript).toBe('静音前识别');
    });

    await act(async () => {
      await result.current.toggleVoiceInputMuted();
    });

    expect(mockDialogPauseTalking).toHaveBeenCalledTimes(1);
    expect(result.current.isVoiceInputMuted).toBe(true);
    expect(result.current.voiceRuntimeHint).toBe('你已静音');

    await act(async () => {
      mockDialogListener?.({ type: 'asr_start', sessionId: 'voice-session-mute' });
      mockDialogListener?.({ type: 'asr_partial', text: '静音中应忽略', sessionId: 'voice-session-mute' });
      mockDialogListener?.({ type: 'asr_final', text: '静音中应忽略', sessionId: 'voice-session-mute' });
    });

    await waitFor(() => {
      expect(result.current.liveUserTranscript).toBe('');
      expect(
        result.current.messages.some(
          (message) => message.role === 'user' && message.content === '静音中应忽略',
        ),
      ).toBe(false);
    });

    await act(async () => {
      await result.current.toggleVoiceInputMuted();
    });

    expect(mockDialogResumeTalking).toHaveBeenCalledTimes(1);
    expect(result.current.isVoiceInputMuted).toBe(false);
    expect(result.current.voiceRuntimeHint).toBe('正在听你说');
  });

  it('does not restore listening state when mute call resolves after hangup', async () => {
    let resolvePauseTalking: (() => void) | null = null;
    mockDialogPauseTalking.mockImplementationOnce(
      () =>
        new Promise<void>((resolve) => {
          resolvePauseTalking = resolve;
        }),
    );

    const { result } = renderHook(() => useTextChat());

    await waitFor(() => {
      expect(result.current.activeConversationId).not.toBeNull();
    });

    await act(async () => {
      await result.current.toggleVoice();
    });

    await act(async () => {
      emitEngineStart('voice-session-mute-race');
      mockDialogListener?.({ type: 'asr_start', sessionId: 'voice-session-mute-race' });
    });

    let mutePromise: Promise<void> | null = null;
    await act(async () => {
      mutePromise = result.current.toggleVoiceInputMuted();
      await result.current.toggleVoice();
      resolvePauseTalking?.();
      if (mutePromise) {
        await mutePromise;
      }
    });

    await waitFor(() => {
      expect(result.current.isVoiceActive).toBe(false);
      expect(result.current.status).toBe('idle');
      expect(result.current.voiceRuntimeHint).toBe('实时通话未开启');
    });
  });

  it('rolls back optimistic mute flag when pauseTalking fails during call startup', async () => {
    let resolveStartConversation: (() => void) | null = null;
    mockDialogStartConversation.mockImplementationOnce(
      () =>
        new Promise<void>((resolve) => {
          resolveStartConversation = resolve;
        }),
    );
    mockDialogPauseTalking.mockRejectedValueOnce(new Error('pause failed'));

    const { result } = renderHook(() => useTextChat());

    await waitFor(() => {
      expect(result.current.activeConversationId).not.toBeNull();
    });

    let startPromise: Promise<void> | null = null;
    await act(async () => {
      startPromise = result.current.toggleVoice();
      await Promise.resolve();
    });

    await act(async () => {
      await result.current.toggleVoiceInputMuted();
    });

    expect(result.current.isVoiceInputMuted).toBe(false);

    await act(async () => {
      resolveStartConversation?.();
      if (startPromise) {
        await startPromise;
      }
    });
  });

  it('rolls back android voice state when startConversation fails', async () => {
    mockDialogStartConversation.mockRejectedValueOnce(new Error('native start failed'));

    const { result } = renderHook(() => useTextChat());

    await waitFor(() => {
      expect(result.current.activeConversationId).not.toBeNull();
    });

    await act(async () => {
      await result.current.toggleVoice();
    });

    expect(result.current.isVoiceActive).toBe(false);
    expect(result.current.status).toBe('idle');
    expect(result.current.voiceRuntimeHint).toBe('实时通话未开启');
    expect(result.current.connectivityHint).toContain('通话启动失败');
  });

  it('finalizes android text rounds when sendTextQuery fails', async () => {
    mockDialogSendTextQuery.mockRejectedValueOnce(new Error('sdk send failed'));

    const { result } = renderHook(() => useTextChat());

    await waitFor(() => {
      expect(result.current.activeConversationId).not.toBeNull();
    });

    await act(async () => {
      await result.current.sendText('发送失败测试');
    });

    await waitFor(() => {
      expect(
        result.current.messages.some(
          (message) =>
            message.role === 'assistant' && message.content === '本轮文本对话失败，请检查网络后重试。',
        ),
      ).toBe(true);
      expect(result.current.status).toBe('idle');
      expect(result.current.isVoiceActive).toBe(false);
      expect(result.current.voiceRuntimeHint).toBe('实时通话未开启');
    });
    expect(mockDialogStopConversation).toHaveBeenCalledTimes(1);
  });

  it('ignores stale chat events from an old android dialog session', async () => {
    const { result } = renderHook(() => useTextChat());

    await waitFor(() => {
      expect(result.current.activeConversationId).not.toBeNull();
    });

    await act(async () => {
      await result.current.sendText('当前文本轮');
    });

    await act(async () => {
      emitEngineStart('text-session-current');
      mockDialogListener?.({ type: 'chat_final', text: '旧会话回复', sessionId: 'text-session-stale' });
      mockDialogListener?.({ type: 'chat_final', text: '当前会话回复', sessionId: 'text-session-current' });
    });

    await waitFor(() => {
      expect(result.current.messages.some((message) => message.role === 'assistant' && message.content === '当前会话回复')).toBe(true);
      expect(result.current.messages.some((message) => message.role === 'assistant' && message.content === '旧会话回复')).toBe(false);
    });
  });

  it('persists interrupted assistant draft to the original conversation after switching sessions', async () => {
    const { result } = renderHook(() => useTextChat());

    await waitFor(() => {
      expect(result.current.activeConversationId).not.toBeNull();
    });

    const originalConversationId = result.current.activeConversationId as string;
    let anotherConversationId = '';

    await act(async () => {
      anotherConversationId = await result.current.createConversation('另一个会话');
    });

    await act(async () => {
      await result.current.selectConversation(originalConversationId);
    });

    await waitFor(() => {
      expect(result.current.activeConversationId).toBe(originalConversationId);
    });

    await act(async () => {
      await result.current.toggleVoice();
    });

    await act(async () => {
      emitEngineStart('voice-session-draft-owner');
      mockDialogListener?.({ type: 'asr_start', sessionId: 'voice-session-draft-owner' });
      mockDialogListener?.({
        type: 'chat_partial',
        text: '原会话草稿回复',
        sessionId: 'voice-session-draft-owner',
      });
    });

    await waitFor(() => {
      expect(result.current.pendingAssistantReply).toContain('原会话草稿回复');
    });

    await act(async () => {
      await result.current.selectConversation(anotherConversationId);
    });

    await act(async () => {
      await result.current.toggleVoice();
    });

    await act(async () => {
      await result.current.selectConversation(originalConversationId);
    });

    await waitFor(() => {
      expect(
        result.current.messages.some(
          (message) => message.role === 'assistant' && message.content === '原会话草稿回复',
        ),
      ).toBe(true);
    });

    await act(async () => {
      await result.current.selectConversation(anotherConversationId);
    });

    expect(
      result.current.messages.some(
        (message) => message.role === 'assistant' && message.content === '原会话草稿回复',
      ),
    ).toBe(false);
  });

  it('resets call state when the active android engine emits stop', async () => {
    const { result } = renderHook(() => useTextChat());

    await waitFor(() => {
      expect(result.current.activeConversationId).not.toBeNull();
    });

    await act(async () => {
      await result.current.toggleVoice();
    });

    await act(async () => {
      emitEngineStart('voice-session-stop');
      mockDialogListener?.({ type: 'asr_start', sessionId: 'voice-session-stop' });
    });

    await waitFor(() => {
      expect(result.current.voiceToggleLabel).toBe('挂断通话');
      expect(result.current.voiceRuntimeHint).toBe('正在听你说');
    });

    await act(async () => {
      mockDialogListener?.({ type: 'engine_stop', sessionId: 'voice-session-stop' });
    });

    await waitFor(() => {
      expect(result.current.isVoiceActive).toBe(false);
      expect(result.current.voiceToggleLabel).toBe('开始通话');
      expect(result.current.voiceRuntimeHint).toBe('实时通话未开启');
      expect(result.current.status).toBe('idle');
    });
  });

  it('keeps stable state across long round barge-in and voice-text-voice switch', async () => {
    const { result } = renderHook(() => useTextChat());

    await waitFor(() => {
      expect(result.current.activeConversationId).not.toBeNull();
    });

    await act(async () => {
      await result.current.toggleVoice();
    });

    await act(async () => {
      emitEngineStart('voice-session-combo');
      mockDialogListener?.({ type: 'asr_start', sessionId: 'voice-session-combo' });
      mockDialogListener?.({ type: 'asr_final', text: '第一轮问题', sessionId: 'voice-session-combo' });
      mockDialogListener?.({ type: 'chat_partial', text: '第一轮回复进行中', sessionId: 'voice-session-combo' });
      mockDialogListener?.({ type: 'asr_partial', text: '打断', sessionId: 'voice-session-combo' });
      mockDialogListener?.({ type: 'chat_final', text: '第一轮最终回复', sessionId: 'voice-session-combo' });
    });

    await act(async () => {
      await result.current.sendText('切到文本轮');
    });

    await act(async () => {
      emitEngineStart('text-session-combo');
      mockDialogListener?.({ type: 'chat_final', text: '文本轮回复', sessionId: 'text-session-combo' });
    });

    await waitFor(
      () => {
        expect(result.current.messages.some((message) => message.role === 'user' && message.content === '切到文本轮')).toBe(true);
      },
      { timeout: 3000 },
    );

    expect(result.current.status).not.toBe('error');
  });

  it('restores runtime state when chat_final arrives without any usable text', async () => {
    const { result } = renderHook(() => useTextChat());

    await waitFor(() => {
      expect(result.current.activeConversationId).not.toBeNull();
    });

    await act(async () => {
      await result.current.toggleVoice();
    });

    await act(async () => {
      const sessionId = emitEngineStart('voice-session-7');
      mockDialogListener?.({ type: 'asr_start', sessionId });
      mockDialogListener?.({ type: 'asr_partial', text: '你好', sessionId });
      mockDialogListener?.({ type: 'asr_final', text: '你好', sessionId });
      mockDialogListener?.({ type: 'chat_final', text: '', sessionId });
    });

    await waitFor(() => {
      expect(result.current.pendingAssistantReply).toBe('');
      expect(result.current.voiceRuntimeHint).toBe('正在听你说');
      expect(result.current.status).toBe('listening');
    });
  });

  it('ignores empty asr_final results instead of creating blank user turns', async () => {
    const { result } = renderHook(() => useTextChat());

    await waitFor(() => {
      expect(result.current.activeConversationId).not.toBeNull();
    });

    await act(async () => {
      await result.current.toggleVoice();
    });

    await act(async () => {
      const sessionId = emitEngineStart('voice-session-8');
      mockDialogListener?.({ type: 'asr_start', sessionId });
      mockDialogListener?.({ type: 'asr_final', text: '   ', sessionId });
    });

    await waitFor(() => {
      expect(result.current.messages.some((message) => message.role === 'user')).toBe(false);
      expect(result.current.liveUserTranscript).toBe('');
      expect(result.current.voiceRuntimeHint).toBe('正在听你说');
      expect(result.current.status).toBe('listening');
    });
  });
});
