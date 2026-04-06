import type { S2SProvider } from './types';
import { KONAN_CHARACTER_MANIFEST } from '../../../character/konanManifest';
import {
  buildAudioFrame,
  buildFinishConnectionFrame,
  buildFinishSessionFrame,
  buildStartConnectionFrame,
  buildStartSessionFrame,
  buildTextQueryFrame,
  parseServerFrame,
  type ParsedServerFrame,
} from './protocol';
import {
  CONAN_NAME,
  CONAN_SPEAKING_STYLE,
  CONAN_SYSTEM_ROLE,
  CONTROL_RESPONSE_TIMEOUT_MS,
  CUSTOM_SC_SPEAKER_ID,
  INTERRUPT_CLEAR_AUDIO_EVENT,
  SC_FEMALE_SPEAKER_CANDIDATES,
  SC_MODEL_VERSION,
  TURN_END_EVENTS,
} from './websocket.constants';

type WebSocketS2SProviderConfig = {
  wsUrl: string;
  appId: string;
  accessToken: string;
};

type S2SConnectionPhase = 'disconnected' | 'connected' | 'session_started';
type TurnState = {
  pendingAssistantText: string;
  pendingAssistantHasText: boolean;
  lastCompletedAssistantTextNormalized: string;
  lastCompletedAssistantTextAt: number;
  recentCompletedAssistantTexts: Array<{
    normalized: string;
    at: number;
  }>;
};

export class WebSocketS2SProvider implements S2SProvider {
  private socket: WebSocket | null = null;
  private readonly connectTimeoutMs = 8000;
  private sessionId: string = '';
  private connected = false;
  private phase: S2SConnectionPhase = 'disconnected';
  private frameQueue: ParsedServerFrame[] = [];
  private textQueue: string[] = [];
  private audioQueue: Uint8Array[] = [];
  private turnState: TurnState = {
    pendingAssistantText: '',
    pendingAssistantHasText: false,
    lastCompletedAssistantTextNormalized: '',
    lastCompletedAssistantTextAt: 0,
    recentCompletedAssistantTexts: [],
  };
  private frameWaiters: Array<(value: ParsedServerFrame | null) => void> = [];
  private textWaiters: Array<(value: string | null) => void> = [];
  private audioWaiters: Array<(value: Uint8Array | null) => void> = [];
  private sentAudioFrames = 0;
  private receivedAudioChunks = 0;
  private finalizedTurns = 0;

  constructor(private readonly config: WebSocketS2SProviderConfig) {}

  async connect(): Promise<void> {
    if (this.socket) {
      return;
    }
    await new Promise<void>((resolve, reject) => {
      type ReactNativeWebSocketCtor = new (
        url: string,
        protocols?: string | string[],
        options?: { headers?: Record<string, string> },
      ) => WebSocket;
      const ReactNativeWebSocket = WebSocket as unknown as ReactNativeWebSocketCtor;
      const socket = new ReactNativeWebSocket(this.config.wsUrl, undefined, {
        headers: {
          'X-Api-App-ID': this.config.appId,
          'X-Api-Access-Key': this.config.accessToken,
          'X-Api-Resource-Id': 'volc.speech.dialog',
          'X-Api-App-Key': 'PlgvMymc7f3tQnJ6',
        },
      });

      let settled = false;
      const timeout = setTimeout(() => {
        if (settled) {
          return;
        }
        settled = true;
        socket.close();
        reject(new Error(`S2S websocket connect timeout after ${this.connectTimeoutMs}ms`));
      }, this.connectTimeoutMs);

      const done = (fn: () => void) => {
        if (settled) {
          return;
        }
        settled = true;
        clearTimeout(timeout);
        fn();
      };

      socket.onopen = () => {
        done(() => {
          this.socket = socket;
          this.connected = true;
          this.phase = 'connected';
          this.sessionId = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
          socket.binaryType = 'arraybuffer';
          socket.onmessage = this.handleMessage;
          socket.send(buildStartConnectionFrame() as unknown as ArrayBuffer);
          resolve();
        });
      };
      socket.onerror = (event: unknown) => {
        done(() => {
          const maybeMessage =
            typeof event === 'object' &&
            event !== null &&
            'message' in event &&
            typeof (event as { message?: unknown }).message === 'string'
              ? (event as { message: string }).message
              : 'unknown error';
          reject(new Error(`S2S websocket connect failed: ${maybeMessage}`));
        });
      };
      socket.onclose = (event: unknown) => {
        done(() => {
          const code =
            typeof event === 'object' &&
            event !== null &&
            'code' in event &&
            typeof (event as { code?: unknown }).code === 'number'
              ? (event as { code: number }).code
              : -1;
          const reason =
            typeof event === 'object' &&
            event !== null &&
            'reason' in event &&
            typeof (event as { reason?: unknown }).reason === 'string'
              ? (event as { reason: string }).reason
              : 'no reason';
          if (!this.socket) {
            reject(new Error(`S2S websocket closed during connect: code=${code} reason=${reason}`));
          }
        });
      };
    });
    await this.waitForControlFrame('StartConnection', this.connectTimeoutMs);
    console.info('[voice-assistant] s2s StartConnection ack');
  }

