import { useEffect, useMemo, useState } from 'react';
import { ScrollView, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import {
  voiceAssistantConversationThemeClass,
  voiceAssistantThemeStyle,
} from '../../../core/theme/mappers';
import type { UseTextChatResult } from '../runtime/useTextChat';
import type { Message } from '../types/model';
import { VoiceAssistantMessageBubble } from './VoiceAssistantMessageBubble';
import { VoiceAssistantIcon } from './VoiceAssistantIcon';
import { VoiceAssistantScreen } from './VoiceAssistantScreen';

type ConversationScreenMode = 'text' | 'voice';

type VoiceAssistantConversationScreenProps = {
  session: UseTextChatResult;
  mode: ConversationScreenMode;
  onChangeMode: (mode: ConversationScreenMode) => void;
  onOpenDrawer: () => void;
};

export function VoiceAssistantConversationScreen({
  session,
  mode,
  onChangeMode,
  onOpenDrawer,
}: VoiceAssistantConversationScreenProps) {
  const [draft, setDraft] = useState('');
  const [voiceDisplayMode, setVoiceDisplayMode] = useState<'avatar' | 'dialogue'>('avatar');

  const activeConversation = useMemo(
    () => session.conversations.find((conversation) => conversation.id === session.activeConversationId) ?? null,
    [session.activeConversationId, session.conversations],
  );
  const pendingAssistantMessage = useMemo<Message | null>(() => {
    const raw = session.pendingAssistantReply.trim();
    if (!raw && session.status !== 'thinking') {
      return null;
    }
    if (!session.activeConversationId) {
      return null;
    }
    return {
      id: 'pending-assistant-reply',
      conversationId: session.activeConversationId,
      role: 'assistant',
      content: raw || '思考中...',
      type: 'text',
      createdAt: Date.now(),
    };
  }, [session.activeConversationId, session.pendingAssistantReply, session.status]);

  const canSend = draft.trim().length > 0;

  useEffect(() => {
    if (mode !== 'voice') {
      setVoiceDisplayMode('avatar');
    }
  }, [mode]);

  async function onSend() {
    const clean = draft.trim();
    if (!clean) {
      return;
    }
    await session.sendText(clean);
    setDraft('');
  }

  return (
    <SafeAreaView edges={['top', 'bottom']} className={voiceAssistantConversationThemeClass.safeArea}>
      <View className={voiceAssistantConversationThemeClass.screen}>
        <View className={voiceAssistantConversationThemeClass.header}>
          <View className={voiceAssistantConversationThemeClass.headerRow}>
            <TouchableOpacity
              className={voiceAssistantConversationThemeClass.headerButton}
              onPress={onOpenDrawer}
              testID="conversation-open-drawer-button"
            >
              <VoiceAssistantIcon name="menu" size={22} color="#111827" />
            </TouchableOpacity>
            <View className={voiceAssistantConversationThemeClass.headerCenter}>
              <Text className={voiceAssistantConversationThemeClass.headerTitle}>
                {activeConversation?.title ?? '默认会话'}
              </Text>
              <Text className={voiceAssistantConversationThemeClass.headerSubtext}>
                {mode === 'voice' ? '语音对话中会继续沿用当前上下文' : session.textReplySourceLabel}
              </Text>
            </View>
            <TouchableOpacity
              className={voiceAssistantConversationThemeClass.headerButton}
              onPress={() => onChangeMode(mode === 'voice' ? 'text' : 'voice')}
              testID="conversation-mode-toggle-button"
            >
              <VoiceAssistantIcon name={mode === 'voice' ? 'text' : 'phone'} size={20} color="#111827" />
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
          {pendingAssistantMessage ? <VoiceAssistantMessageBubble message={pendingAssistantMessage} /> : null}
        </ScrollView>

        <View className={voiceAssistantConversationThemeClass.composerDock}>
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
            onPress={() => onChangeMode('voice')}
            testID="conversation-open-voice-button"
          >
            <VoiceAssistantIcon name="mic" size={22} color="#111827" />
          </TouchableOpacity>

          <TouchableOpacity
            className={`${voiceAssistantConversationThemeClass.primaryComposerAction} ${
              canSend ? '' : 'opacity-40'
            }`}
            disabled={!canSend}
            onPress={onSend}
            testID="conversation-send-button"
          >
            <Text className={voiceAssistantConversationThemeClass.primaryComposerActionText}>发送</Text>
          </TouchableOpacity>
        </View>

        {mode === 'voice' ? (
          <View className="absolute inset-0 z-20">
            <VoiceAssistantScreen
              session={session}
              onExitVoice={() => onChangeMode('text')}
              onOpenDrawer={onOpenDrawer}
              autoStartOnMount
              displayMode={voiceDisplayMode}
              onToggleDisplayMode={() => {
                setVoiceDisplayMode((current) => (current === 'avatar' ? 'dialogue' : 'avatar'));
              }}
            />
          </View>
        ) : null}
      </View>
    </SafeAreaView>
  );
}
