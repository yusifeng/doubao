import { useRouter } from 'expo-router';
import { View } from 'react-native';
import { SettingsEntryRow, SettingsScaffold } from './_components';
import { useVoiceAssistantRuntime } from '../../src/features/voice-assistant/runtime/VoiceAssistantRuntimeProvider';

export default function SettingsHomeRoute() {
  const router = useRouter();
  const session = useVoiceAssistantRuntime();

  const replyModeSummary =
    session.runtimeConfig.replyChainMode === 'custom_llm' ? '自定义 LLM' : '官方 S2S';
  const s2sSummary = session.runtimeConfig.s2s.appId.trim()
    ? `App ID: ${session.runtimeConfig.s2s.appId}`
    : '未配置';
  const llmSummary = session.runtimeConfig.llm.model.trim()
    ? `${session.runtimeConfig.llm.provider || 'openai-compatible'} / ${session.runtimeConfig.llm.model}`
    : '未配置';
  const personaSummary =
    session.runtimeConfig.persona.source === 'custom'
      ? '自定义提示词（仅新会话生效）'
      : '默认角色提示词（仅新会话生效）';

  return (
    <SettingsScaffold title="设置" subtitle="配置会在本机保存并立即生效">
      <View className="gap-3" testID="settings-home-list">
        <SettingsEntryRow
          title="回复模式"
          summary={replyModeSummary}
          onPress={() => router.push('/settings/reply-mode')}
          testID="settings-home-item-reply-mode"
        />
        <SettingsEntryRow
          title="S2S 配置"
          summary={s2sSummary}
          onPress={() => router.push('/settings/s2s')}
          testID="settings-home-item-s2s"
        />
        <SettingsEntryRow
          title="自定义大模型"
          summary={llmSummary}
          onPress={() => router.push('/settings/llm')}
          testID="settings-home-item-llm"
        />
        <SettingsEntryRow
          title="系统提示词"
          summary={personaSummary}
          onPress={() => router.push('/settings/persona')}
          testID="settings-home-item-persona"
        />
      </View>
    </SettingsScaffold>
  );
}
