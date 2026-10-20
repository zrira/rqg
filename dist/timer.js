import { performance } from 'node:perf_hooks';
const performanceClock = () => performance.now();
/** Creates a running operation timer without scheduling background work. */
export function createTimer(options = {}) {
    assertValidOptions(options);
    const clock = options.clock ?? performanceClock;
    const startedAtMs = readClock(clock);
    let greatestElapsedMs = 0;
    let stoppedElapsedMs;
    function sample() {
        const elapsedMs = readClock(clock) - startedAtMs;
        greatestElapsedMs = Math.max(greatestElapsedMs, elapsedMs, 0);
        return greatestElapsedMs;
    }
    return Object.freeze({
        elapsed() {
            return stoppedElapsedMs ?? sample();
        },
        stop() {
            stoppedElapsedMs ??= sample();
            return stoppedElapsedMs;
        },
    });
}
function readClock(clock) {
    const reading = clock();
    if (typeof reading !== 'number' || !Number.isFinite(reading)) {
        throw new TypeError('Monotonic clock must return a finite number');
    }
    return reading;
}
function assertValidOptions(options) {
    if (typeof options !== 'object' ||
        options === null ||
        Array.isArray(options)) {
        throw new TypeError('Timer options must be an object');
    }
    if (options.clock !== undefined && typeof options.clock !== 'function') {
        throw new TypeError('Timer clock must be a function');
    }
}
//# sourceMappingURL=timer.js.map