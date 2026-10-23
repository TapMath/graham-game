// Tiny pub/sub. Handlers receive (data, type). Subscribe to '*' to see every event.
// A throwing handler is logged and does not stop the other handlers.
export class Events {
  constructor() { this.map = new Map(); }

  /** Subscribe. Returns an unsubscribe function. */
  on(type, fn) {
    let set = this.map.get(type);
    if (!set) this.map.set(type, (set = new Set()));
    set.add(fn);
    return () => this.off(type, fn);
  }

  once(type, fn) {
    const off = this.on(type, (data, t) => { off(); fn(data, t); });
    return off;
  }

  off(type, fn) {
    const set = this.map.get(type);
    if (set) set.delete(fn);
  }

  emit(type, data) {
    this._fire(this.map.get(type), data, type);
    this._fire(this.map.get('*'), data, type);
  }

  _fire(set, data, type) {
    if (!set || set.size === 0) return;
    for (const fn of [...set]) {
      try { fn(data, type); } catch (e) { console.error(`[events] handler for "${type}" threw:`, e); }
    }
  }
}
