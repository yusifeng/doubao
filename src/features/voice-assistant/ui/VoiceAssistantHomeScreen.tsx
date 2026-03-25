import { useMemo } from 'react';
import { ScrollView, Text, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import {
  voiceAssistantListThemeClass,
  voiceAssistantThemeStyle,
} from '../../../core/theme/mappers';
import type { Conversation } from '../types/model';
import type { UseTextChatResult } from '../runtime/useTextChat';
import { VOICE_ASSISTANT_STATUS_LABEL } from '../config/constants';
import { VoiceAssistantIcon } from './VoiceAssistantIcon';

type VoiceAssistantHomeScreenProps = {
  session: UseTextChatResult;
  onOpenConversation: () => void;
  onOpenVoice: () => void;
};

function formatConversationTime(updatedAt: number): string {
  const date = new Date(updatedAt);
  const now = new Date();
  const sameDay = date.toDateString() === now.toDateString();
  if (sameDay) {
    return date.toLocaleTimeString('zh-CN', {
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
    });
  }
  return `${date.getMonth() + 1}/${date.getDate()}`;
}

function buildConversationPreview(conversation: Conversation): string {
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
          <Text className={voiceAssistantListThemeClass.listAvatarText}>会</Text>
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

export function VoiceAssistantHomeScreen({
  session,
  onOpenConversation,
  onOpenVoice,
}: VoiceAssistantHomeScreenProps) {
  const activeConversation = useMemo(
    () => session.conversations.find((conversation) => conversation.id === session.activeConversationId) ?? null,
    [session.activeConversationId, session.conversations],
  );

  const conversations = useMemo(() => {
    return session.conversations.map((conversation) => ({
      ...conversation,
      preview: buildConversationPreview(conversation),
      meta: formatConversationTime(conversation.updatedAt),
      isActive: conversation.id === session.activeConversationId,
    }));
  }, [session.activeConversationId, session.conversations]);

  return (
    <SafeAreaView edges={['top', 'bottom']} className={voiceAssistantListThemeClass.safeArea}>
      <View className={voiceAssistantListThemeClass.screen}>
        <View className={voiceAssistantListThemeClass.header}>
          <View className={voiceAssistantListThemeClass.headerSide}>
            <TouchableOpacity className={voiceAssistantListThemeClass.headerAction}>
              <VoiceAssistantIcon name="menu" size={20} color="#111827" />
            </TouchableOpacity>
          </View>
          <View className={voiceAssistantListThemeClass.headerCenter}>
            <Text className={voiceAssistantListThemeClass.headerTitle}>对话</Text>
          </View>
          <View className={`${voiceAssistantListThemeClass.headerSide} justify-end`}>
            <TouchableOpacity className={voiceAssistantListThemeClass.headerAction}>
              <VoiceAssistantIcon name="search" size={20} color="#111827" />
            </TouchableOpacity>
          </View>
        </View>

        <TouchableOpacity
          className={voiceAssistantListThemeClass.featuredCard}
          onPress={onOpenVoice}
          testID="open-voice-button"
          style={voiceAssistantThemeStyle.listFeaturedShadow}
        >
          <View className={voiceAssistantListThemeClass.featuredAvatarOuter}>
            <View className={voiceAssistantListThemeClass.featuredAvatarInner}>
              <Text className={voiceAssistantListThemeClass.featuredAvatarText}>豆</Text>
            </View>
          </View>
          <View className={voiceAssistantListThemeClass.featuredBody}>
            <View className={voiceAssistantListThemeClass.featuredTitleRow}>
              <Text className={voiceAssistantListThemeClass.featuredTitle}>豆包</Text>
              <View className={voiceAssistantListThemeClass.featuredBadge}>
                <Text className={voiceAssistantListThemeClass.featuredBadgeText}>实时语音</Text>
              </View>
            </View>
            <Text className={voiceAssistantListThemeClass.featuredSubtitle}>
              {activeConversation?.title ?? '默认会话'}
            </Text>
            <Text className="mt-1 text-[12px] leading-4 text-slate-400">
              {session.voiceRuntimeHint}
            </Text>
          </View>
          <View className={voiceAssistantListThemeClass.featuredVoiceButton}>
            <VoiceAssistantIcon name="phone" size={18} color="#FFFFFF" />
          </View>
        </TouchableOpacity>

        <Text className={voiceAssistantListThemeClass.sectionLabel}>本地会话</Text>

        {conversations.length === 0 ? (
          <View className={voiceAssistantListThemeClass.emptyState}>
            <Text className={voiceAssistantListThemeClass.emptyStateTitle}>还没有会话记录</Text>
            <Text className={voiceAssistantListThemeClass.emptyStateBody}>
              先开始一轮文字或语音对话，新的会话会出现在这里。
            </Text>
          </View>
        ) : (
          <ScrollView
            contentContainerStyle={voiceAssistantThemeStyle.listScrollContent}
            showsVerticalScrollIndicator={false}
          >
            {conversations.map((conversation, index) => (
              <TouchableOpacity
                key={conversation.id}
                className={voiceAssistantListThemeClass.listRow}
                onPress={conversation.isActive ? onOpenConversation : undefined}
                testID={conversation.isActive ? 'open-conversation-button' : undefined}
                disabled={!conversation.isActive}
              >
                <ConversationAvatar index={index} isActive={conversation.isActive} />
                <View className={voiceAssistantListThemeClass.listBody}>
                  <Text className={voiceAssistantListThemeClass.listTitle}>{conversation.title}</Text>
                  <Text className={voiceAssistantListThemeClass.listPreview} numberOfLines={1}>
                    {conversation.preview}
                  </Text>
                </View>
                <View className="items-end">
                  <Text className={voiceAssistantListThemeClass.listMeta}>{conversation.meta}</Text>
                  <Text className="mt-1 text-[11px] text-slate-300">
                    {VOICE_ASSISTANT_STATUS_LABEL[conversation.status]}
                  </Text>
                </View>
              </TouchableOpacity>
            ))}
          </ScrollView>
        )}

        <View className={voiceAssistantListThemeClass.bottomTabs}>
          <View className={voiceAssistantListThemeClass.bottomTabsRow}>
            <View className={voiceAssistantListThemeClass.tabItem}>
              <View>
                <VoiceAssistantIcon name="chat" size={26} color="#000000" />
                <View className={voiceAssistantListThemeClass.tabBadge}>
                  <Text className={voiceAssistantListThemeClass.tabBadgeText}>
                    {String(Math.max(1, conversations.length))}
                  </Text>
                </View>
              </View>
              <Text className={voiceAssistantListThemeClass.tabLabelActive}>对话</Text>
            </View>
            <TouchableOpacity className={voiceAssistantListThemeClass.tabItem} onPress={onOpenVoice}>
              <View className="h-7 w-7 items-center justify-center rounded-[8px] border-2 border-slate-400">
                <VoiceAssistantIcon name="phone" size={16} color="#71717A" />
              </View>
              <Text className={voiceAssistantListThemeClass.tabLabel}>语音</Text>
            </TouchableOpacity>
            <View className={voiceAssistantListThemeClass.tabItem}>
              <VoiceAssistantIcon name="profile" size={26} color="#71717A" />
              <Text className={voiceAssistantListThemeClass.tabLabel}>我的</Text>
            </View>
          </View>
        </View>
      </View>
    </SafeAreaView>
  );
}
