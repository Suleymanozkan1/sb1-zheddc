// Pure anti-cheat heuristics used by the game server. They never trust client-reported
// outcomes; they only rate-limit and detect suspicious input patterns.

export class RateWindow {
  private readonly stamps: number[] = [];
  private readonly windowMs: number;
  private readonly max: number;

  constructor(max: number, windowMs = 1000) {
    this.max = max;
    this.windowMs = windowMs;
  }

  /** Records a hit; returns false when the limit is exceeded. */
  hit(now: number): boolean {
    while (this.stamps.length > 0 && now - this.stamps[0]! > this.windowMs) this.stamps.shift();
    // Rejected hits are not stored, so a flood cannot grow the window unboundedly.
    if (this.stamps.length >= this.max) return false;
    this.stamps.push(now);
    return true;
  }
}

/**
 * Detects machine-perfect input timing: humans (and browsers) show jitter between frames and
 * vary aim constantly. A long run of identical intervals with discrete aim changes is bot-like.
 */
export class BotBehaviorDetector {
  private lastAt = 0;
  private intervals: number[] = [];
  private aimChanges = 0;
  private lastAim = 0;
  private samples = 0;
  private readonly size: number;

  constructor(size = 600) {
    this.size = size;
  }

  record(now: number, aim: number, moving: boolean): void {
    if (this.lastAt > 0) {
      this.intervals.push(now - this.lastAt);
      if (this.intervals.length > this.size) this.intervals.shift();
    }
    this.lastAt = now;
    if (moving && Math.abs(aim - this.lastAim) > 1e-6) this.aimChanges++;
    this.lastAim = aim;
    this.samples++;
  }

  /** Returns a 0..1 suspicion score once enough samples are collected. */
  score(): number {
    if (this.intervals.length < this.size) return 0;
    const mean = this.intervals.reduce((a, b) => a + b, 0) / this.intervals.length;
    const variance = this.intervals.reduce((a, b) => a + (b - mean) ** 2, 0) / this.intervals.length;
    const stddev = Math.sqrt(variance);
    const aimRatio = this.aimChanges / Math.max(1, this.samples);
    let s = 0;
    if (stddev < 0.25) s += 0.6;
    if (aimRatio < 0.01) s += 0.4;
    return Math.min(1, s);
  }

  reset(): void {
    this.intervals = [];
    this.aimChanges = 0;
    this.samples = 0;
  }
}

/** Sequence numbers must strictly increase (replay / reorder protection). */
export function isValidSeq(lastSeq: number, seq: number): boolean {
  return Number.isInteger(seq) && seq > lastSeq && seq - lastSeq < 10_000;
}
