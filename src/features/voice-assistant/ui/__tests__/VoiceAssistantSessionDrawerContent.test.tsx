import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import type { UseTextChatResult } from '../../runtime/useTextChat';
import { VoiceAssistantSessionDrawerContent } from '../VoiceAssistantSessionDrawerContent';

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
    messages: [],
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
    textReplySourceLabel: '文本回复来源：官方S2S（Dialog SDK）',
    voiceToggleLabel: '开始通话',
    voiceRuntimeHint: '实时通话未开启',
    connectivityHint: '尚未测试连接',
    testS2SConnection: jest.fn().mockResolvedValue(undefined),
  };
}

describe('VoiceAssistantSessionDrawerContent', () => {
  it('renders real local conversations and filters them', () => {
    render(
      <VoiceAssistantSessionDrawerContent
        session={createSession()}
        onClose={jest.fn()}
        onSelectConversation={jest.fn()}
        onCreateConversation={jest.fn()}
        onOpenVoice={jest.fn()}
      />,
    );

    expect(screen.getByText('会话')).toBeTruthy();
    expect(screen.getByText('默认会话')).toBeTruthy();
    expect(screen.getByText('案件讨论')).toBeTruthy();

    fireEvent.changeText(screen.getByTestId('conversation-drawer-search-input'), '案件');

    expect(screen.getByText('案件讨论')).toBeTruthy();
    expect(screen.queryByTestId('conversation-current-session-row')).toBeNull();
  });

  it('supports create, select, open voice, and connection test actions', async () => {
    const session = createSession();
    const onClose = jest.fn();
    const onSelectConversation = jest.fn().mockResolvedValue(undefined);
    const onCreateConversation = jest.fn().mockResolvedValue(undefined);
    const onOpenVoice = jest.fn().mockResolvedValue(undefined);

    render(
      <VoiceAssistantSessionDrawerContent
        session={session}
        onClose={onClose}
        onSelectConversation={onSelectConversation}
        onCreateConversation={onCreateConversation}
        onOpenVoice={onOpenVoice}
      />,
    );

    fireEvent.press(screen.getByTestId('conversation-close-drawer-button'));
    fireEvent.press(screen.getByTestId('conversation-create-button'));
    fireEvent.press(screen.getByTestId('conversation-drawer-open-voice-button'));
    fireEvent.press(screen.getByTestId('conversation-row-conv-2'));
    fireEvent.press(screen.getByTestId('conversation-drawer-s2s-test-button'));

    expect(onClose).toHaveBeenCalledTimes(1);
    await waitFor(() => {
      expect(onCreateConversation).toHaveBeenCalledTimes(1);
      expect(onOpenVoice).toHaveBeenCalledTimes(1);
      expect(onSelectConversation).toHaveBeenCalledWith('conv-2');
      expect(session.testS2SConnection).toHaveBeenCalledTimes(1);
    });
  });
});
