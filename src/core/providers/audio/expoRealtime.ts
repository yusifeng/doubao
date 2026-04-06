import { Audio } from 'expo-av';
import * as Speech from 'expo-speech';
import * as FileSystem from 'expo-file-system/legacy';
import { NativeEventEmitter, NativeModules, Platform } from 'react-native';
import {
  ExpoSpeechRecognitionModule,
  type ExpoSpeechRecognitionErrorCode,
  type ExpoSpeechRecognitionErrorEvent,
  type ExpoSpeechRecognitionResultEvent,
} from 'expo-speech-recognition';
import type { AudioProvider } from './types';
import {
  ASR_SILENCE_GAP_MS,
  CAPTURE_AUDIO_MODE,
  ENABLE_ANDROID_NATIVE_PCM_PLAYBACK,
  LIVE_PCM_CAPTURE_RETRY_COOLDOWN_MS,
  LIVE_STREAM_AUDIO_SOURCE,
  LIVE_STREAM_BITS_PER_SAMPLE,
  LIVE_STREAM_BUFFER_SIZE,
  LIVE_STREAM_CHANNELS,
  LIVE_STREAM_SAMPLE_RATE,
  MAX_FRAME_BYTES,
  MIC_HARD_FAILURE_ERRORS,
  NATIVE_PCM_RETRY_COOLDOWN_MS,
  PCM_BITS_PER_SAMPLE,
  PCM_CHANNELS,
  PCM_SAMPLE_RATE,
  PLAYBACK_PCM_FORMAT_PROBE_MIN_BYTES,
  PREFERRED_ANDROID_RECOGNITION_SERVICES,
  RECOGNITION_STOP_TIMEOUT_MS,
  STREAM_SEGMENT_MS,
  TRANSIENT_NO_INPUT_ERRORS,
} from './expoRealtime.constants';
import { base64ToBytes, bytesToBase64, concatUint8, pcmToWav } from './expoRealtime.pcm';

type RecognitionSubscription = {
  remove: () => void;
};

type LiveAudioStreamModule = {
  init: (options: {
    sampleRate: number;
    channels: number;
    bitsPerSample: number;
    audioSource?: number;
    bufferSize?: number;
  }) => void;
  start: () => void;
  stop: () => void;
  on: (event: 'data', callback: (data: string) => void) => { remove?: () => void } | void;
};

type RNLiveAudioStreamNativeModule = {
  init: (options: {
    sampleRate: number;
    channels: number;
    bitsPerSample: number;
    audioSource?: number;
    bufferSize?: number;
  }) => void;
  start: () => void;
  stop: () => void;
};

type RNRealtimePcmPlayerNativeModule = {
  init: (options: {
    sampleRate: number;
    channels: number;
    bitsPerSample: number;
    bufferSize?: number;
  }) => Promise<void> | void;
  start: () => Promise<void> | void;
  write: (base64Pcm: string) => Promise<void> | void;
  flush: () => Promise<void> | void;
  stop: () => Promise<void> | void;
  release: () => Promise<void> | void;
};

export class ExpoRealtimeAudioProvider implements AudioProvider {
  private recording: Audio.Recording | null = null;

  private capturedFrame: Uint8Array | null = null;
  private captureActive = false;
  private captureUsingLiveStream = false;
  private liveAudioStream: LiveAudioStreamModule | null = null;
  private liveAudioSubscription: { remove?: () => void } | null = null;
  private liveAudioEmitter: NativeEventEmitter | null = null;
  private captureTimer: ReturnType<typeof setInterval> | null = null;
  private captureUri: string | null = null;
  private captureLastReadSize = 0;
  private captureReadInFlight = false;
  private onFrame: ((frame: Uint8Array) => Promise<void> | void) | null = null;
  private captureFrameCount = 0;
  private captureBytesEmitted = 0;
  private captureLastFrameAt = 0;
  private livePcmCaptureDisabledUntil = 0;
  private livePcmLastWarnAt = 0;
  private playbackChain: Promise<void> = Promise.resolve();
  private playbackSound: Audio.Sound | null = null;
  private nativePcmPlayer: RNRealtimePcmPlayerNativeModule | null = null;
  private nativePcmPlayerReady = false;
  private nativePcmPlayerStarted = false;
  private nativePcmTemporaryDisabledUntil = 0;
  private nativePcmLastWarnAt = 0;
  private playbackDetectedPcmFormat: 'unknown' | 'pcm_s16le' | 'pcm_f32le' = 'unknown';
  private playbackPcmRemainder = new Uint8Array(0);
  private playbackLastSkipReason = '';
  private recognitionActive = false;
  private recognitionQueue: Array<string | null> = [];
  private recognitionWaiters: Array<(value: string | null) => void> = [];
  private recognitionErrorCode: ExpoSpeechRecognitionErrorCode | null = null;
  private recognitionErrorMessage: string | null = null;
  private recognitionListeners: RecognitionSubscription[] = [];
  private recognitionLatestTranscript: string | null = null;
  private recognitionLatestUpdatedAt = 0;
  private recognitionLastEnqueuedTranscript: string | null = null;
  private recognitionInterimCommitTimer: ReturnType<typeof setTimeout> | null = null;
  private recognitionDetectedSound = false;
  private recognitionPeakVolume = -2;
  private recognitionPermissionGranted = false;

