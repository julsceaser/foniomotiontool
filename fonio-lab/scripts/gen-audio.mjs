// Generates public/demo.wav — speech-like modulated noise (~6 s, mono, 22.05 kHz).
// Syllable-shaped amplitude envelope over low-pass-filtered noise with a soft
// harmonic hum underneath, so the waveform has natural-looking peaks/pauses.
import { writeFileSync, mkdirSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const outPath = join(root, 'public', 'demo.wav')

const sampleRate = 22050
const seconds = 6
const n = sampleRate * seconds
const samples = new Float64Array(n)

// Syllable envelope: bursts of 120–280 ms with short gaps, grouped into "words".
let t = 0
const bursts = []
while (t < seconds - 0.1) {
  const len = 0.12 + Math.random() * 0.16
  bursts.push({ start: t, len, amp: 0.5 + Math.random() * 0.5 })
  t += len + (Math.random() < 0.25 ? 0.25 + Math.random() * 0.3 : 0.02 + Math.random() * 0.06)
}

// One-pole low-pass for the noise (voice-ish spectral tilt)
let lp = 0
const alpha = 0.12

for (let i = 0; i < n; i++) {
  const time = i / sampleRate
  // envelope from bursts (raised-cosine per burst)
  let env = 0
  for (const b of bursts) {
    if (time >= b.start && time < b.start + b.len) {
      const ph = (time - b.start) / b.len
      env = Math.max(env, b.amp * Math.sin(Math.PI * ph) ** 0.8)
    }
  }
  // filtered noise + quiet pitch-drifting hum
  lp += alpha * ((Math.random() * 2 - 1) - lp)
  const hum =
    0.25 * Math.sin(2 * Math.PI * (140 + 30 * Math.sin(2 * Math.PI * 0.7 * time)) * time)
  samples[i] = env * (0.85 * lp * 2.2 + hum)
}

// normalize to 0.9 peak
let peak = 0
for (const s of samples) peak = Math.max(peak, Math.abs(s))
const gain = 0.9 / peak

// write 16-bit PCM WAV
const dataSize = n * 2
const buf = Buffer.alloc(44 + dataSize)
buf.write('RIFF', 0)
buf.writeUInt32LE(36 + dataSize, 4)
buf.write('WAVE', 8)
buf.write('fmt ', 12)
buf.writeUInt32LE(16, 16) // fmt chunk size
buf.writeUInt16LE(1, 20) // PCM
buf.writeUInt16LE(1, 22) // mono
buf.writeUInt32LE(sampleRate, 24)
buf.writeUInt32LE(sampleRate * 2, 28) // byte rate
buf.writeUInt16LE(2, 32) // block align
buf.writeUInt16LE(16, 34) // bits per sample
buf.write('data', 36)
buf.writeUInt32LE(dataSize, 40)
for (let i = 0; i < n; i++) {
  buf.writeInt16LE(Math.round(Math.max(-1, Math.min(1, samples[i] * gain)) * 32767), 44 + i * 2)
}

mkdirSync(join(root, 'public'), { recursive: true })
writeFileSync(outPath, buf)
console.log(`Wrote ${outPath} (${(buf.length / 1024).toFixed(1)} KiB, ${seconds}s @ ${sampleRate} Hz)`)
