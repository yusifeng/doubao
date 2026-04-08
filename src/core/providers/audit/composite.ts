import type { AuditEvent, AuditProvider } from './types';

export class CompositeAuditProvider implements AuditProvider {
  constructor(private readonly providers: AuditProvider[]) {}

  record(event: AuditEvent): void {
    this.providers.forEach((provider) => {
      try {
        provider.record(event);
      } catch {
        // Keep provider fanout failures isolated.
      }
    });
  }
}
