import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import type { UseTextChatResult } from '../../runtime/useTextChat';
import { VoiceAssistantConversationScreen } from '../VoiceAssistantConversationScreen';

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
    toggleVoice: jest.fn().mockResolvedValue(undefined),
    voiceModeLabel: 'Android Dialog SDK 模式（服务端自动回复）',
    voiceToggleLabel: '开始通话',
    voiceRuntimeHint: '实时通话未开启',
    connectivityHint: '尚未测试连接',
    testS2SConnection: jest.fn().mockResolvedValue(undefined),
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
    expect(screen.getByText('继续和当前角色对话')).toBeTruthy();
    expect(screen.queryByText('AI 创作')).toBeNull();
    expect(screen.queryByText('发现智能体')).toBeNull();
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
    fireEvent.press(screen.getByTestId('voice-switch-text-button'));
    expect(screen.getByTestId('voice-dialogue-scene')).toBeTruthy();
    expect(screen.getAllByText('你好，我在。').length).toBeGreaterThan(0);
    fireEvent.press(screen.getByTestId('voice-exit-button'));

    await waitFor(() => {
      expect(onChangeMode).toHaveBeenCalledWith('text');
    });
  });
});
