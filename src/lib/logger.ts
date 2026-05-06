import type { SupabaseClient } from '@supabase/supabase-js'

export type LogLevel = 'info' | 'warn' | 'error' | 'debug'

export type LogEntry = {
  step: string
  message: string
  level?: LogLevel
  payload?: Record<string, unknown>
}

/**
 * Append-only log writer for one generation run.
 *
 * Usage:
 *   const log = createLogger(supabase, userId, runId, carouselId)
 *   await log({ step: 'claude.request', message: 'sent prompt', payload: {...} })
 */
export function createLogger(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: SupabaseClient<any, any, any>,
  userId: string,
  runId: string,
  carouselId?: string | null,
) {
  return async function log(entry: LogEntry): Promise<void> {
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await (supabase.from('generation_logs') as any).insert({
        user_id: userId,
        run_id: runId,
        carousel_id: carouselId ?? null,
        step: entry.step,
        level: entry.level ?? 'info',
        message: entry.message,
        payload: entry.payload ?? null,
      })
    } catch (err) {
      // Swallow logging errors — never break a generation run because logging failed.
      console.error('[logger] failed to write log entry:', err)
    }
  }
}

export type Logger = ReturnType<typeof createLogger>

/**
 * Create a logger that uses an existing run_id (when continuing a run from
 * another endpoint).
 */
export function noopLogger(): Logger {
  return async () => {}
}
