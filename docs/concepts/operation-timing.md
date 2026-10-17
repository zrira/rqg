# Operation timing

`@rqg/core` provides a small operation timer that is independent of HTTP and suitable for requests, jobs, database calls, or any other operation.

## Basic usage

```ts
import { createTimer } from '@rqg/core';

const timer = createTimer();
await performOperation();

console.log(timer.stop()); // elapsed milliseconds
```

Creating a timer reads the clock once. `elapsed()` reads it again without stopping the timer. `stop()` reads once and freezes the result; repeated calls to `stop()` and later calls to `elapsed()` return that frozen value. The timer creates no interval, timeout, event listener, or background resource.

## Deterministic clocks

```ts
import { createTimer, type MonotonicClock } from '@rqg/core';

const readings = [100, 112.5];
const clock: MonotonicClock = () => {
  const reading = readings.shift();
  if (reading === undefined) throw new Error('No clock reading');
  return reading;
};

const timer = createTimer({ clock });
console.log(timer.stop()); // 12.5
```

A `MonotonicClock` returns a finite number measured in milliseconds from an arbitrary origin. Its values are durations inputs, not dates. Injecting one makes tests deterministic without sleeping or replacing global APIs.

Invalid clock configuration and non-finite readings throw `TypeError`. If a faulty injected clock moves backward, rqg clamps the duration to zero and never lets a later elapsed read decrease below the greatest duration already observed.

## Monotonic time versus wall-clock time

The default clock is [`performance.now()`](https://nodejs.org/api/perf_hooks.html#performancenow) from `node:perf_hooks`. It is monotonic: its purpose is measuring elapsed time, and operating-system clock corrections do not change its origin during the process lifetime.

`Date.now()` is wall-clock time: milliseconds since the Unix epoch. Administrators, NTP synchronization, virtual-machine behavior, or daylight-saving display rules can alter the apparent wall time. It is useful for timestamps but is the wrong source for reliable elapsed durations. A `performance.now()` reading cannot be converted directly into a calendar timestamp.

## The event loop and asynchronous operations

Calling an asynchronous function does not make the timer run separately. The timer stores a start reading, and a later call computes a difference. While an operation awaits I/O, Node.js continues processing other event-loop work. The measured duration therefore includes I/O waiting, event-loop scheduling delays, and synchronous CPU work between the readings. It is elapsed latency, not CPU usage.

## Design decisions

- A closure keeps timer state private without requiring a class.
- Reads are explicit, so there are no timer handles to clean up.
- Milliseconds appear in names and documentation.
- Stopping is idempotent and gives lifecycle code a stable duration.
- The greatest observed elapsed duration protects consumers from broken injected clocks while preserving normal sub-millisecond precision.

Rejected alternatives include `Date.now()` for duration measurement, `process.hrtime()` tuple arithmetic, and recurring timers. `performance.now()` already provides the native monotonic millisecond abstraction this API needs.
