import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import type { UseTextChatResult } from '../../../src/features/voice-assistant/runtime/useTextChat';

const mockShowToast = jest.fn();
const mockSaveRuntimeConfig = jest.fn().mockResolvedValue({ ok: true, message: 'saved' });

jest.mock('expo-router', () => ({
  useRouter: () => ({
    replace: jest.fn(),
    push: jest.fn(),
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

describe('SettingsPersonaRoute', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockUseVoiceAssistantRuntime.mockReturnValue(createSession());
  });

  it('supports adding and deleting custom roles', async () => {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const SettingsPersonaRoute = require('../persona').default;
    render(<SettingsPersonaRoute />);

    fireEvent.changeText(screen.getByTestId('settings-persona-new-role-name-input'), '福尔摩斯');
    fireEvent.changeText(
      screen.getByTestId('settings-persona-new-role-prompt-input'),
      '你是 Sherlock Holmes，擅长推理。',
    );
    fireEvent.press(screen.getByTestId('settings-persona-add-role-button'));

    expect(screen.getByText('福尔摩斯')).toBeTruthy();
    fireEvent.press(screen.getByText('删除'));

    await waitFor(() => {
      expect(screen.queryByText('福尔摩斯')).toBeNull();
    });
  });

  it('saves selected custom role as active persona', async () => {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const SettingsPersonaRoute = require('../persona').default;
    render(<SettingsPersonaRoute />);

    fireEvent.changeText(screen.getByTestId('settings-persona-new-role-name-input'), '华生');
    fireEvent.changeText(
      screen.getByTestId('settings-persona-new-role-prompt-input'),
      '你是华生，请用伙伴视角回答。',
    );
    fireEvent.press(screen.getByTestId('settings-persona-add-role-button'));
    fireEvent.press(screen.getByTestId('settings-persona-save'));

    await waitFor(() => {
      expect(mockSaveRuntimeConfig).toHaveBeenCalledTimes(1);
    });
    const payload = mockSaveRuntimeConfig.mock.calls[0][0];
    expect(payload.persona.source).toBe('custom');
    expect(payload.persona.systemPrompt).toBe('你是华生，请用伙伴视角回答。');
    expect(payload.persona.activeRoleId).toContain('persona-custom-');
    expect(payload.persona.roles.some((role: { name: string }) => role.name === '华生')).toBe(true);
  });
});