  async startCapture(onFrame?: (frame: Uint8Array) => Promise<void> | void): Promise<void> {
    if (this.captureActive) {
      this.onFrame = onFrame ?? this.onFrame;
      return;
    }
    const permission = await Audio.requestPermissionsAsync();
    if (!permission.granted) {
      throw new Error('麦克风权限未授予');
    }

    await Audio.setAudioModeAsync(CAPTURE_AUDIO_MODE);
    this.captureActive = true;
    this.onFrame = onFrame ?? null;
    this.captureLastReadSize = 0;
    this.captureFrameCount = 0;
    this.captureBytesEmitted = 0;
    this.captureLastFrameAt = 0;
    const liveStreamStarted = this.tryStartLivePcmCapture();
    if (liveStreamStarted) {
      // Runtime marker for diagnosing fallback issues on emulator/device.
      console.info('[voice-assistant][audio] capture source=live_pcm');
      return;
    }
    this.logCaptureFallback('live_pcm_unavailable');
    await this.startCaptureSession();
  }

  async stopCapture(): Promise<void> {
    if (!this.captureActive && !this.captureUsingLiveStream && !this.recording) {
      this.onFrame = null;
      return;
    }
    this.captureActive = false;
    if (this.captureUsingLiveStream) {
      this.stopLivePcmCapture();
      this.onFrame = null;
      this.captureUri = null;
      this.captureLastReadSize = 0;
      this.captureReadInFlight = false;
      this.captureFrameCount = 0;
      this.captureBytesEmitted = 0;
      this.captureLastFrameAt = 0;
      return;
    }
    if (this.captureTimer) {
      clearInterval(this.captureTimer);
      this.captureTimer = null;
    }
    if (!this.recording) {
      this.onFrame = null;
      this.captureUri = null;
      this.captureLastReadSize = 0;
      this.captureReadInFlight = false;
      this.captureFrameCount = 0;
      this.captureBytesEmitted = 0;
      this.captureLastFrameAt = 0;
      return;
    }

    await this.flushCaptureChunk();
    let uri: string | null = null;
    try {
      await this.recording.stopAndUnloadAsync();
      uri = this.recording.getURI() ?? this.captureUri;
    } catch {
      // Some devices throw when stopping too quickly; treat as empty capture.
      uri = this.captureUri;
    } finally {
      this.recording = null;
    }
    this.captureUri = uri;
    try {
      await this.flushCaptureChunk();
    } catch {
      // Best effort: final chunk may not be readable on some devices.
    }
    this.captureUri = null;
    this.captureLastReadSize = 0;
    this.captureReadInFlight = false;
    this.captureFrameCount = 0;
    this.captureBytesEmitted = 0;
    this.captureLastFrameAt = 0;
    this.onFrame = null;
  }

  async consumeCapturedAudioFrame(): Promise<Uint8Array | null> {
    const frame = this.capturedFrame;
    this.capturedFrame = null;
    return frame;
  }

  async startRecognition(locale = 'zh-CN'): Promise<void> {
    if (this.recognitionActive) {
      return;
    }
    await this.ensureRecognitionPermission();
    if (!ExpoSpeechRecognitionModule.isRecognitionAvailable()) {
      throw new Error('当前设备不可用语音识别服务');
    }

    this.clearRecognitionListeners();
    this.resetRecognitionState();
    this.registerRecognitionListeners();
    try {
      const recognitionServices = ExpoSpeechRecognitionModule.getSpeechRecognitionServices();
      const defaultService =
        typeof ExpoSpeechRecognitionModule.getDefaultRecognitionService === 'function'
          ? ExpoSpeechRecognitionModule.getDefaultRecognitionService().packageName.trim()
          : '';
      const preferredService = PREFERRED_ANDROID_RECOGNITION_SERVICES.find((service) =>
        recognitionServices.includes(service),
      );
      const canUseDefaultService =
        defaultService.length > 0 &&
        recognitionServices.includes(defaultService) &&
        !defaultService.toLowerCase().includes('tts');
      // Prefer known speech recognizers and avoid selecting TTS packages as ASR backends.
      const recognitionServicePackage = preferredService ?? (canUseDefaultService ? defaultService : undefined);
      ExpoSpeechRecognitionModule.start({
        lang: locale,
        interimResults: true,
        // Keep one long-running recognition session like the official realtime demo microphone loop.
        continuous: true,
        maxAlternatives: 1,
        requiresOnDeviceRecognition: false,
        // Punctuation on Android is mainly stable with on-device models; disable to reduce recognition stalls.
        addsPunctuation: false,
        androidRecognitionServicePackage: recognitionServicePackage,
        // Improve short prompt recognition on Android.
        androidIntentOptions: {
          EXTRA_LANGUAGE_MODEL: 'web_search',
        },
      });
      this.recognitionActive = true;
    } catch (error) {
      this.clearRecognitionListeners();
      const message = error instanceof Error ? error.message : '语音识别启动失败';
      throw new Error(message);
    }
  }

