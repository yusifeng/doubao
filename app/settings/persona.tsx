import { useEffect, useMemo, useState } from 'react';
import { Text, TextInput, TouchableOpacity, View } from 'react-native';
import { KONAN_CHARACTER_MANIFEST } from '../../src/character/konanManifest';
import { useVoiceAssistantRuntime } from '../../src/features/voice-assistant/runtime/VoiceAssistantRuntimeProvider';
import { SettingsPrimaryButton, SettingsScaffold } from './_components';
import { useAppToast } from '../../src/shared/ui/AppToastProvider';

export default function SettingsPersonaRoute() {
  const session = useVoiceAssistantRuntime();
  const { showToast } = useAppToast();
  const [systemPrompt, setSystemPrompt] = useState(session.runtimeConfig.persona.systemPrompt);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    setSystemPrompt(session.runtimeConfig.persona.systemPrompt);
  }, [session.runtimeConfig.persona.systemPrompt]);

  const isDefault = useMemo(
    () => systemPrompt.trim() === KONAN_CHARACTER_MANIFEST.trim(),
    [systemPrompt],
  );

  async function handleSave() {
    setSaving(true);
    try {
      const nextPrompt = systemPrompt.trim() || KONAN_CHARACTER_MANIFEST;
      const result = await session.saveRuntimeConfig({
        persona: {
          systemPrompt: nextPrompt,
          source: nextPrompt.trim() === KONAN_CHARACTER_MANIFEST.trim() ? 'default' : 'custom',
        },
      });
      showToast(result.message, result.ok ? 'success' : 'error');
    } finally {
      setSaving(false);
    }
  }

  function handleRestoreDefault() {
    setSystemPrompt(KONAN_CHARACTER_MANIFEST);
    showToast('已恢复默认提示词。', 'success');
  }

  return (
    <SettingsScaffold title="系统提示词" subtitle="仅对新建会话生效，历史会话不受影响" showBack>
      <View className="rounded-2xl bg-white p-4" testID="settings-persona-card">
        <View className="flex-row items-center justify-between">
          <Text className="text-[14px] font-semibold text-slate-900">角色提示词</Text>
          <Text className={`text-[12px] ${isDefault ? 'text-slate-500' : 'text-slate-900'}`}>
            {isDefault ? '默认' : '自定义'}
          </Text>
        </View>

        <TextInput
          className="mt-3 min-h-[220px] rounded-xl border border-slate-200 px-3 py-3 text-[14px] leading-6 text-slate-900"
          value={systemPrompt}
          onChangeText={setSystemPrompt}
          multiline
          textAlignVertical="top"
          placeholder="输入系统提示词"
          placeholderTextColor="#94A3B8"
          testID="settings-persona-input"
        />

        <TouchableOpacity
          className="mt-3 items-center rounded-xl border border-slate-200 px-3 py-3"
          onPress={handleRestoreDefault}
          testID="settings-persona-restore-default"
        >
          <Text className="text-[13px] font-medium text-slate-700">恢复默认提示词</Text>
        </TouchableOpacity>
      </View>

      <SettingsPrimaryButton
        label={saving ? '保存中...' : '保存配置'}
        onPress={() => void handleSave()}
        disabled={saving}
        testID="settings-persona-save"
      />
    </SettingsScaffold>
  );
}
