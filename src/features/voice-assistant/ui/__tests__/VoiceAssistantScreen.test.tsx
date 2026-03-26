import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';
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
    toggleVoice: jest.fn().mockResolvedValue(undefined),
    voiceModeLabel: 'Android Dialog SDK 模式（服务端自动回复）',
    voiceToggleLabel: '开始通话',
    voiceRuntimeHint: '实时通话未开启',
    connectivityHint: '尚未测试连接',
    testS2SConnection: jest.fn().mockResolvedValue(undefined),
  };
}

describe('VoiceAssistantScreen', () => {
  it('renders voice scene shell and current conversation', async () => {
    render(<VoiceAssistantScreen />);

    await waitFor(() => {
      expect(screen.getAllByText('默认会话').length).toBeGreaterThan(0);
    });
    expect(screen.getByTestId('voice-toggle-button')).toBeTruthy();
    expect(screen.getByTestId('voice-placeholder-spark-button')).toBeTruthy();
    expect(screen.getByTestId('voice-placeholder-video-button')).toBeTruthy();
    expect(screen.getByTestId('voice-exit-button')).toBeTruthy();
  });

  it('shows latest round area after bootstrap', async () => {
    render(<VoiceAssistantScreen />);

    expect(await screen.findByText('当前状态')).toBeTruthy();
    expect(screen.getByText(/切到语音模式后会自动开始收听/)).toBeTruthy();
  });

  it('supports pausing and resuming voice capture from the first control', async () => {
    const session = createSession();

    render(<VoiceAssistantScreen session={session} />);
    await waitFor(() => {
      expect(screen.getAllByText('默认会话').length).toBeGreaterThan(0);
    });

    fireEvent.press(screen.getByTestId('voice-toggle-button'));
    fireEvent.press(screen.getByTestId('voice-toggle-button'));

    expect(session.toggleVoice).toHaveBeenCalledTimes(2);
  });

  it('delegates connection test to the session hook', async () => {
    const session = createSession();

    render(<VoiceAssistantScreen session={session} />);
    await waitFor(() => {
      expect(screen.getAllByText('默认会话').length).toBeGreaterThan(0);
    });

    fireEvent.press(screen.getByTestId('s2s-test-button'));
    expect(session.testS2SConnection).toHaveBeenCalledTimes(1);
  });

  it('renders drawer and exit actions when callbacks exist', async () => {
    const onExitVoice = jest.fn();
    const onOpenDrawer = jest.fn();

    render(
      <VoiceAssistantScreen
        session={createSession()}
        onExitVoice={onExitVoice}
        onOpenDrawer={onOpenDrawer}
      />,
    );

    await waitFor(() => {
      expect(screen.getAllByText('默认会话').length).toBeGreaterThan(0);
    });
    fireEvent.press(screen.getByTestId('voice-open-drawer-button'));
    fireEvent.press(screen.getByTestId('voice-switch-text-button'));
    fireEvent.press(screen.getByTestId('voice-exit-button'));

    expect(onOpenDrawer).toHaveBeenCalledTimes(1);
    expect(onExitVoice).toHaveBeenCalledTimes(2);
  });

  it('auto starts voice when mounted from the conversation surface', async () => {
    const session = createSession();

    render(<VoiceAssistantScreen session={session} autoStartOnMount />);

    await waitFor(() => {
      expect(session.toggleVoice).toHaveBeenCalledTimes(1);
    });
  });
});
