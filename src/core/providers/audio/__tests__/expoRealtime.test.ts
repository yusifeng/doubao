jest.mock('expo-av', () => {
  const prepareToRecordAsync = jest.fn(async () => undefined);
  const startAsync = jest.fn(async () => undefined);
  const stopAndUnloadAsync = jest.fn(async () => undefined);
  const getURI = jest.fn(() => 'file://mock.m4a');

  class Recording {
    prepareToRecordAsync = prepareToRecordAsync;
    startAsync = startAsync;
    stopAndUnloadAsync = stopAndUnloadAsync;
    getURI = getURI;
  }

  class Sound {
    async loadAsync() {
      return undefined;
    }
    setOnPlaybackStatusUpdate() {
      return undefined;
    }
    async unloadAsync() {
      return undefined;
    }
    async stopAsync() {
      return undefined;
    }
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
import { ExpoRealtimeAudioProvider } from '../expoRealtime';

describe('ExpoRealtimeAudioProvider capture idempotency', () => {
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
});
