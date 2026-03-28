import { act, renderHook, waitFor } from '@testing-library/react-native';
import { Platform } from 'react-native';
import { useTextChat } from '../useTextChat';

const mockDialogPrepare = jest.fn<Promise<void>, [Record<string, unknown>?]>();
const mockDialogStartConversation = jest.fn<Promise<void>, [unknown]>();
const mockDialogStopConversation = jest.fn<Promise<void>, []>();
const mockDialogPauseTalking = jest.fn<Promise<void>, []>();
const mockDialogResumeTalking = jest.fn<Promise<void>, []>();
const mockDialogInterruptCurrentDialog = jest.fn<Promise<void>, []>();
const mockDialogSendTextQuery = jest.fn<Promise<void>, [string]>();
const mockDialogDestroy = jest.fn<Promise<void>, []>();
const mockDialogSetListener = jest.fn<void, [((event: { type: string; text?: string; sessionId?: string }) => void) | null]>();
const mockAudioSpeak = jest.fn();
const mockObservabilityLog = jest.fn();
let mockDialogListener: ((event: { type: string; text?: string; sessionId?: string }) => void) | null = null;
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
    });

    await waitFor(() => {
      expect(result.current.voiceToggleLabel).toBe('挂断通话');
      expect(result.current.voiceRuntimeHint).toBe('正在听你说');
    });

    await act(async () => {
      await result.current.sendText('切到文本轮');
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
