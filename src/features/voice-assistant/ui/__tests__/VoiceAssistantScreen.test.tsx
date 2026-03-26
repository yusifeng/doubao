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

describe('VoiceAssistantScreen', () => {
  it('renders voice scene shell and current conversation', async () => {
    render(<VoiceAssistantScreen />);

    expect(screen.getByText('选择情景')).toBeTruthy();
    await waitFor(() => {
      expect(screen.getAllByText('默认会话').length).toBeGreaterThan(0);
    });
    expect(screen.getAllByText(/开始通话|开始语音/).length).toBeGreaterThan(0);
  });

  it('shows latest round area after bootstrap', async () => {
    render(<VoiceAssistantScreen />);

    expect(await screen.findByText('当前会话')).toBeTruthy();
    expect(screen.getByText(/轻触下方按钮开始实时语音通话/)).toBeTruthy();
  });

  it('supports tap to start and stop voice session', async () => {
    render(<VoiceAssistantScreen />);
    await waitFor(() => {
      expect(screen.getAllByText('默认会话').length).toBeGreaterThan(0);
    });

    fireEvent.press(screen.getByTestId('voice-toggle-button'));
    expect(await screen.findByText(/挂断通话|结束语音/)).toBeTruthy();
    expect(screen.getByText(/本机识别已开启|正在听你说/)).toBeTruthy();

    fireEvent.press(screen.getByTestId('voice-toggle-button'));
    expect(await screen.findByText(/开始通话|开始语音/)).toBeTruthy();
    expect(await screen.findByText('收到：测试语音输入。这是 M3 文本链路回包。')).toBeTruthy();
    expect(screen.getByText('待命中')).toBeTruthy();
  });

  it('keeps voice flow stable under quick repeated taps', async () => {
    render(<VoiceAssistantScreen />);
    await waitFor(() => {
      expect(screen.getAllByText('默认会话').length).toBeGreaterThan(0);
    });

    fireEvent.press(screen.getByTestId('voice-toggle-button'));
    fireEvent.press(screen.getByTestId('voice-toggle-button'));

    await waitFor(() => {
      expect(screen.getByText(/本机识别已开启|正在听你说|待命中/)).toBeTruthy();
    });
  });

  it('shows env hint when running s2s connection test without key', async () => {
    render(<VoiceAssistantScreen />);
    await waitFor(() => {
      expect(screen.getAllByText('默认会话').length).toBeGreaterThan(0);
    });

    fireEvent.press(screen.getByTestId('s2s-test-button'));
    expect(
      await screen.findByText(
        '缺少 EXPO_PUBLIC_S2S_APP_ID / EXPO_PUBLIC_S2S_ACCESS_TOKEN / EXPO_PUBLIC_S2S_WS_URL',
      ),
    ).toBeTruthy();
  });

  it('renders explicit navigation actions when route callbacks exist', async () => {
    const onGoConversation = jest.fn();
    const onGoHome = jest.fn();

    render(
      <VoiceAssistantScreen
        session={createSession()}
        onGoConversation={onGoConversation}
        onGoHome={onGoHome}
      />,
    );

    await waitFor(() => {
      expect(screen.getAllByText('默认会话').length).toBeGreaterThan(0);
    });
    fireEvent.press(screen.getByTestId('voice-go-conversation-button'));
    fireEvent.press(screen.getByTestId('voice-go-home-button'));

    expect(onGoConversation).toHaveBeenCalledTimes(1);
    expect(onGoHome).toHaveBeenCalledTimes(1);
  });
});
