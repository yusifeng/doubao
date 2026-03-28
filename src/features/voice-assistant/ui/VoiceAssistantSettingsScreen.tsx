import {
  BottomSheetBackdrop,
  BottomSheetModal,
  BottomSheetModalProvider,
  BottomSheetScrollView,
  BottomSheetView,
} from '@gorhom/bottom-sheet';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ScrollView, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { Button, Dialog, Portal, Provider as PaperProvider } from 'react-native-paper';
import { SafeAreaView } from 'react-native-safe-area-context';
import {
  listRuntimeVoiceOptions,
  type RuntimeConfig,
} from '../config/runtimeConfig';
import type { UseTextChatResult } from '../runtime/useTextChat';
import { VoiceAssistantIcon } from './VoiceAssistantIcon';
import { useAppToast } from '../../../shared/ui/AppToastProvider';

type VoiceAssistantSettingsScreenProps = {
  session: UseTextChatResult;
  onOpenDrawer: () => void;
};

const LLM_PROVIDER_OPTIONS = [
  {
    value: 'openai-compatible',
    label: 'OpenAI Compatible',
  },
] as const;

type LLMProviderValue = (typeof LLM_PROVIDER_OPTIONS)[number]['value'];

function normalizeProvider(provider: string): LLMProviderValue | '' {
  const hit = LLM_PROVIDER_OPTIONS.find((option) => option.value === provider);
  return hit?.value ?? '';
}

function normalizeBaseUrl(baseUrl: string): string {
  return baseUrl.trim().replace(/\/+$/, '');
}

