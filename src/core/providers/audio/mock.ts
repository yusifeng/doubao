import type { AudioProvider } from './types';

export class MockAudioProvider implements AudioProvider {
  private readonly mockTranscript = '测试语音输入';

  async startCapture(_onFrame?: (frame: Uint8Array) => Promise<void> | void): Promise<void> {
    return;
  }

  async stopCapture(): Promise<void> {
    return;
  }

  async consumeCapturedAudioFrame(): Promise<Uint8Array | null> {
    return null;
  }

  async startRecognition(_locale?: string): Promise<void> {
    return;
  }

  async waitForRecognitionResult(_timeoutMs?: number): Promise<string | null> {
    return this.mockTranscript;
  }

  async stopRecognition(): Promise<string | null> {
    return this.mockTranscript;
  }

  async abortRecognition(): Promise<void> {
    return;
  }

  async play(_chunk: Uint8Array): Promise<void> {
    return;
  }

  async speak(_text: string): Promise<void> {
    return;
  }

  async stopPlayback(): Promise<void> {
    return;
  }
}