  async waitForRecognitionResult(timeoutMs = RECOGNITION_STOP_TIMEOUT_MS): Promise<string | null> {
    const transcript = await this.waitFromRecognitionQueue(timeoutMs);
    return this.consumeRecognitionOutcome(transcript);
  }

  async stopRecognition(): Promise<string | null> {
    if (this.recognitionActive) {
      try {
        ExpoSpeechRecognitionModule.stop();
      } catch (error) {
        await this.abortRecognition();
        const message = error instanceof Error ? error.message : '语音识别停止失败';
        throw new Error(message);
      }
    }
    const transcript = await this.waitForRecognitionResult(RECOGNITION_STOP_TIMEOUT_MS);
    await this.abortRecognition();
    return transcript;
  }

  async abortRecognition(): Promise<void> {
    if (this.recognitionActive) {
      try {
        ExpoSpeechRecognitionModule.abort();
      } catch {
        // Best effort.
      }
    }
    this.flushRecognitionWaiters(null);
    this.clearRecognitionListeners();
    this.resetRecognitionState();
  }

  async play(chunk: Uint8Array): Promise<void> {
    const raw = chunk.length > MAX_FRAME_BYTES ? chunk.slice(0, MAX_FRAME_BYTES) : chunk;
    this.playbackChain = this.playbackChain.then(async () => {
      const pcm = this.normalizePcmForPlayback(raw);
      if (pcm.length === 0) {
        if (this.playbackLastSkipReason) {
          console.info('[voice-assistant][audio] playback skip', {
            reason: this.playbackLastSkipReason,
          });
          this.playbackLastSkipReason = '';
        }
        return;
      }
      let nativePlaybackStarted = false;
      try {
        nativePlaybackStarted = await this.ensureNativePcmPlaybackStarted();
      } catch (error) {
        const message = error instanceof Error ? error.message : 'unknown error';
        this.disableNativePcmTemporarily(message);
      }
      if (nativePlaybackStarted) {
        try {
          await Promise.resolve(this.nativePcmPlayer?.write(bytesToBase64(pcm)));
          return;
        } catch (error) {
          const message = error instanceof Error ? error.message : 'unknown error';
          this.disableNativePcmTemporarily(message);
        }
      }
      const wav = pcmToWav(pcm);
      const wavBase64 = bytesToBase64(wav);
      const dataUri = `data:audio/wav;base64,${wavBase64}`;
      try {
        await this.playWavUri(dataUri);
        return;
      } catch {
        // Some Android environments may reject data URI playback; fallback to temp-file route.
      }
      const uri = `${FileSystem.cacheDirectory}s2s-chunk-${Date.now()}-${Math.random().toString(36).slice(2, 8)}.wav`;
      try {
        await FileSystem.writeAsStringAsync(uri, wavBase64, {
          encoding: FileSystem.EncodingType.Base64,
        });
        await this.playWavUri(uri);
      } finally {
        await FileSystem.deleteAsync(uri, { idempotent: true });
      }
    });
    await this.playbackChain;
  }

  async speak(text: string): Promise<void> {
    const value = text.trim();
    if (!value) {
      return;
    }
    await new Promise<void>((resolve) => {
      Speech.speak(value, {
        language: 'zh-CN',
        onDone: () => resolve(),
        onStopped: () => resolve(),
        onError: () => resolve(),
      });
    });
  }

  async stopPlayback(): Promise<void> {
    Speech.stop();
    await this.stopNativePcmPlayback();
    this.playbackDetectedPcmFormat = 'unknown';
    this.playbackPcmRemainder = new Uint8Array(0);
    this.nativePcmTemporaryDisabledUntil = 0;
    if (this.playbackSound) {
      try {
        await this.playbackSound.stopAsync();
      } catch {
        // Best effort.
      }
    }
  }

