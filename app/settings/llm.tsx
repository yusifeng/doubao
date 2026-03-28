import { BottomSheetBackdrop, BottomSheetModal, BottomSheetModalProvider, BottomSheetView } from '@gorhom/bottom-sheet';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Text, TextInput, TouchableOpacity, View } from 'react-native';
import { useAppToast } from '../../src/shared/ui/AppToastProvider';
import { useVoiceAssistantRuntime } from '../../src/features/voice-assistant/runtime/VoiceAssistantRuntimeProvider';
import { SettingsPrimaryButton, SettingsScaffold } from './_components';
import { VoiceAssistantIcon } from '../../src/features/voice-assistant/ui/VoiceAssistantIcon';

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

export default function SettingsLLMRoute() {
  const session = useVoiceAssistantRuntime();
  const { showToast } = useAppToast();
  const [provider, setProvider] = useState<LLMProviderValue | ''>(normalizeProvider(session.runtimeConfig.llm.provider));
  const [baseUrl, setBaseUrl] = useState(session.runtimeConfig.llm.baseUrl);
  const [apiKey, setApiKey] = useState(session.runtimeConfig.llm.apiKey);
  const [model, setModel] = useState(session.runtimeConfig.llm.model);
  const [customModelInput, setCustomModelInput] = useState(session.runtimeConfig.llm.model);
  const [remoteModels, setRemoteModels] = useState<string[]>([]);
  const [fetchingModels, setFetchingModels] = useState(false);
  const [testingLLM, setTestingLLM] = useState(false);
  const [saving, setSaving] = useState(false);
  const [modelSheetMode, setModelSheetMode] = useState<'list' | 'custom'>('list');

  const providerSheetRef = useRef<BottomSheetModal>(null);
  const modelSheetRef = useRef<BottomSheetModal>(null);
  const snapPoints = useMemo(() => ['55%'], []);

  const modelCandidates = useMemo(() => {
    const currentModel = model.trim();
    const base = [...remoteModels];
    if (currentModel && !base.includes(currentModel)) {
      base.unshift(currentModel);
    }
    return base;
  }, [model, remoteModels]);

  useEffect(() => {
    setProvider(normalizeProvider(session.runtimeConfig.llm.provider));
    setBaseUrl(session.runtimeConfig.llm.baseUrl);
    setApiKey(session.runtimeConfig.llm.apiKey);
    setModel(session.runtimeConfig.llm.model);
    setCustomModelInput(session.runtimeConfig.llm.model);
    setRemoteModels([]);
  }, [session.runtimeConfig.llm]);

  const renderBackdrop = useCallback(
    (props: any) => (
      <BottomSheetBackdrop {...props} appearsOnIndex={0} disappearsOnIndex={-1} opacity={0.35} pressBehavior="close" />
    ),
    [],
  );

  async function handleFetchModels() {
    setFetchingModels(true);
    try {
      const result = await fetchOpenAICompatibleModels({ baseUrl, apiKey });
      if (result.ok) {
        setRemoteModels(result.models);
      } else {
        setRemoteModels([]);
      }
      showToast(result.message, result.ok ? 'success' : 'error');
    } finally {
      setFetchingModels(false);
    }
  }

  async function handleTestLLM() {
    setTestingLLM(true);
    try {
      const result = await session.testLLMConfig({
        provider,
        baseUrl,
        apiKey,
        model,
      });
      showToast(result.message, result.ok ? 'success' : 'error');
    } finally {
      setTestingLLM(false);
    }
  }

  async function handleSave() {
    setSaving(true);
    try {
      const result = await session.saveRuntimeConfig({
        llm: {
          provider,
          baseUrl,
          apiKey,
          model,
        },
      });
      showToast(result.message, result.ok ? 'success' : 'error');
    } finally {
      setSaving(false);
    }
  }

  function handleOpenModelSheet() {
    setCustomModelInput(model);
    setModelSheetMode('list');
    modelSheetRef.current?.present();
  }

  function handleApplyCustomModel() {
    const nextModel = customModelInput.trim();
    if (!nextModel) {
      showToast('请先输入模型名。', 'error');
      return;
    }
    setModel(nextModel);
    showToast(`已选择模型：${nextModel}`, 'success');
    setModelSheetMode('list');
    modelSheetRef.current?.dismiss();
  }

  const selectedProviderLabel =
    LLM_PROVIDER_OPTIONS.find((option) => option.value === provider)?.label ?? '请选择模型厂商';

  return (
    <BottomSheetModalProvider>
      <SettingsScaffold title="自定义大模型" subtitle="仅在回复模式=自定义 LLM 时生效" showBack>
        <View className="rounded-2xl bg-white p-4" testID="settings-llm-card">
          <View className="flex-row items-center justify-between">
            <Text className="text-[14px] font-semibold text-slate-900">连接配置</Text>
            <TouchableOpacity
              className="rounded-full bg-slate-100 px-3 py-2"
              onPress={() => void handleTestLLM()}
              disabled={testingLLM || !provider}
              testID="settings-llm-test"
            >
              <Text className="text-[12px] font-medium text-slate-700">{testingLLM ? '测试中...' : '测试 LLM'}</Text>
            </TouchableOpacity>
          </View>

          <TouchableOpacity
            className="mt-3 flex-row items-center justify-between rounded-xl border border-slate-200 px-3 py-3"
            onPress={() => providerSheetRef.current?.present()}
            testID="settings-llm-provider-selector"
          >
            <View>
              <Text className="text-[12px] text-slate-500">模型厂商</Text>
              <Text className="mt-1 text-[14px] font-medium text-slate-900">{selectedProviderLabel}</Text>
            </View>
            <VoiceAssistantIcon name="grid" size={16} color="#64748B" />
          </TouchableOpacity>

          <Text className="mt-3 text-[12px] text-slate-500">Base URL</Text>
          <TextInput
            className="mt-2 rounded-xl border border-slate-200 px-3 py-3 text-[14px] text-slate-900"
            value={baseUrl}
            onChangeText={(text) => {
              setBaseUrl(text);
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
            value={apiKey}
            onChangeText={(text) => {
              setApiKey(text);
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
            testID="settings-llm-fetch-models"
          >
            <Text className="text-[12px] font-medium text-slate-700">{fetchingModels ? '拉取中...' : '通过接口拉取模型'}</Text>
          </TouchableOpacity>

          <TouchableOpacity
            className="mt-3 rounded-xl border border-slate-200 px-3 py-3"
            onPress={handleOpenModelSheet}
            testID="settings-llm-model-selector"
          >
            <Text className="text-[12px] text-slate-500">模型</Text>
            <Text className="mt-1 text-[13px] text-slate-700">{model || '选择接口模型（可选）'}</Text>
          </TouchableOpacity>
        </View>

        <SettingsPrimaryButton
          label={saving ? '保存中...' : '保存配置'}
          onPress={() => void handleSave()}
          disabled={saving}
          testID="settings-llm-save"
        />

      </SettingsScaffold>

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
              active={provider === option.value}
              onPress={() => {
                setProvider(option.value);
                providerSheetRef.current?.dismiss();
              }}
              testID={`settings-provider-option-${option.value}`}
            />
          ))}
        </BottomSheetView>
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
                modelCandidates.map((candidate) => (
                  <SheetRow
                    key={candidate}
                    label={candidate}
                    active={model === candidate}
                    onPress={() => {
                      setModel(candidate);
                      modelSheetRef.current?.dismiss();
                    }}
                    testID={`settings-model-option-${candidate}`}
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
                  <Text className="mt-1 text-[12px] text-slate-500">{customModelInput.trim() || '点击编辑自定义模型名'}</Text>
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
    </BottomSheetModalProvider>
  );
}
