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
    observability: {
      log: jest.fn(),
    },
  }),
}));

jest.mock('../../config/env', () => ({
  readVoicePipelineMode: () => 'realtime_audio',
  readS2SEnv: () => null,
  maskSecret: (value: string) => value,
}));

describe('useTextChat realtime lifecycle lock', () => {
  const originalNodeEnv = process.env.NODE_ENV;

  beforeEach(() => {
    jest.clearAllMocks();
    process.env.NODE_ENV = 'development';
    mockStartCapture.mockImplementation(
      () =>
        new Promise((resolve) => {
          setTimeout(resolve, 30);
        }),
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
});