  getDebugSnapshot(): {
    captureActive: boolean;
    captureUsingLiveStream: boolean;
    captureFrameCount: number;
    captureBytesEmitted: number;
    captureLastFrameAt: number;
    livePcmCaptureDisabledUntil: number;
    nativePcmPlayerReady: boolean;
    nativePcmPlayerStarted: boolean;
  } {
    return {
      captureActive: this.captureActive,
      captureUsingLiveStream: this.captureUsingLiveStream,
      captureFrameCount: this.captureFrameCount,
      captureBytesEmitted: this.captureBytesEmitted,
      captureLastFrameAt: this.captureLastFrameAt,
      livePcmCaptureDisabledUntil: this.livePcmCaptureDisabledUntil,
      nativePcmPlayerReady: this.nativePcmPlayerReady,
      nativePcmPlayerStarted: this.nativePcmPlayerStarted,
    };
  }

  private async playWavUri(uri: string): Promise<void> {
    const sound = new Audio.Sound();
    try {
      await sound.loadAsync({ uri }, { shouldPlay: true });
      this.playbackSound = sound;
      await new Promise<void>((resolve) => {
        sound.setOnPlaybackStatusUpdate((status) => {
          if (!status.isLoaded || status.didJustFinish) {
            resolve();
          }
        });
      });
    } finally {
      await sound.unloadAsync();
      if (this.playbackSound === sound) {
        this.playbackSound = null;
      }
    }
  }

  private async startCaptureSession(): Promise<void> {
    if (!this.captureActive) {
      return;
    }
    this.captureUsingLiveStream = false;
    const instance = new Audio.Recording();
    await instance.prepareToRecordAsync(Audio.RecordingOptionsPresets.HIGH_QUALITY);
    await instance.startAsync();
    this.recording = instance;
    this.captureUri = instance.getURI();
    this.captureLastReadSize = 0;
    this.captureTimer = setInterval(() => {
      void this.flushCaptureChunk().catch(() => {
        // Avoid unhandled rejection from timer callback.
      });
    }, STREAM_SEGMENT_MS);
  }

  private tryStartLivePcmCapture(): boolean {
    if (Platform.OS !== 'android') {
      return false;
    }
    if (Date.now() < this.livePcmCaptureDisabledUntil) {
      return false;
    }
    const liveAudioStream = this.createNativeLiveAudioStreamModule();
    if (!liveAudioStream) {
      this.disableLivePcmCaptureTemporarily('native_module_unavailable');
      return false;
    }
    try {
      this.stopLivePcmCapture();
      this.captureUsingLiveStream = true;
      this.liveAudioStream = liveAudioStream;
      liveAudioStream.init({
        sampleRate: LIVE_STREAM_SAMPLE_RATE,
        channels: LIVE_STREAM_CHANNELS,
        bitsPerSample: LIVE_STREAM_BITS_PER_SAMPLE,
        audioSource: LIVE_STREAM_AUDIO_SOURCE,
        bufferSize: LIVE_STREAM_BUFFER_SIZE,
      });
      const subscription = liveAudioStream.on('data', (base64Chunk: string) => {
        if (!this.captureActive) {
          return;
        }
        const bytes = base64ToBytes(base64Chunk);
        if (bytes.length === 0) {
          return;
        }
        for (let offset = 0; offset < bytes.length; offset += MAX_FRAME_BYTES) {
          const frame = bytes.slice(offset, offset + MAX_FRAME_BYTES);
          this.capturedFrame = frame;
          this.captureFrameCount += 1;
          this.captureBytesEmitted += frame.length;
          this.captureLastFrameAt = Date.now();
          if (this.captureFrameCount === 1 || this.captureFrameCount % 50 === 0) {
            console.info('[voice-assistant][audio] capture health', {
              frames: this.captureFrameCount,
              bytes: this.captureBytesEmitted,
              lastFrameAt: this.captureLastFrameAt,
            });
          }
          void this.emitFrameIfNeeded(frame).catch(() => {
            // Keep audio callback non-blocking and resilient.
          });
        }
      });
      this.liveAudioSubscription = subscription && typeof subscription === 'object' ? subscription : null;
      liveAudioStream.start();
      return true;
    } catch (error) {
      const message = error instanceof Error ? error.message : 'unknown error';
      this.disableLivePcmCaptureTemporarily(message);
      this.stopLivePcmCapture();
      return false;
    }
  }

