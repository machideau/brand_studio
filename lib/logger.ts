/**
 * lib/logger.ts — Structured JSON logger (no secrets, no stack traces)
 *
 * Outputs newline-delimited JSON to stdout.
 * Rules:
 *  - Never log environment variable values, API keys, or tokens
 *  - Truncate userInputSummary to 100 characters
 *  - Never include stack traces in any log entry
 */

const MAX_USER_INPUT_SUMMARY_LENGTH = 100;

export interface LogErrorDetails {
  code: string;
  model?: string;
  operation?: string;
  attempts?: number;
  // NOTE: stack trace is deliberately excluded
}

export interface LogEntry {
  level: 'info' | 'warn' | 'error';
  timestamp: string; // ISO 8601
  projectId?: string; // never a personal identifier
  step?: string; // Inngest step name
  message: string; // never a secret, never an API key
  userInputSummary?: string; // truncated to MAX_USER_INPUT_SUMMARY_LENGTH chars
  error?: LogErrorDetails;
}

/** Options accepted by the log functions */
export interface LogOptions {
  projectId?: string;
  step?: string;
  userInputSummary?: string;
  error?: LogErrorDetails | Error | unknown;
}

/**
 * Truncate a string to `max` characters, appending "..." if truncated.
 */
function truncate(value: string, max: number): string {
  if (value.length <= max) return value;
  return value.slice(0, max) + '...';
}

/**
 * Safely extract a `LogErrorDetails` from any thrown value.
 * Never includes the stack trace.
 */
function toErrorDetails(err: LogErrorDetails | Error | unknown): LogErrorDetails {
  if (err === null || err === undefined) {
    return { code: 'UNKNOWN_ERROR' };
  }

  // Already a structured LogErrorDetails
  if (
    typeof err === 'object' &&
    'code' in (err as object) &&
    typeof (err as LogErrorDetails).code === 'string' &&
    !(err instanceof Error)
  ) {
    const e = err as LogErrorDetails;
    return {
      code: e.code,
      ...(e.model !== undefined && { model: e.model }),
      ...(e.operation !== undefined && { operation: e.operation }),
      ...(e.attempts !== undefined && { attempts: e.attempts }),
    };
  }

  // Native Error — extract only the message, never the stack
  if (err instanceof Error) {
    return { code: err.message };
  }

  // Primitive fallback
  return { code: String(err) };
}

/**
 * Build and emit a single log entry as a JSON line on stdout.
 */
function emit(level: LogEntry['level'], message: string, options: LogOptions = {}): void {
  const entry: LogEntry = {
    level,
    timestamp: new Date().toISOString(),
    message,
  };

  if (options.projectId !== undefined) {
    entry.projectId = options.projectId;
  }

  if (options.step !== undefined) {
    entry.step = options.step;
  }

  if (options.userInputSummary !== undefined) {
    entry.userInputSummary = truncate(options.userInputSummary, MAX_USER_INPUT_SUMMARY_LENGTH);
  }

  if (options.error !== undefined) {
    entry.error = toErrorDetails(options.error);
  }

  // process.stdout.write ensures atomic newline-delimited JSON output
  process.stdout.write(JSON.stringify(entry) + '\n');
}

export const log = {
  info(message: string, options?: LogOptions): void {
    emit('info', message, options);
  },

  warn(message: string, options?: LogOptions): void {
    emit('warn', message, options);
  },

  error(message: string, options?: LogOptions): void {
    emit('error', message, options);
  },
} as const;
