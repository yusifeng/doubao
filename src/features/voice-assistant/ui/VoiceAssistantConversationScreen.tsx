import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Dimensions,
  FlatList,
  Keyboard,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";
import {
  voiceAssistantConversationThemeClass,
  voiceAssistantThemeStyle,
} from "../../../core/theme/mappers";
import type { UseTextChatResult } from "../runtime/useTextChat";
import type { Message } from "../types/model";
import { VoiceAssistantIcon } from "./VoiceAssistantIcon";
import { VoiceAssistantMessageBubble } from "./VoiceAssistantMessageBubble";
import { VoiceAssistantScreen } from "./VoiceAssistantScreen";
import { AppDialog } from "../../../shared/ui/AppDialog";

type ConversationScreenMode = "text" | "voice";

type VoiceAssistantConversationScreenProps = {
  session: UseTextChatResult;
  mode: ConversationScreenMode;
  onChangeMode: (mode: ConversationScreenMode) => void;
  onOpenDrawer: () => void;
};

export function VoiceAssistantConversationScreen({
  session,
  mode,
  onChangeMode,
  onOpenDrawer,
}: VoiceAssistantConversationScreenProps) {
  const insets = useSafeAreaInsets();
  const [draft, setDraft] = useState("");
  const [sessionDebugVisible, setSessionDebugVisible] = useState(false);
  const initialWindowHeightRef = useRef(Dimensions.get("window").height);
  const keyboardVisibleRef = useRef(false);
  const [androidKeyboardOffset, setAndroidKeyboardOffset] = useState(0);
  const voiceToggleInFlightRef = useRef(false);
  const previousModeRef = useRef<ConversationScreenMode | null>(null);
  const shouldRecoverVoiceAfterStopRef = useRef(false);
  const pendingStopAfterInFlightRef = useRef(false);
  const pendingStartWhenConversationReadyRef = useRef(false);
  const modeRef = useRef(mode);
  const voiceActiveRef = useRef(session.isVoiceActive);

  const activeConversation = useMemo(
    () =>
      session.conversations.find(
        (conversation) => conversation.id === session.activeConversationId,
      ) ?? null,
    [session.activeConversationId, session.conversations],
  );
  const pendingAssistantMessage = useMemo<Message | null>(() => {
    const raw = session.pendingAssistantReply.trim();
    if (!raw && session.status !== "thinking") {
      return null;
    }
    if (!session.activeConversationId) {
      return null;
    }
    return {
      id: `pending-assistant-reply-${session.activeConversationId}`,
      conversationId: session.activeConversationId,
      role: "assistant",
      content: raw || "思考中...",
      type: "text",
      createdAt: -1,
    };
  }, [
    session.activeConversationId,
    session.pendingAssistantReply,
    session.status,
  ]);
  const renderedMessages = useMemo(
    () => (pendingAssistantMessage ? [...session.messages, pendingAssistantMessage] : session.messages),
    [pendingAssistantMessage, session.messages],
  );
  const renderMessageItem = useCallback(
    ({ item }: { item: Message }) => <VoiceAssistantMessageBubble message={item} />,
    [],
  );
  const messageKeyExtractor = useCallback((item: Message) => item.id, []);

  const canSend = draft.trim().length > 0;
  const activeRole = useMemo(
    () =>
      session.runtimeConfig.persona.roles.find(
        (role) => role.id === session.runtimeConfig.persona.activeRoleId,
      ) ?? session.runtimeConfig.persona.roles[0] ?? null,
    [session.runtimeConfig.persona.activeRoleId, session.runtimeConfig.persona.roles],
  );
  const activeSystemPrompt = useMemo(() => {
    const conversationPrompt = activeConversation?.systemPromptSnapshot?.trim();
    if (conversationPrompt) {
      return conversationPrompt;
    }
    const rolePrompt = activeRole?.systemPrompt?.trim();
    if (rolePrompt) {
      return rolePrompt;
    }
    return session.runtimeConfig.persona.systemPrompt?.trim() || "（空）";
  }, [activeConversation?.systemPromptSnapshot, activeRole?.systemPrompt, session.runtimeConfig.persona.systemPrompt]);

  useEffect(() => {
    if (Platform.OS !== "android") {
      return;
    }

    const dimensionsSubscription = Dimensions.addEventListener("change", ({ window }) => {
      if (keyboardVisibleRef.current) {
        return;
      }
      const baselineHeight = initialWindowHeightRef.current;
      const heightDrop = baselineHeight - window.height;
      // Ignore large drops before keyboardDidShow; those are usually adjustResize in-flight.
      if (window.height >= baselineHeight || heightDrop < 80) {
        initialWindowHeightRef.current = window.height;
      }
    });

    const keyboardShowSubscription = Keyboard.addListener("keyboardDidShow", (event) => {
      keyboardVisibleRef.current = true;
      const currentWindowHeight = Dimensions.get("window").height;
      const isSystemResizeActive = initialWindowHeightRef.current - currentWindowHeight > 80;
      if (isSystemResizeActive) {
        setAndroidKeyboardOffset(0);
        return;
      }
      const keyboardHeight = event.endCoordinates?.height ?? 0;
      setAndroidKeyboardOffset(Math.max(0, keyboardHeight - insets.bottom));
    });

    const keyboardHideSubscription = Keyboard.addListener("keyboardDidHide", () => {
      keyboardVisibleRef.current = false;
      setAndroidKeyboardOffset(0);
      initialWindowHeightRef.current = Dimensions.get("window").height;
    });

    return () => {
      dimensionsSubscription.remove();
      keyboardShowSubscription.remove();
      keyboardHideSubscription.remove();
    };
  }, [insets.bottom]);

  useEffect(() => {
    modeRef.current = mode;
    voiceActiveRef.current = session.isVoiceActive;
  }, [mode, session.isVoiceActive]);

  const maybeRecoverVoiceAfterStop = useCallback(() => {
    if (
      !shouldRecoverVoiceAfterStopRef.current ||
      modeRef.current !== "voice" ||
      voiceActiveRef.current ||
      voiceToggleInFlightRef.current
    ) {
      return;
    }
    shouldRecoverVoiceAfterStopRef.current = false;
    voiceToggleInFlightRef.current = true;
    void session
      .toggleVoice()
      .catch(() => {
        // Best effort: retry is handled by subsequent mode transitions.
      })
      .finally(() => {
        voiceToggleInFlightRef.current = false;
      });
  }, [session.toggleVoice]);

  const maybeStopAfterInFlight = useCallback(() => {
    if (
      !pendingStopAfterInFlightRef.current ||
      voiceToggleInFlightRef.current
    ) {
      return;
    }
    if (modeRef.current === "voice") {
      return;
    }
    if (!voiceActiveRef.current) {
      return;
    }
    pendingStopAfterInFlightRef.current = false;
    voiceToggleInFlightRef.current = true;
    void session
      .toggleVoice()
      .catch(() => {
        // Best effort: if delayed shutdown fails, next mode transition will retry.
      })
      .finally(() => {
        voiceToggleInFlightRef.current = false;
      });
  }, [session.toggleVoice]);

  useEffect(() => {
    const previousMode = previousModeRef.current;
    previousModeRef.current = mode;

    if (mode !== "voice") {
      shouldRecoverVoiceAfterStopRef.current = false;
      pendingStartWhenConversationReadyRef.current = false;
    } else {
      pendingStopAfterInFlightRef.current = false;
    }

    const enteringVoice = previousMode !== "voice" && mode === "voice";
    const leavingVoice = previousMode === "voice" && mode !== "voice";

    if (leavingVoice) {
      if (voiceToggleInFlightRef.current) {
        pendingStopAfterInFlightRef.current = true;
        return;
      }
      if (!session.isVoiceActive) {
        pendingStopAfterInFlightRef.current = false;
        return;
      }
      voiceToggleInFlightRef.current = true;
      void session
        .toggleVoice()
        .catch(() => {
          // Best effort: if shutdown fails, runtime state will still be reconciled by hook internals.
        })
        .finally(() => {
          voiceToggleInFlightRef.current = false;
          maybeStopAfterInFlight();
          maybeRecoverVoiceAfterStop();
        });
      return;
    }

    if (!enteringVoice) {
      return;
    }

    if (voiceToggleInFlightRef.current) {
      shouldRecoverVoiceAfterStopRef.current = true;
      return;
    }

    if (session.isVoiceActive) {
      return;
    }
    if (!session.activeConversationId) {
      pendingStartWhenConversationReadyRef.current = true;
      return;
    }

    voiceToggleInFlightRef.current = true;
    pendingStartWhenConversationReadyRef.current = false;
    void session
      .toggleVoice()
      .catch(() => {
        // Best effort: if startup fails, user can retry from the voice screen.
      })
      .finally(() => {
        voiceToggleInFlightRef.current = false;
        maybeStopAfterInFlight();
        maybeRecoverVoiceAfterStop();
      });
  }, [
    maybeRecoverVoiceAfterStop,
    maybeStopAfterInFlight,
    mode,
    session.activeConversationId,
    session.isVoiceActive,
    session.toggleVoice,
  ]);

  useEffect(() => {
    maybeStopAfterInFlight();
    maybeRecoverVoiceAfterStop();
  }, [
    maybeRecoverVoiceAfterStop,
    maybeStopAfterInFlight,
    mode,
    session.isVoiceActive,
  ]);

  useEffect(() => {
    if (
      mode !== "voice" ||
      !pendingStartWhenConversationReadyRef.current ||
      !session.activeConversationId ||
      session.isVoiceActive ||
      voiceToggleInFlightRef.current
    ) {
      return;
    }
    pendingStartWhenConversationReadyRef.current = false;
    voiceToggleInFlightRef.current = true;
    void session
      .toggleVoice()
      .catch(() => {
        // Best effort: if startup fails, user can retry from the voice screen.
      })
      .finally(() => {
        voiceToggleInFlightRef.current = false;
        maybeStopAfterInFlight();
        maybeRecoverVoiceAfterStop();
      });
  }, [
    maybeRecoverVoiceAfterStop,
    maybeStopAfterInFlight,
    mode,
    session.activeConversationId,
    session.isVoiceActive,
    session.toggleVoice,
  ]);

  async function onSend() {
    const clean = draft.trim();
    if (!clean) {
      return;
    }
    await session.sendText(clean);
    setDraft("");
  }

  return (
    <SafeAreaView edges={["top"]} className={voiceAssistantConversationThemeClass.safeArea}>
      <KeyboardAvoidingView
        className="flex-1"
        behavior={Platform.OS === "ios" ? "padding" : undefined}
      >
        <View className={voiceAssistantConversationThemeClass.screen}>
          <View className={voiceAssistantConversationThemeClass.header}>
            <View className={voiceAssistantConversationThemeClass.headerRow}>
              <TouchableOpacity
                className={voiceAssistantConversationThemeClass.headerButton}
                onPress={onOpenDrawer}
                testID="conversation-open-drawer-button"
              >
                <VoiceAssistantIcon name="menu" size={24} color="#111827" />
              </TouchableOpacity>
              <View className={voiceAssistantConversationThemeClass.headerCenter}>
                <View
                  className={voiceAssistantConversationThemeClass.headerTitleRow}
                >
                  <Text
                    className={voiceAssistantConversationThemeClass.headerTitle}
                  >
                    {activeConversation?.title ?? "默认会话"}
                  </Text>
                  <TouchableOpacity
                    className="ml-2 rounded-full border border-slate-200 bg-white/80 px-2.5 py-1"
                    onPress={() => setSessionDebugVisible(true)}
                    testID="conversation-session-debug-button"
                  >
                    <Text className="text-[11px] font-medium text-slate-700">测试</Text>
                  </TouchableOpacity>
                </View>
                <Text
                  className={voiceAssistantConversationThemeClass.headerSubtext}
                >
                  {session.textReplySourceLabel}
                </Text>
              </View>
              <View
                className={
                  voiceAssistantConversationThemeClass.headerRightActions
                }
              >
                <TouchableOpacity
                  className={voiceAssistantConversationThemeClass.headerButton}
                  onPress={() =>
                    onChangeMode(mode === "voice" ? "text" : "voice")
                  }
                  testID={
                    mode === "voice"
                      ? "conversation-close-voice-button"
                      : "conversation-open-voice-button"
                  }
                >
                  <VoiceAssistantIcon
                    name={mode === "voice" ? "text" : "phone"}
                    size={20}
                    color="#111827"
                  />
                </TouchableOpacity>
              </View>
            </View>
          </View>

          <FlatList
            className={voiceAssistantConversationThemeClass.messageArea}
            data={renderedMessages}
            contentContainerStyle={
              voiceAssistantThemeStyle.conversationScrollContent
            }
            keyExtractor={messageKeyExtractor}
            renderItem={renderMessageItem}
            keyboardDismissMode={Platform.OS === "ios" ? "interactive" : "on-drag"}
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}
          />

          <View
            className={voiceAssistantConversationThemeClass.composerDock}
            style={{ paddingBottom: Math.max(insets.bottom, 8) + androidKeyboardOffset }}
          >
            <View
              className={voiceAssistantConversationThemeClass.composerContainer}
            >
              <View className={voiceAssistantConversationThemeClass.inputShell}>
                <TextInput
                  className={voiceAssistantConversationThemeClass.inputField}
                  onChangeText={setDraft}
                  placeholder="输入消息..."
                  placeholderTextColor="#9CA3AF"
                  testID="conversation-message-input"
                  value={draft}
                />
              </View>

              <TouchableOpacity
                className={`${voiceAssistantConversationThemeClass.primaryComposerAction} ${
                  canSend ? "" : "opacity-40"
                }`}
                disabled={!canSend}
                onPress={onSend}
                testID="conversation-send-button"
              >
                <Text
                  className={
                    voiceAssistantConversationThemeClass.primaryComposerActionText
                  }
                >
                  发送
                </Text>
              </TouchableOpacity>
            </View>
          </View>

          {mode === "voice" ? (
            <View className="absolute inset-0 z-20">
              <VoiceAssistantScreen
                session={session}
                onExitVoice={() => onChangeMode("text")}
                onOpenDrawer={onOpenDrawer}
                autoStartOnMount={false}
              />
            </View>
          ) : null}

          <AppDialog
            visible={sessionDebugVisible}
            title="会话调试信息"
            onBackdropPress={() => setSessionDebugVisible(false)}
            actions={[
              {
                label: "关闭",
                onPress: () => setSessionDebugVisible(false),
                testID: "conversation-session-debug-close",
                variant: "primary",
              },
            ]}
            testID="conversation-session-debug-dialog"
          >
            <View className="gap-2" testID="conversation-session-debug-content">
              <Text className="text-[12px] text-slate-500">Session ID</Text>
              <Text className="rounded-lg bg-slate-50 px-3 py-2 text-[13px] text-slate-900" testID="conversation-session-debug-session-id">
                {session.activeConversationId ?? "未绑定会话"}
              </Text>

              <Text className="mt-1 text-[12px] text-slate-500">角色</Text>
              <Text className="rounded-lg bg-slate-50 px-3 py-2 text-[13px] text-slate-900" testID="conversation-session-debug-role-name">
                {activeRole?.name ?? "未选择角色"}
              </Text>

              <Text className="mt-1 text-[12px] text-slate-500">系统提示词（可滚动）</Text>
              <View className="rounded-lg border border-slate-200 bg-slate-50" testID="conversation-session-debug-prompt-wrap">
                <ScrollView
                  className="max-h-52"
                  contentContainerStyle={{ paddingHorizontal: 12, paddingVertical: 10 }}
                  showsVerticalScrollIndicator
                  nestedScrollEnabled
                  testID="conversation-session-debug-prompt-scroll"
                >
                  <Text className="text-[13px] leading-5 text-slate-800" testID="conversation-session-debug-prompt">
                    {activeSystemPrompt}
                  </Text>
                </ScrollView>
              </View>
            </View>
          </AppDialog>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}