  async disconnect(): Promise<void> {
    if (!this.socket) {
      return;
    }
    this.socket.close();
    this.socket = null;
    this.connected = false;
    this.phase = 'disconnected';
    this.frameQueue = [];
    this.textQueue = [];
    this.audioQueue = [];
    this.resetTurnState({ resetLastCompleted: true });
    this.flushWaitersOnDisconnect();
  }

  async startSession(): Promise<void> {
    if (!this.socket || !this.connected) {
      throw new Error('S2S socket is not connected');
    }
    let lastError: unknown = null;

    for (const speaker of SC_FEMALE_SPEAKER_CANDIDATES) {
      const preferredRequest = this.buildStartSessionRequest(speaker);
      try {
        await this.sendStartSession(preferredRequest);
        return;
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        if (!this.shouldFallbackSpeakerForSC(message)) {
          throw error;
        }
        lastError = error;
        console.warn('[voice-assistant] s2s StartSession speaker incompatible, try next speaker', {
          model: SC_MODEL_VERSION,
          speaker,
          error: message,
        });
      }
    }

    const fallbackRequest = this.buildStartSessionRequest(null);
    try {
      await this.sendStartSession(fallbackRequest);
    } catch (error) {
      if (lastError) {
        throw lastError;
      }
      throw error;
    }
  }

  async finishSession(): Promise<void> {
    if (!this.socket || !this.connected) {
      return;
    }
    this.socket.send(buildFinishSessionFrame(this.sessionId) as unknown as ArrayBuffer);
    this.phase = 'connected';
  }

  async finishConnection(): Promise<void> {
    if (!this.socket || !this.connected) {
      return;
    }
    this.socket.send(buildFinishConnectionFrame() as unknown as ArrayBuffer);
  }

  async sendAudioFrame(frame: Uint8Array): Promise<void> {
    if (!this.socket) {
      return;
    }
    this.ensureSessionStarted('sendAudioFrame');
    const socket = this.socket;
    if (!socket) {
      return;
    }
    this.sentAudioFrames += 1;
    if (this.sentAudioFrames === 1 || this.sentAudioFrames % 25 === 0) {
      console.info('[voice-assistant] s2s upstream audio', {
        frames: this.sentAudioFrames,
        bytes: frame.length,
      });
    }
    socket.send(buildAudioFrame(this.sessionId, frame) as unknown as ArrayBuffer);
  }

  async sendTextQuery(text: string): Promise<string | null> {
    this.ensureSessionStarted('sendTextQuery');
    const socket = this.socket;
    if (!socket) {
      throw new Error('S2S socket is not connected (sendTextQuery)');
    }
    this.clearTurnState();
    socket.send(buildTextQueryFrame(this.sessionId, text) as unknown as ArrayBuffer);
    return this.waitForAssistantText(7000);
  }

