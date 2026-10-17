export interface RateLimitPolicy {
  /** Maximum successful consumptions in one window. */
  readonly max: number;
  /** Window duration in milliseconds. */
  readonly windowMs: number;
}

export interface RateLimitStoreResult {
  /** Whether this attempt consumed one allowance. */
  readonly consumed: boolean;
  /** Saturated number of allowances consumed in the current window. */
  readonly count: number;
  /** Monotonic clock boundary at which the current window expires. */
  readonly resetAtMs: number;
}

export interface RateLimitStore {
  /** Atomically evaluates and updates one fixed-window counter. */
  readonly consume: (
    key: string,
    policy: RateLimitPolicy,
    nowMs: number,
  ) => RateLimitStoreResult | Promise<RateLimitStoreResult>;
}

/** Indicates that a bounded store cannot safely track another active key. */
export class RateLimitCapacityError extends Error {
  override readonly name = 'RateLimitCapacityError';

  constructor() {
    super('Rate limit store capacity exhausted');
  }
}

/** Indicates that one store key was reused with a different policy. */
export class RateLimitPolicyConflictError extends Error {
  override readonly name = 'RateLimitPolicyConflictError';

  constructor() {
    super('Rate limit store key has conflicting policies');
  }
}

export function assertRateLimitPolicy(policy: RateLimitPolicy): void {
  if (typeof policy !== 'object' || policy === null || Array.isArray(policy)) {
    throw new TypeError('Rate limit policy must be an object');
  }

  if (!Number.isSafeInteger(policy.max) || policy.max <= 0) {
    throw new TypeError('Rate limit max must be a positive safe integer');
  }

  if (
    typeof policy.windowMs !== 'number' ||
    !Number.isFinite(policy.windowMs) ||
    policy.windowMs <= 0
  ) {
    throw new TypeError('Rate limit windowMs must be a positive finite number');
  }
}
