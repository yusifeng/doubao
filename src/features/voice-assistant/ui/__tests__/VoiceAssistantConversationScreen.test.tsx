import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';
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
    sendText: jest.fn().mockResolvedValue(undefined),
    isVoiceActive: false,
    toggleVoice: jest.fn().mockResolvedValue(undefined),
    voiceModeLabel: 'Demo实时通话模式（连续语音上行）',
    voiceToggleLabel: '开始通话',
    voiceRuntimeHint: '实时通话未开启',
    connectivityHint: '尚未测试连接',
    testS2SConnection: jest.fn().mockResolvedValue(undefined),
  };
}

describe('VoiceAssistantConversationScreen', () => {
  it('renders messages and conversation title', () => {
    render(
      <VoiceAssistantConversationScreen
        session={createSession()}
        onOpenVoice={jest.fn()}
      />,
    );

    expect(screen.getByText('默认会话')).toBeTruthy();
    expect(screen.getByText('你好，我在。')).toBeTruthy();
  });

  it('sends text and opens voice page', async () => {
    const session = createSession();
    const onOpenVoice = jest.fn();

    render(<VoiceAssistantConversationScreen session={session} onOpenVoice={onOpenVoice} />);

    fireEvent.changeText(screen.getByTestId('conversation-message-input'), '测试一下');
    fireEvent.press(screen.getByTestId('conversation-send-button'));
    fireEvent.press(screen.getByTestId('conversation-open-voice-button'));

    await waitFor(() => {
      expect(session.sendText).toHaveBeenCalledWith('测试一下');
    });
    expect(onOpenVoice).toHaveBeenCalledTimes(1);
  });
});
