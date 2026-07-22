/**
 * Circuit Breaker — protects against cascading failures from external services.
 *
 * States:
 *  - CLOSED:    requests pass through normally. Failures are counted.
 *  - OPEN:      requests are immediately rejected (fail-fast). After recoveryTimeout, moves to HALF_OPEN.
 *  - HALF_OPEN: allows a single probe request. If it succeeds → CLOSED. If it fails → OPEN again.
 *
 * Usage:
 *   const breaker = new CircuitBreaker({ name: 'firebase', failureThreshold: 5, recoveryTimeoutMs: 30000 });
 *   const result = await breaker.exec(() => sendPushNotification(token, payload));
 *   // If circuit is open, throws CircuitOpenError immediately without calling the action.
 */

export type CircuitState = 'CLOSED' | 'OPEN' | 'HALF_OPEN';

export interface CircuitBreakerOptions {
  /** Name for logging/debugging. */
  name: string;
  /** Number of consecutive failures before opening the circuit. Default: 5. */
  failureThreshold?: number;
  /** Time in ms to wait before attempting recovery (half-open). Default: 30000 (30s). */
  recoveryTimeoutMs?: number;
  /** Optional callback when state changes. */
  onStateChange?: (name: string, from: CircuitState, to: CircuitState) => void;
}

export class CircuitOpenError extends Error {
  public readonly circuitName: string;
  constructor(name: string) {
    super(`Circuit breaker '${name}' is OPEN — request rejected`);
    this.name = 'CircuitOpenError';
    this.circuitName = name;
  }
}

export class CircuitBreaker {
  private state: CircuitState = 'CLOSED';
  private failureCount = 0;
  private lastFailureTime = 0;

  private readonly name: string;
  private readonly failureThreshold: number;
  private readonly recoveryTimeoutMs: number;
  private readonly onStateChange?: (name: string, from: CircuitState, to: CircuitState) => void;

  constructor(options: CircuitBreakerOptions) {
    this.name              = options.name;
    this.failureThreshold  = options.failureThreshold ?? 5;
    this.recoveryTimeoutMs = options.recoveryTimeoutMs ?? 30000;
    this.onStateChange     = options.onStateChange;
  }

  /** Current circuit state. */
  getState(): CircuitState {
    return this.state;
  }

  /** Current failure count. */
  getFailureCount(): number {
    return this.failureCount;
  }

  /**
   * Executes the given action through the circuit breaker.
   * If circuit is OPEN and recovery timeout hasn't elapsed, rejects immediately.
   * If a fallback is provided, returns it when the circuit is open.
   */
  async exec<T>(action: () => Promise<T>, fallback?: () => T | Promise<T>): Promise<T> {
    // Check if we should transition from OPEN to HALF_OPEN
    if (this.state === 'OPEN') {
      const elapsed = Date.now() - this.lastFailureTime;
      if (elapsed >= this.recoveryTimeoutMs) {
        this.transition('HALF_OPEN');
      } else {
        if (fallback) return fallback();
        throw new CircuitOpenError(this.name);
      }
    }

    try {
      const result = await action();
      this.onSuccess();
      return result;
    } catch (err) {
      this.onFailure();
      throw err;
    }
  }

  /**
   * Executes with a fallback value when the circuit is open or the action fails.
   * Never throws — always returns either the action result or the fallback.
   */
  async execWithFallback<T>(action: () => Promise<T>, fallback: T): Promise<T> {
    try {
      return await this.exec(action);
    } catch {
      return fallback;
    }
  }

  /** Manually reset the circuit to CLOSED state. */
  reset(): void {
    this.transition('CLOSED');
    this.failureCount = 0;
  }

  private onSuccess(): void {
    if (this.state === 'HALF_OPEN') {
      // Probe succeeded — close the circuit
      this.transition('CLOSED');
    }
    this.failureCount = 0;
  }

  private onFailure(): void {
    this.failureCount++;
    this.lastFailureTime = Date.now();

    if (this.state === 'HALF_OPEN') {
      // Probe failed — reopen
      this.transition('OPEN');
    } else if (this.failureCount >= this.failureThreshold) {
      this.transition('OPEN');
    }
  }

  private transition(to: CircuitState): void {
    if (this.state === to) return;
    const from = this.state;
    this.state = to;
    this.onStateChange?.(this.name, from, to);
  }
}
