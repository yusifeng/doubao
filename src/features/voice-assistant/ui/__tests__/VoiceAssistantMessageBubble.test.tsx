import { render, screen } from '@testing-library/react-native';
import { VoiceAssistantMessageBubble } from '../VoiceAssistantMessageBubble';

describe('VoiceAssistantMessageBubble', () => {
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
});
