// Monotonic clock: from detected interruption through restart/retry to successful acknowledgment.
export class RecoveryTimer {
  private started: number | undefined;
  durationMs: number | null = null;
  constructor(private readonly now: () => number = () => performance.now()) {}
  interrupted() { this.started ??= this.now(); }
  acknowledged() {
    if (this.started !== undefined && this.durationMs === null) this.durationMs = Math.max(0, Math.round(this.now() - this.started));
  }
}
