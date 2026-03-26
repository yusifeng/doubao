import { useMemo } from 'react';
import { Text, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import {
  voiceAssistantThemeStyle,
  voiceAssistantVoiceThemeClass,
} from '../../../core/theme/mappers';
import { VOICE_ASSISTANT_STATUS_LABEL } from '../config/constants';
import { useTextChat, type UseTextChatResult } from '../runtime/useTextChat';
import { VoiceAssistantIcon } from './VoiceAssistantIcon';

type VoiceAssistantScreenContentProps = {
  session: UseTextChatResult;
  onGoConversation?: () => void;
  onGoHome?: () => void;
};

function VoiceAssistantScreenContent({
  session,
  onGoConversation,
  onGoHome,
}: VoiceAssistantScreenContentProps) {
  const activeConversation = useMemo(
    () => session.conversations.find((conversation) => conversation.id === session.activeConversationId),
    [session.activeConversationId, session.conversations],
  );
  const latestMessage = session.messages[session.messages.length - 1]?.content;
  const isVoiceRunning = session.isVoiceActive;
  const statusText = isVoiceRunning ? session.voiceRuntimeHint : VOICE_ASSISTANT_STATUS_LABEL[session.status];
  const transcriptLabel = session.pendingAssistantReply
    ? '助手草稿'
    : session.liveUserTranscript
    ? '实时转写'
    : '当前会话';
  const transcriptText =
    session.pendingAssistantReply ||
    session.liveUserTranscript ||
    latestMessage ||
    '轻触下方按钮开始实时语音通话。你说完后，页面会先显示“已发送，等待回复”，再等待模型回话。';

  return (
    <SafeAreaView edges={['top', 'bottom']} className={voiceAssistantVoiceThemeClass.safeArea}>
      <View className={voiceAssistantVoiceThemeClass.screen}>
        <View className="absolute -left-24 -top-16 h-80 w-80 rounded-full bg-pink-100/80" />
        <View className="absolute left-12 top-40 h-72 w-72 rounded-full bg-violet-100/70" />
        <View className="absolute -bottom-24 -right-16 h-96 w-96 rounded-full bg-sky-100/80" />

        <View className={voiceAssistantVoiceThemeClass.header}>
          <TouchableOpacity
            className={voiceAssistantVoiceThemeClass.headerButton}
            onPress={onGoHome}
            testID="voice-go-home-button"
          >
            <VoiceAssistantIcon name="menu" size={22} color="#1F2937" />
          </TouchableOpacity>
          <View className={voiceAssistantVoiceThemeClass.headerCenter}>
            <VoiceAssistantIcon name="grid" size={18} color="#1F2937" />
            <Text className={voiceAssistantVoiceThemeClass.headerTitle}>选择情景</Text>
          </View>
          <TouchableOpacity
            className={voiceAssistantVoiceThemeClass.textModeButton}
            onPress={onGoConversation}
            testID="voice-go-conversation-button"
          >
            <VoiceAssistantIcon name="text" size={20} color="#1F2937" />
          </TouchableOpacity>
        </View>

        <View className={voiceAssistantVoiceThemeClass.body}>
          <View
            className={voiceAssistantVoiceThemeClass.avatarOuter}
            style={voiceAssistantThemeStyle.voiceAvatarShadow}
          >
            <View className={voiceAssistantVoiceThemeClass.avatarInner}>
              <View className={voiceAssistantVoiceThemeClass.avatarCore}>
                <Text className={voiceAssistantVoiceThemeClass.avatarTitle}>豆</Text>
                <Text className={voiceAssistantVoiceThemeClass.avatarSubtitle}>
                  {activeConversation?.title ?? '默认会话'}
                </Text>
              </View>
            </View>
          </View>

          <View className={voiceAssistantVoiceThemeClass.statusDots}>
            <View className={voiceAssistantVoiceThemeClass.statusDot} />
            <View className={voiceAssistantVoiceThemeClass.statusDot} />
            <View className={voiceAssistantVoiceThemeClass.statusDot} />
          </View>
          <Text className={voiceAssistantVoiceThemeClass.statusText}>{statusText}</Text>
          <Text className={voiceAssistantVoiceThemeClass.metaText}>{session.voiceModeLabel}</Text>

          <View
            className={voiceAssistantVoiceThemeClass.transcriptCard}
            style={voiceAssistantThemeStyle.voiceTranscriptShadow}
          >
            <Text className={voiceAssistantVoiceThemeClass.transcriptLabel}>{transcriptLabel}</Text>
            <Text className={voiceAssistantVoiceThemeClass.transcriptTitle}>
              {activeConversation?.title ?? '默认会话'}
            </Text>
            <Text className={voiceAssistantVoiceThemeClass.transcriptBody}>
              {transcriptText}
            </Text>
            <Text className="mt-2 text-[13px] leading-5 text-slate-400">{session.connectivityHint}</Text>
            <TouchableOpacity className="mt-3 self-start rounded-full bg-white/70 px-4 py-2" onPress={session.testS2SConnection} testID="s2s-test-button">
              <Text className="text-[13px] font-medium text-slate-700">连接测试</Text>
            </TouchableOpacity>
          </View>
        </View>

        <View className={voiceAssistantVoiceThemeClass.footer}>
          <View className={voiceAssistantVoiceThemeClass.controlsRow}>
            <TouchableOpacity
              className={voiceAssistantVoiceThemeClass.secondaryControl}
              onPress={onGoConversation}
              testID="voice-go-conversation-button-secondary"
            >
              <VoiceAssistantIcon name="text" size={24} color="#374151" />
            </TouchableOpacity>
            <TouchableOpacity
              className={isVoiceRunning ? voiceAssistantVoiceThemeClass.dangerControl : voiceAssistantVoiceThemeClass.primaryControl}
              onPress={session.toggleVoice}
              testID="voice-toggle-button"
            >
              <VoiceAssistantIcon name={isVoiceRunning ? 'close' : 'mic'} size={30} color={isVoiceRunning ? '#EF4444' : '#374151'} />
            </TouchableOpacity>
          </View>
          <Text className={voiceAssistantVoiceThemeClass.controlCaption}>{session.voiceToggleLabel}</Text>
          <Text className={voiceAssistantVoiceThemeClass.attribution}>内容由 AI 生成</Text>
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
  onGoConversation?: () => void;
  onGoHome?: () => void;
};

export function VoiceAssistantScreen({
  session,
  onGoConversation,
  onGoHome,
}: VoiceAssistantScreenProps) {
  if (session) {
    return (
      <VoiceAssistantScreenContent
        session={session}
        onGoConversation={onGoConversation}
        onGoHome={onGoHome}
      />
    );
  }
  return <VoiceAssistantScreenStandalone />;
}
