import type { HttpEventSink } from '../telemetry/httpEventSink';
import type { AuditEvent, AuditProvider } from './types';

export class RemoteHttpAuditProvider implements AuditProvider {
  constructor(private readonly sink: HttpEventSink) {}

  record(event: AuditEvent): void {
    this.sink.push({
      channel: 'audit',
      level: event.level ?? 'info',
      message: event.stage,
      payload: event as Record<string, unknown>,
    });
  }
}
