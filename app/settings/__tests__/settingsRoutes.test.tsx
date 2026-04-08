import { fireEvent, render, screen } from '@testing-library/react-native';
import type { UseTextChatResult } from '../../../src/features/voice-assistant/runtime/useTextChat';

const mockPush = jest.fn();

jest.mock('expo-router', () => ({
  useRouter: () => ({
    push: mockPush,
    back: jest.fn(),
    canGoBack: () => true,
  }),
  useNavigation: () => ({
    dispatch: jest.fn(),
  }),
}));

const mockUseVoiceAssistantRuntime = jest.fn<UseTextChatResult, []>();

jest.mock('../../../src/features/voice-assistant/runtime/VoiceAssistantRuntimeProvider', () => ({
  useVoiceAssistantRuntime: () => mockUseVoiceAssistantRuntime(),
}));

const baseSession: UseTextChatResult = {
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
    llm: { baseUrl: 'https://x', apiKey: 'k', model: 'm', provider: 'openai-compatible' },
    s2s: { appId: 'app-id', accessToken: 'token', wsUrl: 'wss://example.com' },
    persona: {
      activeRoleId: 'persona-default-konan',
      roles: [
        {
          id: 'persona-default-konan',
          name: '江户川柯南',
          systemPrompt: 'prompt',
          source: 'default',
        },
      ],
      systemPrompt: 'prompt',
      source: 'default',
    },
    androidDialog: { appKeyOverride: '' },
    voice: { speakerId: 'saturn_zh_male_fuheigongzi_tob', speakerLabel: '腹黑公子(男)', sourceType: 'default' },
  },
  saveRuntimeConfig: jest.fn().mockResolvedValue({ ok: true, message: 'saved' }),
  testLLMConfig: jest.fn().mockResolvedValue({ ok: true, message: 'ok' }),
  testS2SConnection: jest.fn().mockResolvedValue({ ok: true, message: 'ok' }),
};

describe('settings routes', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockUseVoiceAssistantRuntime.mockReturnValue(baseSession);
  });

  it('renders four home entries and no .env copy', () => {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const SettingsHomeRoute = require('../index').default;
    render(<SettingsHomeRoute />);

    expect(screen.getByTestId('settings-home-item-reply-mode')).toBeTruthy();
    expect(screen.getByTestId('settings-home-item-s2s')).toBeTruthy();
    expect(screen.getByTestId('settings-home-item-llm')).toBeTruthy();
    expect(screen.getByTestId('settings-home-item-persona')).toBeTruthy();
    expect(screen.queryByText(/\.env/)).toBeNull();
  });

  it('navigates to persona settings from home row', () => {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const SettingsHomeRoute = require('../index').default;
    render(<SettingsHomeRoute />);

    fireEvent.press(screen.getByTestId('settings-home-item-persona'));
    expect(mockPush).toHaveBeenCalledWith('/settings/persona');
  });
});
