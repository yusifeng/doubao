import { SafeAreaView } from 'react-native-safe-area-context';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import type { UseTextChatResult } from '../runtime/useTextChat';
import { VOICE_ASSISTANT_STATUS_LABEL } from '../config/constants';

type VoiceAssistantHomeScreenProps = {
  session: UseTextChatResult;
  onOpenConversation: () => void;
  onOpenVoice: () => void;
};

export function VoiceAssistantHomeScreen({
  session,
  onOpenConversation,
  onOpenVoice,
}: VoiceAssistantHomeScreenProps) {
  const activeConversation = session.conversations.find(
    (conversation) => conversation.id === session.activeConversationId,
  );

  return (
    <SafeAreaView edges={['top']} style={styles.safeArea}>
      <View className="flex-1 px-4 pb-4 pt-2">
        <View className="flex-1 overflow-hidden rounded-[32px] border border-amber-200 bg-white" style={styles.shellShadow}>
          <View className="bg-orange-400 px-5 pb-6 pt-6">
            <Text className="text-xs font-bold uppercase tracking-[1.8px] text-orange-50">
              Doubao Voice
            </Text>
            <Text className="mt-3 text-5xl font-black leading-[52px] text-white">
              Konan Companion
            </Text>
            <Text className="mt-3 text-base leading-6 text-orange-50">
              官方 Expo Router 底座上的语音助手迁移版，保留实时对话主链和角色设定。
            </Text>
          </View>

          <View className="flex-1 px-4 py-4">
            <View className="rounded-[28px] border border-amber-200 bg-amber-50 px-4 py-4">
              <Text className="text-xs font-semibold uppercase tracking-[1.2px] text-slate-500">
                当前会话
              </Text>
              <Text className="mt-2 text-3xl font-extrabold text-slate-900">
                {activeConversation?.title ?? '默认会话'}
              </Text>
              <Text className="mt-2 text-[15px] leading-6 text-slate-600">
                状态：{VOICE_ASSISTANT_STATUS_LABEL[session.status]}
              </Text>
              <Text className="mt-2 text-[15px] leading-6 text-slate-600">
                语音链路：{session.voiceModeLabel}
              </Text>
              <Text className="mt-2 text-[15px] leading-6 text-slate-600">
                连接状态：{session.connectivityHint}
              </Text>
            </View>

            <View className="mt-4 rounded-[28px] border border-orange-100 bg-orange-50 px-4 py-4">
              <Text className="text-xs font-semibold uppercase tracking-[1.2px] text-orange-700">
                迁移目标
              </Text>
              <Text className="mt-2 text-[16px] leading-7 text-slate-700">
                首页负责会话入口，会话页承接消息流，语音页保留打电话式的主交互。当前先把
                官方底座、NativeWind、S2S 主链路稳定跑通，再继续收口原生音频模块。
              </Text>
            </View>

            <View className="mt-4 flex-row flex-wrap gap-3">
              <TouchableOpacity
                className="rounded-full bg-amber-400 px-5 py-3 active:bg-amber-500"
                onPress={onOpenConversation}
                testID="open-conversation-button"
              >
                <Text className="text-[15px] font-bold text-amber-950">进入会话</Text>
              </TouchableOpacity>
              <TouchableOpacity
                className="rounded-full bg-rose-500 px-5 py-3 active:bg-rose-600"
                onPress={onOpenVoice}
                testID="open-voice-button"
              >
                <Text className="text-[15px] font-bold text-white">进入语音页</Text>
              </TouchableOpacity>
              <TouchableOpacity
                className="rounded-full border border-orange-200 bg-white px-5 py-3 active:bg-orange-50"
                onPress={session.testS2SConnection}
                testID="home-s2s-test-button"
              >
                <Text className="text-[15px] font-semibold text-slate-700">连接测试</Text>
              </TouchableOpacity>
            </View>

            <View className="mt-4 flex-1 rounded-[28px] border border-amber-100 bg-white px-4 py-4">
              <Text className="text-xs font-semibold uppercase tracking-[1.2px] text-slate-500">
                最近消息
              </Text>
              <Text className="mt-3 text-[16px] leading-7 text-slate-700">
                {session.messages.length > 0
                  ? session.messages[session.messages.length - 1]?.content
                  : '还没有消息，先发一条文本或开启语音。'}
              </Text>
            </View>
          </View>
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
});
