export class FixedIntervalRateLimiter {
  private nextAvailableAt = 0;

  constructor(private readonly minIntervalMs: number) {
    if (!Number.isFinite(minIntervalMs) || minIntervalMs <= 0) {
      throw new Error(`Intervalo inválido para rate limiter: ${minIntervalMs}`);
    }
  }

  reserve(nowMs: number): number {
    const scheduledAt = Math.max(nowMs, this.nextAvailableAt);
    this.nextAvailableAt = scheduledAt + this.minIntervalMs;
    return scheduledAt;
  }

  applyRetryAfter(untilMs: number): void {
    this.nextAvailableAt = Math.max(this.nextAvailableAt, untilMs);
  }
}
