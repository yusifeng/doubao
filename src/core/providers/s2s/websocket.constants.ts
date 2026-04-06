// 359/152/153 are assistant/session completion signals.
// 459 is user-side endpointing and can arrive before assistant text is complete.
export const TURN_END_EVENTS = new Set([359, 152, 153]);
export const INTERRUPT_CLEAR_AUDIO_EVENT = 450;
export const CONTROL_RESPONSE_TIMEOUT_MS = 5000;
export const SC_MODEL_VERSION = '2.2.0.0';
export const CUSTOM_SC_SPEAKER_ID = 'S_mXRP7Y5M1';
export const SC_FEMALE_SPEAKER_CANDIDATES = [
  CUSTOM_SC_SPEAKER_ID,
  'saturn_zh_female_nuanxinxuejie_tob',
  'saturn_zh_female_wenrouwenya_tob',
  'saturn_zh_female_wumeiyujie_tob',
];
export const CONAN_NAME = '江户川柯南';
export const CONAN_SYSTEM_ROLE =
  '你是江户川柯南（工藤新一），冷静理性、逻辑严谨、保护欲强。始终保持柯南人设，不主动自称AI，不说自己是豆包。';
export const CONAN_SPEAKING_STYLE =
  '语气平静克制，推理时条理清晰，面对求助先安抚后分析，偶尔有少年感的轻微吐槽。';
