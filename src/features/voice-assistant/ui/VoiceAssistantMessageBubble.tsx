import * as Clipboard from 'expo-clipboard';
import { Text, TouchableOpacity, View } from 'react-native';
import {
  voiceAssistantBubbleThemeClass,
} from '../../../core/theme/mappers';
import { extractAssistantDisplaySegments } from '../service/assistantText';
import type { Message } from '../types/model';
import { VoiceAssistantIcon } from './VoiceAssistantIcon';
import { useAppToast } from '../../../shared/ui/AppToastProvider';

type VoiceAssistantMessageBubbleProps = {
  message: Message;
};

export function VoiceAssistantMessageBubble({ message }: VoiceAssistantMessageBubbleProps) {
  const isAssistant = message.role === 'assistant';
  const segments = isAssistant ? extractAssistantDisplaySegments(message.content) : [];
  const { showToast } = useAppToast();

  if (!isAssistant) {
    return (
      <View className={voiceAssistantBubbleThemeClass.userBubble}>
        <Text className={voiceAssistantBubbleThemeClass.userText}>{message.content}</Text>
      </View>
    );
  }

  return (
    <View className={voiceAssistantBubbleThemeClass.assistantCardWrap}>
      <View className={voiceAssistantBubbleThemeClass.assistantCardPanel}>
        <Text className={voiceAssistantBubbleThemeClass.assistantCardText}>
          {segments.map((segment, index) => (
            <Text
              key={`${message.id}-${index}`}
              className={segment.narration ? voiceAssistantBubbleThemeClass.narrationText : voiceAssistantBubbleThemeClass.assistantText}
            >
              {segment.text}
            </Text>
          ))}
        </Text>
      </View>
      <View className={voiceAssistantBubbleThemeClass.assistantDivider} />
      <View className={voiceAssistantBubbleThemeClass.assistantActions}>
        <View className={voiceAssistantBubbleThemeClass.assistantActionLeft}>
          <TouchableOpacity
            className={voiceAssistantBubbleThemeClass.assistantActionButton}
            onPress={() => {
              const content = message.content.trim();
              if (!content) {
                showToast('没有可复制的内容。', 'error');
                return;
              }
              void Clipboard.setStringAsync(content)
                .then(() => {
                  showToast('已复制到剪贴板。', 'success');
                })
                .catch(() => {
                  showToast('复制失败，请重试。', 'error');
                });
            }}
            testID="assistant-copy-button"
          >
            <VoiceAssistantIcon name="copy" size={18} color="#0A7CFF" />
          </TouchableOpacity>
          <TouchableOpacity className={voiceAssistantBubbleThemeClass.assistantActionButton}>
            <VoiceAssistantIcon name="speaker" size={18} color="#0A7CFF" />
          </TouchableOpacity>
          <TouchableOpacity className={voiceAssistantBubbleThemeClass.assistantActionButton}>
            <VoiceAssistantIcon name="bookmark" size={18} color="#0A7CFF" />
          </TouchableOpacity>
        </View>
        <TouchableOpacity className={voiceAssistantBubbleThemeClass.assistantRetryButton}>
          <VoiceAssistantIcon name="retry" size={19} color="#0A7CFF" />
        </TouchableOpacity>
      </View>
    </View>
  );
}