  private createNativeLiveAudioStreamModule(): LiveAudioStreamModule | null {
    const nativeModule = (NativeModules as { RNLiveAudioStream?: unknown }).RNLiveAudioStream;
    if (!nativeModule || typeof nativeModule !== 'object') {
      return null;
    }
    const typedModule = nativeModule as Partial<RNLiveAudioStreamNativeModule>;
    if (
      typeof typedModule.init !== 'function' ||
      typeof typedModule.start !== 'function' ||
      typeof typedModule.stop !== 'function'
    ) {
      return null;
    }
    const emitter = this.getLiveAudioEmitter();
    return {
      init: (options) => typedModule.init?.(options),
      start: () => typedModule.start?.(),
      stop: () => typedModule.stop?.(),
      on: (event, callback) => {
        if (event !== 'data') {
          throw new Error('Invalid live audio event');
        }
        return emitter.addListener('data', callback);
      },
    };
  }

  private getLiveAudioEmitter(): NativeEventEmitter {
    if (this.liveAudioEmitter) {
      return this.liveAudioEmitter;
    }
    this.liveAudioEmitter = new NativeEventEmitter({
      // Shim methods for RN >=0.65 NativeEventEmitter contract.
      addListener: () => {},
      removeListeners: () => {},
    } as any);
    return this.liveAudioEmitter;
  }

  private getNativePcmPlayerModule(): RNRealtimePcmPlayerNativeModule | null {
    if (Platform.OS !== 'android') {
      return null;
    }
    if (this.nativePcmPlayer) {
      return this.nativePcmPlayer;
    }
    const nativeModule = (NativeModules as { RNRealtimePcmPlayer?: unknown }).RNRealtimePcmPlayer;
    if (!nativeModule || typeof nativeModule !== 'object') {
      return null;
    }
    const typed = nativeModule as Partial<RNRealtimePcmPlayerNativeModule>;
    if (
      typeof typed.init !== 'function' ||
      typeof typed.start !== 'function' ||
      typeof typed.write !== 'function' ||
      typeof typed.flush !== 'function' ||
      typeof typed.stop !== 'function'
    ) {
      return null;
    }
    this.nativePcmPlayer = typed as RNRealtimePcmPlayerNativeModule;
    return this.nativePcmPlayer;
  }

  private async ensureNativePcmPlaybackStarted(): Promise<boolean> {
    if (!ENABLE_ANDROID_NATIVE_PCM_PLAYBACK) {
      return false;
    }
    if (Date.now() < this.nativePcmTemporaryDisabledUntil) {
      return false;
    }
    const module = this.getNativePcmPlayerModule();
    if (!module) {
      return false;
    }
    if (!this.nativePcmPlayerReady) {
      await Promise.resolve(
        module.init({
          sampleRate: PCM_SAMPLE_RATE,
          channels: PCM_CHANNELS,
          bitsPerSample: PCM_BITS_PER_SAMPLE,
          // Keep a larger stream buffer to smooth jitter spikes.
          bufferSize: PCM_SAMPLE_RATE * 4,
        }),
      );
      this.nativePcmPlayerReady = true;
    }
    if (!this.nativePcmPlayerStarted) {
      await Promise.resolve(module.start());
      this.nativePcmPlayerStarted = true;
      console.info('[voice-assistant][audio] playback sink=native_pcm_stream');
    }
    return true;
  }

  private disableNativePcmTemporarily(reason: string): void {
    this.nativePcmTemporaryDisabledUntil = Date.now() + NATIVE_PCM_RETRY_COOLDOWN_MS;
    this.nativePcmPlayerStarted = false;
    this.nativePcmPlayerReady = false;
    const now = Date.now();
    if (now - this.nativePcmLastWarnAt >= 2000) {
      this.nativePcmLastWarnAt = now;
      console.warn('[voice-assistant][audio] native pcm playback unavailable, temporary fallback to expo-av', {
        reason,
        retryInMs: NATIVE_PCM_RETRY_COOLDOWN_MS,
      });
    }
  }

  private async stopNativePcmPlayback(): Promise<void> {
    const module = this.getNativePcmPlayerModule();
    if (!module || !this.nativePcmPlayerReady) {
      return;
    }
    try {
      await Promise.resolve(module.flush());
      await Promise.resolve(module.stop());
    } catch {
      // Best effort.
    } finally {
      this.nativePcmPlayerStarted = false;
    }
  }

  private stopLivePcmCapture(): void {
    if (this.liveAudioSubscription?.remove) {
      try {
        this.liveAudioSubscription.remove();
      } catch {
        // Best effort.
      }
    }
    this.liveAudioSubscription = null;
    if (this.liveAudioStream) {
      try {
        this.liveAudioStream.stop();
      } catch {
        // Best effort.
      }
    }
    this.liveAudioStream = null;
    this.captureUsingLiveStream = false;
  }

