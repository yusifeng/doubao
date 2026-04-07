import { useMemo, useRef, useState } from 'react';
import {
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
import { AppDialog } from '../../../shared/ui/AppDialog';

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
  const [actionDialogVisible, setActionDialogVisible] = useState(false);
  const [pendingRenameConversation, setPendingRenameConversation] = useState<Conversation | null>(null);
  const [renameConversation, setRenameConversation] = useState<Conversation | null>(null);
  const [renameDialogVisible, setRenameDialogVisible] = useState(false);
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
    setPendingRenameConversation(conversation);
    setActionDialogVisible(false);
  };

  const handleRenameConfirm = async () => {
    if (!renameConversation || !onRenameConversation) {
      setRenameDialogVisible(false);
      setRenameDraft('');
      return;
    }
    const nextTitle = renameDraft.trim();
    if (!nextTitle) {
      return;
    }
    await onRenameConversation(renameConversation.id, nextTitle);
    setRenameDialogVisible(false);
    setRenameDraft('');
  };

  const handleDeleteConversation = async () => {
    if (!actionConversation || !onDeleteConversation) {
      setActionDialogVisible(false);
      return;
    }
    await onDeleteConversation(actionConversation.id);
    setActionDialogVisible(false);
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
                    setActionDialogVisible(true);
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

      <AppDialog
        visible={actionDialogVisible}
        title={actionConversation?.title}
        onBackdropPress={() => setActionDialogVisible(false)}
        onModalHide={() => {
          if (!actionDialogVisible) {
            setActionConversation(null);
            if (pendingRenameConversation) {
              setRenameConversation(pendingRenameConversation);
              setRenameDraft(pendingRenameConversation.title);
              setRenameDialogVisible(true);
              setPendingRenameConversation(null);
            }
          }
        }}
        testID="conversation-action-menu-backdrop"
      >
        <View testID="conversation-action-menu">
          <TouchableOpacity
            className="flex-row items-center justify-between px-1 py-3"
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
            className="border-t border-black/5 px-1 py-3"
            onPress={() => {
              void handleDeleteConversation();
            }}
            testID="conversation-action-delete-button"
          >
            <Text className="text-[15px] text-[#DC2626]">从对话列表删除</Text>
          </TouchableOpacity>
        </View>
      </AppDialog>

      <AppDialog
        visible={renameDialogVisible}
        title="对话名称"
        onBackdropPress={() => {
          setRenameDialogVisible(false);
          setRenameDraft('');
        }}
        onModalHide={() => {
          if (!renameDialogVisible) {
            setRenameConversation(null);
          }
        }}
        testID="conversation-rename-modal-backdrop"
        actions={[
          {
            label: '取消',
            onPress: () => {
              setRenameDialogVisible(false);
              setRenameDraft('');
            },
            testID: 'conversation-rename-cancel-button',
          },
          {
            label: '确定',
            onPress: () => {
              void handleRenameConfirm();
            },
            testID: 'conversation-rename-confirm-button',
            variant: 'primary',
            disabled: renameDraft.trim().length === 0,
          },
        ]}
      >
        <View testID="conversation-rename-modal">
          <TextInput
            className="rounded-xl border border-[#D1D5DB] px-3 py-2 text-[16px] text-[#111827]"
            onChangeText={setRenameDraft}
            value={renameDraft}
            placeholder="请输入对话名称"
            placeholderTextColor="#9CA3AF"
            maxLength={40}
            autoFocus
            testID="conversation-rename-input"
          />
        </View>
      </AppDialog>
    </SafeAreaView>
  );
}
