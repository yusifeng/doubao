import { useEffect, useMemo, useRef } from 'react';
import { Text, TouchableOpacity, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Svg, { Defs, LinearGradient, Rect, Stop } from 'react-native-svg';
import {
  voiceAssistantThemeStyle,
  voiceAssistantVoiceThemeClass,
} from '../../../core/theme/mappers';
import { useTextChat, type UseTextChatResult } from '../runtime/useTextChat';
import { VoiceAssistantIcon } from './VoiceAssistantIcon';

type VoiceAssistantScreenContentProps = {
  session: UseTextChatResult;
  onExitVoice?: () => void;
  onOpenDrawer?: () => void;
  autoStartOnMount?: boolean;
  embedded?: boolean;
  displayMode?: 'avatar' | 'dialogue';
  onToggleDisplayMode?: () => void;
};

type DialogueLine = {
  id: string;
  text: string;
  role: 'assistant' | 'user';
};

function VoiceAssistantScreenContent({
  session,
  onExitVoice,
  onOpenDrawer,
  autoStartOnMount = false,
  embedded = false,
  displayMode = 'avatar',
  onToggleDisplayMode,
}: VoiceAssistantScreenContentProps) {
  const insets = useSafeAreaInsets();
  const autoStartedRef = useRef(false);
  const isVoiceRunning = session.isVoiceActive;
  const isAssistantSpeaking = session.status === 'speaking';
  const isVoiceInputMuted = session.isVoiceInputMuted;
  const statusText = useMemo(() => {
    if (isVoiceInputMuted) {
      return '你已静音';
    }
    if (isAssistantSpeaking) {
      return '说话或者点击打断';
    }
    return '正在听...';
  }, [isAssistantSpeaking, isVoiceInputMuted]);
  const dialogueLines = useMemo<DialogueLine[]>(() => {
    const baseLines: DialogueLine[] = session.messages
      .slice(-4)
      .map<DialogueLine>((message) => ({
        id: message.id,
        text: message.content.trim(),
        role: message.role === 'user' ? 'user' : 'assistant',
      }))
      .filter((message) => message.text.length > 0);
    const lines: DialogueLine[] = [...baseLines];

    if (session.pendingAssistantReply.trim()) {
      lines.push({
        id: 'pending-assistant-reply',
        text: session.pendingAssistantReply.trim(),
        role: 'assistant',
      });
      return lines.slice(-4);
    }

    if (session.liveUserTranscript.trim()) {
      lines.push({
        id: 'live-user-transcript',
        text: session.liveUserTranscript.trim(),
        role: 'user',
      });
      return lines.slice(-4);
    }

    return baseLines;
  }, [session.liveUserTranscript, session.messages, session.pendingAssistantReply]);

  useEffect(() => {
    if (!autoStartOnMount || autoStartedRef.current || session.isVoiceActive) {
      return;
    }
    autoStartedRef.current = true;
    void session.toggleVoice();
  }, [autoStartOnMount, session]);

  const handleMicControl = async () => {
    if (isAssistantSpeaking) {
      await session.interruptVoiceOutput();
      return;
    }
    if (!isVoiceRunning) {
      await session.toggleVoice();
      return;
    }
    if (session.supportsVoiceInputMute) {
      await session.toggleVoiceInputMuted();
      return;
    }
    await session.toggleVoice();
  };

  const handleExitVoice = async () => {
    if (session.isVoiceActive) {
      await session.toggleVoice();
    }
    onExitVoice?.();
  };

  const rootPaddingTop = embedded ? 0 : insets.top + 10;
  const rootPaddingBottom = embedded ? Math.max(18, insets.bottom + 6) : Math.max(24, insets.bottom + 10);

  return (
    <View
      className={voiceAssistantVoiceThemeClass.safeArea}
      style={{ paddingTop: rootPaddingTop, paddingBottom: rootPaddingBottom }}
    >
      <View className={voiceAssistantVoiceThemeClass.screen}>
        <View className="absolute inset-0">
          <Svg width="100%" height="100%" viewBox="0 0 100 100" preserveAspectRatio="none">
            <Defs>
              <LinearGradient id="voice-bg" x1="0%" y1="0%" x2="100%" y2="100%">
                <Stop offset="0%" stopColor="#FDE7F3" />
                <Stop offset="48%" stopColor="#F7F1FF" />
                <Stop offset="100%" stopColor="#E7F2FF" />
              </LinearGradient>
            </Defs>
            <Rect x="0" y="0" width="100" height="100" fill="url(#voice-bg)" />
          </Svg>
        </View>
        <View className="absolute left-[-28] top-[120] h-64 w-64 rounded-full bg-white/25" />
        <View className="absolute right-[-40] top-[420] h-72 w-72 rounded-full bg-white/20" />

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
            <Text className={voiceAssistantVoiceThemeClass.headerTitle}>选择情景</Text>
          </View>
          <TouchableOpacity
            className={voiceAssistantVoiceThemeClass.textModeButton}
            onPress={() => {
              onToggleDisplayMode?.();
            }}
            testID="voice-switch-text-button"
          >
            {displayMode === 'avatar' ? (
              <Text className={voiceAssistantVoiceThemeClass.textModeButtonLabel}>字</Text>
            ) : (
              <VoiceAssistantIcon name="profile" size={20} color="#1F2937" strokeWidth={1.7} />
            )}
          </TouchableOpacity>
        </View>

        {displayMode === 'avatar' ? (
          <View className={voiceAssistantVoiceThemeClass.body} testID="voice-avatar-scene">
            <View
              className={voiceAssistantVoiceThemeClass.avatarOuter}
              style={voiceAssistantThemeStyle.voiceAvatarShadow}
            >
              <View className={voiceAssistantVoiceThemeClass.avatarInner}>
                <View className={voiceAssistantVoiceThemeClass.avatarCore}>
                  <View className="h-40 w-40 items-center justify-center rounded-full bg-[#CFE5FF]">
                    <View className="h-32 w-32 items-center justify-center rounded-full bg-white">
                      <VoiceAssistantIcon name="profile" size={68} color="#344054" strokeWidth={1.6} />
                    </View>
                  </View>
                </View>
              </View>
            </View>

            <View className={voiceAssistantVoiceThemeClass.statusDots}>
              <View className={voiceAssistantVoiceThemeClass.statusDot} />
              <View className={voiceAssistantVoiceThemeClass.statusDot} />
              <View className={voiceAssistantVoiceThemeClass.statusDot} />
            </View>
            <Text className={voiceAssistantVoiceThemeClass.statusText}>{statusText}</Text>
          </View>
        ) : (
          <View className={voiceAssistantVoiceThemeClass.dialogueBody} testID="voice-dialogue-scene">
            <View className={voiceAssistantVoiceThemeClass.dialogueList}>
              {dialogueLines.map((line) => (
                <Text
                  key={line.id}
                  className={
                    line.role === 'assistant'
                      ? voiceAssistantVoiceThemeClass.dialogueLinePrimary
                      : voiceAssistantVoiceThemeClass.dialogueLineSecondary
                  }
                >
                  {line.text}
                </Text>
              ))}
            </View>
            <View className="items-center">
              <View className={voiceAssistantVoiceThemeClass.statusDots}>
                <View className={voiceAssistantVoiceThemeClass.statusDot} />
                <View className={voiceAssistantVoiceThemeClass.statusDot} />
                <View className={voiceAssistantVoiceThemeClass.statusDot} />
              </View>
              <Text className={voiceAssistantVoiceThemeClass.statusText}>{statusText}</Text>
            </View>
          </View>
        )}

        <View className={voiceAssistantVoiceThemeClass.footer}>
          <View className={voiceAssistantVoiceThemeClass.controlsRow}>
            <TouchableOpacity
              className={
                isAssistantSpeaking
                  ? voiceAssistantVoiceThemeClass.controlShellSpeaking
                  : isVoiceRunning && !isVoiceInputMuted
                  ? voiceAssistantVoiceThemeClass.controlShell
                  : voiceAssistantVoiceThemeClass.controlShellMuted
              }
              onPress={() => {
                void handleMicControl();
              }}
              testID="voice-toggle-button"
            >
              <VoiceAssistantIcon
                name={isAssistantSpeaking ? 'close' : 'mic'}
                size={26}
                color={
                  isAssistantSpeaking ? '#FFFFFF' : isVoiceRunning && !isVoiceInputMuted ? '#111827' : '#FFFFFF'
                }
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

          <Text className={voiceAssistantVoiceThemeClass.attribution}>内容由 AI 生成</Text>
        </View>
      </View>
    </View>
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
  displayMode?: 'avatar' | 'dialogue';
  onToggleDisplayMode?: () => void;
};

export function VoiceAssistantScreen({
  session,
  onExitVoice,
  onOpenDrawer,
  autoStartOnMount,
  displayMode,
  onToggleDisplayMode,
}: VoiceAssistantScreenProps) {
  if (session) {
    return (
      <VoiceAssistantScreenContent
        session={session}
        onExitVoice={onExitVoice}
        onOpenDrawer={onOpenDrawer}
        autoStartOnMount={autoStartOnMount}
        embedded
        displayMode={displayMode}
        onToggleDisplayMode={onToggleDisplayMode}
      />
    );
  }
  return <VoiceAssistantScreenStandalone />;
}
