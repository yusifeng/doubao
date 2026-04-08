import type { HttpEventSink } from '../telemetry/httpEventSink';
import type { ObservabilityProvider } from './types';

export class RemoteHttpObservabilityProvider implements ObservabilityProvider {
  constructor(private readonly sink: HttpEventSink) {}

  log(level: 'info' | 'warn' | 'error', message: string, context?: Record<string, unknown>): void {
    this.sink.push({
      channel: 'observability',
      level,
      message,
      payload: context ?? {},
    });
  }
}
