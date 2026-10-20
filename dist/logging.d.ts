export type LogLevel = 'debug' | 'info' | 'warn' | 'error';
export type JsonPrimitive = string | number | boolean | null;
export type JsonValue = JsonPrimitive | readonly JsonValue[] | {
    readonly [key: string]: JsonValue;
};
export type JsonObject = {
    readonly [key: string]: JsonValue;
};
export interface LogRecord {
    readonly level: LogLevel;
    readonly message: string;
    readonly context?: JsonObject;
}
export interface Logger {
    readonly log: (record: LogRecord) => void | Promise<void>;
}
export type LogWriteResult = {
    readonly ok: true;
} | {
    readonly ok: false;
    readonly error: unknown;
};
/** Validates and snapshots a structured log record. */
export declare function createLogRecord(record: LogRecord): LogRecord;
/**
 * Writes a validated record without allowing logger failures to reject.
 *
 * Invalid logger configuration or malformed records throw synchronously.
 * Logger throws and rejected promises are represented by `ok: false`.
 */
export declare function writeLog(logger: Logger, record: LogRecord): Promise<LogWriteResult>;
export declare function assertLogger(logger: Logger): void;
//# sourceMappingURL=logging.d.ts.map