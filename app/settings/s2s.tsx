import {
  BottomSheetBackdrop,
  BottomSheetModal,
  BottomSheetModalProvider,
  BottomSheetScrollView,
} from '@gorhom/bottom-sheet';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Text, TextInput, TouchableOpacity, View } from 'react-native';
import { Button, Dialog, Portal, Provider as PaperProvider } from 'react-native-paper';
import { listRuntimeVoiceOptions } from '../../src/features/voice-assistant/config/runtimeConfig';
import { useVoiceAssistantRuntime } from '../../src/features/voice-assistant/runtime/VoiceAssistantRuntimeProvider';
import { SettingsPrimaryButton, SettingsScaffold } from './_components';
import { VoiceAssistantIcon } from '../../src/features/voice-assistant/ui/VoiceAssistantIcon';
import { useAppToast } from '../../src/shared/ui/AppToastProvider';

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

export default function SettingsS2SRoute() {
  const session = useVoiceAssistantRuntime();
  const { showToast } = useAppToast();

  const [appId, setAppId] = useState(session.runtimeConfig.s2s.appId);
  const [accessToken, setAccessToken] = useState(session.runtimeConfig.s2s.accessToken);
  const [voice, setVoice] = useState(session.runtimeConfig.voice);
  const [customVoiceInput, setCustomVoiceInput] = useState('');
  const [voiceSheetMode, setVoiceSheetMode] = useState<'list' | 'custom'>('list');
  const [testingS2S, setTestingS2S] = useState(false);
  const [saving, setSaving] = useState(false);
  const [voiceTipVisible, setVoiceTipVisible] = useState(false);

  const voiceSheetRef = useRef<BottomSheetModal>(null);
  const voiceOptions = useMemo(() => listRuntimeVoiceOptions(), []);
  const voiceSnapPoints = useMemo(() => ['70%'], []);

  useEffect(() => {
    setAppId(session.runtimeConfig.s2s.appId);
    setAccessToken(session.runtimeConfig.s2s.accessToken);
    setVoice(session.runtimeConfig.voice);
    setCustomVoiceInput(session.runtimeConfig.voice.sourceType === 'remote' ? session.runtimeConfig.voice.speakerId : '');
  }, [session.runtimeConfig.s2s, session.runtimeConfig.voice]);

  const renderBackdrop = useCallback(
    (props: any) => (
      <BottomSheetBackdrop {...props} appearsOnIndex={0} disappearsOnIndex={-1} opacity={0.35} pressBehavior="close" />
    ),
    [],
  );

  const selectedVoiceLabel =
    voiceOptions.find((item) => item.id === voice.speakerId)?.label ?? voice.speakerLabel;

  function openVoiceSheet() {
    setVoiceSheetMode('list');
    setCustomVoiceInput(voice.sourceType === 'remote' ? voice.speakerId : '');
    voiceSheetRef.current?.present();
  }

  function applyCustomVoice() {
    const nextId = customVoiceInput.trim();
    if (!nextId) {
      showToast('请先输入自定义音色ID。', 'error');
      return;
    }
    setVoice({
      speakerId: nextId,
      speakerLabel: '自定义音色',
      sourceType: 'remote',
    });
    showToast(`已应用自定义音色：${nextId}`, 'success');
    setVoiceSheetMode('list');
    voiceSheetRef.current?.dismiss();
  }

  async function handleTestS2S() {
    setTestingS2S(true);
    try {
      const result = await session.testS2SConnection({ appId, accessToken });
      showToast(result.message, result.ok ? 'success' : 'error');
    } finally {
      setTestingS2S(false);
    }
  }

  async function handleSave() {
    setSaving(true);
    try {
      const result = await session.saveRuntimeConfig({
        s2s: {
          appId,
          accessToken,
        },
        voice,
      });
      showToast(result.message, result.ok ? 'success' : 'error');
    } finally {
      setSaving(false);
    }
  }

  return (
    <PaperProvider>
      <BottomSheetModalProvider>
        <SettingsScaffold title="S2S 配置" subtitle="包含连接参数与音色设置" showBack>
          <View className="rounded-2xl bg-white p-4" testID="settings-s2s-card">
            <View className="flex-row items-center justify-between">
              <Text className="text-[14px] font-semibold text-slate-900">连接参数</Text>
              <TouchableOpacity
                className="rounded-full bg-slate-100 px-3 py-2"
                onPress={() => void handleTestS2S()}
                disabled={testingS2S}
                testID="settings-s2s-test"
              >
                <Text className="text-[12px] font-medium text-slate-700">{testingS2S ? '测试中...' : '测试 S2S'}</Text>
              </TouchableOpacity>
            </View>

            <Text className="mt-3 text-[12px] text-slate-500">App ID</Text>
            <TextInput
              className="mt-2 rounded-xl border border-slate-200 px-3 py-3 text-[14px] text-slate-900"
              value={appId}
              onChangeText={setAppId}
              placeholder="App ID"
              placeholderTextColor="#94A3B8"
              testID="settings-s2s-app-id-input"
            />

            <Text className="mt-3 text-[12px] text-slate-500">Access Token</Text>
            <TextInput
              className="mt-2 rounded-xl border border-slate-200 px-3 py-3 text-[14px] text-slate-900"
              value={accessToken}
              onChangeText={setAccessToken}
              placeholder="Access Token"
              placeholderTextColor="#94A3B8"
              testID="settings-s2s-access-token-input"
              secureTextEntry
              autoCapitalize="none"
            />
          </View>

          <View className="mt-3 rounded-2xl bg-white p-4" testID="settings-voice-card">
            <Text className="text-[14px] font-semibold text-slate-900">音色</Text>
            <TouchableOpacity
              className="mt-3 flex-row items-center justify-between rounded-xl border border-slate-200 px-3 py-3"
              onPress={openVoiceSheet}
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
              onPress={() => setVoiceTipVisible(true)}
              testID="settings-voice-custom-tip"
            >
              <Text className="text-[13px] font-medium text-slate-700">如何获取自定义音色？</Text>
            </TouchableOpacity>
            <Text className="mt-3 text-[12px] leading-5 text-slate-500" testID="settings-s2s-sc20-hint">
              当前仅支持 SC2.0 连接协议，WS 地址已内置固定。
            </Text>
          </View>

          <SettingsPrimaryButton
            label={saving ? '保存中...' : '保存配置'}
            onPress={() => void handleSave()}
            disabled={saving}
            testID="settings-s2s-save"
          />
        </SettingsScaffold>

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
                    <Text className="mt-1 text-[12px] text-slate-500">{customVoiceInput.trim() || '点击编辑自定义音色ID'}</Text>
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
                    active={voice.speakerId === option.id}
                    onPress={() => {
                      setVoice({
                        speakerId: option.id,
                        speakerLabel: option.label,
                        sourceType: option.sourceType,
                      });
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
                  onPress={applyCustomVoice}
                  testID="settings-voice-custom-apply"
                >
                  <Text className="text-[13px] font-semibold text-white">使用该音色</Text>
                </TouchableOpacity>
              </View>
            )}
          </BottomSheetScrollView>
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
  );
}
