import { useMemo, useRef, useState } from 'react';
import {
  Modal,
  Pressable,
  ScrollView,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { voiceAssistantConversationThemeClass } from '../../../core/theme/mappers';
import type { Conversation } from '../types/model';
import type { UseTextChatResult } from '../runtime/useTextChat';
import { VoiceAssistantIcon } from './VoiceAssistantIcon';

type VoiceAssistantSessionDrawerContentProps = {
  session: UseTextChatResult;
  onClose: () => void;
  onSelectConversation: (conversationId: string) => Promise<void> | void;
  onCreateConversation: () => Promise<void> | void;
  onRenameConversation?: (conversationId: string, title: string) => Promise<void> | void;
  onDeleteConversation?: (conversationId: string) => Promise<void> | void;
  onOpenSettings: () => Promise<void> | void;
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

function ConversationAvatar({ isActive }: { isActive: boolean }) {
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
  onRenameConversation,
  onDeleteConversation,
  onOpenSettings,
}: VoiceAssistantSessionDrawerContentProps) {
  const [searchQuery, setSearchQuery] = useState('');
  const [actionConversation, setActionConversation] = useState<Conversation | null>(null);
  const [renameConversation, setRenameConversation] = useState<Conversation | null>(null);
  const [renameDraft, setRenameDraft] = useState('');
  const longPressedConversationIdRef = useRef<string | null>(null);

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

  const openRenameDialog = (conversation: Conversation) => {
    setActionConversation(null);
    setRenameConversation(conversation);
    setRenameDraft(conversation.title);
  };

  const handleRenameConfirm = async () => {
    if (!renameConversation || !onRenameConversation) {
      setRenameConversation(null);
      setRenameDraft('');
      return;
    }
    const nextTitle = renameDraft.trim();
    if (!nextTitle) {
      return;
    }
    await onRenameConversation(renameConversation.id, nextTitle);
    setRenameConversation(null);
    setRenameDraft('');
  };

  const handleDeleteConversation = async () => {
    if (!actionConversation || !onDeleteConversation) {
      setActionConversation(null);
      return;
    }
    await onDeleteConversation(actionConversation.id);
    setActionConversation(null);
  };

  return (
    <SafeAreaView edges={['top', 'bottom']} className="flex-1 bg-[#FDFDFD]">
      <View
        className="flex-1 bg-[#FDFDFD] px-4 pb-6 pt-5"
        testID="conversation-drawer-content"
      >
        <View className="mb-3 flex-row items-center justify-between px-1">
          <Text className="text-[28px] font-semibold text-[#111827]">会话</Text>
          <TouchableOpacity
            className="h-10 w-10 items-center justify-center rounded-full"
            onPress={onClose}
            testID="conversation-close-drawer-button"
          >
            <VoiceAssistantIcon name="close" size={20} color="#111827" />
          </TouchableOpacity>
        </View>

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
            filteredConversations.map((conversation) => {
              const isActive = conversation.id === session.activeConversationId;
              return (
                <TouchableOpacity
                  key={conversation.id}
                  className={`${voiceAssistantConversationThemeClass.drawerConversationRow} ${isActive ? 'bg-[#F1F6FF]' : 'bg-transparent'}`}
                  onPress={() => {
                    if (longPressedConversationIdRef.current === conversation.id) {
                      longPressedConversationIdRef.current = null;
                      return;
                    }
                    void onSelectConversation(conversation.id);
                  }}
                  onLongPress={() => {
                    longPressedConversationIdRef.current = conversation.id;
                    setActionConversation(conversation);
                  }}
                  delayLongPress={220}
                  testID={
                    isActive
                      ? 'conversation-current-session-row'
                      : `conversation-row-${conversation.id}`
                  }
                >
                  <ConversationAvatar isActive={isActive} />
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

      <Modal
        transparent
        visible={actionConversation !== null}
        animationType="fade"
        onRequestClose={() => setActionConversation(null)}
      >
        <Pressable
          className="flex-1 items-center justify-center bg-black/30 px-8"
          onPress={() => setActionConversation(null)}
          testID="conversation-action-menu-backdrop"
        >
          <Pressable
            className="w-full max-w-[320px] overflow-hidden rounded-2xl bg-white"
            onPress={() => {}}
            testID="conversation-action-menu"
          >
            <View className="border-b border-black/5 px-4 py-3">
              <Text className="text-[16px] font-medium text-[#111827]" numberOfLines={1}>
                {actionConversation?.title ?? '会话'}
              </Text>
            </View>
            <TouchableOpacity
              className="flex-row items-center justify-between px-4 py-3"
              onPress={() => {
                if (!actionConversation) {
                  return;
                }
                openRenameDialog(actionConversation);
              }}
              testID="conversation-action-rename-button"
            >
              <Text className="text-[15px] text-[#111827]">编辑对话名称</Text>
              <VoiceAssistantIcon name="edit" size={16} color="#6B7280" />
            </TouchableOpacity>
            <TouchableOpacity
              className="border-t border-black/5 px-4 py-3"
              onPress={() => {
                void handleDeleteConversation();
              }}
              testID="conversation-action-delete-button"
            >
              <Text className="text-[15px] text-[#DC2626]">从对话列表删除</Text>
            </TouchableOpacity>
          </Pressable>
        </Pressable>
      </Modal>

      <Modal
        transparent
        visible={renameConversation !== null}
        animationType="fade"
        onRequestClose={() => {
          setRenameConversation(null);
          setRenameDraft('');
        }}
      >
        <Pressable
          className="flex-1 items-center justify-center bg-black/35 px-8"
          onPress={() => {
            setRenameConversation(null);
            setRenameDraft('');
          }}
          testID="conversation-rename-modal-backdrop"
        >
          <Pressable
            className="w-full max-w-[340px] rounded-2xl bg-white px-4 pb-3 pt-4"
            onPress={() => {}}
            testID="conversation-rename-modal"
          >
            <Text className="text-center text-[19px] font-semibold text-[#111827]">对话名称</Text>
            <TextInput
              className="mt-4 rounded-xl border border-[#D1D5DB] px-3 py-2 text-[16px] text-[#111827]"
              onChangeText={setRenameDraft}
              value={renameDraft}
              placeholder="请输入对话名称"
              placeholderTextColor="#9CA3AF"
              maxLength={40}
              autoFocus
              testID="conversation-rename-input"
            />
            <View className="mt-4 flex-row items-center justify-end gap-5 pr-1">
              <TouchableOpacity
                onPress={() => {
                  setRenameConversation(null);
                  setRenameDraft('');
                }}
                testID="conversation-rename-cancel-button"
              >
                <Text className="text-[16px] text-[#6B7280]">取消</Text>
              </TouchableOpacity>
              <TouchableOpacity
                onPress={() => {
                  void handleRenameConfirm();
                }}
                disabled={renameDraft.trim().length === 0}
                testID="conversation-rename-confirm-button"
              >
                <Text
                  className={`text-[16px] font-semibold ${
                    renameDraft.trim().length === 0 ? 'text-[#93C5FD]' : 'text-[#2563EB]'
                  }`}
                >
                  确定
                </Text>
              </TouchableOpacity>
            </View>
          </Pressable>
        </Pressable>
      </Modal>
    </SafeAreaView>
  );
}
