/** Returns a finite monotonic clock reading in milliseconds. */
export type MonotonicClock = () => number;
export interface CreateTimerOptions {
    /** Clock used for start and elapsed readings. Defaults to `performance.now`. */
    readonly clock?: MonotonicClock;
}
export interface OperationTimer {
    /** Returns the greatest nonnegative elapsed duration observed so far. */
    readonly elapsed: () => number;
    /** Stops the timer and returns its frozen elapsed duration. */
    readonly stop: () => number;
}
/** Creates a running operation timer without scheduling background work. */
export declare function createTimer(options?: CreateTimerOptions): OperationTimer;
//# sourceMappingURL=timer.d.ts.map