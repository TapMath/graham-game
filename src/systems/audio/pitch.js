// Pitch of a voice from one block of microphone samples (busking, src/systems/busk.js). Pure functions, no Web Audio.
//
//   analysePitch(buf, sampleRate)  -> { db, f0, clarity }
//     db       RMS level in dBFS
//     f0       fundamental in Hz (0 when there is none)
//     clarity  0..1, the height of the normalised autocorrelation peak (a sung vowel is above ~0.8, noise well below)
//   noteName(midi)  -> the sargam syllable (taking C as Sa) and the note, e.g. 'Pa · G4'
//
// The method is McLeod's normalised square difference: for each lag, 2·Σx[i]x[i+lag] / Σ(x[i]² + x[i+lag]²) over a fixed
// window, then the first peak that reaches 90% of the highest one (which avoids octave errors), refined by a parabola.
const MIN_HZ = 70, MAX_HZ = 1200;
const NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
const SARGAM = ['Sa', 're', 'Re', 'ga', 'Ga', 'Ma', 'Ma’', 'Pa', 'dha', 'Dha', 'ni', 'Ni'];
let nsdf = new Float32Array(0), half = new Float32Array(0);

export function analysePitch(input, rate) {
  let sum = 0;
  for (let i = 0; i < input.length; i++) sum += input[i] * input[i];
  const rms = Math.sqrt(sum / input.length), db = rms > 1e-6 ? 20 * Math.log10(rms) : -120;
  if (rms < 2e-4) return { db, f0: 0, clarity: 0 };
  // a voice needs nothing above ~8 kHz: at 32 kHz and up, work on pairs averaged (a quarter of the cost)
  let buf = input, sr = rate;
  if (rate >= 32000) {
    const n = input.length >> 1;
    if (half.length !== n) half = new Float32Array(n);
    for (let i = 0; i < n; i++) half[i] = 0.5 * (input[2 * i] + input[2 * i + 1]);
    buf = half; sr = rate / 2;
  }
  const N = buf.length;
  const minLag = Math.max(2, Math.floor(sr / MAX_HZ)), maxLag = Math.min(Math.floor(sr / MIN_HZ), Math.floor(N / 2));
  const W = N - maxLag;
  if (nsdf.length < maxLag + 2) nsdf = new Float32Array(maxLag + 2);
  for (let lag = 1; lag <= maxLag; lag++) {
    let ac = 0, m = 0;
    for (let i = 0; i < W; i++) { const a = buf[i], b = buf[i + lag]; ac += a * b; m += a * a + b * b; }
    nsdf[lag] = m > 0 ? (2 * ac) / m : 0;
  }
  // peaks between positive-going and negative-going zero crossings
  let best = 0, peaks = [], i = 1;
  while (i <= maxLag && nsdf[i] > 0) i++;                     // skip the lobe around lag 0
  while (i <= maxLag) {
    while (i <= maxLag && nsdf[i] <= 0) i++;
    let pk = -1, pv = 0;
    while (i <= maxLag && nsdf[i] > 0) { if (nsdf[i] > pv) { pv = nsdf[i]; pk = i; } i++; }
    if (pk >= minLag) { peaks.push(pk); if (pv > best) best = pv; }
  }
  if (!peaks.length || best <= 0) return { db, f0: 0, clarity: 0 };
  const lag = peaks.find((p) => nsdf[p] >= 0.9 * best);
  let shift = 0;
  if (lag > minLag && lag < maxLag) {
    const a = nsdf[lag - 1], b = nsdf[lag], c = nsdf[lag + 1], d = a - 2 * b + c;
    if (d !== 0) shift = clampShift(0.5 * (a - c) / d);
  }
  return { db, f0: sr / (lag + shift), clarity: nsdf[lag] };
}
const clampShift = (s) => Math.max(-0.5, Math.min(0.5, s));

export function noteName(midi) {
  const m = Math.round(midi), pc = ((m % 12) + 12) % 12;
  return `${SARGAM[pc]} · ${NAMES[pc]}${Math.floor(m / 12) - 1}`;
}
