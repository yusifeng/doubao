import { useEffect, useMemo, useState } from 'react';
import { Text, TextInput, TouchableOpacity, View } from 'react-native';
import { useVoiceAssistantRuntime } from '../../src/features/voice-assistant/runtime/VoiceAssistantRuntimeProvider';
import { useAppToast } from '../../src/shared/ui/AppToastProvider';
import { SettingsPrimaryButton, SettingsScaffold } from './_components';
import type { RuntimePersonaRole } from '../../src/features/voice-assistant/config/runtimeConfig';

function findNextActiveRoleId(roles: RuntimePersonaRole[]): string {
  if (roles.length === 0) {
    return '';
  }
  const defaultRole = roles.find((role) => role.source === 'default');
  return defaultRole?.id ?? roles[0].id;
}

export default function SettingsPersonaRoute() {
  const session = useVoiceAssistantRuntime();
  const { showToast } = useAppToast();
  const [roles, setRoles] = useState<RuntimePersonaRole[]>(session.runtimeConfig.persona.roles);
  const [activeRoleId, setActiveRoleId] = useState(session.runtimeConfig.persona.activeRoleId);
  const [newRoleName, setNewRoleName] = useState('');
  const [newRolePrompt, setNewRolePrompt] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    setRoles(session.runtimeConfig.persona.roles);
    setActiveRoleId(session.runtimeConfig.persona.activeRoleId);
  }, [session.runtimeConfig.persona.activeRoleId, session.runtimeConfig.persona.roles]);

  const activeRole = useMemo(
    () => roles.find((role) => role.id === activeRoleId) ?? roles[0] ?? null,
    [activeRoleId, roles],
  );

  const canCreateRole = useMemo(
    () => newRoleName.trim().length > 0 && newRolePrompt.trim().length > 0,
    [newRoleName, newRolePrompt],
  );

  async function handleSave() {
    if (!activeRole) {
      showToast('请先选择一个角色。', 'error');
      return;
    }
    setSaving(true);
    try {
      const result = await session.saveRuntimeConfig({
        persona: {
          roles,
          activeRoleId: activeRole.id,
          systemPrompt: activeRole.systemPrompt,
          source: activeRole.source,
        },
      });
      showToast(result.message, result.ok ? 'success' : 'error');
    } finally {
      setSaving(false);
    }
  }

  function handleAddRole() {
    const trimmedName = newRoleName.trim();
    const trimmedPrompt = newRolePrompt.trim();
    if (!trimmedName || !trimmedPrompt) {
      showToast('请填写角色名称与提示词。', 'error');
      return;
    }
    const nextRole: RuntimePersonaRole = {
      id: `persona-custom-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
      name: trimmedName,
      systemPrompt: trimmedPrompt,
      source: 'custom',
    };
    const nextRoles = [...roles, nextRole];
    setRoles(nextRoles);
    setActiveRoleId(nextRole.id);
    setNewRoleName('');
    setNewRolePrompt('');
    showToast('已添加角色，请点击保存生效。', 'success');
  }

  function handleDeleteRole(roleId: string) {
    const targetRole = roles.find((role) => role.id === roleId);
    if (!targetRole) {
      return;
    }
    if (targetRole.source === 'default') {
      showToast('默认角色不可删除。', 'error');
      return;
    }
    const nextRoles = roles.filter((role) => role.id !== roleId);
    setRoles(nextRoles);
    if (activeRoleId === roleId) {
      setActiveRoleId(findNextActiveRoleId(nextRoles));
    }
    showToast('角色已删除，请点击保存生效。', 'success');
  }

  return (
    <SettingsScaffold title="角色提示词" subtitle="仅对新建会话生效，历史会话不受影响" showBack>
      <View className="gap-3">
        <View className="rounded-2xl bg-white px-4 py-4" testID="settings-persona-role-list-card">
          <Text className="text-[14px] font-semibold text-slate-900">角色列表</Text>
          <View className="mt-3 gap-2">
            {roles.map((role) => {
              const isActive = role.id === activeRole?.id;
              return (
                <View
                  key={role.id}
                  className={`rounded-xl border px-3 py-3 ${
                    isActive ? 'border-slate-900 bg-slate-50' : 'border-slate-200 bg-white'
                  }`}
                >
                  <TouchableOpacity
                    onPress={() => setActiveRoleId(role.id)}
                    testID={`settings-persona-role-item-${role.id}`}
                  >
                    <View className="flex-row items-center justify-between">
                      <Text className="text-[14px] font-semibold text-slate-900">{role.name}</Text>
                      <Text className="text-[12px] text-slate-500">{isActive ? '已选中' : '点击选择'}</Text>
                    </View>
                    <Text className="mt-1 text-[12px] leading-5 text-slate-500" numberOfLines={2}>
                      {role.systemPrompt}
                    </Text>
                  </TouchableOpacity>
                  {role.source === 'custom' ? (
                    <TouchableOpacity
                      className="mt-2 self-start rounded-full border border-rose-200 bg-rose-50 px-3 py-1"
                      onPress={() => handleDeleteRole(role.id)}
                      testID={`settings-persona-delete-role-${role.id}`}
                    >
                      <Text className="text-[12px] font-medium text-rose-600">删除</Text>
                    </TouchableOpacity>
                  ) : null}
                </View>
              );
            })}
          </View>
        </View>

        <View className="rounded-2xl bg-white px-4 py-4" testID="settings-persona-create-card">
          <Text className="text-[14px] font-semibold text-slate-900">新增角色</Text>
          <TextInput
            className="mt-3 rounded-xl border border-slate-200 px-3 py-3 text-[14px] text-slate-900"
            value={newRoleName}
            onChangeText={setNewRoleName}
            placeholder="角色名称"
            placeholderTextColor="#94A3B8"
            testID="settings-persona-new-role-name-input"
          />
          <TextInput
            className="mt-2 min-h-[130px] rounded-xl border border-slate-200 px-3 py-3 text-[14px] leading-6 text-slate-900"
            value={newRolePrompt}
            onChangeText={setNewRolePrompt}
            multiline
            textAlignVertical="top"
            placeholder="角色系统提示词"
            placeholderTextColor="#94A3B8"
            testID="settings-persona-new-role-prompt-input"
          />
          <TouchableOpacity
            className={`mt-3 items-center rounded-xl px-3 py-3 ${
              canCreateRole ? 'bg-slate-900' : 'bg-slate-300'
            }`}
            onPress={handleAddRole}
            disabled={!canCreateRole}
            testID="settings-persona-add-role-button"
          >
            <Text className="text-[13px] font-medium text-white">添加角色</Text>
          </TouchableOpacity>
        </View>
      </View>

      <SettingsPrimaryButton
        label={saving ? '保存中...' : '保存角色配置'}
        onPress={() => void handleSave()}
        disabled={saving || !activeRole}
        testID="settings-persona-save"
      />
    </SettingsScaffold>
  );
}
