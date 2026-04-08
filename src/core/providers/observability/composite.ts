import type { ObservabilityProvider } from './types';

export class CompositeObservabilityProvider implements ObservabilityProvider {
  constructor(private readonly providers: ObservabilityProvider[]) {}

  log(level: 'info' | 'warn' | 'error', message: string, context?: Record<string, unknown>): void {
    this.providers.forEach((provider) => {
      try {
        provider.log(level, message, context);
      } catch {
        // Keep provider fanout failures isolated.
      }
    });
  }
}
