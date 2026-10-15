import { GristAPIError, GristRateLimitError, GristNetworkError } from '../errors';
import { RetryConfig } from '../types/config';

export const defaultSleep = (ms: number): Promise<void> =>
  new Promise((resolve) => setTimeout(resolve, Math.max(0, ms)));

export class RetryHandler {
  readonly maxRetries: number;
  readonly baseDelayMs: number;
  readonly maxDelayMs: number;
  readonly enabled: boolean;

  constructor(options?: RetryConfig | boolean) {
    if (options === false) {
      this.enabled = false;
      this.maxRetries = 0;
      this.baseDelayMs = 1000;
      this.maxDelayMs = 30000;
    } else {
      this.enabled = true;
      const opts = typeof options === 'object' && options !== null ? options : {};
      this.maxRetries =
        typeof opts.maxRetries === 'number' && Number.isFinite(opts.maxRetries) && opts.maxRetries >= 0
          ? opts.maxRetries
          : 3;
      this.baseDelayMs =
        typeof opts.baseDelayMs === 'number' && Number.isFinite(opts.baseDelayMs) && opts.baseDelayMs >= 0
          ? opts.baseDelayMs
          : 1000;
      this.maxDelayMs =
        typeof opts.maxDelayMs === 'number' && Number.isFinite(opts.maxDelayMs) && opts.maxDelayMs >= 0
          ? opts.maxDelayMs
          : 30000;
    }
  }

  /**
   * Determines whether an error is eligible for retry based on status code and attempt count.
   */
  shouldRetry(error: unknown, attempt: number): boolean {
    if (!this.enabled || attempt >= this.maxRetries) {
      return false;
    }

    if (error instanceof GristRateLimitError) {
      return true;
    }

    if (error instanceof GristAPIError) {
      const status = error.statusCode;
      return status === 429 || (status >= 500 && status < 600);
    }

    if (error instanceof GristNetworkError) {
      return true;
    }

    // In case native fetch TypeError occurs
    if (error instanceof TypeError) {
      return true;
    }

    return false;
  }

  /**
   * Calculates the sleep delay in milliseconds before the next retry attempt.
   *
   * Honors parsed retryAfterSeconds from 429 rate limit errors when valid.
   * Otherwise uses exponential backoff with jitter.
   * Guarantees no NaN, finite, and non-negative delays.
   */
  calculateDelay(error: unknown, attempt: number): number {
    if (error instanceof GristRateLimitError) {
      const retryAfter = error.retryAfterSeconds;
      if (typeof retryAfter === 'number' && Number.isFinite(retryAfter) && retryAfter >= 0) {
        return Math.round(retryAfter * 1000);
      }
    }

    const safeAttempt = Number.isFinite(attempt) && attempt >= 0 ? attempt : 0;
    const safeBase = Number.isFinite(this.baseDelayMs) && this.baseDelayMs >= 0 ? this.baseDelayMs : 1000;
    const safeMax = Number.isFinite(this.maxDelayMs) && this.maxDelayMs >= 0 ? this.maxDelayMs : 30000;

    // Exponential backoff: base * 2^attempt
    const expBackoff = Math.min(safeMax, safeBase * Math.pow(2, safeAttempt));

    // Full / decorrelated jitter: between 50% and 100% of computed exponential backoff
    const jitterFactor = 0.5 + Math.random() * 0.5;
    const jittered = expBackoff * jitterFactor;
    const delay = Math.min(safeMax, Math.max(0, Math.round(jittered)));

    return Number.isFinite(delay) ? delay : safeBase;
  }

  /**
   * Executes an asynchronous operation with retry logic.
   */
  async execute<T>(
    operation: (attempt: number) => Promise<T>,
    sleep: (ms: number) => Promise<void> = defaultSleep
  ): Promise<T> {
    let attempt = 0;
    while (true) {
      try {
        return await operation(attempt);
      } catch (error) {
        if (!this.shouldRetry(error, attempt)) {
          throw error;
        }
        const delayMs = this.calculateDelay(error, attempt);
        await sleep(delayMs);
        attempt++;
      }
    }
  }
}
