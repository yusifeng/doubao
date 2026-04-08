import { act, renderHook, waitFor } from '@testing-library/react-native';
import { useTextChat } from '../useTextChat';

function createDeferred<T>() {
  let resolve: ((value: T) => void) | null = null;
  const promise = new Promise<T>((innerResolve) => {
    resolve = innerResolve;
  });
  return {
    promise,
    resolve: (value: T) => {
      resolve?.(value);
    },
  };
}

const mockStartCapture = jest.fn<Promise<void>, [((frame: Uint8Array) => Promise<void> | void)?]>();
const mockStopCapture = jest.fn<Promise<void>, []>();
const mockStopPlayback = jest.fn<Promise<void>, []>();
const mockAbortRecognition = jest.fn<Promise<void>, []>();
const mockConnect = jest.fn<Promise<void>, []>();
const mockStartSession = jest.fn<Promise<void>, []>();
const mockFinishSession = jest.fn<Promise<void>, []>();
const mockFinishConnection = jest.fn<Promise<void>, []>();
const mockInterrupt = jest.fn<Promise<void>, []>();
const mockDisconnect = jest.fn<Promise<void>, []>();
const mockSendTextQuery = jest.fn<
  Promise<string | null>,
  [string, { onPartialText?: (text: string) => void }?]
>();
const mockSendAudioFrame = jest.fn<Promise<void>, [Uint8Array]>();
const mockWaitForAssistantAudioChunk = jest.fn<Promise<Uint8Array | null>, [number]>();
const mockWaitForAssistantText = jest.fn<Promise<string | null>, [number]>();
const mockGenerateReplyStream = jest.fn();
let latestCaptureCallback: ((frame: Uint8Array) => Promise<void> | void) | undefined;
const runtimeConfig = {
  replyChainMode: 'official_s2s' as const,
  replyStreamMode: 'auto' as const,
  llm: {
    baseUrl: '',
    apiKey: '',
    model: '',
    provider: 'openai-compatible',
  },
  s2s: {
    appId: '',
    accessToken: '',
    wsUrl: '',
  },
  persona: {
    activeRoleId: 'persona-default-konan',
    roles: [
      {
        id: 'persona-default-konan',
        name: '江户川柯南',
        systemPrompt: 'persisted persona prompt',
        source: 'default' as const,
      },
    ],
    systemPrompt: 'persisted persona prompt',
    source: 'default' as const,
  },
  androidDialog: {
    appKeyOverride: '',
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
      startCapture: mockStartCapture,
      stopCapture: mockStopCapture,
      stopPlayback: mockStopPlayback,
      abortRecognition: mockAbortRecognition,
      startRecognition: jest.fn(),
      stopRecognition: jest.fn(),
      waitForRecognitionResult: jest.fn(),
      consumeCapturedAudioFrame: jest.fn(),
      play: jest.fn(),
      speak: jest.fn(),
    },
    s2s: {
      connect: mockConnect,
      startSession: mockStartSession,
      finishSession: mockFinishSession,
      finishConnection: mockFinishConnection,
      interrupt: mockInterrupt,
      disconnect: mockDisconnect,
      sendAudioFrame: mockSendAudioFrame,
      sendTextQuery: mockSendTextQuery,
      waitForAssistantAudioChunk: mockWaitForAssistantAudioChunk,
      waitForAssistantText: mockWaitForAssistantText,
    },
    dialogEngine: {
      isSupported: () => false,
      prepare: jest.fn(),
      startConversation: jest.fn(),
      stopConversation: jest.fn(),
      pauseTalking: jest.fn(),
      resumeTalking: jest.fn(),
      interruptCurrentDialog: jest.fn(),
      sendTextQuery: jest.fn(),
      useClientTriggeredTts: jest.fn(),
      useServerTriggeredTts: jest.fn(),
      streamClientTtsText: jest.fn(),
      setListener: jest.fn(),
      destroy: jest.fn(),
    },
    reply: {
      generateReplyStream: mockGenerateReplyStream,
    },
    observability: {
      log: jest.fn(),
    },
    audit: {
      record: jest.fn(),
    },
  }),
}));

jest.mock('../../config/env', () => ({
  readVoicePipelineMode: () => 'realtime_audio',
  readS2SEnv: () => null,
  readLLMEnv: () => null,
  readReplyChainMode: () => 'official_s2s',
  readReplyStreamMode: () => 'auto',
  maskSecret: (value: string) => value,
}));

jest.mock('../../repo/runtimeConfigRepo', () => ({
  getEffectiveRuntimeConfig: jest.fn(async () => runtimeConfig),
  saveRuntimeConfig: jest.fn(async (nextConfig) => nextConfig),
  buildRuntimeConfigForSave: jest.fn((currentConfig, draft) => ({
    ...currentConfig,
    ...draft,
  })),
  validateRuntimeConfigForSave: jest.fn(() => []),
}));

