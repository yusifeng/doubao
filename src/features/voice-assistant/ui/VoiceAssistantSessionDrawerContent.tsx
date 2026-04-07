import { useMemo, useState } from "react";
import {
  ScrollView,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { voiceAssistantConversationThemeClass } from "../../../core/theme/mappers";
import type { UseTextChatResult } from "../runtime/useTextChat";
import { VoiceAssistantIcon } from "./VoiceAssistantIcon";

type VoiceAssistantSessionDrawerContentProps = {
  session: UseTextChatResult;
  onClose: () => void;
  onSelectConversation: (conversationId: string) => Promise<void> | void;
  onCreateConversation: () => Promise<void> | void;
  onOpenSettings: () => Promise<void> | void;
};

function formatConversationTime(updatedAt: number): string {
  const date = new Date(updatedAt);
  const now = new Date();
  if (date.toDateString() === now.toDateString()) {
    return date.toLocaleTimeString("zh-CN", {
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    });
  }
  return `${date.getMonth() + 1}/${date.getDate()}`;
}

function ConversationAvatar({
  index,
  isActive,
}: {
  index: number;
  isActive: boolean;
}) {
  if (isActive) {
    return (
      <View className="h-10 w-10 items-center justify-center rounded-xl bg-[#007AFF]/10">
        <VoiceAssistantIcon name="chat" color="#007AFF" size={18} />
      </View>
    );
  }

  return (
    <View className="h-10 w-10 items-center justify-center rounded-xl bg-[#F4F5F6]">
      <VoiceAssistantIcon name="chat" color="#9CA3AF" size={18} />
    </View>
  );
}

export function VoiceAssistantSessionDrawerContent({
  session,
  onClose,
  onSelectConversation,
  onCreateConversation,
  onOpenSettings,
}: VoiceAssistantSessionDrawerContentProps) {
  const [searchQuery, setSearchQuery] = useState("");

  const filteredConversations = useMemo(() => {
    const query = searchQuery.trim().toLowerCase();
    return session.conversations.filter((conversation) => {
      if (!query) {
        return true;
      }
      return [conversation.title, conversation.lastMessage]
        .join(" ")
        .toLowerCase()
        .includes(query);
    });
  }, [searchQuery, session.conversations]);

  return (
    <SafeAreaView edges={["top", "bottom"]} className="flex-1 bg-[#FDFDFD]">
      <View
        className="flex-1 bg-[#FDFDFD] px-4 pb-6 pt-5"
        testID="conversation-drawer-content"
      >
        <View className={voiceAssistantConversationThemeClass.drawerSearchWrap}>
          <View
            className={voiceAssistantConversationThemeClass.drawerSearchInner}
          >
            <VoiceAssistantIcon name="search" size={18} color="#9CA3AF" />
            <TextInput
              className={voiceAssistantConversationThemeClass.drawerSearchInput}
              onChangeText={setSearchQuery}
              placeholder="搜索"
              placeholderTextColor="#9CA3AF"
              testID="conversation-drawer-search-input"
              value={searchQuery}
            />
          </View>
          <TouchableOpacity
            className={voiceAssistantConversationThemeClass.drawerSearchAction}
            onPress={() => void onCreateConversation()}
            testID="conversation-create-button"
          >
            <VoiceAssistantIcon name="compose" size={20} color="#111827" />
          </TouchableOpacity>
        </View>

        <View className="h-3" />

        <ScrollView
          showsVerticalScrollIndicator={false}
          contentContainerStyle={{ paddingBottom: 20 }}
        >
          {filteredConversations.length === 0 ? (
            <View className="rounded-[20px] bg-slate-50 px-4 py-4">
              <Text className="text-[14px] leading-6 text-slate-500">
                没有匹配的会话。
              </Text>
            </View>
          ) : (
            filteredConversations.map((conversation, index) => {
              const isActive = conversation.id === session.activeConversationId;
              return (
                <TouchableOpacity
                  key={conversation.id}
                  className={`${voiceAssistantConversationThemeClass.drawerConversationRow} ${isActive ? "bg-[#F1F6FF]" : "bg-transparent"}`}
                  onPress={() => void onSelectConversation(conversation.id)}
                  testID={
                    isActive
                      ? "conversation-current-session-row"
                      : `conversation-row-${conversation.id}`
                  }
                >
                  <ConversationAvatar index={index} isActive={isActive} />
                  <View
                    className={
                      voiceAssistantConversationThemeClass.drawerConversationBody
                    }
                  >
                    <Text
                      className={
                        voiceAssistantConversationThemeClass.drawerConversationTitle
                      }
                      numberOfLines={1}
                    >
                      {conversation.title}
                    </Text>
                  </View>
                  <View className="items-end">
                    <Text
                      className={
                        voiceAssistantConversationThemeClass.drawerConversationMeta
                      }
                    >
                      {formatConversationTime(conversation.updatedAt)}
                    </Text>
                  </View>
                </TouchableOpacity>
              );
            })
          )}
        </ScrollView>

        <View className={voiceAssistantConversationThemeClass.drawerFooter}>
          <TouchableOpacity
            className="flex-row items-center gap-2 rounded-full px-2 py-2"
            onPress={() => void onOpenSettings()}
            testID="conversation-drawer-open-settings-button"
          >
            <VoiceAssistantIcon name="settings" size={20} color="#64748B" />
            <Text className="text-[14px] font-medium text-slate-500">设置</Text>
          </TouchableOpacity>
        </View>
      </View>
    </SafeAreaView>
  );
}
