export type HttpEventSinkConfig = {
  endpointUrl: string;
  authToken?: string;
  batchSize?: number;
  flushIntervalMs?: number;
  maxQueueSize?: number;
  sourceApp?: string;
  sourceEnv?: string;
  deviceLabel?: string;
};

export type HttpEventSinkEntry = {
  channel: 'observability' | 'audit';
  level: 'info' | 'warn' | 'error';
  message: string;
  payload?: Record<string, unknown>;
  at?: string;
};

type HttpEventSinkEnvelope = {
  channel: HttpEventSinkEntry['channel'];
  level: HttpEventSinkEntry['level'];
  message: string;
  payload: Record<string, unknown>;
  at: string;
  source: {
    app: string;
    env: string;
    deviceLabel: string;
  };
};

export class HttpEventSink {
  private readonly endpointUrl: string;

  private readonly authToken: string;

  private readonly batchSize: number;

  private readonly flushIntervalMs: number;

  private readonly maxQueueSize: number;

  private readonly sourceApp: string;

  private readonly sourceEnv: string;

  private readonly deviceLabel: string;

  private queue: HttpEventSinkEnvelope[] = [];

  private flushTimer: ReturnType<typeof setTimeout> | null = null;

  private flushInFlight = false;

  constructor(config: HttpEventSinkConfig) {
    this.endpointUrl = config.endpointUrl;
    this.authToken = config.authToken?.trim() ?? '';
    this.batchSize = Math.max(1, config.batchSize ?? 20);
    this.flushIntervalMs = Math.max(100, config.flushIntervalMs ?? 800);
    this.maxQueueSize = Math.max(this.batchSize, config.maxQueueSize ?? 2000);
    this.sourceApp = config.sourceApp?.trim() || 'my-doubao2';
    this.sourceEnv = config.sourceEnv?.trim() || 'development';
    this.deviceLabel = config.deviceLabel?.trim() || 'unknown-device';
  }

  push(entry: HttpEventSinkEntry): void {
    const envelope: HttpEventSinkEnvelope = {
      channel: entry.channel,
      level: entry.level,
      message: entry.message,
      payload: entry.payload ?? {},
      at: entry.at ?? new Date().toISOString(),
      source: {
        app: this.sourceApp,
        env: this.sourceEnv,
        deviceLabel: this.deviceLabel,
      },
    };
    this.queue.push(envelope);
    if (this.queue.length > this.maxQueueSize) {
      this.queue = this.queue.slice(this.queue.length - this.maxQueueSize);
    }
    if (this.queue.length >= this.batchSize) {
      this.scheduleFlush(0);
      return;
    }
    this.scheduleFlush(this.flushIntervalMs);
  }

  private scheduleFlush(delayMs: number) {
    if (this.flushTimer) {
      if (delayMs > 0) {
        return;
      }
      clearTimeout(this.flushTimer);
      this.flushTimer = null;
    }
    this.flushTimer = setTimeout(() => {
      this.flushTimer = null;
      void this.flush();
    }, delayMs);
  }

  private async flush(): Promise<void> {
    if (this.flushInFlight || this.queue.length === 0) {
      return;
    }
    this.flushInFlight = true;
    const batch = this.queue.splice(0, this.batchSize);
    try {
      const response = await fetch(this.endpointUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(this.authToken ? { Authorization: `Bearer ${this.authToken}` } : {}),
        },
        body: JSON.stringify({ events: batch }),
      });
      if (!response.ok) {
        throw new Error(`http sink response ${response.status}`);
      }
    } catch {
      this.queue = [...batch, ...this.queue];
      if (this.queue.length > this.maxQueueSize) {
        this.queue = this.queue.slice(this.queue.length - this.maxQueueSize);
      }
    } finally {
      this.flushInFlight = false;
      if (this.queue.length > 0) {
        this.scheduleFlush(this.flushIntervalMs);
      }
    }
  }
}
