import { useEffect, useMemo, useRef, useState } from 'react';
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
  onExitVoice?: () => void;
  onOpenDrawer?: () => void;
  autoStartOnMount?: boolean;
};

function VoiceAssistantScreenContent({
  session,
  onExitVoice,
  onOpenDrawer,
  autoStartOnMount = false,
}: VoiceAssistantScreenContentProps) {
  const autoStartedRef = useRef(false);
  const [voiceInputMuted, setVoiceInputMuted] = useState(false);
  const activeConversation = useMemo(
    () => session.conversations.find((conversation) => conversation.id === session.activeConversationId),
    [session.activeConversationId, session.conversations],
  );
  const latestMessage = session.messages[session.messages.length - 1]?.content;
  const isVoiceRunning = session.isVoiceActive;
  const statusText = voiceInputMuted
    ? '已暂停接收语音'
    : isVoiceRunning
    ? session.voiceRuntimeHint
    : VOICE_ASSISTANT_STATUS_LABEL[session.status];
  const transcriptLabel = session.pendingAssistantReply
    ? '助手回复中'
    : session.liveUserTranscript
    ? '实时转写'
    : latestMessage
    ? '最近消息'
    : '当前状态';
  const transcriptText =
    session.pendingAssistantReply ||
    session.liveUserTranscript ||
    latestMessage ||
    '切到语音模式后会自动开始收听，语音结果会继续回到当前会话。';

  useEffect(() => {
    if (!isVoiceRunning) {
      return;
    }
    setVoiceInputMuted(false);
  }, [isVoiceRunning]);

  useEffect(() => {
    if (!autoStartOnMount || autoStartedRef.current || session.isVoiceActive) {
      return;
    }
    autoStartedRef.current = true;
    void session.toggleVoice();
  }, [autoStartOnMount, session]);

  const handleMicControl = async () => {
    setVoiceInputMuted(isVoiceRunning);
    await session.toggleVoice();
  };

  const handleExitVoice = async () => {
    if (session.isVoiceActive) {
      await session.toggleVoice();
    }
    setVoiceInputMuted(false);
    onExitVoice?.();
  };

  const showDebugButton =
    typeof __DEV__ !== 'undefined' ? __DEV__ : process.env.NODE_ENV !== 'production';

  return (
    <SafeAreaView edges={['top', 'bottom']} className={voiceAssistantVoiceThemeClass.safeArea}>
      <View className={voiceAssistantVoiceThemeClass.screen}>
        <View className="absolute -left-24 -top-16 h-80 w-80 rounded-full bg-pink-100/80" />
        <View className="absolute left-12 top-40 h-72 w-72 rounded-full bg-violet-100/70" />
        <View className="absolute -bottom-24 -right-16 h-96 w-96 rounded-full bg-sky-100/80" />

        <View className={voiceAssistantVoiceThemeClass.header}>
          <TouchableOpacity
            className={voiceAssistantVoiceThemeClass.headerButton}
            onPress={onOpenDrawer}
            testID="voice-open-drawer-button"
          >
            <VoiceAssistantIcon name="menu" size={22} color="#1F2937" />
          </TouchableOpacity>
          <View className={voiceAssistantVoiceThemeClass.headerCenter}>
            <VoiceAssistantIcon name="grid" size={18} color="#1F2937" />
            <Text className={voiceAssistantVoiceThemeClass.headerTitle}>
              {activeConversation?.title ?? '默认会话'}
            </Text>
          </View>
          <TouchableOpacity
            className={voiceAssistantVoiceThemeClass.textModeButton}
            onPress={() => {
              void handleExitVoice();
            }}
            testID="voice-switch-text-button"
          >
            <Text className={voiceAssistantVoiceThemeClass.textModeButtonLabel}>字</Text>
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

          <View
            className={voiceAssistantVoiceThemeClass.transcriptStrip}
            style={voiceAssistantThemeStyle.voiceTranscriptShadow}
          >
            <Text className={voiceAssistantVoiceThemeClass.transcriptStripLabel}>{transcriptLabel}</Text>
            <Text className={voiceAssistantVoiceThemeClass.transcriptStripBody}>{transcriptText}</Text>
          </View>
        </View>

        <View className={voiceAssistantVoiceThemeClass.footer}>
          <View className={voiceAssistantVoiceThemeClass.controlsRow}>
            <TouchableOpacity
              className={
                isVoiceRunning
                  ? voiceAssistantVoiceThemeClass.controlShell
                  : voiceAssistantVoiceThemeClass.controlShellMuted
              }
              onPress={() => {
                void handleMicControl();
              }}
              testID="voice-toggle-button"
            >
              <VoiceAssistantIcon
                name="mic"
                size={26}
                color={isVoiceRunning ? '#111827' : '#FFFFFF'}
              />
            </TouchableOpacity>
            <TouchableOpacity
              className={voiceAssistantVoiceThemeClass.controlShellPlaceholder}
              disabled
              testID="voice-placeholder-spark-button"
            >
              <VoiceAssistantIcon name="spark" size={24} color="#4B5563" />
            </TouchableOpacity>
            <TouchableOpacity
              className={voiceAssistantVoiceThemeClass.controlShellPlaceholder}
              disabled
              testID="voice-placeholder-video-button"
            >
              <VoiceAssistantIcon name="video" size={24} color="#111827" />
            </TouchableOpacity>
            <TouchableOpacity
              className={voiceAssistantVoiceThemeClass.controlShellDanger}
              onPress={() => {
                void handleExitVoice();
              }}
              testID="voice-exit-button"
            >
              <VoiceAssistantIcon name="close" size={28} color="#EF4444" />
            </TouchableOpacity>
          </View>

          <Text className={voiceAssistantVoiceThemeClass.controlCaption}>
            {voiceInputMuted
              ? '当前已暂停接收语音，再点一次麦克风继续'
              : isVoiceRunning
              ? '当前会话正在持续收听，你可以直接开口说话'
              : '正在准备开始收听'}
          </Text>

          {showDebugButton ? (
            <View className={voiceAssistantVoiceThemeClass.debugRow}>
              <TouchableOpacity
                className={voiceAssistantVoiceThemeClass.debugButton}
                onPress={session.testS2SConnection}
                testID="s2s-test-button"
              >
                <Text className={voiceAssistantVoiceThemeClass.debugButtonText}>连接测试</Text>
              </TouchableOpacity>
            </View>
          ) : null}

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
  onExitVoice?: () => void;
  onOpenDrawer?: () => void;
  autoStartOnMount?: boolean;
};

export function VoiceAssistantScreen({
  session,
  onExitVoice,
  onOpenDrawer,
  autoStartOnMount,
}: VoiceAssistantScreenProps) {
  if (session) {
    return (
      <VoiceAssistantScreenContent
        session={session}
        onExitVoice={onExitVoice}
        onOpenDrawer={onOpenDrawer}
        autoStartOnMount={autoStartOnMount}
      />
    );
  }
  return <VoiceAssistantScreenStandalone />;
}
