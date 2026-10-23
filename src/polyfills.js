// Small polyfills for older Safari (iPadOS 15.0–15.3 lacks Array/String .at). Imported first by main.js.
function at(n) {
  n = Math.trunc(n) || 0;
  if (n < 0) n += this.length;
  return n < 0 || n >= this.length ? undefined : this[n];
}
for (const C of [Array, String, Float32Array, Uint8Array, Uint16Array, Uint32Array, Int32Array]) {
  if (!C.prototype.at) Object.defineProperty(C.prototype, 'at', { value: at, writable: true, configurable: true });
}
