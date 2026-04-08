import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import type { UseTextChatResult } from '../../runtime/useTextChat';
import { VoiceAssistantScreen } from '../VoiceAssistantScreen';

jest.mock('../../repo/runtimeConfigRepo', () => ({
  getEffectiveRuntimeConfig: jest.fn(async () => ({
    replyChainMode: 'official_s2s',
    replyStreamMode: 'auto',
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
          systemPrompt: 'default prompt',
          source: 'default',
        },
      ],
      systemPrompt: 'default prompt',
      source: 'default',
    },
    androidDialog: {
      appKeyOverride: '',
    },
    voice: {
      speakerId: 'S_mXRP7Y5M1',
      speakerLabel: '江户川柯南（默认音色）',
      sourceType: 'default',
    },
  })),
  saveRuntimeConfig: jest.fn(async (nextConfig) => nextConfig),
  buildRuntimeConfigForSave: jest.fn((currentConfig, draft) => ({ ...currentConfig, ...draft })),
  validateRuntimeConfigForSave: jest.fn(() => []),
}));

function createSession(): UseTextChatResult {
  return {
    status: 'idle',
    conversations: [
      {
        id: 'conv-1',
        title: '默认会话',
        lastMessage: '你好',
        updatedAt: Date.now(),
        status: 'idle',
      },
    ],
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
    voiceModeLabel: 'Android Dialog SDK 模式（服务端自动回复）',
    textReplySourceLabel: '官方 S2S / Dialog SDK',
    voiceToggleLabel: '开始通话',
    voiceRuntimeHint: '实时通话未开启',
    connectivityHint: '尚未测试连接',
    runtimeConfig: {
      replyChainMode: 'official_s2s',
      replyStreamMode: 'auto',
      llm: {
        baseUrl: '',
        apiKey: '',
        model: '',
        provider: 'openai-compatible',
      },
      s2s: {
        appId: 'app-id',
        accessToken: 'token',
        wsUrl: 'wss://example.com/realtime/dialogue',
      },
      persona: {
        activeRoleId: 'persona-default-konan',
        roles: [
          {
            id: 'persona-default-konan',
            name: '江户川柯南',
            systemPrompt: 'default prompt',
            source: 'default',
          },
        ],
        systemPrompt: 'default prompt',
        source: 'default',
      },
      androidDialog: {
        appKeyOverride: '',
      },
      voice: {
        speakerId: 'S_mXRP7Y5M1',
        speakerLabel: '默认音色',
        sourceType: 'default',
      },
    },
    saveRuntimeConfig: jest.fn().mockResolvedValue({ ok: true, message: 'saved' }),
    testLLMConfig: jest.fn().mockResolvedValue({ ok: true, message: 'ok' }),
    testS2SConnection: jest.fn().mockResolvedValue({ ok: true, message: 'ok' }),
  };
}