  async waitForAssistantText(timeoutMs = 7000): Promise<string | null> {
    this.ensureSessionStarted('waitForAssistantText');
    const deadline = Date.now() + timeoutMs;

    while (Date.now() < deadline) {
      const remaining = Math.max(0, deadline - Date.now());
      const frame = await this.waitFromQueue<ParsedServerFrame>({
        queue: this.frameQueue,
        waiters: this.frameWaiters,
        label: 'assistant_text_frame',
        timeoutMs: Math.min(remaining, 800),
      });

      if (!frame) {
        continue;
      }

      if (frame.error) {
        throw new Error(frame.error);
      }
      if (frame.text) {
        if (frame.event === 154 || frame.event === 559) {
          // Some server events send a finalized snapshot text.
          // Replace current buffer to avoid duplicating previous streamed chunks.
          this.turnState.pendingAssistantText = this.normalizeFinalAssistantText(frame.text);
        } else {
          this.turnState.pendingAssistantText = this.mergeStreamingText(this.turnState.pendingAssistantText, frame.text);
        }
        this.turnState.pendingAssistantHasText = this.turnState.pendingAssistantText.length > 0;
      }
      if (
        frame.event !== null &&
        TURN_END_EVENTS.has(frame.event) &&
        this.turnState.pendingAssistantHasText
      ) {
        const completed = this.turnState.pendingAssistantText;
        this.resetTurnState();
        if (this.isLikelyDuplicatedCompletedText(completed)) {
          continue;
        }
        this.finalizedTurns += 1;
        console.info('[voice-assistant] s2s turn finalized', {
          turns: this.finalizedTurns,
          textLength: completed.length,
        });
        return completed;
      }
    }

    if (timeoutMs >= 3000 && this.turnState.pendingAssistantHasText) {
      // Long waits (e.g. text query) can still return partial text if turn-end event is missing.
      const partial = this.turnState.pendingAssistantText;
      this.resetTurnState();
      if (this.isLikelyDuplicatedCompletedText(partial)) {
        return null;
      }
      return partial;
    }

    return null;
  }

  async waitForAssistantAudioChunk(timeoutMs = 1200): Promise<Uint8Array | null> {
    this.ensureSessionStarted('waitForAssistantAudioChunk');
    return this.waitFromQueue<Uint8Array>({
      queue: this.audioQueue,
      waiters: this.audioWaiters,
      label: 'assistant_audio_chunk',
      timeoutMs,
    });
  }

  private readonly handleMessage = (event: MessageEvent) => {
    try {
      const data = event.data;
      if (!(data instanceof ArrayBuffer)) {
        return;
      }
      const parsed = parseServerFrame(data);
      this.enqueueFrame(parsed);
      if (parsed.event !== null) {
        console.info('[voice-assistant] s2s event', { event: parsed.event });
      }
      if (parsed.event === INTERRUPT_CLEAR_AUDIO_EVENT) {
        this.audioQueue = [];
      }
      if (parsed.text) {
        console.info('[voice-assistant] s2s text chunk', { length: parsed.text.length });
        this.enqueueValue<string>(this.textQueue, this.textWaiters, parsed.text);
      }
      if (parsed.audio) {
        this.receivedAudioChunks += 1;
        if (this.receivedAudioChunks === 1 || this.receivedAudioChunks % 25 === 0) {
          console.info('[voice-assistant] s2s downstream audio', {
            chunks: this.receivedAudioChunks,
            bytes: parsed.audio.length,
          });
        }
        this.enqueueValue<Uint8Array>(this.audioQueue, this.audioWaiters, parsed.audio);
      }
    } catch {
      // Swallow malformed frames to keep the session alive.
    }
  };

  private enqueueFrame(frame: ParsedServerFrame): void {
    if (this.frameWaiters.length > 0) {
      const waiter = this.frameWaiters.shift();
      waiter?.(frame);
      return;
    }
    this.frameQueue.push(frame);
  }

  private enqueueValue<T>(queue: T[], waiters: Array<(value: T | null) => void>, value: T): void {
    if (waiters.length > 0) {
      const waiter = waiters.shift();
      waiter?.(value);
      return;
    }
    queue.push(value);
  }

  private clearTurnState(): void {
    this.frameQueue = [];
    this.textQueue = [];
    this.audioQueue = [];
    this.resetTurnState();
  }

  private resetTurnState(options?: { resetLastCompleted?: boolean }): void {
    this.turnState.pendingAssistantText = '';
    this.turnState.pendingAssistantHasText = false;
    if (options?.resetLastCompleted) {
      this.turnState.lastCompletedAssistantTextNormalized = '';
      this.turnState.lastCompletedAssistantTextAt = 0;
      this.turnState.recentCompletedAssistantTexts = [];
    }
  }

  private ensureSessionStarted(action: string): void {
    if (!this.socket || !this.connected) {
      throw new Error(`S2S socket is not connected (${action})`);
    }
    if (this.phase !== 'session_started') {
      throw new Error(`S2S session is not started (${action})`);
    }
  }

