import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import type { UseTextChatResult } from '../../runtime/useTextChat';
import { VoiceAssistantScreen } from '../VoiceAssistantScreen';

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
    voiceToggleLabel: '开始通话',
    voiceRuntimeHint: '实时通话未开启',
    connectivityHint: '尚未测试连接',
    testS2SConnection: jest.fn().mockResolvedValue(undefined),
  };
}

describe('VoiceAssistantScreen', () => {
  function renderScreen(ui: React.ReactElement) {
    return render(<SafeAreaProvider>{ui}</SafeAreaProvider>);
  }

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
    expect(screen.getByText('正在听...')).toBeTruthy();
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

  it('falls back to legacy voice toggle when input mute is unsupported', async () => {
    const session = createSession();
    session.isVoiceActive = true;
    session.supportsVoiceInputMute = false;

    renderScreen(<VoiceAssistantScreen session={session} />);
    await waitFor(() => {
      expect(screen.getByText('选择情景')).toBeTruthy();
    });

    fireEvent.press(screen.getByTestId('voice-toggle-button'));

    expect(session.toggleVoice).toHaveBeenCalledTimes(1);
    expect(session.toggleVoiceInputMuted).not.toHaveBeenCalled();
  });

  it('interrupts assistant output from the first control while speaking', async () => {
    const session = createSession();
    session.status = 'speaking';
    session.isVoiceActive = true;

    renderScreen(<VoiceAssistantScreen session={session} />);
    await waitFor(() => {
      expect(screen.getByText('选择情景')).toBeTruthy();
    });

    fireEvent.press(screen.getByTestId('voice-toggle-button'));

    expect(session.interruptVoiceOutput).toHaveBeenCalledTimes(1);
    expect(session.toggleVoice).not.toHaveBeenCalled();
  });

  it('renders drawer and exit actions when callbacks exist', async () => {
    const onExitVoice = jest.fn();
    const onOpenDrawer = jest.fn();
    const onToggleDisplayMode = jest.fn();

    renderScreen(
      <VoiceAssistantScreen
        session={createSession()}
        onExitVoice={onExitVoice}
        onOpenDrawer={onOpenDrawer}
        onToggleDisplayMode={onToggleDisplayMode}
      />,
    );

    await waitFor(() => {
      expect(screen.getByText('选择情景')).toBeTruthy();
    });
    fireEvent.press(screen.getByTestId('voice-open-drawer-button'));
    fireEvent.press(screen.getByTestId('voice-switch-text-button'));
    fireEvent.press(screen.getByTestId('voice-exit-button'));

    expect(onOpenDrawer).toHaveBeenCalledTimes(1);
    expect(onToggleDisplayMode).toHaveBeenCalledTimes(1);
    expect(onExitVoice).toHaveBeenCalledTimes(1);
  });

  it('auto starts voice when mounted from the conversation surface', async () => {
    const session = createSession();

    renderScreen(<VoiceAssistantScreen session={session} autoStartOnMount />);

    await waitFor(() => {
      expect(session.toggleVoice).toHaveBeenCalledTimes(1);
    });
  });

  it('renders dialogue display mode with recent lines instead of avatar strip', async () => {
    const session = createSession();
    session.messages = [
      {
        id: 'msg-1',
        conversationId: 'conv-1',
        role: 'assistant',
        content: '豆包你好。',
        type: 'text',
        createdAt: Date.now(),
      },
      {
        id: 'msg-2',
        conversationId: 'conv-1',
        role: 'user',
        content: '你好呀，今天有什么想聊的吗？',
        type: 'text',
        createdAt: Date.now() + 1,
      },
    ];

    renderScreen(<VoiceAssistantScreen session={session} displayMode="dialogue" />);

    expect(screen.getByTestId('voice-dialogue-scene')).toBeTruthy();
    expect(await screen.findByText('豆包你好。')).toBeTruthy();
    expect(screen.getByText('你好呀，今天有什么想聊的吗？')).toBeTruthy();
    expect(screen.queryByText('正在听...')).toBeTruthy();
  });
});
