// The record's waveform, as the groove will draw it: the lowest and highest
// sample in each bin along the record, mono, normalised. Computed once when
// a record goes on (from the same int24 render the export path makes); the
// platter paints it into a cached bitmap and re-lays it only when the
// record, the canvas size or the slinky changes.

export interface Wave {
  /** Per bin, the lowest and highest sample, −1…1, normalised to the record's own peak. */
  min: Float32Array;
  max: Float32Array;
}

export async function waveformOf(ctx: BaseAudioContext, wav: ArrayBuffer, bins: number): Promise<Wave> {
  const buffer = await ctx.decodeAudioData(wav.slice(0));
  const n = buffer.length;
  const ch = buffer.numberOfChannels;
  const min = new Float32Array(bins);
  const max = new Float32Array(bins);
  const per = n / bins;
  // Mono: the channels averaged, so the wave is the sound and not one side.
  const mono = new Float32Array(n);
  for (let c = 0; c < ch; c += 1) {
    const d = buffer.getChannelData(c);
    for (let i = 0; i < n; i += 1) mono[i] = (mono[i] ?? 0) + (d[i] ?? 0) / ch;
  }
  let peak = 0;
  for (let b = 0; b < bins; b += 1) {
    const i0 = Math.floor(b * per);
    const i1 = Math.max(i0 + 1, Math.min(n, Math.floor((b + 1) * per)));
    let lo = Infinity;
    let hi = -Infinity;
    for (let i = i0; i < i1; i += 1) {
      const v = mono[i] ?? 0;
      if (v < lo) lo = v;
      if (v > hi) hi = v;
    }
    min[b] = lo === Infinity ? 0 : lo;
    max[b] = hi === -Infinity ? 0 : hi;
    peak = Math.max(peak, Math.abs(lo), Math.abs(hi));
  }
  if (peak > 0) {
    for (let b = 0; b < bins; b += 1) {
      min[b] = (min[b] ?? 0) / peak;
      max[b] = (max[b] ?? 0) / peak;
    }
  }
  return { min, max };
}
