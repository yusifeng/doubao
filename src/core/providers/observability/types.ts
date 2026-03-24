export type LogLevel = 'info' | 'warn' | 'error';

export interface ObservabilityProvider {
  log(level: LogLevel, message: string, context?: Record<string, unknown>): void;
}
