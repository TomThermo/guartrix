/**
 * Tracks AbortController + generation so stale browse responses are ignored
 * when filters change or a newer search supersedes an in-flight one.
 */
export class AbortableBrowse {
  private controller: AbortController | null = null;
  private seq = 0;

  begin(): { signal: AbortSignal; seq: number } {
    this.controller?.abort();
    const ac = new AbortController();
    this.controller = ac;
    const seq = ++this.seq;
    return { signal: ac.signal, seq };
  }

  isCurrent(seq: number): boolean {
    return seq === this.seq;
  }

  isStale(seq: number, signal?: AbortSignal): boolean {
    return Boolean(signal?.aborted) || seq !== this.seq;
  }

  abort(): void {
    this.controller?.abort();
  }
}