  private disableLivePcmCaptureTemporarily(reason: string): void {
    this.livePcmCaptureDisabledUntil = Date.now() + LIVE_PCM_CAPTURE_RETRY_COOLDOWN_MS;
    const now = Date.now();
    if (now - this.livePcmLastWarnAt >= 2000) {
      this.livePcmLastWarnAt = now;
      console.warn('[voice-assistant][audio] live pcm capture unavailable, temporary fallback to expo-av', {
        reason,
        retryInMs: LIVE_PCM_CAPTURE_RETRY_COOLDOWN_MS,
      });
    }
  }

  private logCaptureFallback(reason: string): void {
    console.warn('[voice-assistant][audio] capture source=expo_av_fallback', {
      reason,
      livePcmRetryInMs: Math.max(0, this.livePcmCaptureDisabledUntil - Date.now()),
    });
  }

  private normalizePcmForPlayback(chunk: Uint8Array): Uint8Array {
    const merged = concatUint8(this.playbackPcmRemainder, chunk);
    this.playbackPcmRemainder = new Uint8Array(0);
    if (merged.length === 0) {
      this.playbackLastSkipReason = 'empty_chunk';
      return merged;
    }

    if (this.playbackDetectedPcmFormat === 'unknown') {
      // Do not lock format too early: first chunks can be tiny and inconclusive.
      if (merged.length < PLAYBACK_PCM_FORMAT_PROBE_MIN_BYTES) {
        this.playbackPcmRemainder = new Uint8Array(merged);
        this.playbackLastSkipReason = 'await_more_bytes_for_format_probe';
        return new Uint8Array(0);
      }
      const alignedProbeSize = merged.length - (merged.length % 4);
      const probe = alignedProbeSize > 0 ? merged.slice(0, alignedProbeSize) : merged;
      if (alignedProbeSize >= PLAYBACK_PCM_FORMAT_PROBE_MIN_BYTES && this.isLikelyFloat32Pcm(probe)) {
        this.playbackDetectedPcmFormat = 'pcm_f32le';
        console.info('[voice-assistant][audio] downstream pcm format detected=pcm_f32le(auto-convert)');
      } else {
        this.playbackDetectedPcmFormat = 'pcm_s16le';
        console.info('[voice-assistant][audio] downstream pcm format detected=pcm_s16le');
      }
    }

    if (this.playbackDetectedPcmFormat === 'pcm_f32le') {
      const aligned = merged.length - (merged.length % 4);
      if (aligned <= 0) {
        this.playbackPcmRemainder = new Uint8Array(merged);
        this.playbackLastSkipReason = 'float32_alignment_pending';
        return new Uint8Array(0);
      }
      if (aligned < merged.length) {
        this.playbackPcmRemainder = new Uint8Array(merged.slice(aligned));
      }
      return this.convertFloat32LePcmToS16Le(merged.slice(0, aligned));
    }

    const aligned = merged.length - (merged.length % 2);
    if (aligned <= 0) {
      this.playbackPcmRemainder = new Uint8Array(merged);
      this.playbackLastSkipReason = 's16_alignment_pending';
      return new Uint8Array(0);
    }
    if (aligned < merged.length) {
      this.playbackPcmRemainder = new Uint8Array(merged.slice(aligned));
    }
    return merged.slice(0, aligned);
  }

  private isLikelyFloat32Pcm(bytes: Uint8Array): boolean {
    if (bytes.length < 1024 || bytes.length % 4 !== 0) {
      return false;
    }
    const sampleCount = Math.min(256, Math.floor(bytes.length / 4));
    if (sampleCount < 64) {
      return false;
    }
    const view = new DataView(bytes.buffer, bytes.byteOffset, sampleCount * 4);
    let finite = 0;
    let inRange = 0;
    let nearZero = 0;
    for (let index = 0; index < sampleCount; index += 1) {
      const value = view.getFloat32(index * 4, true);
      if (!Number.isFinite(value)) {
        continue;
      }
      finite += 1;
      const abs = Math.abs(value);
      if (abs <= 1.2) {
        inRange += 1;
      }
      if (abs < 0.0001) {
        nearZero += 1;
      }
    }
    if (finite < sampleCount * 0.95) {
      return false;
    }
    // Silence chunks are inconclusive; avoid false positive for all-zero s16 buffers.
    if (nearZero > finite * 0.95) {
      return false;
    }
    return inRange > finite * 0.92;
  }

  private convertFloat32LePcmToS16Le(input: Uint8Array): Uint8Array {
    const sampleCount = Math.floor(input.length / 4);
    const out = new Uint8Array(sampleCount * 2);
    const view = new DataView(input.buffer, input.byteOffset, sampleCount * 4);
    for (let index = 0; index < sampleCount; index += 1) {
      const floatValue = view.getFloat32(index * 4, true);
      const clamped = Math.max(-1, Math.min(1, Number.isFinite(floatValue) ? floatValue : 0));
      const intValue = clamped < 0 ? Math.round(clamped * 32768) : Math.round(clamped * 32767);
      out[index * 2] = intValue & 0xff;
      out[index * 2 + 1] = (intValue >> 8) & 0xff;
    }
    return out;
  }

