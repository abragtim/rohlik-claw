import {
  LOOP_STALL_TIMEOUT,
  STARTUP_TIMEOUT,
  WATCHDOG_CHECK_INTERVAL,
} from './config.js';
import { logger } from './logger.js';

/**
 * Liveness watchdogs.
 *
 * The failure they exist for: the process stays alive but stops doing
 * anything. systemd only restarts what exits, so a wedged-but-running
 * NanoClaw looks healthy while messages pile up unanswered and scheduled
 * tasks never fire. Both watchdogs turn a hang into a non-zero exit, which
 * the unit's Restart=on-failure (plus the OnFailure email) already handles.
 */

export const MESSAGE_LOOP = 'message-loop';
export const SCHEDULER_LOOP = 'scheduler-loop';

export interface WatchdogOpts {
  /** Injected by tests; defaults to process.exit. */
  exit?: (code: number) => void;
}

const ticks = new Map<string, number>();
let startupTimer: NodeJS.Timeout | undefined;

/** Stamp a loop as alive. Called once per iteration from the loop itself. */
export function heartbeat(loop: string): void {
  ticks.set(loop, Date.now());
}

/**
 * Deadline for reaching the message loop. main() awaits channel.connect(),
 * which can hang indefinitely if a channel never settles its connect promise;
 * everything downstream (message loop, scheduler, IPC watcher) then never
 * starts, and nothing in the process ever exits.
 */
export function armStartupWatchdog(opts: WatchdogOpts = {}): void {
  const exit = opts.exit ?? ((code: number) => process.exit(code));
  clearTimeout(startupTimer);
  startupTimer = setTimeout(() => {
    logger.fatal(
      { timeoutMs: STARTUP_TIMEOUT },
      'Startup did not reach the message loop in time, exiting for a clean restart',
    );
    exit(1);
  }, STARTUP_TIMEOUT);
}

/** Startup got where it needed to go — stop the deadline. */
export function disarmStartupWatchdog(): void {
  clearTimeout(startupTimer);
  startupTimer = undefined;
}

/**
 * Watch the long-lived loops. They tick far faster than the stall timeout
 * (message loop every POLL_INTERVAL, scheduler every SCHEDULER_POLL_INTERVAL)
 * and never block on container runs — those go through the queue — so silence
 * means wedged, not busy.
 */
export function startLivenessWatchdog(
  loops: string[],
  opts: WatchdogOpts = {},
): () => void {
  const exit = opts.exit ?? ((code: number) => process.exit(code));
  // Seed from arm time so a loop that never ticks at all is caught too.
  const armedAt = Date.now();
  for (const loop of loops) {
    if (!ticks.has(loop)) ticks.set(loop, armedAt);
  }

  const timer = setInterval(() => {
    for (const loop of loops) {
      const stalledMs = Date.now() - (ticks.get(loop) ?? armedAt);
      if (stalledMs > LOOP_STALL_TIMEOUT) {
        logger.fatal(
          { loop, stalledMs, timeoutMs: LOOP_STALL_TIMEOUT },
          'Loop stopped ticking, exiting for a clean restart',
        );
        exit(1);
        return;
      }
    }
  }, WATCHDOG_CHECK_INTERVAL);
  timer.unref?.();

  return () => clearInterval(timer);
}

/** @internal - for tests only. */
export function _resetWatchdogsForTests(): void {
  ticks.clear();
  disarmStartupWatchdog();
}
