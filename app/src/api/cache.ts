/** 키별 TTL 메모리 캐시. 같은 키로 동시에 요청하면 진행 중인 Promise 를 공유한다. */
export class TtlCache<T> {
  private store = new Map<string, { value: T; expiresAt: number }>();
  private pending = new Map<string, Promise<T>>();

  constructor(private ttlMs: number) {}

  get(key: string): T | undefined {
    const hit = this.store.get(key);
    if (!hit) return undefined;
    if (Date.now() >= hit.expiresAt) {
      this.store.delete(key);
      return undefined;
    }
    return hit.value;
  }

  async getOrLoad(key: string, load: () => Promise<T>, force = false): Promise<T> {
    if (!force) {
      const hit = this.get(key);
      if (hit !== undefined) return hit;
    }
    const running = this.pending.get(key);
    if (running) return running;
    const p = load()
      .then((value) => {
        this.store.set(key, { value, expiresAt: Date.now() + this.ttlMs });
        return value;
      })
      .finally(() => this.pending.delete(key));
    this.pending.set(key, p);
    return p;
  }

  clear() {
    this.store.clear();
  }
}
