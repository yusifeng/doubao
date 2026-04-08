import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import type { UseTextChatResult } from '../../../src/features/voice-assistant/runtime/useTextChat';

const mockShowToast = jest.fn();
const mockSaveRuntimeConfig = jest.fn().mockResolvedValue({ ok: true, message: 'saved' });

jest.mock('expo-router', () => ({
  useRouter: () => ({
    back: jest.fn(),
    canGoBack: () => true,
    push: jest.fn(),
    replace: jest.fn(),
  }),
  useNavigation: () => ({
    dispatch: jest.fn(),
  }),
}));

const mockUseVoiceAssistantRuntime = jest.fn<UseTextChatResult, []>();

jest.mock('../../../src/features/voice-assistant/runtime/VoiceAssistantRuntimeProvider', () => ({
  useVoiceAssistantRuntime: () => mockUseVoiceAssistantRuntime(),
}));

jest.mock('../../../src/shared/ui/AppToastProvider', () => ({
  useAppToast: () => ({
    showToast: mockShowToast,
  }),
}));

function createSession(): UseTextChatResult {
  return {
    status: 'idle',
    conversations: [],
    activeConversationId: 'conv-1',
    messages: [],
    liveUserTranscript: '',
    pendingAssistantReply: '',
    createConversation: jest.fn().mockResolvedValue('conv-2'),
    selectConversation: jest.fn().mockResolvedValue(true),
    sendText: jest.fn().mockResolvedValue(undefined),
    isVoiceActive: false,
    supportsVoiceInputMute: true,
    isVoiceInputMuted: false,
    toggleVoice: jest.fn().mockResolvedValue(undefined),
    toggleVoiceInputMuted: jest.fn().mockResolvedValue(undefined),
    interruptVoiceOutput: jest.fn().mockResolvedValue(undefined),
    voiceModeLabel: 'mode',
    textReplySourceLabel: 'source',
    voiceToggleLabel: 'toggle',
    voiceRuntimeHint: 'hint',
    connectivityHint: 'ok',
    runtimeConfig: {
      replyChainMode: 'official_s2s',
      replyStreamMode: 'auto',
      llm: { baseUrl: '', apiKey: '', model: '', provider: 'openai-compatible' },
      s2s: { appId: '', accessToken: '', wsUrl: 'wss://example.com' },
      persona: {
        activeRoleId: 'persona-default-konan',
        roles: [
          {
            id: 'persona-default-konan',
            name: '江户川柯南',
            systemPrompt: '默认角色提示词',
            source: 'default',
          },
        ],
        systemPrompt: '默认角色提示词',
        source: 'default',
      },
      androidDialog: { appKeyOverride: '' },
      voice: {
        speakerId: 'saturn_zh_male_fuheigongzi_tob',
        speakerLabel: '腹黑公子(男)',
        sourceType: 'default',
      },
    },
    saveRuntimeConfig: mockSaveRuntimeConfig,
    testLLMConfig: jest.fn().mockResolvedValue({ ok: true, message: 'ok' }),
    testS2SConnection: jest.fn().mockResolvedValue({ ok: true, message: 'ok' }),
  };
}

describe('SettingsReplyModeRoute', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockUseVoiceAssistantRuntime.mockReturnValue(createSession());
  });

  it('renders reply mode and stream mode cards', () => {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const SettingsReplyModeRoute = require('../reply-mode').default;
    render(<SettingsReplyModeRoute />);

    expect(screen.getByTestId('settings-reply-mode-card')).toBeTruthy();
    expect(screen.getByTestId('settings-reply-stream-mode-card')).toBeTruthy();
    expect(screen.getByText('自动（推荐）')).toBeTruthy();
    expect(screen.getByText('强制流式')).toBeTruthy();
    expect(screen.getByText('强制非流式')).toBeTruthy();
  });

  it('saves reply chain mode and stream mode together', async () => {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const SettingsReplyModeRoute = require('../reply-mode').default;
    render(<SettingsReplyModeRoute />);

    fireEvent.press(screen.getByText('自定义 LLM'));
    fireEvent.press(screen.getByText('强制流式'));
    fireEvent.press(screen.getByTestId('settings-reply-mode-save'));

    await waitFor(() => {
      expect(mockSaveRuntimeConfig).toHaveBeenCalledWith({
        replyChainMode: 'custom_llm',
        replyStreamMode: 'force_stream',
      });
    });
    expect(mockShowToast).toHaveBeenCalledWith('saved', 'success');
  });
});
