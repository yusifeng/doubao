import type { ExpoSpeechRecognitionErrorCode } from 'expo-speech-recognition';

export const MAX_FRAME_BYTES = 64 * 1024;
export const PCM_SAMPLE_RATE = 24000;
export const PCM_CHANNELS = 1;
export const PCM_BITS_PER_SAMPLE = 16;
export const STREAM_SEGMENT_MS = 1200;
export const RECOGNITION_STOP_TIMEOUT_MS = 8000;
export const ASR_SILENCE_GAP_MS = 1500;
export const LIVE_STREAM_SAMPLE_RATE = 16000;
export const LIVE_STREAM_CHANNELS = 1;
export const LIVE_STREAM_BITS_PER_SAMPLE = 16;
export const LIVE_STREAM_BUFFER_SIZE = 3200;
// Use default MIC source to keep emulator host-mic behavior predictable.
export const LIVE_STREAM_AUDIO_SOURCE = 1;
export const LIVE_PCM_CAPTURE_RETRY_COOLDOWN_MS = 4000;
export const CAPTURE_AUDIO_MODE = {
  allowsRecordingIOS: true,
  playsInSilentModeIOS: true,
  shouldDuckAndroid: true,
  staysActiveInBackground: true,
  // Keep assistant audio on media route; earpiece/voice-call route is prone to artifacts on emulator.
  playThroughEarpieceAndroid: false,
} as const;
export const PLAYBACK_PCM_FORMAT_PROBE_MIN_BYTES = 2048;
export const ENABLE_ANDROID_NATIVE_PCM_PLAYBACK = true;
export const NATIVE_PCM_RETRY_COOLDOWN_MS = 4000;
export const TRANSIENT_NO_INPUT_ERRORS: ExpoSpeechRecognitionErrorCode[] = [
  'no-speech',
  'speech-timeout',
  'network',
  'busy',
];
export const MIC_HARD_FAILURE_ERRORS: ExpoSpeechRecognitionErrorCode[] = ['audio-capture', 'not-allowed'];
export const PREFERRED_ANDROID_RECOGNITION_SERVICES = [
  'com.google.android.googlequicksearchbox',
  'com.google.android.as',
] as const;
