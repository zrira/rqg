const LOG_LEVELS = new Set([
    'debug',
    'info',
    'warn',
    'error',
]);
const MAX_JSON_DEPTH = 32;
const SUCCESSFUL_WRITE = Object.freeze({ ok: true });
/** Validates and snapshots a structured log record. */
export function createLogRecord(record) {
    if (!isPlainObject(record)) {
        throw new TypeError('Log record must be an object');
    }
    if (typeof record.level !== 'string' || !LOG_LEVELS.has(record.level)) {
        throw new TypeError('Log level must be debug, info, warn, or error');
    }
    if (typeof record.message !== 'string' || record.message.length === 0) {
        throw new TypeError('Log message must be a nonempty string');
    }
    if (record.context === undefined) {
        return Object.freeze({ level: record.level, message: record.message });
    }
    return Object.freeze({
        level: record.level,
        message: record.message,
        context: copyJsonObject(record.context),
    });
}
/**
 * Writes a validated record without allowing logger failures to reject.
 *
 * Invalid logger configuration or malformed records throw synchronously.
 * Logger throws and rejected promises are represented by `ok: false`.
 */
export function writeLog(logger, record) {
    assertLogger(logger);
    const validatedRecord = createLogRecord(record);
    let writeResult;
    try {
        writeResult = logger.log(validatedRecord);
    }
    catch (error) {
        return Promise.resolve(failedWrite(error));
    }
    return Promise.resolve(writeResult).then(() => SUCCESSFUL_WRITE, (error) => failedWrite(error));
}
export function assertLogger(logger) {
    if ((typeof logger !== 'object' && typeof logger !== 'function') ||
        logger === null ||
        typeof logger.log !== 'function') {
        throw new TypeError('Logger must provide a log function');
    }
}
function failedWrite(error) {
    return Object.freeze({ ok: false, error });
}
function copyJsonObject(value) {
    if (!isPlainObject(value)) {
        throw new TypeError('Log context must be a JSON-compatible object');
    }
    const ancestors = new WeakSet();
    ancestors.add(value);
    return copyPlainObject(value, ancestors, 1);
}
function copyJsonValue(value, ancestors, depth) {
    if (value === null ||
        typeof value === 'string' ||
        typeof value === 'boolean') {
        return value;
    }
    if (typeof value === 'number') {
        if (!Number.isFinite(value)) {
            throw new TypeError('Log context numbers must be finite');
        }
        return value;
    }
    if (typeof value !== 'object') {
        throw new TypeError('Log context must contain only JSON-compatible values');
    }
    if (depth >= MAX_JSON_DEPTH) {
        throw new TypeError(`Log context must not exceed ${MAX_JSON_DEPTH} levels`);
    }
    if (ancestors.has(value)) {
        throw new TypeError('Log context must not contain circular references');
    }
    ancestors.add(value);
    try {
        if (Array.isArray(value)) {
            return copyJsonArray(value, ancestors, depth + 1);
        }
        if (!isPlainObject(value)) {
            throw new TypeError('Log context must contain only plain objects');
        }
        return copyPlainObject(value, ancestors, depth + 1);
    }
    finally {
        ancestors.delete(value);
    }
}
function copyJsonArray(value, ancestors, depth) {
    const ownKeys = Reflect.ownKeys(value);
    if (ownKeys.some((key) => typeof key === 'symbol' ||
        (key !== 'length' && !isArrayIndex(key, value.length)))) {
        throw new TypeError('Log context arrays must not have custom properties');
    }
    const copy = [];
    for (let index = 0; index < value.length; index += 1) {
        const descriptor = Object.getOwnPropertyDescriptor(value, String(index));
        if (descriptor === undefined || !('value' in descriptor)) {
            throw new TypeError('Log context arrays must be dense data arrays');
        }
        copy.push(copyJsonValue(descriptor.value, ancestors, depth));
    }
    return Object.freeze(copy);
}
function copyPlainObject(value, ancestors, depth) {
    if (Object.getOwnPropertySymbols(value).length > 0) {
        throw new TypeError('Log context must not contain symbol keys');
    }
    const copy = {};
    for (const [key, descriptor] of Object.entries(Object.getOwnPropertyDescriptors(value))) {
        if (!descriptor.enumerable || !('value' in descriptor)) {
            throw new TypeError('Log context properties must be enumerable data values');
        }
        Object.defineProperty(copy, key, {
            configurable: false,
            enumerable: true,
            value: copyJsonValue(descriptor.value, ancestors, depth),
            writable: false,
        });
    }
    return Object.freeze(copy);
}
function isArrayIndex(key, length) {
    const index = Number(key);
    return (Number.isInteger(index) &&
        index >= 0 &&
        index < length &&
        String(index) === key);
}
function isPlainObject(value) {
    if (typeof value !== 'object' || value === null || Array.isArray(value)) {
        return false;
    }
    const prototype = Object.getPrototypeOf(value);
    return prototype === Object.prototype || prototype === null;
}
//# sourceMappingURL=logging.js.map