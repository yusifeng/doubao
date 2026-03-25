jest.mock('expo-av', () => {
  const prepareToRecordAsync = jest.fn(async () => undefined);
  const startAsync = jest.fn(async () => undefined);
  const stopAndUnloadAsync = jest.fn(async () => undefined);
  const getURI = jest.fn(() => 'file://mock.m4a');
  const soundLoadAsync = jest.fn(async () => undefined);
  const soundUnloadAsync = jest.fn(async () => undefined);
  const soundStopAsync = jest.fn(async () => undefined);

  class Recording {
    prepareToRecordAsync = prepareToRecordAsync;
    startAsync = startAsync;
    stopAndUnloadAsync = stopAndUnloadAsync;
    getURI = getURI;
  }

  class Sound {
    loadAsync = soundLoadAsync;
    setOnPlaybackStatusUpdate(callback: (status: { isLoaded: boolean; didJustFinish: boolean }) => void) {
      callback({ isLoaded: true, didJustFinish: true });
    }
    unloadAsync = soundUnloadAsync;
    stopAsync = soundStopAsync;
  }

  return {
    Audio: {
      requestPermissionsAsync: jest.fn(async () => ({ granted: true })),
      setAudioModeAsync: jest.fn(async () => undefined),
      Recording,
      Sound,
      RecordingOptionsPresets: {
        HIGH_QUALITY: {},
      },
    },
    __mock: {
      soundLoadAsync,
      soundUnloadAsync,
      soundStopAsync,
    },
  };
});

jest.mock('expo-speech', () => ({
  speak: jest.fn(),
  stop: jest.fn(),
}));

jest.mock('expo-file-system/legacy', () => ({
  cacheDirectory: 'file://cache/',
  writeAsStringAsync: jest.fn(async () => undefined),
  deleteAsync: jest.fn(async () => undefined),
  EncodingType: {
    Base64: 'base64',
  },
}));

jest.mock('expo-speech-recognition', () => ({
  ExpoSpeechRecognitionModule: {
    isRecognitionAvailable: jest.fn(() => true),
    getSpeechRecognitionServices: jest.fn(() => []),
    start: jest.fn(),
    stop: jest.fn(),
    abort: jest.fn(),
  },
}));

jest.mock('react-native', () => ({
  NativeModules: {},
  NativeEventEmitter: class {
    addListener() {
      return { remove: jest.fn() };
    }
  },
  Platform: {
    OS: 'ios',
  },
}));

import { Audio } from 'expo-av';
import { NativeModules, Platform } from 'react-native';
import { ExpoRealtimeAudioProvider } from '../expoRealtime';

const expoAvMock = jest.requireMock('expo-av').__mock as {
  soundLoadAsync: jest.Mock;
  soundUnloadAsync: jest.Mock;
  soundStopAsync: jest.Mock;
};

describe('ExpoRealtimeAudioProvider capture idempotency', () => {
  beforeEach(() => {
    Platform.OS = 'ios';
    Object.keys(NativeModules).forEach((key) => {
      delete (NativeModules as Record<string, unknown>)[key];
    });
    jest.clearAllMocks();
  });

  it('does not reinitialize capture when startCapture is called twice', async () => {
    const provider = new ExpoRealtimeAudioProvider();

    await provider.startCapture();
    await provider.startCapture();

    expect(Audio.requestPermissionsAsync).toHaveBeenCalledTimes(1);
    expect(Audio.setAudioModeAsync).toHaveBeenCalledTimes(1);

    await provider.stopCapture();
  });

  it('allows stopCapture to be called repeatedly without throwing', async () => {
    const provider = new ExpoRealtimeAudioProvider();

    await provider.startCapture();
    await expect(provider.stopCapture()).resolves.toBeUndefined();
    await expect(provider.stopCapture()).resolves.toBeUndefined();
  });

  it('uses the native PCM player on Android when the module is available', async () => {
    Platform.OS = 'android';
    const init = jest.fn(async () => undefined);
    const start = jest.fn(async () => undefined);
    const write = jest.fn(async () => undefined);
    const flush = jest.fn(async () => undefined);
    const stop = jest.fn(async () => undefined);
    const release = jest.fn(async () => undefined);
    (NativeModules as Record<string, unknown>).RNRealtimePcmPlayer = {
      init,
      start,
      write,
      flush,
      stop,
      release,
    };
    const provider = new ExpoRealtimeAudioProvider();
    const chunk = new Uint8Array(4096);
    chunk.fill(1);

    await provider.play(chunk);

    expect(init).toHaveBeenCalledTimes(1);
    expect(start).toHaveBeenCalledTimes(1);
    expect(write).toHaveBeenCalledTimes(1);
    expect(expoAvMock.soundLoadAsync).not.toHaveBeenCalled();
  });
});