  private isLiveAudioStreamModule(value: unknown): value is LiveAudioStreamModule {
    if (!value || typeof value !== 'object') {
      return false;
    }
    const candidate = value as Partial<LiveAudioStreamModule>;
    return (
      typeof candidate.init === 'function' &&
      typeof candidate.start === 'function' &&
      typeof candidate.stop === 'function' &&
      typeof candidate.on === 'function'
    );
  }

  private async flushCaptureChunk(): Promise<void> {
    if (!this.captureActive && !this.recording) {
      return;
    }
    if (this.captureReadInFlight) {
      return;
    }
    const uri = this.captureUri ?? this.recording?.getURI();
    if (!uri) {
      return;
    }
    this.captureUri = uri;
    this.captureReadInFlight = true;
    try {
      const content = await FileSystem.readAsStringAsync(uri, {
        encoding: FileSystem.EncodingType.Base64,
      });
      const bytes = base64ToBytes(content);
      if (bytes.length <= this.captureLastReadSize) {
        return;
      }
      const delta = bytes.slice(this.captureLastReadSize);
      this.captureLastReadSize = bytes.length;
      if (delta.length === 0) {
        return;
      }
      for (let offset = 0; offset < delta.length; offset += MAX_FRAME_BYTES) {
        const frame = delta.slice(offset, offset + MAX_FRAME_BYTES);
        this.capturedFrame = frame;
        await this.emitFrameIfNeeded(frame);
      }
    } catch {
      // Android emulator may occasionally lock recording file briefly while muxing.
    } finally {
      this.captureReadInFlight = false;
    }
  }

  private registerRecognitionListeners(): void {
    this.recognitionListeners = [
      ExpoSpeechRecognitionModule.addListener('result', (event: ExpoSpeechRecognitionResultEvent) => {
        const best = event.results
          .map((item) => item.transcript?.trim() ?? '')
          .sort((a, b) => b.length - a.length)[0];
        if (!best) {
          return;
        }
        this.recognitionDetectedSound = true;
        this.recognitionLatestTranscript = best;
        this.recognitionLatestUpdatedAt = Date.now();
        if (event.isFinal) {
          this.clearRecognitionInterimCommitTimer();
          this.enqueueRecognitionTranscript(best);
          return;
        }
        this.scheduleRecognitionInterimCommit();
      }),
      ExpoSpeechRecognitionModule.addListener('soundstart', () => {
        this.recognitionDetectedSound = true;
      }),
      ExpoSpeechRecognitionModule.addListener('speechstart', () => {
        this.recognitionDetectedSound = true;
      }),
      ExpoSpeechRecognitionModule.addListener('speechend', () => {
        this.flushRecognitionLatestTranscript();
      }),
      ExpoSpeechRecognitionModule.addListener('soundend', () => {
        this.flushRecognitionLatestTranscript();
      }),
      ExpoSpeechRecognitionModule.addListener('volumechange', (event: { value: number }) => {
        if (event.value > this.recognitionPeakVolume) {
          this.recognitionPeakVolume = event.value;
        }
        if (event.value > -1) {
          this.recognitionDetectedSound = true;
        }
      }),
      ExpoSpeechRecognitionModule.addListener('error', (event: ExpoSpeechRecognitionErrorEvent) => {
        this.recognitionErrorCode = event.error;
        this.recognitionErrorMessage = event.message;
        this.recognitionActive = false;
        this.flushRecognitionLatestTranscript();
        this.enqueueRecognitionResult(null);
      }),
      ExpoSpeechRecognitionModule.addListener('end', () => {
        this.recognitionActive = false;
        this.flushRecognitionLatestTranscript();
        this.enqueueRecognitionResult(null);
      }),
    ];
  }

  private clearRecognitionListeners(): void {
    this.clearRecognitionInterimCommitTimer();
    for (const listener of this.recognitionListeners) {
      listener.remove();
    }
    this.recognitionListeners = [];
  }

  private resetRecognitionState(): void {
    this.recognitionActive = false;
    this.recognitionQueue = [];
    this.recognitionWaiters = [];
    this.recognitionErrorCode = null;
    this.recognitionErrorMessage = null;
    this.recognitionLatestTranscript = null;
    this.recognitionLatestUpdatedAt = 0;
    this.recognitionLastEnqueuedTranscript = null;
    this.recognitionDetectedSound = false;
    this.recognitionPeakVolume = -2;
  }

  private scheduleRecognitionInterimCommit(): void {
    this.clearRecognitionInterimCommitTimer();
    this.recognitionInterimCommitTimer = setTimeout(() => {
      this.recognitionInterimCommitTimer = null;
      this.flushRecognitionLatestTranscript();
    }, ASR_SILENCE_GAP_MS);
  }

