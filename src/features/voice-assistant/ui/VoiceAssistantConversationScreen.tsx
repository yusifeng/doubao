import { useMemo, useState } from 'react';
import { ScrollView, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import {
  voiceAssistantConversationThemeClass,
  voiceAssistantThemeStyle,
} from '../../../core/theme/mappers';
import type { UseTextChatResult } from '../runtime/useTextChat';
import { VoiceAssistantMessageBubble } from './VoiceAssistantMessageBubble';
import { VoiceAssistantIcon } from './VoiceAssistantIcon';

type VoiceAssistantConversationScreenProps = {
  session: UseTextChatResult;
  onOpenVoice: () => void;
  onGoHome?: () => void;
};

export function VoiceAssistantConversationScreen({
  session,
  onOpenVoice,
  onGoHome,
}: VoiceAssistantConversationScreenProps) {
  const [draft, setDraft] = useState('');
  const activeConversation = useMemo(
    () => session.conversations.find((conversation) => conversation.id === session.activeConversationId),
    [session.activeConversationId, session.conversations],
  );

  async function onSend() {
    const clean = draft.trim();
    if (!clean) {
      return;
    }
    await session.sendText(clean);
    setDraft('');
  }

  const canSend = draft.trim().length > 0;

  return (
    <SafeAreaView edges={['top', 'bottom']} className={voiceAssistantConversationThemeClass.safeArea}>
      <View className={voiceAssistantConversationThemeClass.screen}>
        <View className={voiceAssistantConversationThemeClass.header}>
          <View className={voiceAssistantConversationThemeClass.headerRow}>
            <TouchableOpacity
              className={voiceAssistantConversationThemeClass.headerButton}
              onPress={onGoHome}
              testID="conversation-go-home-button"
            >
              <VoiceAssistantIcon name="back" size={22} color="#111827" />
            </TouchableOpacity>
            <View className={voiceAssistantConversationThemeClass.headerCenter}>
              <Text className={voiceAssistantConversationThemeClass.headerTitle}>
                {activeConversation?.title ?? '默认会话'}
              </Text>
              <Text className={voiceAssistantConversationThemeClass.headerSubtext}>
                当前为文字对话模式
              </Text>
            </View>
            <TouchableOpacity
              className={voiceAssistantConversationThemeClass.headerButton}
              onPress={onOpenVoice}
              testID="conversation-open-voice-button"
            >
              <VoiceAssistantIcon name="phone" size={20} color="#111827" />
            </TouchableOpacity>
          </View>

          <View className={voiceAssistantConversationThemeClass.modeSwitchRow}>
            <View className={voiceAssistantConversationThemeClass.modeChipActive}>
              <VoiceAssistantIcon name="text" size={16} color="#0F172A" />
              <Text className={voiceAssistantConversationThemeClass.modeChipActiveText}>文字对话</Text>
            </View>
            <TouchableOpacity className={voiceAssistantConversationThemeClass.modeChip} onPress={onOpenVoice}>
              <VoiceAssistantIcon name="phone" size={16} color="#475569" />
              <Text className={voiceAssistantConversationThemeClass.modeChipText}>语音通话</Text>
            </TouchableOpacity>
          </View>
        </View>

        <ScrollView
          className={voiceAssistantConversationThemeClass.messageArea}
          contentContainerStyle={voiceAssistantThemeStyle.conversationScrollContent}
          showsVerticalScrollIndicator={false}
        >
          {session.messages.length === 0 ? (
            <View className={voiceAssistantConversationThemeClass.emptyBubble}>
              <Text className={voiceAssistantConversationThemeClass.emptyBubbleText}>
                你好呀，有什么想聊的吗？
              </Text>
            </View>
          ) : null}
          {session.messages.map((message) => (
            <VoiceAssistantMessageBubble key={message.id} message={message} />
          ))}
        </ScrollView>

        <View className={voiceAssistantConversationThemeClass.composerMetaRow}>
          <Text className={voiceAssistantConversationThemeClass.composerMetaText}>
            语音模式下会自动听说；文字模式下可直接输入发送。
          </Text>
          <TouchableOpacity
            className={voiceAssistantConversationThemeClass.connectionTextButton}
            onPress={session.testS2SConnection}
            testID="conversation-s2s-test-button"
          >
            <Text className={voiceAssistantConversationThemeClass.connectionTextButtonText}>连接测试</Text>
          </TouchableOpacity>
        </View>

        <View className={voiceAssistantConversationThemeClass.composerDock}>
          <TouchableOpacity className={voiceAssistantConversationThemeClass.iconButton}>
            <VoiceAssistantIcon name="camera" size={23} color="#111827" />
          </TouchableOpacity>

          <View className={voiceAssistantConversationThemeClass.inputShell}>
            <TextInput
              className={voiceAssistantConversationThemeClass.inputField}
              onChangeText={setDraft}
              placeholder="输入消息"
              placeholderTextColor="#9CA3AF"
              testID="conversation-message-input"
              value={draft}
            />
          </View>

          <TouchableOpacity
            className={voiceAssistantConversationThemeClass.iconButtonSoft}
            onPress={onOpenVoice}
          >
            <VoiceAssistantIcon name="mic" size={22} color="#111827" />
          </TouchableOpacity>

          {canSend ? (
            <TouchableOpacity
              className={voiceAssistantConversationThemeClass.primaryComposerAction}
              onPress={onSend}
              testID="conversation-send-button"
            >
              <Text className={voiceAssistantConversationThemeClass.primaryComposerActionText}>发送</Text>
            </TouchableOpacity>
          ) : (
            <TouchableOpacity className={voiceAssistantConversationThemeClass.iconButton}>
              <View className="h-8 w-8 items-center justify-center rounded-full border border-slate-900">
                <VoiceAssistantIcon name="plus" size={18} color="#111827" />
              </View>
            </TouchableOpacity>
          )}
        </View>
      </View>
    </SafeAreaView>
  );
}
