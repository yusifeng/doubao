import { useEffect, useState } from 'react';
import { Text, TouchableOpacity, View } from 'react-native';
import { SettingsPrimaryButton, SettingsScaffold } from './_components';
import { useVoiceAssistantRuntime } from '../../src/features/voice-assistant/runtime/VoiceAssistantRuntimeProvider';
import type { ReplyChainMode } from '../../src/features/voice-assistant/config/env';
import { useAppToast } from '../../src/shared/ui/AppToastProvider';

function ModeChip({
  label,
  active,
  onPress,
}: {
  label: string;
  active: boolean;
  onPress: () => void;
}) {
  return (
    <TouchableOpacity
      className={`rounded-full border px-4 py-3 ${active ? 'border-slate-900 bg-slate-900' : 'border-slate-200 bg-white'}`}
      onPress={onPress}
    >
      <Text className={`text-[13px] ${active ? 'font-semibold text-white' : 'text-slate-700'}`}>{label}</Text>
    </TouchableOpacity>
  );
}

export default function SettingsReplyModeRoute() {
  const session = useVoiceAssistantRuntime();
  const { showToast } = useAppToast();
  const [mode, setMode] = useState<ReplyChainMode>(session.runtimeConfig.replyChainMode);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    setMode(session.runtimeConfig.replyChainMode);
  }, [session.runtimeConfig.replyChainMode]);

  async function handleSave() {
    setSaving(true);
    try {
      const result = await session.saveRuntimeConfig({ replyChainMode: mode });
      showToast(result.message, result.ok ? 'success' : 'error');
    } finally {
      setSaving(false);
    }
  }

  return (
    <SettingsScaffold title="回复模式" subtitle="选择官方 S2S 或自定义 LLM" showBack>
      <View className="rounded-2xl bg-white p-4" testID="settings-reply-mode-card">
        <Text className="text-[14px] font-semibold text-slate-900">模式</Text>
        <View className="mt-3 flex-row gap-2">
          <ModeChip label="官方 S2S" active={mode === 'official_s2s'} onPress={() => setMode('official_s2s')} />
          <ModeChip label="自定义 LLM" active={mode === 'custom_llm'} onPress={() => setMode('custom_llm')} />
        </View>
        <Text className="mt-3 text-[12px] text-slate-500">
          保存后立即用于后续请求。若当前在语音通话中，请挂断后重连生效。
        </Text>
      </View>

      <SettingsPrimaryButton
        label={saving ? '保存中...' : '保存配置'}
        onPress={() => void handleSave()}
        disabled={saving}
        testID="settings-reply-mode-save"
      />
    </SettingsScaffold>
  );
}
