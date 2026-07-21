/** Minimal per-provider pacing: enforce a floor interval between request starts. */
export class RateLimiter {
  private nextAt = 0;
  constructor(private minIntervalMs: number, private now: () => number = Date.now,
              private sleep: (ms: number) => Promise<void> = (ms) => new Promise((r) => setTimeout(r, ms))) {}
  static perMinute(rpm: number): RateLimiter { return new RateLimiter(Math.ceil(60000 / rpm)); }
  async acquire(): Promise<void> {
    const t = this.now();
    if (t < this.nextAt) await this.sleep(this.nextAt - t);
    this.nextAt = Math.max(t, this.nextAt) + this.minIntervalMs;
  }
}
