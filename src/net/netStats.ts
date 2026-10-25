/** Rolling latency samples (ms): percentiles + jitter (mean change between consecutive samples, like RFC 3550). */
export class LatencySeries {
  private xs: number[] = [];
  private jit = 0;
  constructor(private size = 60) {}
  add(ms: number): void {
    if (!Number.isFinite(ms) || ms < 0) return;
    const last = this.xs[this.xs.length - 1];
    if (last !== undefined) this.jit += (Math.abs(ms - last) - this.jit) / 16;
    this.xs.push(ms);
    if (this.xs.length > this.size) this.xs.shift();
  }
  get count(): number { return this.xs.length; }
  /** copy of the newest `n` samples */
  recent(n: number): number[] { return this.xs.slice(-n); }
  get last(): number { return this.xs[this.xs.length - 1] ?? 0; }
  get jitter(): number { return Math.round(this.jit); }
  pct(q: number): number {
    if (!this.xs.length) return 0;
    const s = [...this.xs].sort((a, b) => a - b);
    return Math.round(s[Math.min(s.length - 1, Math.floor(q * s.length))]);
  }
  summary(): { p50: number; p95: number; jitter: number; n: number } {
    return { p50: this.pct(0.5), p95: this.pct(0.95), jitter: this.jitter, n: this.count };
  }
}
