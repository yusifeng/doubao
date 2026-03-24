import { useMemo, useState } from 'react';
import { ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import type { UseTextChatResult } from '../runtime/useTextChat';
import { VOICE_ASSISTANT_STATUS_LABEL } from '../config/constants';
import { extractAssistantDisplaySegments } from '../service/assistantText';

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
    await session.sendText(draft);
    setDraft('');
  }

  return (
    <SafeAreaView edges={['top']} style={styles.safeArea}>
      <View className="flex-1 px-4 pb-4 pt-2">
        <View className="flex-1 overflow-hidden rounded-[32px] border border-amber-200 bg-white" style={styles.shellShadow}>
          <View className="bg-orange-400 px-5 pb-5 pt-6">
            <Text className="text-xs font-bold uppercase tracking-[1.8px] text-orange-50">
              Conversation
            </Text>
            <Text className="mt-3 text-4xl font-black leading-[46px] text-white">
              {activeConversation?.title ?? '默认会话'}
            </Text>
            <Text className="mt-3 text-base leading-6 text-orange-50">
              状态：{VOICE_ASSISTANT_STATUS_LABEL[session.status]}，支持文本输入和跳转到语音页。
            </Text>
            <View className="mt-4 flex-row flex-wrap gap-2.5">
              {onGoHome ? (
                <TouchableOpacity
                  className="rounded-full border border-orange-50/60 bg-orange-50/15 px-4 py-2 active:bg-orange-50/25"
                  onPress={onGoHome}
                  testID="conversation-go-home-button"
                >
                  <Text className="text-sm font-semibold text-white">返回首页</Text>
                </TouchableOpacity>
              ) : null}
              <TouchableOpacity
                className="rounded-full border border-orange-50/60 bg-orange-50/15 px-4 py-2 active:bg-orange-50/25"
                onPress={onOpenVoice}
                testID="conversation-hero-open-voice-button"
              >
                <Text className="text-sm font-semibold text-white">切到语音页</Text>
              </TouchableOpacity>
            </View>
          </View>

          <View className="flex-1 px-4 py-4">
            <View className="flex-row flex-wrap gap-3">
              <TouchableOpacity
                className="rounded-full bg-amber-400 px-5 py-3 active:bg-amber-500"
                onPress={onOpenVoice}
                testID="conversation-open-voice-button"
              >
                <Text className="text-[15px] font-bold text-amber-950">开始通话</Text>
              </TouchableOpacity>
              <TouchableOpacity
                className="rounded-full border border-orange-200 bg-orange-50 px-5 py-3 active:bg-orange-100"
                onPress={session.testS2SConnection}
                testID="conversation-s2s-test-button"
              >
                <Text className="text-[15px] font-semibold text-slate-700">连接测试</Text>
              </TouchableOpacity>
            </View>

            <View className="mt-4 flex-1 rounded-[28px] border border-orange-100 bg-white">
              <ScrollView contentContainerStyle={styles.messagesContent} showsVerticalScrollIndicator={false}>
                {session.messages.length === 0 ? (
                  <Text className="text-[16px] leading-7 text-slate-500">
                    还没有消息，先输入一句或者去语音页说话。
                  </Text>
                ) : null}
                {session.messages.map((message) => {
                  const isAssistant = message.role === 'assistant';
                  return (
                    <View
                      key={message.id}
                      className={
                        isAssistant
                          ? 'mb-3 self-start rounded-[24px] rounded-bl-md border border-amber-200 bg-amber-50 px-4 py-3'
                          : 'mb-3 self-end rounded-[24px] rounded-br-md bg-slate-900 px-4 py-3'
                      }
                      style={isAssistant ? styles.assistantBubbleMaxWidth : styles.userBubbleMaxWidth}
                    >
                      <Text
                        className={
                          isAssistant
                            ? 'text-xs font-semibold uppercase tracking-[1px] text-slate-500'
                            : 'text-xs font-semibold uppercase tracking-[1px] text-slate-300'
                        }
                      >
                        {isAssistant ? '助手' : '你'}
                      </Text>
                      {isAssistant ? (
                        <Text className="mt-2 text-[17px] leading-7 text-slate-800">
                          {extractAssistantDisplaySegments(message.content).map((segment, index) => (
                            <Text
                              key={`${message.id}-${index}`}
                              className={
                                segment.narration
                                  ? 'text-[16px] leading-7 text-slate-400'
                                  : 'text-[17px] leading-7 text-slate-800'
                              }
                            >
                              {segment.narration ? `（${segment.text}）` : segment.text}
                            </Text>
                          ))}
                        </Text>
                      ) : (
                        <Text className="mt-2 text-[17px] leading-7 text-white">{message.content}</Text>
                      )}
                    </View>
                  );
                })}
              </ScrollView>
            </View>
          </View>
        </View>

        <View
          className="mt-3 flex-row items-center rounded-[28px] border border-orange-200 bg-white px-3 py-3"
          style={styles.dockShadow}
        >
          <TextInput
            className="flex-1 px-3 py-2 text-[17px] text-slate-900"
            onChangeText={setDraft}
            placeholder="输入你的问题"
            placeholderTextColor="#94A3B8"
            testID="conversation-message-input"
            value={draft}
          />
          <TouchableOpacity
            className="ml-3 rounded-full bg-rose-500 px-5 py-3 active:bg-rose-600"
            onPress={onSend}
            testID="conversation-send-button"
          >
            <Text className="text-base font-bold text-white">发送</Text>
          </TouchableOpacity>
        </View>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: '#FFF4E8',
  },
  shellShadow: {
    shadowColor: '#C9731F',
    shadowOpacity: 0.12,
    shadowRadius: 18,
    shadowOffset: { width: 0, height: 10 },
    elevation: 3,
  },
  messagesContent: {
    paddingHorizontal: 14,
    paddingTop: 14,
    paddingBottom: 22,
  },
  assistantBubbleMaxWidth: {
    maxWidth: '92%',
  },
  userBubbleMaxWidth: {
    maxWidth: '88%',
  },
  dockShadow: {
    shadowColor: '#D97706',
    shadowOpacity: 0.08,
    shadowRadius: 14,
    shadowOffset: { width: 0, height: 6 },
    elevation: 2,
  },
});
