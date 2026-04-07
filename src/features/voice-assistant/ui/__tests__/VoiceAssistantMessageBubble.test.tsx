import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import * as Clipboard from 'expo-clipboard';
import { VoiceAssistantMessageBubble } from '../VoiceAssistantMessageBubble';

const mockShowToast = jest.fn();

jest.mock('expo-clipboard', () => ({
  setStringAsync: jest.fn(),
}));

jest.mock('../../../../shared/ui/AppToastProvider', () => ({
  useAppToast: () => ({
    showToast: mockShowToast,
  }),
}));

describe('VoiceAssistantMessageBubble', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('renders assistant narration with lighter parenthesized copy', () => {
    render(
      <VoiceAssistantMessageBubble
        message={{
          id: 'msg-assistant',
          conversationId: 'conv-1',
          role: 'assistant',
          content: '手指下意识抵着下巴，镜片反光遮住眼神。嗯，我知道了。',
          type: 'text',
          createdAt: Date.now(),
        }}
      />,
    );

    expect(screen.getByText('（手指下意识抵着下巴，镜片反光遮住眼神。）')).toBeTruthy();
    expect(screen.getByText('嗯，我知道了。')).toBeTruthy();
  });

  it('renders user message without assistant-specific narration formatting', () => {
    render(
      <VoiceAssistantMessageBubble
        message={{
          id: 'msg-user',
          conversationId: 'conv-1',
          role: 'user',
          content: '你好，能听到吗？',
          type: 'text',
          createdAt: Date.now(),
        }}
      />,
    );

    expect(screen.getByText('你好，能听到吗？')).toBeTruthy();
  });

  it('copies assistant message content when copy button is pressed', async () => {
    const setStringAsync = jest.mocked(Clipboard.setStringAsync);
    setStringAsync.mockResolvedValueOnce(true);

    render(
      <VoiceAssistantMessageBubble
        message={{
          id: 'msg-assistant-copy',
          conversationId: 'conv-1',
          role: 'assistant',
          content: '复制这句助手回复',
          type: 'text',
          createdAt: Date.now(),
        }}
      />,
    );

    fireEvent.press(screen.getByTestId('assistant-copy-button'));

    await waitFor(() => {
      expect(setStringAsync).toHaveBeenCalledWith('复制这句助手回复');
      expect(mockShowToast).toHaveBeenCalledWith('已复制到剪贴板。', 'success');
    });
  });
});
