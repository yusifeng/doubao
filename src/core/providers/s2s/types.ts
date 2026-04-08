export type S2STextQueryOptions = {
  onPartialText?: (text: string) => void;
};

export interface S2SProvider {
  connect(): Promise<void>;
  disconnect(): Promise<void>;
  startSession(): Promise<void>;
  finishSession(): Promise<void>;
  finishConnection(): Promise<void>;
  sendAudioFrame(frame: Uint8Array): Promise<void>;
  sendTextQuery(text: string, options?: S2STextQueryOptions): Promise<string | null>;
  waitForAssistantText(timeoutMs?: number, onPartialText?: (text: string) => void): Promise<string | null>;
  waitForAssistantAudioChunk(timeoutMs?: number): Promise<Uint8Array | null>;
  interrupt(): Promise<void>;
}
