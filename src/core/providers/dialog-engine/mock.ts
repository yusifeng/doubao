import type {
  DialogEngineListener,
  DialogEngineProvider,
  DialogPrepareConfig,
  DialogStartConversationConfig,
  DialogTtsChunk,
} from './types';

export class MockDialogEngineProvider implements DialogEngineProvider {
  private listener: DialogEngineListener | null = null;

  isSupported(): boolean {
    return false;
  }

  async prepare(_config?: Partial<DialogPrepareConfig>): Promise<void> {
    // noop
  }

  async startConversation(_config: DialogStartConversationConfig): Promise<void> {
    this.listener?.({ type: 'engine_start', sessionId: 'mock-session' });
  }

  async stopConversation(): Promise<void> {
    this.listener?.({ type: 'engine_stop', sessionId: 'mock-session' });
  }

  async pauseTalking(): Promise<void> {
    // noop
  }

  async resumeTalking(): Promise<void> {
    // noop
  }

  async interruptCurrentDialog(): Promise<void> {
    // noop
  }

  async sendTextQuery(_text: string): Promise<void> {
    // noop
  }

  async useClientTriggeredTts(): Promise<void> {
    // noop
  }

  async useServerTriggeredTts(): Promise<void> {
    // noop
  }

  async streamClientTtsText(chunk: DialogTtsChunk): Promise<void> {
    if (chunk.content) {
      this.listener?.({ type: 'chat_partial', text: chunk.content, raw: chunk.content });
    }
    if (chunk.end) {
      this.listener?.({ type: 'chat_final', text: '', raw: '' });
    }
  }

  setListener(listener: DialogEngineListener | null): void {
    this.listener = listener;
  }

  async destroy(): Promise<void> {
    this.listener = null;
  }
}
