import type { AuditEvent, AuditProvider } from './types';

export class ConsoleAuditProvider implements AuditProvider {
  record(event: AuditEvent): void {
    if (process.env.NODE_ENV === 'test') {
      return;
    }
    const level = event.level ?? 'info';
    const logger = level === 'error' ? console.error : level === 'warn' ? console.warn : console.info;
    logger('[voice-audit]', {
      at: new Date().toISOString(),
      ...event,
    });
  }
}
