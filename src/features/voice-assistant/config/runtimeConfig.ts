import {
  VOICE_ASSISTANT_DIALOG_SPEAKER,
} from './constants';
import {
  readLLMEnv,
  readReplyChainMode,
  readS2SEnv,
  type ReplyChainMode,
} from './env';

export type VoiceOptionSource = 'default' | 'remote';

export type RuntimeVoiceOption = {
  id: string;
  label: string;
  sourceType: VoiceOptionSource;
};

export type RuntimeLLMConfig = {
  baseUrl: string;
  apiKey: string;
  model: string;
  provider: string;
};

export type RuntimeS2SConfig = {
  appId: string;
  accessToken: string;
  wsUrl: string;
};

export type RuntimeConfig = {
  replyChainMode: ReplyChainMode;
  llm: RuntimeLLMConfig;
  s2s: RuntimeS2SConfig;
  androidDialog: {
    appKeyOverride: string;
  };
  voice: {
    speakerId: string;
    speakerLabel: string;
    sourceType: VoiceOptionSource;
  };
};

export type RuntimeConfigDraft = Partial<{
  replyChainMode: ReplyChainMode;
  llm: Partial<RuntimeLLMConfig>;
  s2s: Partial<RuntimeS2SConfig>;
  androidDialog: Partial<RuntimeConfig['androidDialog']>;
  voice: Partial<RuntimeConfig['voice']>;
}>;

export const VOICE_ASSISTANT_DEFAULT_VOICE_OPTIONS: RuntimeVoiceOption[] = [
  { id: 'saturn_zh_female_aojiaonvyou_tob', label: '傲娇女友(女)', sourceType: 'default' },
  { id: 'saturn_zh_female_bingjiaojiejie_tob', label: '病娇姐姐(女)', sourceType: 'default' },
  { id: 'saturn_zh_female_chengshujiejie_tob', label: '成熟姐姐(女)', sourceType: 'default' },
  { id: 'saturn_zh_female_keainvsheng_tob', label: '可爱女生(女)', sourceType: 'default' },
  { id: 'saturn_zh_female_nuanxinxuejie_tob', label: '暖心学姐(女)', sourceType: 'default' },
  { id: 'saturn_zh_female_tiexinnvyou_tob', label: '贴心女友(女)', sourceType: 'default' },
  { id: 'saturn_zh_female_wenrouwenya_tob', label: '温柔文雅(女)', sourceType: 'default' },
  { id: 'saturn_zh_female_wumeiyujie_tob', label: '妩媚御姐(女)', sourceType: 'default' },
  { id: 'saturn_zh_female_xingganyujie_tob', label: '性感御姐(女)', sourceType: 'default' },
  { id: 'saturn_zh_male_aiqilingren_tob', label: '爱妻邻人(男)', sourceType: 'default' },
  { id: 'saturn_zh_male_aojiaogongzi_tob', label: '傲娇公子(男)', sourceType: 'default' },
  { id: 'saturn_zh_male_aojiaojingying_tob', label: '傲娇精英(男)', sourceType: 'default' },
  { id: 'saturn_zh_male_aomanshaoye_tob', label: '傲慢少爷(男)', sourceType: 'default' },
  { id: 'saturn_zh_male_badaoshaoye_tob', label: '霸道少爷(男)', sourceType: 'default' },
  { id: 'saturn_zh_male_bingjiaobailian_tob', label: '病娇白脸(男)', sourceType: 'default' },
  { id: 'saturn_zh_male_bujiqingnian_tob', label: '不羁青年(男)', sourceType: 'default' },
  { id: 'saturn_zh_male_chengshuzongcai_tob', label: '成熟总裁(男)', sourceType: 'default' },
  { id: 'saturn_zh_male_cixingnansang_tob', label: '磁性男嗓(男)', sourceType: 'default' },
  { id: 'saturn_zh_male_cujingnanyou_tob', label: '粗犷男友(男)', sourceType: 'default' },
  { id: 'saturn_zh_male_fengfashaonian_tob', label: '风发少年(男)', sourceType: 'default' },
  { id: 'saturn_zh_male_fuheigongzi_tob', label: '腹黑公子(男)', sourceType: 'default' },
];

export function listRuntimeVoiceOptions(): RuntimeVoiceOption[] {
  return [...VOICE_ASSISTANT_DEFAULT_VOICE_OPTIONS];
}

