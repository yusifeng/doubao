import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import { VoiceAssistantScreen } from '../VoiceAssistantScreen';

describe('VoiceAssistantScreen', () => {
  it('renders skeleton header', async () => {
    render(<VoiceAssistantScreen />);

    expect(screen.getByText('Voice Assistant V1')).toBeTruthy();
    expect(await screen.findByText('默认会话')).toBeTruthy();
  });

  it('shows default conversation after bootstrap', async () => {
    render(<VoiceAssistantScreen />);

    expect(await screen.findByText('默认会话')).toBeTruthy();
  });

  it('sends text and renders assistant reply', async () => {
    render(<VoiceAssistantScreen />);
    await screen.findByText('默认会话');

    fireEvent.changeText(screen.getByTestId('message-input'), '你好');
    fireEvent.press(screen.getByTestId('send-button'));

    expect(await screen.findByText('收到：你好。这是 M3 文本链路回包。')).toBeTruthy();
    await waitFor(() => {
      expect(screen.getByText('待命中')).toBeTruthy();
    });
  });

  it('supports tap to start and stop voice session', async () => {
    render(<VoiceAssistantScreen />);
    await screen.findByText('默认会话');

    fireEvent.press(screen.getByTestId('voice-toggle-button'));
    expect(await screen.findByText(/挂断通话|结束语音/)).toBeTruthy();
    expect(screen.getByText('正在听你说')).toBeTruthy();

    fireEvent.press(screen.getByTestId('voice-toggle-button'));
    expect(await screen.findByText(/开始通话|开始语音/)).toBeTruthy();
    expect(await screen.findByText('收到：测试语音输入。这是 M3 文本链路回包。')).toBeTruthy();
    expect(screen.getByText('待命中')).toBeTruthy();
  });

  it('keeps voice flow stable under quick repeated taps', async () => {
    render(<VoiceAssistantScreen />);
    await screen.findByText('默认会话');

    fireEvent.press(screen.getByTestId('voice-toggle-button'));
    fireEvent.press(screen.getByTestId('voice-toggle-button'));

    await waitFor(() => {
      expect(screen.getByText(/正在听你说|待命中/)).toBeTruthy();
    });
  });

  it('shows env hint when running s2s connection test without key', async () => {
    render(<VoiceAssistantScreen />);
    await screen.findByText('默认会话');

    fireEvent.press(screen.getByTestId('s2s-test-button'));
    expect(
      await screen.findByText(
        'S2S: 缺少 EXPO_PUBLIC_S2S_APP_ID / EXPO_PUBLIC_S2S_ACCESS_TOKEN / EXPO_PUBLIC_S2S_WS_URL',
      ),
    ).toBeTruthy();
  });
});