describe('useTextChat realtime lifecycle lock', () => {
  const originalNodeEnv = process.env.NODE_ENV;

  beforeEach(() => {
    jest.clearAllMocks();
    const runtimeConfigRepoModule = jest.requireMock('../../repo/runtimeConfigRepo') as {
      getEffectiveRuntimeConfig: jest.Mock;
    };
    runtimeConfigRepoModule.getEffectiveRuntimeConfig.mockImplementation(async () => runtimeConfig);
    process.env.NODE_ENV = 'development';
    mockStartCapture.mockImplementation(
      (onFrame) => {
        latestCaptureCallback = onFrame;
        return new Promise((resolve) => {
          setTimeout(resolve, 30);
        });
      },
    );
    mockStopCapture.mockResolvedValue();
    mockStopPlayback.mockResolvedValue();
    mockAbortRecognition.mockResolvedValue();
    mockConnect.mockResolvedValue();
    mockStartSession.mockResolvedValue();
    mockFinishSession.mockResolvedValue();
    mockFinishConnection.mockResolvedValue();
    mockInterrupt.mockResolvedValue();
    mockDisconnect.mockResolvedValue();
    mockSendTextQuery.mockResolvedValue('S2S测试回复');
    mockSendAudioFrame.mockResolvedValue();
    mockWaitForAssistantAudioChunk.mockResolvedValue(null);
    mockWaitForAssistantText.mockResolvedValue(null);
    mockGenerateReplyStream.mockImplementation(async function* generateReplyStream() {
      yield '测试回复';
    });
  });

  afterEach(() => {
    latestCaptureCallback = undefined;
  });

  afterAll(() => {
    process.env.NODE_ENV = originalNodeEnv;
  });

  it('prevents concurrent realtime start pipelines', async () => {
    const { result } = renderHook(() => useTextChat());

    await waitFor(() => {
      expect(result.current.activeConversationId).not.toBeNull();
    });

    await act(async () => {
      await Promise.all([
        result.current.toggleVoice(),
        result.current.toggleVoice(),
      ]);
    });

    expect(mockConnect).toHaveBeenCalledTimes(1);
    expect(mockStartSession).toHaveBeenCalledTimes(1);
    expect(mockStartCapture).toHaveBeenCalledTimes(1);
    await waitFor(() => {
      expect(result.current.isVoiceActive).toBe(true);
    });
  });

  it('bootstraps default conversation with hydrated persona prompt snapshot', async () => {
    const { result } = renderHook(() => useTextChat());

    await waitFor(() => {
      expect(result.current.activeConversationId).not.toBeNull();
    });

    expect(result.current.conversations[0]?.systemPromptSnapshot).toBe('persisted persona prompt');
  });

  it('blocks text send when official_s2s config is incomplete and does not fallback to other chains', async () => {
    const { result } = renderHook(() => useTextChat());

    await waitFor(() => {
      expect(result.current.activeConversationId).not.toBeNull();
    });

    await act(async () => {
      await result.current.sendText('官方链路配置缺失');
    });

    await waitFor(() => {
      expect(
        result.current.messages.some(
          (message) =>
            message.role === 'assistant' &&
            message.content === '当前 official_s2s 配置不完整，请补全 App ID / Access Token 后重试。',
        ),
      ).toBe(true);
    });
    expect(result.current.messages.some((message) => message.role === 'user' && message.content === '官方链路配置缺失')).toBe(false);
    expect(mockGenerateReplyStream).not.toHaveBeenCalled();
    expect(mockSendTextQuery).not.toHaveBeenCalled();
  });

  it('blocks text send when custom_llm config is incomplete and does not fallback to official/local reply', async () => {
    const runtimeConfigRepoModule = jest.requireMock('../../repo/runtimeConfigRepo') as {
      getEffectiveRuntimeConfig: jest.Mock;
    };
    runtimeConfigRepoModule.getEffectiveRuntimeConfig.mockResolvedValueOnce({
      ...runtimeConfig,
      replyChainMode: 'custom_llm',
      llm: {
        baseUrl: '',
        apiKey: '',
        model: '',
        provider: 'openai-compatible',
      },
    });

    const { result } = renderHook(() => useTextChat());

    await waitFor(() => {
      expect(result.current.activeConversationId).not.toBeNull();
    });

    await act(async () => {
      await result.current.sendText('custom链路配置缺失');
    });

    await waitFor(() => {
      expect(
        result.current.messages.some(
          (message) =>
            message.role === 'assistant' &&
            message.content === '当前 custom_llm 配置不完整，请补全 Base URL / API Key / Model 后重试。',
        ),
      ).toBe(true);
    });
    expect(result.current.messages.some((message) => message.role === 'user' && message.content === 'custom链路配置缺失')).toBe(false);
    expect(mockGenerateReplyStream).not.toHaveBeenCalled();
    expect(mockSendTextQuery).not.toHaveBeenCalled();
  });

  it('uses official_s2s partial stream text as final fallback when final snapshot is missing', async () => {
    const runtimeConfigRepoModule = jest.requireMock('../../repo/runtimeConfigRepo') as {
      getEffectiveRuntimeConfig: jest.Mock;
    };
    runtimeConfigRepoModule.getEffectiveRuntimeConfig.mockResolvedValueOnce({
      ...runtimeConfig,
      s2s: {
        appId: 'test-app-id',
        accessToken: 'test-token',
        wsUrl: 'wss://example.com/realtime/dialogue',
      },
      replyStreamMode: 'auto',
    });
    mockSendTextQuery.mockImplementationOnce(async (_text, options) => {
      options?.onPartialText?.('这是流式');
      options?.onPartialText?.('这是流式回复');
      return null;
    });

    const { result } = renderHook(() => useTextChat());

    await waitFor(() => {
      expect(result.current.activeConversationId).not.toBeNull();
    });

    await act(async () => {
      await result.current.sendText('官方流式回退测试');
    });

    await waitFor(() => {
      expect(
        result.current.messages.some(
          (message) => message.role === 'assistant' && message.content === '这是流式回复',
        ),
      ).toBe(true);
    });
    expect(mockSendTextQuery).toHaveBeenCalledWith(
      '官方流式回退测试',
      expect.objectContaining({
        onPartialText: expect.any(Function),
      }),
    );
  });

  it('uses hydrated persona snapshot when creating conversation before bootstrap hydration', async () => {
    const runtimeConfigRepoModule = jest.requireMock('../../repo/runtimeConfigRepo') as {
      getEffectiveRuntimeConfig: jest.Mock;
    };
    const delayedHydration = createDeferred<typeof runtimeConfig>();
    runtimeConfigRepoModule.getEffectiveRuntimeConfig.mockReset();
    runtimeConfigRepoModule.getEffectiveRuntimeConfig
      .mockImplementationOnce(() => delayedHydration.promise)
      .mockImplementationOnce(async () => ({
        ...runtimeConfig,
        persona: {
          activeRoleId: 'persona-legacy-custom',
          roles: [
            {
              id: 'persona-default-konan',
              name: '江户川柯南',
              systemPrompt: 'persisted persona prompt',
              source: 'default' as const,
            },
            {
              id: 'persona-legacy-custom',
              name: '我的角色',
              systemPrompt: 'late hydrated persona prompt',
              source: 'custom' as const,
            },
          ],
          systemPrompt: 'late hydrated persona prompt',
          source: 'custom' as const,
        },
      }));

    const { result } = renderHook(() => useTextChat());

    await act(async () => {
      await result.current.createConversation('抢先会话');
    });

    expect(result.current.conversations[0]?.systemPromptSnapshot).toBe('late hydrated persona prompt');
    delayedHydration.resolve(runtimeConfig);
  });

  it('does not create default conversation after hydration if user already created one', async () => {
    const runtimeConfigRepoModule = jest.requireMock('../../repo/runtimeConfigRepo') as {
      getEffectiveRuntimeConfig: jest.Mock;
    };
    const delayedHydration = createDeferred<typeof runtimeConfig>();
    runtimeConfigRepoModule.getEffectiveRuntimeConfig.mockReset();
    runtimeConfigRepoModule.getEffectiveRuntimeConfig
      .mockImplementationOnce(() => delayedHydration.promise)
      .mockImplementationOnce(async () => ({
        ...runtimeConfig,
        persona: {
          activeRoleId: 'persona-legacy-custom',
          roles: [
            {
              id: 'persona-default-konan',
              name: '江户川柯南',
              systemPrompt: 'persisted persona prompt',
              source: 'default' as const,
            },
            {
              id: 'persona-legacy-custom',
              name: '我的角色',
              systemPrompt: 'late hydrated persona prompt',
              source: 'custom' as const,
            },
          ],
          systemPrompt: 'late hydrated persona prompt',
          source: 'custom' as const,
        },
      }));

    const { result } = renderHook(() => useTextChat());

    let createdConversationId = '';
    await act(async () => {
      createdConversationId = await result.current.createConversation('抢先会话');
    });
    expect(result.current.activeConversationId).toBe(createdConversationId);

    await act(async () => {
      delayedHydration.resolve(runtimeConfig);
      await Promise.resolve();
    });

    await waitFor(() => {
      expect(result.current.conversations).toHaveLength(1);
      expect(result.current.conversations[0]?.title).toBe('抢先会话');
      expect(result.current.activeConversationId).toBe(createdConversationId);
    });
  });

  it('uses the latest saved persona snapshot when creating a conversation immediately after save', async () => {
    const { result } = renderHook(() => useTextChat());

    await waitFor(() => {
      expect(result.current.activeConversationId).not.toBeNull();
    });

    const nextPersonaPrompt = 'newly selected persona prompt';

    await act(async () => {
      await result.current.saveRuntimeConfig({
        persona: {
          activeRoleId: 'persona-custom-latest',
          roles: [
            {
              id: 'persona-default-konan',
              name: '江户川柯南',
              systemPrompt: 'persisted persona prompt',
              source: 'default',
            },
            {
              id: 'persona-custom-latest',
              name: '新角色',
              systemPrompt: nextPersonaPrompt,
              source: 'custom',
            },
          ],
          systemPrompt: nextPersonaPrompt,
          source: 'custom',
        },
      });
      await result.current.createConversation('新角色会话');
    });

    expect(result.current.conversations[0]?.title).toBe('新角色会话');
    expect(result.current.conversations[0]?.systemPromptSnapshot).toBe(nextPersonaPrompt);
  });

});