describe('VoiceAssistantScreen', () => {
  function renderScreen(ui: React.ReactElement) {
    return render(<SafeAreaProvider>{ui}</SafeAreaProvider>);
  }

  afterEach(() => {
    jest.useRealTimers();
  });

  it('renders the immersive voice shell controls', async () => {
    renderScreen(<VoiceAssistantScreen />);

    await waitFor(() => {
      expect(screen.getByText('选择情景')).toBeTruthy();
    });
    expect(screen.getByTestId('voice-toggle-button')).toBeTruthy();
    expect(screen.getByTestId('voice-placeholder-spark-button')).toBeTruthy();
    expect(screen.getByTestId('voice-placeholder-video-button')).toBeTruthy();
    expect(screen.getByTestId('voice-exit-button')).toBeTruthy();
    expect(screen.queryByTestId('s2s-test-button')).toBeNull();
  });

  it('keeps the avatar display mode lightweight by default', async () => {
    renderScreen(<VoiceAssistantScreen />);

    expect(await screen.findByText('内容由 AI 生成')).toBeTruthy();
    expect(screen.queryByText('最近消息')).toBeNull();
    expect(screen.queryByText(/当前会话正在持续收听/)).toBeNull();
    expect(screen.getByText('你可以开始说话')).toBeTruthy();
    expect(screen.queryByTestId('voice-switch-text-button')).toBeNull();
  });

  it('supports muting and unmuting voice input from the first control', async () => {
    const session = createSession();
    session.isVoiceActive = true;

    renderScreen(<VoiceAssistantScreen session={session} />);
    await waitFor(() => {
      expect(screen.getByText('选择情景')).toBeTruthy();
    });

    fireEvent.press(screen.getByTestId('voice-toggle-button'));
    fireEvent.press(screen.getByTestId('voice-toggle-button'));

    expect(session.toggleVoiceInputMuted).toHaveBeenCalledTimes(2);
  });

  it('keeps first control as no-op when voice is not active', async () => {
    const session = createSession();

    renderScreen(<VoiceAssistantScreen session={session} />);
    await waitFor(() => {
      expect(screen.getByText('你可以开始说话')).toBeTruthy();
    });

    fireEvent.press(screen.getByTestId('voice-toggle-button'));

    expect(session.toggleVoice).not.toHaveBeenCalled();
    expect(session.toggleVoiceInputMuted).not.toHaveBeenCalled();
    expect(session.interruptVoiceOutput).not.toHaveBeenCalled();
  });

  it('always routes first control to mute toggle even when mute support flag is false', async () => {
    const session = createSession();
    session.isVoiceActive = true;
    session.supportsVoiceInputMute = false;

    renderScreen(<VoiceAssistantScreen session={session} />);
    await waitFor(() => {
      expect(screen.getByText('选择情景')).toBeTruthy();
    });

    fireEvent.press(screen.getByTestId('voice-toggle-button'));

    expect(session.toggleVoiceInputMuted).toHaveBeenCalledTimes(1);
    expect(session.toggleVoice).not.toHaveBeenCalled();
  });

  it('does not interrupt assistant output from the first control while speaking', async () => {
    const session = createSession();
    session.status = 'speaking';
    session.isVoiceActive = true;

    renderScreen(<VoiceAssistantScreen session={session} />);
    await waitFor(() => {
      expect(screen.getByText('选择情景')).toBeTruthy();
    });

    fireEvent.press(screen.getByTestId('voice-toggle-button'));

    expect(session.toggleVoiceInputMuted).toHaveBeenCalledTimes(1);
    expect(session.interruptVoiceOutput).not.toHaveBeenCalled();
    expect(session.toggleVoice).not.toHaveBeenCalled();
  });

  it('starts or retries voice from status text when idle', async () => {
    const session = createSession();

    renderScreen(<VoiceAssistantScreen session={session} />);
    await waitFor(() => {
      expect(screen.getByText('你可以开始说话')).toBeTruthy();
    });

    fireEvent.press(screen.getByTestId('voice-status-text-trigger'));

    expect(session.toggleVoice).toHaveBeenCalledTimes(1);
    expect(session.toggleVoiceInputMuted).not.toHaveBeenCalled();
    expect(session.interruptVoiceOutput).not.toHaveBeenCalled();
  });

  it('interrupts assistant output from status text while speaking', async () => {
    const session = createSession();
    session.status = 'speaking';
    session.isVoiceActive = true;

    renderScreen(<VoiceAssistantScreen session={session} />);

    await waitFor(() => {
      expect(screen.getByText('说话或点击打断')).toBeTruthy();
    });

    fireEvent.press(screen.getByTestId('voice-status-text-trigger'));

    expect(session.interruptVoiceOutput).toHaveBeenCalledTimes(1);
    expect(session.toggleVoiceInputMuted).not.toHaveBeenCalled();
    expect(session.toggleVoice).not.toHaveBeenCalled();
  });

  it('shows speaking status from runtime hint even when status is not speaking', async () => {
    const session = createSession();
    session.status = 'listening';
    session.isVoiceActive = true;
    session.voiceRuntimeHint = '助手播报中，稍后继续听';

    renderScreen(<VoiceAssistantScreen session={session} />);

    await waitFor(() => {
      expect(screen.getByText('说话或点击打断')).toBeTruthy();
    });
  });

  it('keeps muted text as the highest-priority status', async () => {
    const session = createSession();
    session.status = 'speaking';
    session.isVoiceActive = true;
    session.isVoiceInputMuted = true;

    renderScreen(<VoiceAssistantScreen session={session} />);

    await waitFor(() => {
      expect(screen.getByText('你已静音')).toBeTruthy();
    });
    expect(screen.queryByText('说话或点击打断')).toBeNull();
  });

  it('renders drawer and exit actions when callbacks exist', async () => {
    const onExitVoice = jest.fn();
    const onOpenDrawer = jest.fn();

    renderScreen(
      <VoiceAssistantScreen
        session={createSession()}
        onExitVoice={onExitVoice}
        onOpenDrawer={onOpenDrawer}
      />,
    );

    await waitFor(() => {
      expect(screen.getByText('选择情景')).toBeTruthy();
    });
    fireEvent.press(screen.getByTestId('voice-open-drawer-button'));
    fireEvent.press(screen.getByTestId('voice-exit-button'));

    expect(onOpenDrawer).toHaveBeenCalledTimes(1);
    expect(onExitVoice).toHaveBeenCalledTimes(1);
  });

  it('auto starts voice when mounted from the conversation surface', async () => {
    const session = createSession();

    renderScreen(<VoiceAssistantScreen session={session} autoStartOnMount />);

    await waitFor(() => {
      expect(session.toggleVoice).toHaveBeenCalledTimes(1);
    });
  });
});
