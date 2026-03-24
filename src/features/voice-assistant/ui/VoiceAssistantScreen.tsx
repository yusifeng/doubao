import { useMemo, useState } from 'react';
import { ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { VOICE_ASSISTANT_STATUS_LABEL } from '../config/constants';
import { useTextChat, type UseTextChatResult } from '../runtime/useTextChat';
import { extractAssistantDisplaySegments } from '../service/assistantText';

type VoiceAssistantScreenContentProps = {
  session: UseTextChatResult;
};

function VoiceAssistantScreenContent({ session }: VoiceAssistantScreenContentProps) {
  const {
    status,
    conversations,
    messages,
    sendText,
    toggleVoice,
    voiceModeLabel,
    voiceToggleLabel,
    voiceRuntimeHint,
    connectivityHint,
    testS2SConnection,
  } = session;
  const [draft, setDraft] = useState('');

  async function onSend() {
    await sendText(draft);
    setDraft('');
  }

  const statusLines = useMemo(
    () => [
      `语音链路: ${voiceModeLabel}`,
      `运行提示: ${voiceRuntimeHint}`,
      `S2S: ${connectivityHint}`,
    ],
    [connectivityHint, voiceModeLabel, voiceRuntimeHint],
  );

  return (
    <SafeAreaView edges={['top']} style={styles.safeArea}>
      <View className="flex-1 px-4 pb-4 pt-2">
        <View className="flex-1 overflow-hidden rounded-[32px] border border-amber-200 bg-white" style={styles.shellShadow}>
          <View className="bg-orange-400 px-5 pb-5 pt-6">
            <Text className="text-xs font-bold uppercase tracking-[1.8px] text-orange-50">
              Doubao Voice
            </Text>
            <Text className="mt-3 text-5xl font-black leading-[52px] text-white">
              Voice Assistant V1
            </Text>
            <Text className="mt-3 text-base leading-6 text-orange-50">
              M3 text-first ready: conversation + message pipeline
            </Text>
          </View>

          <View className="flex-1 px-4 py-4">
            <View className="rounded-[28px] border border-amber-200 bg-amber-50 px-4 py-4">
              <Text className="text-xs font-semibold uppercase tracking-[1.2px] text-slate-500">
                当前状态
              </Text>
              <Text className="mt-2 text-3xl font-extrabold text-slate-900">
                {VOICE_ASSISTANT_STATUS_LABEL[status]}
              </Text>
              {statusLines.map((line) => (
                <Text key={line} className="mt-2 text-[15px] leading-6 text-slate-600">
                  {line}
                </Text>
              ))}
            </View>

            <View className="mt-4 flex-row flex-wrap gap-2.5">
              {conversations.map((conversation) => (
                <View
                  key={conversation.id}
                  className="rounded-full border border-amber-200 bg-amber-100 px-4 py-3"
                  testID={`conversation-${conversation.id}`}
                >
                  <Text className="text-[15px] font-semibold text-slate-900">
                    {conversation.title}
                  </Text>
                </View>
              ))}
              <TouchableOpacity
                className="rounded-full bg-amber-400 px-5 py-3 active:bg-amber-500"
                onPress={toggleVoice}
                testID="voice-toggle-button"
              >
                <Text className="text-[15px] font-bold text-amber-950">{voiceToggleLabel}</Text>
              </TouchableOpacity>
              <TouchableOpacity
                className="rounded-full border border-orange-200 bg-orange-50 px-5 py-3 active:bg-orange-100"
                onPress={testS2SConnection}
                testID="s2s-test-button"
              >
                <Text className="text-[15px] font-semibold text-slate-700">连接测试</Text>
              </TouchableOpacity>
            </View>

            <View className="mt-4 flex-1 rounded-[28px] border border-orange-100 bg-white">
              <ScrollView
                contentContainerStyle={styles.messagesContent}
                showsVerticalScrollIndicator={false}
              >
                {messages.map((message) => {
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
                              className={segment.narration ? 'text-[16px] leading-7 text-slate-400' : 'text-[17px] leading-7 text-slate-800'}
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
            testID="message-input"
            value={draft}
          />
          <TouchableOpacity
            className="ml-3 rounded-full bg-rose-500 px-5 py-3 active:bg-rose-600"
            onPress={onSend}
            testID="send-button"
          >
            <Text className="text-base font-bold text-white">发送</Text>
          </TouchableOpacity>
        </View>
      </View>
    </SafeAreaView>
  );
}

export function VoiceAssistantScreenStandalone() {
  const session = useTextChat();
  return <VoiceAssistantScreenContent session={session} />;
}

type VoiceAssistantScreenProps = {
  session?: UseTextChatResult;
};

export function VoiceAssistantScreen({ session }: VoiceAssistantScreenProps) {
  if (session) {
    return <VoiceAssistantScreenContent session={session} />;
  }
  return <VoiceAssistantScreenStandalone />;
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
