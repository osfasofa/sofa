// A test record: `secs` seconds of a stereo tone as a 16-bit WAV, written to
// the path given. The browser suites drop it on the turntable. Nobody's
// samples — a sine and its fifth.
//   node scripts/tone.mjs /tmp/tone.wav [secs=6] [hz=220] [rate=48000]
import { writeFileSync } from 'node:fs';

const [, , out, secsArg = '6', hzArg = '220', rateArg = '48000'] = process.argv;
if (!out) {
  console.error('usage: node scripts/tone.mjs <out.wav> [secs] [hz] [rate]');
  process.exit(2);
}
const secs = Number(secsArg);
const hz = Number(hzArg);
const rate = Number(rateArg);
const frames = Math.round(secs * rate);
const pcm = new Int16Array(frames * 2);
for (let i = 0; i < frames; i += 1) {
  const env = Math.min(1, i / (rate * 0.05), (frames - i) / (rate * 0.05));
  pcm[i * 2] = Math.round(0.4 * env * Math.sin((2 * Math.PI * hz * i) / rate) * 32767);
  pcm[i * 2 + 1] = Math.round(0.3 * env * Math.sin((2 * Math.PI * hz * 1.5 * i) / rate) * 32767);
}
const header = Buffer.alloc(44);
header.write('RIFF', 0);
header.writeUInt32LE(36 + pcm.byteLength, 4);
header.write('WAVE', 8);
header.write('fmt ', 12);
header.writeUInt32LE(16, 16);
header.writeUInt16LE(1, 20);
header.writeUInt16LE(2, 22);
header.writeUInt32LE(rate, 24);
header.writeUInt32LE(rate * 4, 28);
header.writeUInt16LE(4, 32);
header.writeUInt16LE(16, 34);
header.write('data', 36);
header.writeUInt32LE(pcm.byteLength, 40);
writeFileSync(out, Buffer.concat([header, Buffer.from(pcm.buffer)]));
console.log(`${out}: ${secs}s stereo ${hz} Hz at ${rate} Hz`);
