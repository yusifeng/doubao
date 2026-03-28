import type {
  DialogEngineProvider,
  DialogPrepareConfig,
  DialogStartConversationConfig,
} from '../../../../core/providers/dialog-engine/types';
import { DialogCommandQueue } from './commandQueue';

export class SessionController {
  private readonly queue = new DialogCommandQueue();

  constructor(private readonly dialogEngine: DialogEngineProvider) {}

  async prepare(config?: Partial<DialogPrepareConfig>): Promise<void> {
    await this.queue.enqueue('prepare', () => this.dialogEngine.prepare(config));
  }

  async startConversation(config: DialogStartConversationConfig): Promise<void> {
    await this.queue.enqueue('startConversation', () => this.dialogEngine.startConversation(config));
  }

  async stopConversation(): Promise<void> {
    await this.queue.enqueue('stopConversation', () => this.dialogEngine.stopConversation());
  }

  async pauseTalking(): Promise<void> {
    await this.dialogEngine.pauseTalking();
  }

  async resumeTalking(): Promise<void> {
    await this.dialogEngine.resumeTalking();
  }

  async interruptCurrentDialog(): Promise<void> {
    await this.queue.enqueue('interruptCurrentDialog', () => this.dialogEngine.interruptCurrentDialog());
  }

  async sendTextQuery(text: string): Promise<void> {
    await this.queue.enqueue('sendTextQuery', () => this.dialogEngine.sendTextQuery(text));
  }

  async useClientTriggeredTts(): Promise<void> {
    await this.queue.enqueue('useClientTriggeredTts', () => this.dialogEngine.useClientTriggeredTts());
  }

  async useServerTriggeredTts(): Promise<void> {
    await this.queue.enqueue('useServerTriggeredTts', () => this.dialogEngine.useServerTriggeredTts());
  }

  async streamClientTtsText(payload: { start: boolean; content: string; end: boolean }): Promise<void> {
    // Data-plane path: do not serialize with control-plane queue to avoid stream stalls.
    await this.dialogEngine.streamClientTtsText(payload);
  }

  async destroy(): Promise<void> {
    this.queue.clear();
    await this.dialogEngine.destroy();
  }
}