  private isLikelyDuplicatedCompletedText(text: string): boolean {
    const normalized = this.normalizeForMerge(text);
    if (!normalized) {
      return false;
    }
    const now = Date.now();
    const recentWindowMs = 8000;
    this.turnState.recentCompletedAssistantTexts = this.turnState.recentCompletedAssistantTexts.filter(
      (entry) => now - entry.at <= recentWindowMs,
    );
    const duplicatedFromRecentTurns = this.turnState.recentCompletedAssistantTexts.some((entry) => {
      if (entry.normalized === normalized) {
        return true;
      }
      return entry.normalized.endsWith(normalized) || normalized.endsWith(entry.normalized);
    });
    const duplicatedFromLastTurn =
      normalized === this.turnState.lastCompletedAssistantTextNormalized &&
      now - this.turnState.lastCompletedAssistantTextAt <= recentWindowMs;
    this.turnState.lastCompletedAssistantTextNormalized = normalized;
    this.turnState.lastCompletedAssistantTextAt = now;
    this.turnState.recentCompletedAssistantTexts.push({
      normalized,
      at: now,
    });
    if (this.turnState.recentCompletedAssistantTexts.length > 6) {
      this.turnState.recentCompletedAssistantTexts.shift();
    }
    return duplicatedFromLastTurn || duplicatedFromRecentTurns;
  }

  private mergeStreamingText(current: string, incoming: string): string {
    const next = incoming.trim();
    if (!next) {
      return current;
    }
    if (!current) {
      return this.normalizeFinalAssistantText(next);
    }

    const currentNormalized = this.normalizeForMerge(current);
    const nextNormalized = this.normalizeForMerge(next);

    if (!currentNormalized) {
      return this.normalizeFinalAssistantText(next);
    }
    if (!nextNormalized) {
      return current;
    }

    if (currentNormalized === nextNormalized) {
      return current.length >= next.length ? current : this.normalizeFinalAssistantText(next);
    }
    if (next.startsWith(current) || next.includes(current)) {
      return this.normalizeFinalAssistantText(next);
    }
    if (current.startsWith(next) || current.includes(next)) {
      return current;
    }

    const overlap = this.findMaxExactOverlap(current, next);
    if (overlap > 0) {
      return this.normalizeFinalAssistantText(`${current}${next.slice(overlap)}`);
    }

    // Heuristic for retransmitted chunks with punctuation/spacing variations.
    if (currentNormalized.endsWith(nextNormalized)) {
      return current;
    }
    if (nextNormalized.endsWith(currentNormalized)) {
      return this.normalizeFinalAssistantText(next);
    }

    return this.normalizeFinalAssistantText(`${current}${next}`);
  }

  private findMaxExactOverlap(left: string, right: string): number {
    const max = Math.min(left.length, right.length);
    for (let size = max; size > 0; size -= 1) {
      if (left.slice(-size) === right.slice(0, size)) {
        return size;
      }
    }
    return 0;
  }

