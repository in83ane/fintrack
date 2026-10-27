import { STALE_TTL } from './loading-policy';

/** Session memory only. Invalidated requests cannot overwrite a newer snapshot. */
export class MemoryResource<T> {
  private entries = new Map<string, { value?: T; at: number; pending?: Promise<T> }>();
  peek(key: string) { return this.entries.get(key)?.value; }
  fresh(key: string) { const entry = this.entries.get(key); return entry?.value !== undefined && Date.now() - entry.at < STALE_TTL; }
  invalidate(key?: string) { if (key) this.entries.delete(key); else this.entries.clear(); }
  read(key: string, fetcher: () => Promise<T>): Promise<T> {
    const previous = this.entries.get(key);
    if (this.fresh(key)) return Promise.resolve(previous!.value!);
    if (previous?.pending) return previous.pending;
    const entry = { value: previous?.value, at: previous?.at || 0, pending: undefined as Promise<T> | undefined };
    const pending = fetcher().then(value => {
      if (this.entries.get(key) === entry) { entry.value = value; entry.at = Date.now(); }
      return value;
    }).finally(() => { if (entry.pending === pending) entry.pending = undefined; });
    entry.pending = pending;
    this.entries.set(key, entry);
    return pending;
  }
}
