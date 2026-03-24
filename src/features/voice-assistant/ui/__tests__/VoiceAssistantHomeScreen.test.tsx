import { fireEvent, render, screen } from '@testing-library/react-native';
import type { UseTextChatResult } from '../../runtime/useTextChat';
import { VoiceAssistantHomeScreen } from '../VoiceAssistantHomeScreen';

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

describe('VoiceAssistantHomeScreen', () => {
  it('renders hero and current session summary', () => {
    render(
      <VoiceAssistantHomeScreen
        session={createSession()}
        onOpenConversation={jest.fn()}
        onOpenVoice={jest.fn()}
      />,
    );

    expect(screen.getByText('Konan Companion')).toBeTruthy();
    expect(screen.getByText('默认会话')).toBeTruthy();
    expect(screen.getByText(/Demo实时通话模式/)).toBeTruthy();
  });

  it('triggers navigation actions', () => {
    const onOpenConversation = jest.fn();
    const onOpenVoice = jest.fn();

    render(
      <VoiceAssistantHomeScreen
        session={createSession()}
        onOpenConversation={onOpenConversation}
        onOpenVoice={onOpenVoice}
      />,
    );

    fireEvent.press(screen.getByTestId('open-conversation-button'));
    fireEvent.press(screen.getByTestId('open-voice-button'));

    expect(onOpenConversation).toHaveBeenCalledTimes(1);
    expect(onOpenVoice).toHaveBeenCalledTimes(1);
  });
});