  private normalizeForMerge(text: string): string {
    return text
      .toLowerCase()
      .replace(/\s+/g, '')
      .replace(/[，。！？、,.!?;；:：'"“”‘’（）()【】\[\]<>《》…—-]/g, '');
  }

  private normalizeFinalAssistantText(text: string): string {
    const trimmed = text.trim();
    if (!trimmed) {
      return '';
    }
    const sentenceRegex = /[^。！？!?]+[。！？!?]?/g;
    const segments = trimmed
      .match(sentenceRegex)
      ?.map((segment) => segment.trim())
      .filter((segment) => segment.length > 0);
    if (!segments || segments.length < 2) {
      return trimmed;
    }

    const normalized = segments.map((segment) => this.normalizeForMerge(segment));
    let changed = false;

    // Remove repeated tail blocks, e.g. [A, B, A, B] -> [A, B], or [X, A, B, A, B] -> [X, A, B].
    while (segments.length >= 2) {
      let removed = false;
      for (let blockSize = Math.floor(segments.length / 2); blockSize >= 1; blockSize -= 1) {
        const start = segments.length - blockSize * 2;
        if (start < 0) {
          continue;
        }
        let same = true;
        let enoughSignal = false;
        for (let i = 0; i < blockSize; i += 1) {
          const left = normalized[start + i];
          const right = normalized[start + blockSize + i];
          if (left.length >= 6 || right.length >= 6) {
            enoughSignal = true;
          }
          if (left !== right) {
            same = false;
            break;
          }
        }
        if (same && enoughSignal) {
          segments.splice(start + blockSize, blockSize);
          normalized.splice(start + blockSize, blockSize);
          changed = true;
          removed = true;
          break;
        }
      }
      if (!removed) {
        break;
      }
    }

    if (!changed) {
      return trimmed;
    }
    return segments.join('');
  }

  private async waitFromQueue<T>({
    queue,
    waiters,
    label,
    timeoutMs,
  }: {
    queue: T[];
    waiters: Array<(value: T | null) => void>;
    label: string;
    timeoutMs: number;
  }): Promise<T | null> {
    if (queue.length > 0) {
      const value = queue.shift();
      return value ?? null;
    }
    return new Promise<T | null>((resolve) => {
      const timer = setTimeout(() => {
        const index = waiters.indexOf(resolver);
        if (index >= 0) {
          waiters.splice(index, 1);
        }
        if (timeoutMs >= 1000) {
          console.info('[voice-assistant] s2s queue timeout', { label, timeoutMs });
        }
        resolve(null);
      }, timeoutMs);
      const resolver = (value: T | null) => {
        clearTimeout(timer);
        resolve(value);
      };
      waiters.push(resolver);
    });
  }

  private flushWaitersOnDisconnect(): void {
    this.frameWaiters.splice(0).forEach((resolve) => resolve(null));
    this.textWaiters.splice(0).forEach((resolve) => resolve(null));
    this.audioWaiters.splice(0).forEach((resolve) => resolve(null));
  }

  private async waitForControlFrame(stage: string, timeoutMs: number): Promise<void> {
    const frame = await this.waitFromQueue<ParsedServerFrame>({
      queue: this.frameQueue,
      waiters: this.frameWaiters,
      label: `control_${stage}`,
      timeoutMs,
    });
    if (!frame) {
      throw new Error(`${stage} response timeout after ${timeoutMs}ms`);
    }
    if (frame.error) {
      throw new Error(`${stage} failed with server frame error: ${frame.error}`);
    }
  }

  private buildStartSessionRequest(speaker: string | null) {
    const tts: {
      speaker?: string;
      audio_config: {
        channel: number;
        format: string;
        sample_rate: number;
      };
    } = {
      audio_config: {
        channel: 1,
        // Match Expo playback pipeline (16-bit PCM WAV wrapping) to avoid static noise.
        format: 'pcm_s16le',
        sample_rate: 24000,
      },
    };
    if (speaker) {
      tts.speaker = speaker;
    }
    return {
      asr: {
        extra: {
          end_smooth_window_ms: 1500,
        },
      },
      tts,
      dialog: {
        // O 版本字段（1.2.1.1）兜底：确保角色与称呼不会退回默认“豆包”。
        bot_name: CONAN_NAME,
        system_role: CONAN_SYSTEM_ROLE,
        speaking_style: CONAN_SPEAKING_STYLE,
        // SC 版本字段（2.2.0.0）主路径。
        character_manifest: KONAN_CHARACTER_MANIFEST,
        extra: {
          // Official docs mark model as required; place it under dialog.extra for compatibility.
          model: SC_MODEL_VERSION,
          strict_audit: false,
          audit_response: '当前问题我无法直接回答，我们换个话题。',
          recv_timeout: 10,
          input_mod: 'audio',
        },
      },
    };
  }

  private async sendStartSession(request: ReturnType<WebSocketS2SProvider['buildStartSessionRequest']>): Promise<void> {
    if (!this.socket) {
      throw new Error('S2S socket is not connected');
    }
    console.info('[voice-assistant] s2s StartSession request', {
      model: request.dialog.extra.model,
      speaker: request.tts.speaker ?? 'server-default',
      bot_name: request.dialog.bot_name,
      has_system_role: typeof request.dialog.system_role === 'string' && request.dialog.system_role.length > 0,
      has_speaking_style: typeof request.dialog.speaking_style === 'string' && request.dialog.speaking_style.length > 0,
      has_character_manifest:
        typeof request.dialog.character_manifest === 'string' && request.dialog.character_manifest.length > 0,
      character_manifest_length: request.dialog.character_manifest.length,
    });
    this.socket.send(buildStartSessionFrame(this.sessionId, request) as unknown as ArrayBuffer);
    await this.waitForControlFrame('StartSession', CONTROL_RESPONSE_TIMEOUT_MS);
    this.phase = 'session_started';
    console.info('[voice-assistant] s2s StartSession ack');
  }

  private shouldFallbackSpeakerForSC(message: string): boolean {
    const lower = message.toLowerCase();
    return (
      lower.includes('45000001') &&
      lower.includes('cant support tts') &&
      lower.includes('speaker')
    );
  }

  async interrupt(): Promise<void> {
    // Keep interrupt local-only for now.
    // The realtime dialogue socket expects binary protocol frames; sending JSON text like
    // {"type":"session.interrupt"} can be parsed as an invalid protocol header (version 7).
    this.audioQueue = [];
    this.textQueue = [];
    this.frameQueue = [];
    this.resetTurnState();
  }
}
