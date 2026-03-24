export interface AudioProvider {
  startCapture(onFrame?: (frame: Uint8Array) => Promise<void> | void): Promise<void>;
  stopCapture(): Promise<void>;
  consumeCapturedAudioFrame(): Promise<Uint8Array | null>;
  startRecognition(locale?: string): Promise<void>;
  waitForRecognitionResult(timeoutMs?: number): Promise<string | null>;
  stopRecognition(): Promise<string | null>;
  abortRecognition(): Promise<void>;
  play(chunk: Uint8Array): Promise<void>;
  speak(text: string): Promise<void>;
  stopPlayback(): Promise<void>;
}
