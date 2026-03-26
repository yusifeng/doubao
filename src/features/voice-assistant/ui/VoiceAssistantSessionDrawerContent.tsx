import { useMemo, useState } from 'react';
import { ScrollView, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import {
  voiceAssistantConversationThemeClass,
  voiceAssistantListThemeClass,
} from '../../../core/theme/mappers';
import type { UseTextChatResult } from '../runtime/useTextChat';
import { VoiceAssistantIcon } from './VoiceAssistantIcon';

type VoiceAssistantSessionDrawerContentProps = {
  session: UseTextChatResult;
  onClose: () => void;
  onSelectConversation: (conversationId: string) => Promise<void> | void;
  onCreateConversation: () => Promise<void> | void;
  onOpenVoice: () => Promise<void> | void;
};

function formatConversationTime(updatedAt: number): string {
  const date = new Date(updatedAt);
  const now = new Date();
  if (date.toDateString() === now.toDateString()) {
    return date.toLocaleTimeString('zh-CN', {
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
    });
  }
  return `${date.getMonth() + 1}/${date.getDate()}`;
}

function buildConversationPreview(session: UseTextChatResult, conversationId: string): string {
  const conversation = session.conversations.find((item) => item.id === conversationId);
  if (!conversation) {
    return '点击进入，继续这段对话。';
  }
  const preview = conversation.lastMessage.trim();
  if (preview) {
    return preview;
  }
  switch (conversation.status) {
    case 'listening':
      return '正在听你说，准备开始下一轮。';
    case 'thinking':
      return '正在思考这一轮回复。';
    case 'speaking':
      return '正在播报回复。';
    case 'error':
      return '这一轮出现问题，请重试。';
    case 'idle':
    default:
      return '点击进入，继续这段对话。';
  }
}

function ConversationAvatar({ index, isActive }: { index: number; isActive: boolean }) {
  if (isActive) {
    return (
      <View className={`${voiceAssistantListThemeClass.listAvatarOuter} bg-sky-50`}>
        <View className={`${voiceAssistantListThemeClass.listAvatarInner} bg-sky-100`}>
          <Text className={`${voiceAssistantListThemeClass.listAvatarText} text-sky-700`}>会</Text>
        </View>
      </View>
    );
  }

  const palette = [
    { outer: 'bg-violet-50', inner: 'bg-violet-100' },
    { outer: 'bg-pink-50', inner: 'bg-pink-100' },
    { outer: 'bg-amber-50', inner: 'bg-yellow-100' },
    { outer: 'bg-emerald-50', inner: 'bg-emerald-100' },
  ][index % 4];

  return (
    <View className={`${voiceAssistantListThemeClass.listAvatarOuter} ${palette.outer}`}>
      <View className={`${voiceAssistantListThemeClass.listAvatarInner} ${palette.inner}`}>
        <VoiceAssistantIcon name="chat" color="#64748B" size={20} />
      </View>
    </View>
  );
}

export function VoiceAssistantSessionDrawerContent({
  session,
  onClose,
  onSelectConversation,
  onCreateConversation,
  onOpenVoice,
}: VoiceAssistantSessionDrawerContentProps) {
  const [searchQuery, setSearchQuery] = useState('');

  const filteredConversations = useMemo(() => {
    const query = searchQuery.trim().toLowerCase();
    return session.conversations.filter((conversation) => {
      if (!query) {
        return true;
      }
      return [conversation.title, conversation.lastMessage]
        .join(' ')
        .toLowerCase()
        .includes(query);
    });
  }, [searchQuery, session.conversations]);

  return (
    <SafeAreaView edges={['top', 'bottom']} className="flex-1 bg-white">
      <View className="flex-1 bg-white px-4 pb-6 pt-3" testID="conversation-drawer-content">
        <View className={voiceAssistantConversationThemeClass.drawerHeader}>
          <Text className={voiceAssistantConversationThemeClass.drawerTitle}>会话</Text>
          <TouchableOpacity
            className={voiceAssistantConversationThemeClass.headerButton}
            onPress={onClose}
            testID="conversation-close-drawer-button"
          >
            <VoiceAssistantIcon name="close" size={20} color="#111827" />
          </TouchableOpacity>
        </View>

        <View className={voiceAssistantConversationThemeClass.drawerSearchWrap}>
          <VoiceAssistantIcon name="search" size={18} color="#9CA3AF" />
          <TextInput
            className={voiceAssistantConversationThemeClass.drawerSearchInput}
            onChangeText={setSearchQuery}
            placeholder="搜索会话"
            placeholderTextColor="#9CA3AF"
            testID="conversation-drawer-search-input"
            value={searchQuery}
          />
        </View>

        <View className={voiceAssistantConversationThemeClass.drawerActionRow}>
          <TouchableOpacity
            className={voiceAssistantConversationThemeClass.drawerPrimaryAction}
            onPress={() => void onCreateConversation()}
            testID="conversation-create-button"
          >
            <Text className={voiceAssistantConversationThemeClass.drawerPrimaryActionText}>新建会话</Text>
          </TouchableOpacity>
          <TouchableOpacity
            className={voiceAssistantConversationThemeClass.drawerGhostAction}
            onPress={() => void onOpenVoice()}
            testID="conversation-drawer-open-voice-button"
          >
            <Text className={voiceAssistantConversationThemeClass.drawerGhostActionText}>切到语音</Text>
          </TouchableOpacity>
        </View>

        <Text className={voiceAssistantConversationThemeClass.drawerSectionLabel}>本地会话</Text>

        <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 20 }}>
          {filteredConversations.length === 0 ? (
            <View className="rounded-[20px] bg-slate-50 px-4 py-4">
              <Text className="text-[14px] leading-6 text-slate-500">没有匹配的会话。</Text>
            </View>
          ) : (
            filteredConversations.map((conversation, index) => {
              const isActive = conversation.id === session.activeConversationId;
              return (
                <TouchableOpacity
                  key={conversation.id}
                  className={voiceAssistantConversationThemeClass.drawerConversationRow}
                  onPress={() => void onSelectConversation(conversation.id)}
                  testID={isActive ? 'conversation-current-session-row' : `conversation-row-${conversation.id}`}
                >
                  <ConversationAvatar index={index} isActive={isActive} />
                  <View className={voiceAssistantConversationThemeClass.drawerConversationBody}>
                    <Text className={voiceAssistantConversationThemeClass.drawerConversationTitle}>
                      {conversation.title}
                    </Text>
                    <Text
                      className={voiceAssistantConversationThemeClass.drawerConversationPreview}
                      numberOfLines={1}
                    >
                      {buildConversationPreview(session, conversation.id)}
                    </Text>
                  </View>
                  <View className="items-end">
                    <Text className={voiceAssistantConversationThemeClass.drawerConversationMeta}>
                      {formatConversationTime(conversation.updatedAt)}
                    </Text>
                    {isActive ? (
                      <View className={voiceAssistantConversationThemeClass.drawerConversationActiveBadge}>
                        <Text className={voiceAssistantConversationThemeClass.drawerConversationActiveBadgeText}>
                          当前会话
                        </Text>
                      </View>
                    ) : null}
                  </View>
                </TouchableOpacity>
              );
            })
          )}
        </ScrollView>

        <View className={voiceAssistantConversationThemeClass.drawerFooter}>
          <TouchableOpacity
            className={voiceAssistantConversationThemeClass.drawerFooterButton}
            onPress={session.testS2SConnection}
            testID="conversation-drawer-s2s-test-button"
          >
            <Text className={voiceAssistantConversationThemeClass.drawerFooterButtonText}>连接测试</Text>
          </TouchableOpacity>
        </View>
      </View>
    </SafeAreaView>
  );
}
