/**
 * Minimal structured logger.
 *
 * Emits one JSON object per line with a `level` field. CloudWatch Logs Insights
 * can query these, and the `ERROR` level is what the CloudWatch metric filter
 * matches to drive the error-rate alarm (see infra/modules/monitoring).
 *
 * Kept dependency-free on purpose — a full logging library isn't warranted for
 * an app this size.
 */

type Level = 'INFO' | 'WARN' | 'ERROR';

function emit(level: Level, message: string, meta?: Record<string, unknown>): void {
  const entry = {
    level,
    message,
    timestamp: new Date().toISOString(),
    ...meta,
  };
  const line = JSON.stringify(entry);
  if (level === 'ERROR') {
    console.error(line);
  } else if (level === 'WARN') {
    console.warn(line);
  } else {
    console.info(line);
  }
}

export const logger = {
  info: (message: string, meta?: Record<string, unknown>) => emit('INFO', message, meta),
  warn: (message: string, meta?: Record<string, unknown>) => emit('WARN', message, meta),
  error: (message: string, meta?: Record<string, unknown>) => emit('ERROR', message, meta),
};
