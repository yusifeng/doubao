import { act, renderHook, waitFor } from '@testing-library/react-native';
import { useTextChat } from '../useTextChat';

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
      sendTextQuery: jest.fn(),
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

jest.mock('../../config/runtimeConfigRepo', () => ({
  getEffectiveRuntimeConfig: jest.fn(async () => runtimeConfig),
  saveRuntimeConfig: jest.fn(async (nextConfig) => nextConfig),
  buildRuntimeConfigForSave: jest.fn((currentConfig, draft) => ({
    ...currentConfig,
    ...draft,
  })),
  validateRuntimeConfigForSave: jest.fn(() => []),
}));

describe('useTextChat realtime silence gate', () => {
  const originalNodeEnv = process.env.NODE_ENV;

  beforeEach(() => {
    jest.clearAllMocks();
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

  it('drops sustained low-energy frames before upstream send', async () => {
    const { result } = renderHook(() => useTextChat());

    await waitFor(() => {
      expect(result.current.activeConversationId).not.toBeNull();
    });

    await act(async () => {
      await result.current.toggleVoice();
    });

    await waitFor(() => {
      expect(typeof latestCaptureCallback).toBe('function');
    });

    const callback = latestCaptureCallback as (frame: Uint8Array) => Promise<void>;
    const silentFrame = new Uint8Array(3200);
    const speechFrame = new Uint8Array(3200);
    speechFrame[0] = 0xff;
    speechFrame[1] = 0x1f;

    await act(async () => {
      for (let index = 0; index < 12; index += 1) {
        await callback(silentFrame);
      }
      await callback(speechFrame);
    });

    expect(mockSendAudioFrame).toHaveBeenCalledTimes(3);
    expect(mockSendAudioFrame).toHaveBeenLastCalledWith(speechFrame);
  });

  it('creates a local mute window after speech tails into sustained silence', async () => {
    const { result } = renderHook(() => useTextChat());

    await waitFor(() => {
      expect(result.current.activeConversationId).not.toBeNull();
    });

    await act(async () => {
      await result.current.toggleVoice();
    });

    await waitFor(() => {
      expect(typeof latestCaptureCallback).toBe('function');
    });
    expect(result.current.voiceRuntimeHint).toBe('正在听你说');

    const callback = latestCaptureCallback as (frame: Uint8Array) => Promise<void>;
    const silentFrame = new Uint8Array(3200);
    const speechFrame = new Uint8Array(3200);
    speechFrame[0] = 0xff;
    speechFrame[1] = 0x1f;

    const nowSpy = jest.spyOn(Date, 'now');
    let nowMs = 1000;
    nowSpy.mockImplementation(() => nowMs);

    await act(async () => {
      await callback(speechFrame);
      nowMs += 67;
      await callback(speechFrame);
      nowMs += 67;
      await callback(speechFrame);
      nowMs += 67;
      await callback(speechFrame);
      for (let index = 0; index < 9; index += 1) {
        nowMs += 67;
        await callback(silentFrame);
      }
    });

    await waitFor(() => {
      expect(result.current.voiceRuntimeHint).toBe('已发送，等待回复');
    });
    expect(mockSendAudioFrame).toHaveBeenCalledTimes(6);

    await act(async () => {
      nowMs += 67;
      await callback(speechFrame);
    });

    expect(mockSendAudioFrame).toHaveBeenCalledTimes(6);

    await act(async () => {
      nowMs += 1300;
      await callback(speechFrame);
      nowMs += 67;
      await callback(speechFrame);
      nowMs += 67;
      await callback(speechFrame);
      nowMs += 67;
      await callback(speechFrame);
    });

    expect(mockSendAudioFrame).toHaveBeenCalledTimes(10);
    expect(mockSendAudioFrame).toHaveBeenLastCalledWith(speechFrame);
    await waitFor(() => {
      expect(result.current.voiceRuntimeHint).toBe('已听到你在说话');
    });
    nowSpy.mockRestore();
  });
});
