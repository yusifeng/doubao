import type { ObservabilityProvider } from './types';

export class ConsoleObservabilityProvider implements ObservabilityProvider {
  log(level: 'info' | 'warn' | 'error', message: string, context?: Record<string, unknown>): void {
    if (process.env.NODE_ENV === 'test') {
      return;
    }
    // Keep minimal structured logs for M4 pipeline debugging.
    console[level](`[voice-assistant] ${message}`, context ?? {});
  }
}