async function fetchOpenAICompatibleModels(input: {
  baseUrl: string;
  apiKey: string;
}): Promise<{ ok: boolean; models: string[]; message: string }> {
  if (typeof fetch !== 'function') {
    return { ok: false, models: [], message: '当前环境不支持网络请求。' };
  }
  const baseUrl = normalizeBaseUrl(input.baseUrl);
  const apiKey = input.apiKey.trim();
  if (!baseUrl || !apiKey) {
    return { ok: false, models: [], message: '请先填写 Base URL 和 API Key。' };
  }

  try {
    const response = await fetch(`${baseUrl}/models`, {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${apiKey}`,
      },
    });
    if (!response.ok) {
      const bodyText = await response.text();
      const snippet = bodyText.trim().slice(0, 120);
      return {
        ok: false,
        models: [],
        message: `模型列表拉取失败（HTTP ${response.status}${snippet ? `: ${snippet}` : ''}）`,
      };
    }
    const payload = (await response.json()) as { data?: Array<{ id?: string }> };
    const models = Array.isArray(payload?.data)
      ? payload.data
          .map((item) => (typeof item?.id === 'string' ? item.id.trim() : ''))
          .filter((id) => id.length > 0)
      : [];
    if (models.length === 0) {
      return { ok: false, models: [], message: '接口返回成功，但未解析到可用模型。' };
    }
    return { ok: true, models, message: `已通过接口拉取 ${models.length} 个模型。` };
  } catch (error) {
    const reason = error instanceof Error ? error.message : 'unknown error';
    return { ok: false, models: [], message: `模型列表拉取失败：${reason}` };
  }
}

function OptionChip({
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
      className={`mr-2 mt-2 rounded-full border px-3 py-2 ${
        active ? 'border-slate-900 bg-slate-900' : 'border-slate-200 bg-white'
      }`}
      onPress={onPress}
    >
      <Text className={`text-[12px] ${active ? 'font-semibold text-white' : 'text-slate-600'}`}>{label}</Text>
    </TouchableOpacity>
  );
}

function SheetRow({
  label,
  active,
  onPress,
  testID,
}: {
  label: string;
  active: boolean;
  onPress: () => void;
  testID?: string;
}) {
  return (
    <TouchableOpacity
      className="flex-row items-center justify-between border-b border-slate-100 px-1 py-4"
      onPress={onPress}
      testID={testID}
    >
      <Text className={`text-[15px] ${active ? 'font-semibold text-slate-900' : 'text-slate-700'}`}>{label}</Text>
      <View className={`h-5 w-5 rounded-full border ${active ? 'border-slate-900 bg-slate-900' : 'border-slate-300'}`}>
        {active ? <View className="m-auto h-2 w-2 rounded-full bg-white" /> : null}
      </View>
    </TouchableOpacity>
  );
}

export function VoiceAssistantSettingsScreen({
  session,
  onOpenDrawer,
}: VoiceAssistantSettingsScreenProps) {
  const [draft, setDraft] = useState<RuntimeConfig>({
    ...session.runtimeConfig,
    llm: {
      ...session.runtimeConfig.llm,
      provider: normalizeProvider(session.runtimeConfig.llm.provider),
    },
  });
  const [statusMessage, setStatusMessage] = useState('');
  const [advancedOpen, setAdvancedOpen] = useState(false);
  const [remoteModels, setRemoteModels] = useState<string[]>([]);
  const [fetchingModels, setFetchingModels] = useState(false);
  const [saving, setSaving] = useState(false);
  const [testingS2S, setTestingS2S] = useState(false);
  const [testingLLM, setTestingLLM] = useState(false);
  const [customVoiceInput, setCustomVoiceInput] = useState('');
  const [voiceSheetMode, setVoiceSheetMode] = useState<'list' | 'custom'>('list');
  const [customModelInput, setCustomModelInput] = useState('');
  const [modelSheetMode, setModelSheetMode] = useState<'list' | 'custom'>('list');
  const [voiceTipVisible, setVoiceTipVisible] = useState(false);
  const { showToast } = useAppToast();

  const providerSheetRef = useRef<BottomSheetModal>(null);
  const voiceSheetRef = useRef<BottomSheetModal>(null);
  const modelSheetRef = useRef<BottomSheetModal>(null);
  const snapPoints = useMemo(() => ['55%'], []);
  const voiceSnapPoints = useMemo(() => ['70%'], []);
  const voiceOptions = useMemo(() => listRuntimeVoiceOptions(), []);
  const hasSelectedProvider = draft.llm.provider.trim().length > 0;

  const modelCandidates = useMemo(() => {
    const currentModel = draft.llm.model.trim();
    const base = [...remoteModels];
    if (currentModel && !base.includes(currentModel)) {
      base.unshift(currentModel);
    }
    return base;
  }, [draft.llm.model, remoteModels]);

  const selectedProviderLabel =
    LLM_PROVIDER_OPTIONS.find((option) => option.value === draft.llm.provider)?.label ?? '请选择模型厂商';
  const selectedVoiceLabel =
    voiceOptions.find((item) => item.id === draft.voice.speakerId)?.label ?? draft.voice.speakerLabel;

  useEffect(() => {
    setDraft({
      ...session.runtimeConfig,
      llm: {
        ...session.runtimeConfig.llm,
        provider: normalizeProvider(session.runtimeConfig.llm.provider),
      },
    });
    setRemoteModels([]);
    setCustomModelInput(session.runtimeConfig.llm.model ?? '');
    setCustomVoiceInput(session.runtimeConfig.voice.sourceType === 'remote' ? session.runtimeConfig.voice.speakerId : '');
  }, [session.runtimeConfig]);

  useEffect(() => {
    if (process.env.NODE_ENV === 'test') {
      return;
    }
    if (draft.replyChainMode !== 'custom_llm' || !hasSelectedProvider) {
      return;
    }
    if (remoteModels.length > 0 || fetchingModels) {
      return;
    }
    if (!draft.llm.baseUrl.trim() || !draft.llm.apiKey.trim()) {
      return;
    }
    void (async () => {
      setFetchingModels(true);
      const result = await fetchOpenAICompatibleModels({
        baseUrl: draft.llm.baseUrl,
        apiKey: draft.llm.apiKey,
      });
      if (result.ok) {
        setRemoteModels(result.models);
      }
      setStatusMessage(result.message);
      showToast(result.message, result.ok ? 'success' : 'error');
      setFetchingModels(false);
    })();
  }, [draft.llm.apiKey, draft.llm.baseUrl, draft.replyChainMode, fetchingModels, hasSelectedProvider, remoteModels.length, showToast]);

  const renderBackdrop = useCallback(
    (props: any) => (
      <BottomSheetBackdrop {...props} appearsOnIndex={0} disappearsOnIndex={-1} opacity={0.35} pressBehavior="close" />
    ),
    [],
  );

  async function handleSave() {
    setSaving(true);
    setStatusMessage('正在保存配置...');
    try {
      const result = await session.saveRuntimeConfig(draft);
      setStatusMessage(result.message);
      showToast(result.message, result.ok ? 'success' : 'error');
    } finally {
      setSaving(false);
    }
  }

  async function handleTestS2S() {
    setTestingS2S(true);
    setStatusMessage('正在测试 S2S 连接...');
    try {
      const result = await session.testS2SConnection(draft.s2s);
      setStatusMessage(result.message);
      showToast(result.message, result.ok ? 'success' : 'error');
    } finally {
      setTestingS2S(false);
    }
  }

  async function handleTestLLM() {
    setTestingLLM(true);
    setStatusMessage('正在测试 LLM 连接...');
    try {
      const result = await session.testLLMConfig(draft.llm);
      setStatusMessage(result.message);
      showToast(result.message, result.ok ? 'success' : 'error');
    } finally {
      setTestingLLM(false);
    }
  }

  async function handleFetchModels() {
    setFetchingModels(true);
    setStatusMessage('正在通过接口拉取模型列表...');
    try {
      const result = await fetchOpenAICompatibleModels({
        baseUrl: draft.llm.baseUrl,
        apiKey: draft.llm.apiKey,
      });
      if (result.ok) {
        setRemoteModels(result.models);
      } else {
        setRemoteModels([]);
      }
      setStatusMessage(result.message);
      showToast(result.message, result.ok ? 'success' : 'error');
    } finally {
      setFetchingModels(false);
    }
  }

  function handleApplyCustomVoice() {
    const nextId = customVoiceInput.trim();
    if (!nextId) {
      showToast('请先输入自定义音色ID。', 'error');
      return;
    }
    setDraft((prev) => ({
      ...prev,
      voice: {
        speakerId: nextId,
        speakerLabel: '自定义音色',
        sourceType: 'remote',
      },
    }));
    showToast(`已应用自定义音色：${nextId}`, 'success');
    setVoiceSheetMode('list');
    voiceSheetRef.current?.dismiss();
  }

  function handleOpenVoiceSheet() {
    setVoiceSheetMode('list');
    setCustomVoiceInput(draft.voice.sourceType === 'remote' ? draft.voice.speakerId : '');
    voiceSheetRef.current?.present();
  }

  function showVoiceTipDialog() {
    setVoiceTipVisible(true);
  }

  function handleOpenModelSheet() {
    setCustomModelInput(draft.llm.model);
    setModelSheetMode('list');
    modelSheetRef.current?.present();
  }

  function handleApplyCustomModel() {
    const model = customModelInput.trim();
    if (!model) {
      showToast('请先输入模型名。', 'error');
      return;
    }
    setDraft((prev) => ({ ...prev, llm: { ...prev.llm, model } }));
    showToast(`已选择模型：${model}`, 'success');
    setModelSheetMode('list');
    modelSheetRef.current?.dismiss();
  }

  return (
    <SafeAreaView edges={['top', 'bottom']} className="flex-1 bg-[#FBFCFE]">
      <PaperProvider>
        <BottomSheetModalProvider>
          <View className="flex-1 bg-[#FBFCFE]">
          <View className="flex-row items-center border-b border-black/5 bg-white px-4 pb-3 pt-2">
            <TouchableOpacity
              className="h-10 w-10 items-center justify-center rounded-full"
              onPress={onOpenDrawer}
              testID="settings-open-drawer-button"
            >
              <VoiceAssistantIcon name="menu" size={22} color="#111827" />
            </TouchableOpacity>
            <View className="flex-1 items-center">
              <Text className="text-[17px] font-semibold text-slate-900">设置</Text>
              <Text className="mt-0.5 text-[11px] text-slate-400">运行时配置覆盖 .env</Text>
            </View>
            <View className="h-10 w-10" />
          </View>

          <ScrollView className="flex-1 px-4 pt-4" contentContainerStyle={{ paddingBottom: 24 }}>
            <View className="rounded-2xl bg-white p-4">
              <Text className="text-[14px] font-semibold text-slate-900">回复链路模式</Text>
              <View className="mt-3 flex-row gap-2">
                <OptionChip
                  label="官方 S2S"
                  active={draft.replyChainMode === 'official_s2s'}
                  onPress={() => {
                    setDraft((prev) => ({ ...prev, replyChainMode: 'official_s2s' }));
                  }}
                />
                <OptionChip
                  label="自定义 LLM"
                  active={draft.replyChainMode === 'custom_llm'}
                  onPress={() => {
                    setDraft((prev) => ({ ...prev, replyChainMode: 'custom_llm' }));
                  }}
                />
              </View>
            </View>

            {draft.replyChainMode === 'custom_llm' ? (
              <View className="mt-3 rounded-2xl bg-white p-4" testID="settings-llm-section">
                <View className="flex-row items-center justify-between">
                  <Text className="text-[14px] font-semibold text-slate-900">自定义 LLM</Text>
                  <TouchableOpacity
                    className="rounded-full bg-slate-100 px-3 py-2"
                    onPress={() => void handleTestLLM()}
                    disabled={testingLLM || !hasSelectedProvider}
                    testID="settings-test-llm-button"
                  >
                    <Text className="text-[12px] font-medium text-slate-700">
                      {testingLLM ? '测试中...' : '测试 LLM'}
                    </Text>
                  </TouchableOpacity>
                </View>

                <TouchableOpacity
                  className="mt-3 flex-row items-center justify-between rounded-xl border border-slate-200 px-3 py-3"
                  onPress={() => providerSheetRef.current?.present()}
                  testID="settings-provider-selector-toggle"
                >
                  <View>
                    <Text className="text-[12px] text-slate-500">模型厂商</Text>
                    <Text className="mt-1 text-[14px] font-medium text-slate-900">{selectedProviderLabel}</Text>
                  </View>
                  <VoiceAssistantIcon name="grid" size={16} color="#64748B" />
                </TouchableOpacity>

                {hasSelectedProvider ? (
                  <>
                    <Text className="mt-3 text-[12px] text-slate-500">Base URL</Text>
                    <TextInput
                      className="mt-2 rounded-xl border border-slate-200 px-3 py-3 text-[14px] text-slate-900"
                      value={draft.llm.baseUrl}
                      onChangeText={(text) => {
                        setDraft((prev) => ({ ...prev, llm: { ...prev.llm, baseUrl: text } }));
                        setRemoteModels([]);
                      }}
                      placeholder="Base URL"
                      placeholderTextColor="#94A3B8"
                      testID="settings-llm-base-url-input"
                      autoCapitalize="none"
                    />
                    <Text className="mt-3 text-[12px] text-slate-500">API Key</Text>
                    <TextInput
                      className="mt-2 rounded-xl border border-slate-200 px-3 py-3 text-[14px] text-slate-900"
                      value={draft.llm.apiKey}
                      onChangeText={(text) => {
                        setDraft((prev) => ({ ...prev, llm: { ...prev.llm, apiKey: text } }));
                        setRemoteModels([]);
                      }}
                      placeholder="API Key"
                      placeholderTextColor="#94A3B8"
                      testID="settings-llm-api-key-input"
                      secureTextEntry
                      autoCapitalize="none"
                    />
                    <TouchableOpacity
                      className="mt-3 rounded-full bg-slate-100 px-3 py-2"
                      onPress={() => void handleFetchModels()}
                      disabled={fetchingModels}
                      testID="settings-fetch-models-button"
                    >
                      <Text className="text-[12px] font-medium text-slate-700">
                        {fetchingModels ? '拉取中...' : '通过接口拉取模型'}
                      </Text>
                    </TouchableOpacity>

                    <TouchableOpacity
                      className="mt-3 rounded-xl border border-slate-200 px-3 py-3"
                      testID="settings-model-selector-toggle"
                      onPress={handleOpenModelSheet}
                    >
                      <Text className="text-[12px] text-slate-500">可选模型</Text>
                      <Text className="mt-1 text-[13px] text-slate-700">{draft.llm.model || '选择接口模型（可选）'}</Text>
                    </TouchableOpacity>
                  </>
                ) : (
                  <Text className="mt-3 text-[12px] text-slate-500">
                    请先选择模型厂商，再配置 Base URL / API Key / Model。
                  </Text>
                )}
              </View>
            ) : null}

            <View className="mt-3 rounded-2xl bg-white p-4" testID="settings-s2s-section">
              <View className="flex-row items-center justify-between">
                <Text className="text-[14px] font-semibold text-slate-900">火山 S2S</Text>
                <TouchableOpacity
                  className="rounded-full bg-slate-100 px-3 py-2"
                  onPress={() => void handleTestS2S()}
                  disabled={testingS2S}
                  testID="settings-test-s2s-button"
                >
                  <Text className="text-[12px] font-medium text-slate-700">
                    {testingS2S ? '测试中...' : '测试 S2S'}
                  </Text>
                </TouchableOpacity>
              </View>
              <Text className="mt-3 text-[12px] text-slate-500">App ID</Text>
              <TextInput
                className="mt-2 rounded-xl border border-slate-200 px-3 py-3 text-[14px] text-slate-900"
                value={draft.s2s.appId}
                onChangeText={(text) => {
                  setDraft((prev) => ({ ...prev, s2s: { ...prev.s2s, appId: text } }));
                }}
                placeholder="App ID"
                placeholderTextColor="#94A3B8"
                testID="settings-s2s-app-id-input"
              />
              <Text className="mt-3 text-[12px] text-slate-500">Access Token</Text>
              <TextInput
                className="mt-2 rounded-xl border border-slate-200 px-3 py-3 text-[14px] text-slate-900"
                value={draft.s2s.accessToken}
                onChangeText={(text) => {
                  setDraft((prev) => ({ ...prev, s2s: { ...prev.s2s, accessToken: text } }));
                }}
                placeholder="Access Token"
                placeholderTextColor="#94A3B8"
                testID="settings-s2s-access-token-input"
                secureTextEntry
                autoCapitalize="none"
              />
              <Text className="mt-3 text-[12px] text-slate-500">WS URL</Text>
              <TextInput
                className="mt-2 rounded-xl border border-slate-200 px-3 py-3 text-[14px] text-slate-900"
                value={draft.s2s.wsUrl}
                onChangeText={(text) => {
                  setDraft((prev) => ({ ...prev, s2s: { ...prev.s2s, wsUrl: text } }));
                }}
                placeholder="WS URL"
                placeholderTextColor="#94A3B8"
                testID="settings-s2s-ws-url-input"
                autoCapitalize="none"
              />
            </View>

            <View className="mt-3 rounded-2xl bg-white p-4" testID="settings-voice-section">
              <Text className="text-[14px] font-semibold text-slate-900">音色选择</Text>
              <TouchableOpacity
                className="mt-3 flex-row items-center justify-between rounded-xl border border-slate-200 px-3 py-3"
                onPress={handleOpenVoiceSheet}
                testID="settings-voice-selector-toggle"
              >
                <View>
                  <Text className="text-[13px] text-slate-500">当前音色</Text>
                  <Text className="mt-1 text-[14px] font-medium text-slate-900">{selectedVoiceLabel}</Text>
                </View>
                <VoiceAssistantIcon name="grid" size={16} color="#64748B" />
              </TouchableOpacity>
              <TouchableOpacity
                className="mt-3 flex-row items-center justify-center rounded-xl border border-slate-200 px-3 py-3"
                onPress={showVoiceTipDialog}
                testID="settings-voice-custom-tip"
              >
                <Text className="text-[13px] font-medium text-slate-700">如何获取自定义音色？</Text>
              </TouchableOpacity>
            </View>

            <View className="mt-3 rounded-2xl bg-white p-4" testID="settings-advanced-section">
              <TouchableOpacity
                className="flex-row items-center justify-between"
                onPress={() => {
                  setAdvancedOpen((prev) => !prev);
                }}
                testID="settings-advanced-toggle"
              >
                <Text className="text-[14px] font-semibold text-slate-900">高级配置</Text>
                <VoiceAssistantIcon name={advancedOpen ? 'close' : 'settings'} size={16} color="#64748B" />
              </TouchableOpacity>
              <Text className="mt-2 text-[12px] text-slate-500">Android App Key 覆盖值（可选，不填则使用内置默认）</Text>
              {advancedOpen ? (
                <>
                  <Text className="mt-3 text-[12px] text-slate-500">Android App Key（可选）</Text>
                  <TextInput
                    className="mt-2 rounded-xl border border-slate-200 px-3 py-3 text-[14px] text-slate-900"
                    value={draft.androidDialog.appKeyOverride}
                    onChangeText={(text) => {
                      setDraft((prev) => ({
                        ...prev,
                        androidDialog: { ...prev.androidDialog, appKeyOverride: text },
                      }));
                    }}
                    placeholder="Android App Key (Optional)"
                    placeholderTextColor="#94A3B8"
                    testID="settings-android-app-key-input"
                    secureTextEntry
                    autoCapitalize="none"
                  />
                </>
              ) : null}
            </View>

          <TouchableOpacity
            className="mt-4 items-center rounded-2xl bg-slate-900 px-4 py-3"
            onPress={() => void handleSave()}
            disabled={saving}
            testID="settings-save-button"
          >
            <Text className="text-[14px] font-semibold text-white">{saving ? '保存中...' : '保存配置'}</Text>
          </TouchableOpacity>
        </ScrollView>
      </View>

        <BottomSheetModal
          ref={providerSheetRef}
          snapPoints={snapPoints}
          index={0}
          backdropComponent={renderBackdrop}
          enablePanDownToClose
          handleIndicatorStyle={{ backgroundColor: '#CBD5E1' }}
        >
          <BottomSheetView style={{ paddingHorizontal: 16, paddingBottom: 16 }} testID="settings-provider-sheet">
            <Text className="mb-2 text-[16px] font-semibold text-slate-900">选择模型厂商</Text>
            {LLM_PROVIDER_OPTIONS.map((option) => (
              <SheetRow
                key={option.value}
                label={option.label}
                active={draft.llm.provider === option.value}
                onPress={() => {
                  setDraft((prev) => ({
                    ...prev,
                    llm: {
                      ...prev.llm,
                      provider: option.value,
                    },
                  }));
                  providerSheetRef.current?.dismiss();
                }}
                testID={`settings-provider-option-${option.value}`}
              />
            ))}
          </BottomSheetView>
        </BottomSheetModal>

        <BottomSheetModal
          ref={voiceSheetRef}
          snapPoints={voiceSnapPoints}
          index={0}
          enableDynamicSizing={false}
          backdropComponent={renderBackdrop}
          enablePanDownToClose
          enableContentPanningGesture={false}
          enableOverDrag={false}
          handleIndicatorStyle={{ backgroundColor: '#CBD5E1' }}
        >
          <BottomSheetScrollView
            testID="settings-voice-sheet"
            contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 16 }}
          >
            {voiceSheetMode === 'list' ? (
              <>
                <Text className="mb-2 text-[16px] font-semibold text-slate-900">选择音色</Text>
                <TouchableOpacity
                  className="mt-2 flex-row items-center justify-between border-b border-slate-100 px-1 py-4"
                  onPress={() => setVoiceSheetMode('custom')}
                  testID="settings-voice-custom-edit-row"
                >
                  <View>
                    <Text className="text-[15px] text-slate-700">自定义音色</Text>
                    <Text className="mt-1 text-[12px] text-slate-500">
                      {customVoiceInput.trim() || '点击编辑自定义音色ID'}
                    </Text>
                  </View>
                  <View className="flex-row items-center">
                    <Text className="mr-1 text-[13px] text-slate-500">编辑</Text>
                    <VoiceAssistantIcon name="edit" size={14} color="#64748B" />
                  </View>
                </TouchableOpacity>
                {voiceOptions.map((option) => (
                  <SheetRow
                    key={option.id}
                    label={option.label}
                    active={draft.voice.speakerId === option.id}
                    onPress={() => {
                      setDraft((prev) => ({
                        ...prev,
                        voice: {
                          speakerId: option.id,
                          speakerLabel: option.label,
                          sourceType: option.sourceType,
                        },
                      }));
                      voiceSheetRef.current?.dismiss();
                    }}
                    testID={`settings-voice-option-${option.id}`}
                  />
                ))}
              </>
            ) : (
              <View>
                <View className="mb-2 flex-row items-center justify-between">
                  <Text className="text-[16px] font-semibold text-slate-900">自定义音色</Text>
                  <TouchableOpacity onPress={() => setVoiceSheetMode('list')} testID="settings-voice-custom-back">
                    <Text className="text-[13px] text-slate-500">返回</Text>
                  </TouchableOpacity>
                </View>
                <TextInput
                  className="rounded-lg border border-slate-200 px-3 py-2 text-[14px] text-slate-900"
                  value={customVoiceInput}
                  onChangeText={setCustomVoiceInput}
                  placeholder="输入音色ID（例如：S_xxxxxxxx）"
                  placeholderTextColor="#94A3B8"
                  autoCapitalize="none"
                  testID="settings-voice-custom-input"
                />
                <TouchableOpacity
                  className="mt-3 items-center rounded-lg bg-slate-900 px-3 py-2"
                  onPress={handleApplyCustomVoice}
                  testID="settings-voice-custom-apply"
                >
                  <Text className="text-[13px] font-semibold text-white">使用该音色</Text>
                </TouchableOpacity>
              </View>
            )}
          </BottomSheetScrollView>
        </BottomSheetModal>

        <BottomSheetModal
          ref={modelSheetRef}
          snapPoints={snapPoints}
          index={0}
          backdropComponent={renderBackdrop}
          enablePanDownToClose
          handleIndicatorStyle={{ backgroundColor: '#CBD5E1' }}
        >
          <BottomSheetView style={{ paddingHorizontal: 16, paddingBottom: 16 }} testID="settings-model-sheet">
            {modelSheetMode === 'list' ? (
              <>
                <Text className="mb-2 text-[16px] font-semibold text-slate-900">选择模型</Text>
                {modelCandidates.length > 0 ? (
                  modelCandidates.map((model) => (
                    <SheetRow
                      key={model}
                      label={model}
                      active={draft.llm.model === model}
                      onPress={() => {
                        setDraft((prev) => ({ ...prev, llm: { ...prev.llm, model } }));
                        modelSheetRef.current?.dismiss();
                      }}
                      testID={`settings-model-option-${model}`}
                    />
                  ))
                ) : (
                  <Text className="px-1 py-4 text-[13px] text-slate-500">
                    暂无模型，请先填写 Base URL / API Key 后点击“通过接口拉取模型”。
                  </Text>
                )}
                <TouchableOpacity
                  className="mt-2 flex-row items-center justify-between border-b border-slate-100 px-1 py-4"
                  onPress={() => setModelSheetMode('custom')}
                  testID="settings-model-custom-edit-row"
                >
                  <View>
                    <Text className="text-[15px] text-slate-700">自定义模型</Text>
                    <Text className="mt-1 text-[12px] text-slate-500">
                      {customModelInput.trim() || '点击编辑自定义模型名'}
                    </Text>
                  </View>
                  <View className="flex-row items-center">
                    <Text className="mr-1 text-[13px] text-slate-500">编辑</Text>
                    <VoiceAssistantIcon name="edit" size={14} color="#64748B" />
                  </View>
                </TouchableOpacity>
              </>
            ) : (
              <View>
                <View className="mb-2 flex-row items-center justify-between">
                  <Text className="text-[16px] font-semibold text-slate-900">自定义模型</Text>
                  <TouchableOpacity onPress={() => setModelSheetMode('list')} testID="settings-model-custom-back">
                    <Text className="text-[13px] text-slate-500">返回</Text>
                  </TouchableOpacity>
                </View>
                <TextInput
                  className="rounded-lg border border-slate-200 px-3 py-2 text-[14px] text-slate-900"
                  value={customModelInput}
                  onChangeText={setCustomModelInput}
                  placeholder="输入任意模型名"
                  placeholderTextColor="#94A3B8"
                  autoCapitalize="none"
                  testID="settings-model-custom-input"
                />
                <TouchableOpacity
                  className="mt-3 items-center rounded-lg bg-slate-900 px-3 py-2"
                  onPress={handleApplyCustomModel}
                  testID="settings-model-custom-apply"
                >
                  <Text className="text-[13px] font-semibold text-white">使用该模型</Text>
                </TouchableOpacity>
              </View>
            )}
          </BottomSheetView>
        </BottomSheetModal>
          <Portal>
            <Dialog
              visible={voiceTipVisible}
              onDismiss={() => setVoiceTipVisible(false)}
              testID="settings-voice-tip-modal"
            >
              <Dialog.Title>如何获取自定义音色</Dialog.Title>
              <Dialog.Content>
                <Text className="text-[14px] leading-6 text-slate-700">
                  进入到火山引擎控制台（https://console.volcengine.com/speech/app），选择左侧的【声音复刻大模型】，
                  在【声音复刻详情】中就可以获取【声音ID】，格式一般为 S_xxxxxx，需要注意【声音ID】是跟【App ID】绑定的，
                  所以你要确保你填写的【声音ID】所属正确的【App ID】（你可以看此时 url 后面的 AppID query 参数）。
                </Text>
              </Dialog.Content>
              <Dialog.Actions>
                <Button onPress={() => setVoiceTipVisible(false)} testID="settings-voice-tip-close">
                  我知道了
                </Button>
              </Dialog.Actions>
            </Dialog>
          </Portal>
        </BottomSheetModalProvider>
      </PaperProvider>
    </SafeAreaView>
  );
}
