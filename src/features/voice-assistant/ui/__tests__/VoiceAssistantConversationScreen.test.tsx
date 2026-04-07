import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import type { UseTextChatResult } from '../../runtime/useTextChat';
import { VoiceAssistantConversationScreen } from '../VoiceAssistantConversationScreen';

jest.mock('../../config/runtimeConfigRepo', () => ({
  getEffectiveRuntimeConfig: jest.fn(async () => ({
    replyChainMode: 'official_s2s',
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
        systemPromptSnapshot: '会话提示词快照',
      },
      {
        id: 'conv-2',
        title: '案件讨论',
        lastMessage: '第二条会话',
        updatedAt: Date.now() - 1000,
        status: 'thinking',
      },
    ],
    activeConversationId: 'conv-1',
    messages: [
      {
        id: 'msg-1',
        conversationId: 'conv-1',
        role: 'assistant',
        content: '你好，我在。',
        type: 'text',
        createdAt: Date.now(),
      },
    ],
    liveUserTranscript: '',
    pendingAssistantReply: '',
    createConversation: jest.fn().mockResolvedValue('conv-3'),
    selectConversation: jest.fn().mockResolvedValue(true),
    sendText: jest.fn().mockResolvedValue(undefined),
    isVoiceActive: false,
    supportsVoiceInputMute: true,
    isVoiceInputMuted: false,
    toggleVoice: jest.fn().mockResolvedValue(undefined),
    toggleVoiceInputMuted: jest.fn().mockResolvedValue(undefined),
    interruptVoiceOutput: jest.fn().mockResolvedValue(undefined),
    voiceModeLabel: 'Android Dialog SDK 模式（服务端自动回复）',
    textReplySourceLabel: 'deepseek / deepseek-chat',
    voiceToggleLabel: '开始通话',
    voiceRuntimeHint: '实时通话未开启',
    connectivityHint: '尚未测试连接',
    runtimeConfig: {
      replyChainMode: 'custom_llm',
      llm: {
        baseUrl: 'https://api.deepseek.com/v1',
        apiKey: 'sk-test',
        model: 'deepseek-chat',
        provider: 'deepseek',
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

describe('VoiceAssistantConversationScreen', () => {
  function renderScreen(ui: React.ReactElement) {
    return render(<SafeAreaProvider>{ui}</SafeAreaProvider>);
  }

  it('renders chat mode shell and messages', () => {
    renderScreen(
      <VoiceAssistantConversationScreen
        session={createSession()}
        mode="text"
        onChangeMode={jest.fn()}
        onOpenDrawer={jest.fn()}
      />,
    );

    expect(screen.getAllByText('默认会话').length).toBeGreaterThan(0);
    expect(screen.getByText('你好，我在。')).toBeTruthy();
    expect(screen.getByText('deepseek / deepseek-chat')).toBeTruthy();
    expect(screen.queryByText('AI 创作')).toBeNull();
    expect(screen.queryByText('发现智能体')).toBeNull();
  });

  it('shows session debug dialog with session id, role and scrollable system prompt', () => {
    const session = createSession();
    const longPrompt = Array.from({ length: 20 }, (_, index) => `第${index + 1}行提示词`).join('\n');
    session.conversations = session.conversations.map((conversation) =>
      conversation.id === 'conv-1'
        ? { ...conversation, systemPromptSnapshot: longPrompt }
        : conversation,
    );

    renderScreen(
      <VoiceAssistantConversationScreen
        session={session}
        mode="text"
        onChangeMode={jest.fn()}
        onOpenDrawer={jest.fn()}
      />,
    );

    fireEvent.press(screen.getByTestId('conversation-session-debug-button'));

    expect(screen.getByTestId('conversation-session-debug-content')).toBeTruthy();
    expect(screen.getByTestId('conversation-session-debug-session-id').props.children).toBe('conv-1');
    expect(screen.getByTestId('conversation-session-debug-role-name').props.children).toBe('江户川柯南');
    expect(screen.getByTestId('conversation-session-debug-prompt-scroll')).toBeTruthy();
    expect(screen.getByTestId('conversation-session-debug-prompt').props.children).toBe(longPrompt);

    fireEvent.press(screen.getByTestId('conversation-session-debug-close'));
  });

  it('sends text and switches to voice mode', async () => {
    const session = createSession();
    const onChangeMode = jest.fn();

    renderScreen(
      <VoiceAssistantConversationScreen
        session={session}
        mode="text"
        onChangeMode={onChangeMode}
        onOpenDrawer={jest.fn()}
      />,
    );

    fireEvent.changeText(screen.getByTestId('conversation-message-input'), '测试一下');
    fireEvent.press(screen.getByTestId('conversation-send-button'));
    fireEvent.press(screen.getByTestId('conversation-open-voice-button'));

    await waitFor(() => {
      expect(session.sendText).toHaveBeenCalledWith('测试一下');
    });
    expect(onChangeMode).toHaveBeenCalledWith('voice');
  });

  it('delegates drawer opening to the navigator shell', () => {
    const onOpenDrawer = jest.fn();

    renderScreen(
      <VoiceAssistantConversationScreen
        session={createSession()}
        mode="text"
        onChangeMode={jest.fn()}
        onOpenDrawer={onOpenDrawer}
      />,
    );

    fireEvent.press(screen.getByTestId('conversation-open-drawer-button'));
    expect(onOpenDrawer).toHaveBeenCalledTimes(1);
  });

  it('renders voice mode as the same conversation surface', async () => {
    const onChangeMode = jest.fn();
    const session = createSession();

    renderScreen(
      <VoiceAssistantConversationScreen
        session={session}
        mode="voice"
        onChangeMode={onChangeMode}
        onOpenDrawer={jest.fn()}
      />,
    );

    expect(screen.getByTestId('voice-toggle-button')).toBeTruthy();
    await waitFor(() => {
      expect(session.toggleVoice).toHaveBeenCalledTimes(1);
    });
    expect(screen.queryByTestId('voice-switch-text-button')).toBeNull();
    expect(screen.getByTestId('voice-avatar-scene')).toBeTruthy();
    fireEvent.press(screen.getByTestId('voice-exit-button'));

    await waitFor(() => {
      expect(onChangeMode).toHaveBeenCalledWith('text');
    });
  });

  it('stops active voice capture when leaving voice mode', async () => {
    const session = createSession();
    session.isVoiceActive = true;
    const onChangeMode = jest.fn();

    const view = renderScreen(
      <VoiceAssistantConversationScreen
        session={session}
        mode="voice"
        onChangeMode={onChangeMode}
        onOpenDrawer={jest.fn()}
      />,
    );

    view.rerender(
      <SafeAreaProvider>
        <VoiceAssistantConversationScreen
          session={session}
          mode="text"
          onChangeMode={onChangeMode}
          onOpenDrawer={jest.fn()}
        />
      </SafeAreaProvider>,
    );

    await waitFor(() => {
      expect(session.toggleVoice).toHaveBeenCalledTimes(1);
    });
  });

  it('re-enables voice when a delayed stop resolves after switching back to voice mode', async () => {
    const session = createSession();
    session.isVoiceActive = true;

    let resolveFirstToggle: (() => void) | undefined;
    const firstTogglePromise = new Promise<void>((resolve) => {
      resolveFirstToggle = () => resolve();
    });
    const toggleVoice = jest
      .fn()
      .mockImplementationOnce(() => firstTogglePromise)
      .mockResolvedValue(undefined);
    session.toggleVoice = toggleVoice;

    const view = renderScreen(
      <VoiceAssistantConversationScreen
        session={session}
        mode="voice"
        onChangeMode={jest.fn()}
        onOpenDrawer={jest.fn()}
      />,
    );

    view.rerender(
      <SafeAreaProvider>
        <VoiceAssistantConversationScreen
          session={session}
          mode="text"
          onChangeMode={jest.fn()}
          onOpenDrawer={jest.fn()}
        />
      </SafeAreaProvider>,
    );

    await waitFor(() => {
      expect(toggleVoice).toHaveBeenCalledTimes(1);
    });

    view.rerender(
      <SafeAreaProvider>
        <VoiceAssistantConversationScreen
          session={session}
          mode="voice"
          onChangeMode={jest.fn()}
          onOpenDrawer={jest.fn()}
        />
      </SafeAreaProvider>,
    );

    expect(toggleVoice).toHaveBeenCalledTimes(1);
    resolveFirstToggle?.();
    await Promise.resolve();

    session.isVoiceActive = false;
    view.rerender(
      <SafeAreaProvider>
        <VoiceAssistantConversationScreen
          session={session}
          mode="voice"
          onChangeMode={jest.fn()}
          onOpenDrawer={jest.fn()}
        />
      </SafeAreaProvider>,
    );

    await waitFor(() => {
      expect(toggleVoice).toHaveBeenCalledTimes(2);
    });
  });

  it('queues a stop when leaving voice mode while startup toggle is still in flight', async () => {
    const session = createSession();
    session.isVoiceActive = false;

    let resolveStartToggle: (() => void) | undefined;
    const startTogglePromise = new Promise<void>((resolve) => {
      resolveStartToggle = () => resolve();
    });
    const toggleVoice = jest
      .fn()
      .mockImplementationOnce(() => startTogglePromise)
      .mockResolvedValue(undefined);
    session.toggleVoice = toggleVoice;

    const view = renderScreen(
      <VoiceAssistantConversationScreen
        session={session}
        mode="text"
        onChangeMode={jest.fn()}
        onOpenDrawer={jest.fn()}
      />,
    );

    view.rerender(
      <SafeAreaProvider>
        <VoiceAssistantConversationScreen
          session={session}
          mode="voice"
          onChangeMode={jest.fn()}
          onOpenDrawer={jest.fn()}
        />
      </SafeAreaProvider>,
    );

    await waitFor(() => {
      expect(toggleVoice).toHaveBeenCalledTimes(1);
    });

    view.rerender(
      <SafeAreaProvider>
        <VoiceAssistantConversationScreen
          session={session}
          mode="text"
          onChangeMode={jest.fn()}
          onOpenDrawer={jest.fn()}
        />
      </SafeAreaProvider>,
    );

    expect(toggleVoice).toHaveBeenCalledTimes(1);
    session.isVoiceActive = true;
    resolveStartToggle?.();
    await Promise.resolve();

    view.rerender(
      <SafeAreaProvider>
        <VoiceAssistantConversationScreen
          session={session}
          mode="text"
          onChangeMode={jest.fn()}
          onOpenDrawer={jest.fn()}
        />
      </SafeAreaProvider>,
    );

    await waitFor(() => {
      expect(toggleVoice).toHaveBeenCalledTimes(2);
    });
  });

  it('auto-starts voice after active conversation becomes available', async () => {
    const session = createSession();
    session.activeConversationId = null;
    session.isVoiceActive = false;
    const toggleVoice = jest.fn().mockResolvedValue(undefined);
    session.toggleVoice = toggleVoice;

    const view = renderScreen(
      <VoiceAssistantConversationScreen
        session={session}
        mode="text"
        onChangeMode={jest.fn()}
        onOpenDrawer={jest.fn()}
      />,
    );

    view.rerender(
      <SafeAreaProvider>
        <VoiceAssistantConversationScreen
          session={session}
          mode="voice"
          onChangeMode={jest.fn()}
          onOpenDrawer={jest.fn()}
        />
      </SafeAreaProvider>,
    );

    expect(toggleVoice).toHaveBeenCalledTimes(0);

    session.activeConversationId = 'conv-1';
    view.rerender(
      <SafeAreaProvider>
        <VoiceAssistantConversationScreen
          session={session}
          mode="voice"
          onChangeMode={jest.fn()}
          onOpenDrawer={jest.fn()}
        />
      </SafeAreaProvider>,
    );

    await waitFor(() => {
      expect(toggleVoice).toHaveBeenCalledTimes(1);
    });
  });
});
