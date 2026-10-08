// Screen locks are browser-controlled and automatically revoked in the background.
export class ScreenWakeLock {
  constructor({ navigator, document, onStatus = () => {} }) {
    this.navigator = navigator;
    this.document = document;
    this.onStatus = onStatus;
    this.active = false;
    this.generation = 0;
    this.lock = null;
    this.pending = false;
    this.retry = null;
    document.addEventListener("visibilitychange", () => {
      if (document.hidden) this.release();
      else this.acquire();
    });
  }
  setActive(active) {
    if (this.active === active) return;
    this.active = active;
    if (active) this.acquire();
    else {
      this.release();
      this.onStatus("Screen can sleep while paused.");
    }
  }
  async acquire() {
    clearTimeout(this.retry);
    if (!this.active || this.document.hidden || this.lock || this.pending)
      return;
    if (!this.navigator.wakeLock) {
      this.onStatus("Screen wake lock is unavailable in this browser.");
      return;
    }
    this.pending = true;
    const generation = this.generation;
    try {
      const lock = await this.navigator.wakeLock.request("screen");
      if (
        !this.active ||
        this.document.hidden ||
        generation !== this.generation
      ) {
        await lock.release();
        return;
      }
      this.lock = lock;
      this.onStatus("Screen stays awake while riding.");
      lock.addEventListener("release", () => {
        if (this.lock !== lock) return;
        this.lock = null;
        if (this.active && !this.document.hidden) {
          this.onStatus("Screen wake lock was released; retrying.");
          this.retry = setTimeout(() => this.acquire(), 30000);
        }
      });
    } catch {
      this.onStatus(
        "Screen wake lock was denied; check browser or battery settings.",
      );
    } finally {
      this.pending = false;
      if (
        generation !== this.generation &&
        this.active &&
        !this.document.hidden
      )
        this.acquire();
    }
  }
  release() {
    ++this.generation;
    clearTimeout(this.retry);
    const lock = this.lock;
    this.lock = null;
    if (lock) lock.release().catch(() => {});
  }
}
