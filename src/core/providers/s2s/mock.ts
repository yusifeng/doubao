import type { S2SProvider } from './types';

export class MockS2SProvider implements S2SProvider {
  async connect(): Promise<void> {
    return;
  }

  async disconnect(): Promise<void> {
    return;
  }

  async startSession(): Promise<void> {
    return;
  }

  async finishSession(): Promise<void> {
    return;
  }

  async finishConnection(): Promise<void> {
    return;
  }

  async sendAudioFrame(_frame: Uint8Array): Promise<void> {
    return;
  }

  async sendTextQuery(_text: string): Promise<string | null> {
    return null;
  }

  async waitForAssistantText(_timeoutMs?: number, _onPartialText?: (text: string) => void): Promise<string | null> {
    return null;
  }

  async waitForAssistantAudioChunk(_timeoutMs?: number): Promise<Uint8Array | null> {
    return null;
  }

  async interrupt(): Promise<void> {
    return;
  }
}