export function readRuntimeConfigFromEnv(): RuntimeConfig {
  const envS2S = readS2SEnv();
  const envLLM = readLLMEnv();
  return {
    replyChainMode: readReplyChainMode(),
    llm: {
      baseUrl: envLLM?.baseUrl ?? '',
      apiKey: envLLM?.apiKey ?? '',
      model: envLLM?.model ?? '',
      provider: envLLM?.provider ?? 'openai-compatible',
    },
    s2s: {
      appId: envS2S?.appId ?? '',
      accessToken: envS2S?.accessToken ?? '',
      wsUrl: envS2S?.wsUrl ?? '',
    },
    androidDialog: {
      appKeyOverride: envS2S?.appKey ?? '',
    },
    voice: {
      speakerId: VOICE_ASSISTANT_DEFAULT_VOICE_OPTIONS[0]?.id ?? VOICE_ASSISTANT_DIALOG_SPEAKER,
      speakerLabel: VOICE_ASSISTANT_DEFAULT_VOICE_OPTIONS[0]?.label ?? VOICE_ASSISTANT_DIALOG_SPEAKER,
      sourceType: 'default',
    },
  };
}

export function mergeRuntimeConfig(base: RuntimeConfig, draft?: RuntimeConfigDraft): RuntimeConfig {
  if (!draft) {
    return base;
  }
  const nextLLM = draft.llm ?? {};
  const nextS2S = draft.s2s ?? {};
  const nextAndroidDialog = draft.androidDialog ?? {};
  const nextVoice = draft.voice ?? {};

  return {
    replyChainMode: draft.replyChainMode ?? base.replyChainMode,
    llm: {
      baseUrl: nextLLM.baseUrl ?? base.llm.baseUrl,
      apiKey: nextLLM.apiKey ?? base.llm.apiKey,
      model: nextLLM.model ?? base.llm.model,
      provider: nextLLM.provider ?? base.llm.provider,
    },
    s2s: {
      appId: nextS2S.appId ?? base.s2s.appId,
      accessToken: nextS2S.accessToken ?? base.s2s.accessToken,
      wsUrl: nextS2S.wsUrl ?? base.s2s.wsUrl,
    },
    androidDialog: {
      appKeyOverride: nextAndroidDialog.appKeyOverride ?? base.androidDialog.appKeyOverride,
    },
    voice: {
      speakerId: nextVoice.speakerId ?? base.voice.speakerId,
      speakerLabel: nextVoice.speakerLabel ?? base.voice.speakerLabel,
      sourceType: nextVoice.sourceType ?? base.voice.sourceType,
    },
  };
}

export function isCompleteLLMConfig(llm: RuntimeLLMConfig): boolean {
  return Boolean((llm.baseUrl ?? '').trim() && (llm.apiKey ?? '').trim() && (llm.model ?? '').trim());
}

export function isCompleteS2SConfig(s2s: RuntimeS2SConfig): boolean {
  return Boolean((s2s.appId ?? '').trim() && (s2s.accessToken ?? '').trim() && (s2s.wsUrl ?? '').trim());
}

export function validateRuntimeConfig(config: RuntimeConfig): string[] {
  const errors: string[] = [];
  if (!isCompleteS2SConfig(config.s2s)) {
    errors.push('S2S 配置缺少 App ID / Access Token / WS URL。');
  }
  if (config.replyChainMode === 'custom_llm' && !isCompleteLLMConfig(config.llm)) {
    errors.push('当前选择了 custom_llm，请补全 Base URL / API Key / Model。');
  }
  if (!(config.voice.speakerId ?? '').trim()) {
    errors.push('请至少选择一个音色。');
  }
  return errors;
}

export function isRuntimeConfigEqual(left: RuntimeConfig, right: RuntimeConfig): boolean {
  return (
    left.replyChainMode === right.replyChainMode &&
    left.llm.baseUrl === right.llm.baseUrl &&
    left.llm.apiKey === right.llm.apiKey &&
    left.llm.model === right.llm.model &&
    left.llm.provider === right.llm.provider &&
    left.s2s.appId === right.s2s.appId &&
    left.s2s.accessToken === right.s2s.accessToken &&
    left.s2s.wsUrl === right.s2s.wsUrl &&
    left.androidDialog.appKeyOverride === right.androidDialog.appKeyOverride &&
    left.voice.speakerId === right.voice.speakerId &&
    left.voice.speakerLabel === right.voice.speakerLabel &&
    left.voice.sourceType === right.voice.sourceType
  );
}
