import { describe, expect, it, vi } from 'vitest';

import {
  createTimer,
  type CreateTimerOptions,
  type MonotonicClock,
} from '../src/index.js';

function sequenceClock(...readings: readonly number[]): MonotonicClock {
  let index = 0;

  return () => {
    const reading = readings[index];
    index += 1;

    if (reading === undefined) {
      throw new Error('Clock sequence exhausted');
    }

    return reading;
  };
}

describe('createTimer', () => {
  it('measures positive elapsed durations in milliseconds', () => {
    const timer = createTimer({ clock: sequenceClock(10, 12.5) });

    expect(timer.elapsed()).toBe(2.5);
  });

  it('supports zero duration', () => {
    const timer = createTimer({ clock: sequenceClock(10, 10) });

    expect(timer.elapsed()).toBe(0);
  });

  it('uses an injected clock deterministically', () => {
    const clock = vi.fn(sequenceClock(100, 101, 104));
    const timer = createTimer({ clock });

    expect(timer.elapsed()).toBe(1);
    expect(timer.elapsed()).toBe(4);
    expect(clock).toHaveBeenCalledTimes(3);
  });

  it('clamps backward clock movement to a nonnegative duration', () => {
    const timer = createTimer({ clock: sequenceClock(100, 90) });

    expect(timer.elapsed()).toBe(0);
  });

  it('does not let repeated reads decrease after clock regression', () => {
    const timer = createTimer({ clock: sequenceClock(100, 110, 105, 120) });

    expect(timer.elapsed()).toBe(10);
    expect(timer.elapsed()).toBe(10);
    expect(timer.elapsed()).toBe(20);
  });

  it('freezes the duration when stopped', () => {
    const clock = vi.fn(sequenceClock(100, 125));
    const timer = createTimer({ clock });

    expect(timer.stop()).toBe(25);
    expect(timer.stop()).toBe(25);
    expect(timer.elapsed()).toBe(25);
    expect(clock).toHaveBeenCalledTimes(2);
  });

  it.each([Number.NaN, Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY])(
    'rejects an invalid initial clock reading: %s',
    (reading) => {
      expect(() => createTimer({ clock: () => reading })).toThrow(
        new TypeError('Monotonic clock must return a finite number'),
      );
    },
  );

  it('rejects an invalid later clock reading', () => {
    const timer = createTimer({ clock: sequenceClock(0, Number.NaN) });

    expect(() => timer.elapsed()).toThrow(
      new TypeError('Monotonic clock must return a finite number'),
    );
  });

  it('rejects non-number clock output at runtime', () => {
    const clock = (() => '1') as unknown as MonotonicClock;

    expect(() => createTimer({ clock })).toThrow(TypeError);
  });

  it.each([null, [], { clock: 1 }])(
    'rejects invalid runtime configuration: %j',
    (options) => {
      expect(() => createTimer(options as never as CreateTimerOptions)).toThrow(
        TypeError,
      );
    },
  );
});
