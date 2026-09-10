/*
 * Copyright 2026 The flow-as-code Authors
 * SPDX-License-Identifier: Apache-2.0
 */
// The little that the export and simulate SDK adapters share. Kept separate so
// neither adapter imports the other, and so nothing here pulls in the AWS SDK:
// this module is types and timing only.

/** Anything with a `send`, which is the only surface of a v3 client we use. */
export interface AwsCommandSender {
  send(command: any): Promise<any>;
}

export const defaultSleep = (ms: number): Promise<void> =>
  new Promise((resolve) => setTimeout(resolve, ms));

export interface RateLimiterOptions {
  /**
   * Requests per second. Amazon Connect's default quota is RateLimit 2 /
   * BurstLimit 5 for every operation except the exceptions table, per account
   * per Region, and it is shared across users and across instances in the same
   * account. Neither the flow list operations nor the TestCase operations are
   * in the exceptions table, so both adapters default to 2.
   * https://docs.aws.amazon.com/connect/latest/adminguide/amazon-connect-service-limits.html#connect-api-quotas
   */
  requestsPerSecond?: number;
  /** Injected for tests. Defaults to setTimeout. */
  sleep?: (ms: number) => Promise<void>;
  /** Injected for tests. Defaults to Date.now. */
  now?: () => number;
}

/**
 * Returns an `await`-able gate that spaces calls. Serialized on one promise
 * chain so concurrent callers share a single budget rather than each pacing
 * itself and jointly exceeding the account limit.
 */
export function createRateLimiter(options: RateLimiterOptions = {}): () => Promise<void> {
  const rps = options.requestsPerSecond ?? 2;
  const minIntervalMs = rps > 0 ? Math.ceil(1000 / rps) : 0;
  const sleep = options.sleep ?? defaultSleep;
  const now = options.now ?? Date.now;
  let nextAllowedAt = 0;
  let gate: Promise<void> = Promise.resolve();

  return () => {
    const wait = gate.then(async () => {
      const delay = Math.max(0, nextAllowedAt - now());
      if (delay > 0) await sleep(delay);
      nextAllowedAt = now() + minIntervalMs;
    });
    gate = wait.catch(() => undefined);
    return wait;
  };
}