  private clearRecognitionInterimCommitTimer(): void {
    if (!this.recognitionInterimCommitTimer) {
      return;
    }
    clearTimeout(this.recognitionInterimCommitTimer);
    this.recognitionInterimCommitTimer = null;
  }

  private flushRecognitionLatestTranscript(): void {
    const transcript = this.recognitionLatestTranscript?.trim() ?? '';
    if (!transcript) {
      this.recognitionLatestTranscript = null;
      return;
    }
    this.enqueueRecognitionTranscript(transcript);
  }

  private enqueueRecognitionTranscript(transcript: string): void {
    const clean = transcript.trim();
    if (!clean) {
      return;
    }
    if (clean === this.recognitionLastEnqueuedTranscript) {
      this.recognitionLatestTranscript = null;
      return;
    }
    this.recognitionLastEnqueuedTranscript = clean;
    this.recognitionLatestTranscript = null;
    this.enqueueRecognitionResult(clean);
  }

  private enqueueRecognitionResult(result: string | null): void {
    if (this.recognitionWaiters.length > 0) {
      const waiter = this.recognitionWaiters.shift();
      waiter?.(result);
      return;
    }
    this.recognitionQueue.push(result);
  }

  private flushRecognitionWaiters(value: string | null): void {
    this.recognitionWaiters.splice(0).forEach((resolve) => resolve(value));
  }

  private async waitFromRecognitionQueue(timeoutMs: number): Promise<string | null> {
    if (this.recognitionQueue.length > 0) {
      const queued = this.recognitionQueue.shift();
      return queued ?? null;
    }
    return new Promise<string | null>((resolve) => {
      let settled = false;
      const timer = setTimeout(() => {
        // Fallback path: if interim transcript has been stable for the silence gap, commit it now.
        if (
          this.recognitionLatestTranscript &&
          this.recognitionLatestUpdatedAt > 0 &&
          Date.now() - this.recognitionLatestUpdatedAt >= ASR_SILENCE_GAP_MS
        ) {
          this.flushRecognitionLatestTranscript();
        }
        if (settled) {
          return;
        }
        const index = this.recognitionWaiters.indexOf(waiter);
        if (index >= 0) {
          this.recognitionWaiters.splice(index, 1);
        }
        settled = true;
        resolve(null);
      }, timeoutMs);
      const waiter = (value: string | null) => {
        if (settled) {
          return;
        }
        settled = true;
        clearTimeout(timer);
        resolve(value);
      };
      this.recognitionWaiters.push(waiter);
    });
  }

  private consumeRecognitionOutcome(transcript: string | null): string | null {
    const errorCode = this.recognitionErrorCode;
    const errorMessage = this.recognitionErrorMessage;

    if (transcript) {
      this.recognitionErrorCode = null;
      this.recognitionErrorMessage = null;
      return transcript;
    }

    if (errorCode && MIC_HARD_FAILURE_ERRORS.includes(errorCode)) {
      this.recognitionErrorCode = null;
      this.recognitionErrorMessage = null;
      throw new Error(errorMessage ?? '未检测到麦克风输入');
    }

    if (
      errorCode &&
      !TRANSIENT_NO_INPUT_ERRORS.includes(errorCode) &&
      errorCode !== 'aborted'
    ) {
      this.recognitionErrorCode = null;
      this.recognitionErrorMessage = null;
      throw new Error(errorMessage ?? `语音识别失败：${errorCode}`);
    }

    // Treat no-speech/speech-timeout as an empty utterance instead of a hardware fault.
    this.recognitionErrorCode = null;
    this.recognitionErrorMessage = null;
    return null;
  }

  private async emitFrameIfNeeded(frame: Uint8Array): Promise<void> {
    if (!this.onFrame || frame.length === 0) {
      return;
    }
    await this.onFrame(frame);
  }

  private async ensureRecognitionPermission(): Promise<void> {
    if (this.recognitionPermissionGranted) {
      return;
    }
    const currentPermission = await ExpoSpeechRecognitionModule.getPermissionsAsync();
    if (currentPermission.granted) {
      this.recognitionPermissionGranted = true;
      return;
    }
    const requestPermission =
      typeof ExpoSpeechRecognitionModule.requestMicrophonePermissionsAsync === 'function'
        ? await ExpoSpeechRecognitionModule.requestMicrophonePermissionsAsync()
        : await ExpoSpeechRecognitionModule.requestPermissionsAsync();
    if (!requestPermission.granted) {
      throw new Error('语音识别权限未授予');
    }
    this.recognitionPermissionGranted = true;
  }
}
