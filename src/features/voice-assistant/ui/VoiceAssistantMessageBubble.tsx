import { Text, TouchableOpacity, View } from 'react-native';
import {
  voiceAssistantBubbleThemeClass,
  voiceAssistantThemeStyle,
} from '../../../core/theme/mappers';
import { extractAssistantDisplaySegments } from '../service/assistantText';
import type { Message } from '../types/model';
import { VoiceAssistantIcon } from './VoiceAssistantIcon';

type VoiceAssistantMessageBubbleProps = {
  message: Message;
};

export function VoiceAssistantMessageBubble({ message }: VoiceAssistantMessageBubbleProps) {
  const isAssistant = message.role === 'assistant';
  const segments = isAssistant ? extractAssistantDisplaySegments(message.content) : [];
  const shouldUseAssistantCard = isAssistant && message.content.length >= 18;

  if (!isAssistant) {
    return (
      <View className={voiceAssistantBubbleThemeClass.userBubble}>
        <Text className={voiceAssistantBubbleThemeClass.userText}>{message.content}</Text>
      </View>
    );
  }

  if (shouldUseAssistantCard) {
    return (
      <View className={voiceAssistantBubbleThemeClass.assistantCardWrap}>
        <View
          className={voiceAssistantBubbleThemeClass.assistantCardPanel}
          style={voiceAssistantThemeStyle.whiteCardShadow}
        >
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
        <View className={voiceAssistantBubbleThemeClass.assistantActions}>
          <View className={voiceAssistantBubbleThemeClass.assistantActionLeft}>
            <TouchableOpacity
              className={voiceAssistantBubbleThemeClass.assistantActionButton}
              style={voiceAssistantThemeStyle.assistantActionShadow}
            >
              <VoiceAssistantIcon name="copy" size={18} color="#0A7CFF" />
            </TouchableOpacity>
            <TouchableOpacity
              className={voiceAssistantBubbleThemeClass.assistantActionButton}
              style={voiceAssistantThemeStyle.assistantActionShadow}
            >
              <VoiceAssistantIcon name="speaker" size={18} color="#0A7CFF" />
            </TouchableOpacity>
            <TouchableOpacity
              className={voiceAssistantBubbleThemeClass.assistantActionButton}
              style={voiceAssistantThemeStyle.assistantActionShadow}
            >
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

  return (
    <View className={voiceAssistantBubbleThemeClass.assistantBubble}>
      <Text className={voiceAssistantBubbleThemeClass.assistantText}>
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
  );
}
