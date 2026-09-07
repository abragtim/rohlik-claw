import { afterEach, beforeEach, describe, expect, it, Mock, vi } from 'vitest';

import {
  LOOP_STALL_TIMEOUT,
  STARTUP_TIMEOUT,
  WATCHDOG_CHECK_INTERVAL,
} from './config.js';
import {
  _resetWatchdogsForTests,
  armStartupWatchdog,
  disarmStartupWatchdog,
  heartbeat,
  startLivenessWatchdog,
} from './watchdog.js';

describe('watchdog', () => {
  let exit: Mock<(code: number) => void>;

  beforeEach(() => {
    vi.useFakeTimers();
    _resetWatchdogsForTests();
    exit = vi.fn<(code: number) => void>();
  });

  afterEach(() => {
    _resetWatchdogsForTests();
    vi.useRealTimers();
  });

  describe('startup', () => {
    it('exits non-zero when startup never reaches the message loop', () => {
      armStartupWatchdog({ exit });

      vi.advanceTimersByTime(STARTUP_TIMEOUT + 1);

      expect(exit).toHaveBeenCalledWith(1);
    });

    it('stays quiet once startup completes', () => {
      armStartupWatchdog({ exit });
      disarmStartupWatchdog();

      vi.advanceTimersByTime(STARTUP_TIMEOUT * 3);

      expect(exit).not.toHaveBeenCalled();
    });

    it('does not exit before the deadline', () => {
      armStartupWatchdog({ exit });

      vi.advanceTimersByTime(STARTUP_TIMEOUT - 1);

      expect(exit).not.toHaveBeenCalled();
    });
  });

  describe('liveness', () => {
    it('exits non-zero when a loop stops ticking', () => {
      const stop = startLivenessWatchdog(['loop-a'], { exit });

      heartbeat('loop-a');
      vi.advanceTimersByTime(LOOP_STALL_TIMEOUT + WATCHDOG_CHECK_INTERVAL);

      expect(exit).toHaveBeenCalledWith(1);
      stop();
    });

    it('stays quiet while every loop keeps ticking', () => {
      const stop = startLivenessWatchdog(['loop-a', 'loop-b'], { exit });

      for (let elapsed = 0; elapsed < LOOP_STALL_TIMEOUT * 4; elapsed += 1000) {
        heartbeat('loop-a');
        heartbeat('loop-b');
        vi.advanceTimersByTime(1000);
      }

      expect(exit).not.toHaveBeenCalled();
      stop();
    });

    it('catches a single stalled loop while the others tick', () => {
      const stop = startLivenessWatchdog(['loop-a', 'loop-b'], { exit });

      for (
        let elapsed = 0;
        elapsed < LOOP_STALL_TIMEOUT + WATCHDOG_CHECK_INTERVAL;
        elapsed += 1000
      ) {
        heartbeat('loop-a');
        vi.advanceTimersByTime(1000);
      }

      expect(exit).toHaveBeenCalledWith(1);
      stop();
    });

    it('catches a loop that never ticks at all', () => {
      const stop = startLivenessWatchdog(['loop-a'], { exit });

      vi.advanceTimersByTime(LOOP_STALL_TIMEOUT + WATCHDOG_CHECK_INTERVAL);

      expect(exit).toHaveBeenCalledWith(1);
      stop();
    });

    it('stops checking after the returned disposer runs', () => {
      const stop = startLivenessWatchdog(['loop-a'], { exit });
      stop();

      vi.advanceTimersByTime(LOOP_STALL_TIMEOUT * 3);

      expect(exit).not.toHaveBeenCalled();
    });
  });
});
