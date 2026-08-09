#!/usr/bin/env node
/**
 * Marker-gesteuerter Orb-Renderer für After Effects (Weg 2).
 *
 * Liest eine Timeline (AE-Marker-Export oder Hand-JSON) + optional eine
 * WAV-Datei, berechnet pro Frame deterministisch alle Orb-Parameter
 * (Zustands-Übergänge mit Smoothstep, Audio-Reaktivität aus echtem RMS,
 * Shader-Zeit, Rotation) und schreibt eine PNG-Sequenz MIT Alphakanal.
 *
 *   node scripts/render-orb.mjs --timeline renders/timeline-demo.json \
 *        [--audio public/demo.wav] [--out out-render] [--fps 30] [--size 480]
 *
 * Timeline-Format:
 *   { "duration": 10, "markers": [
 *       { "time": 0,   "state": "idle" },
 *       { "time": 2,   "state": "thinking", "transition": 0.8 },
 *       { "time": 5,   "state": "speaking", "transition": 0.5 } ] }
 *
 * Zustände kommen aus public/states.json — derselben Datei, die der
 * Lab-Editor („Bearbeiten" → Speichern) pflegt.
 */
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { chromium } from 'playwright'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')

// ---------- Args ----------
const args = Object.fromEntries(
  process.argv.slice(2).map((a, i, all) => (a.startsWith('--') ? [a.slice(2), all[i + 1]] : null)).filter(Boolean),
)
const TIMELINE = args.timeline ?? 'renders/timeline-demo.json'
const AUDIO = args.audio ?? null
const OUT = resolve(ROOT, args.out ?? 'out-render')
const FPS = Number(args.fps ?? 30)
const SIZE = Number(args.size ?? 480)
const PORT = Number(args.port ?? 5173)

// ---------- Timeline + Zustände ----------
const timeline = JSON.parse(readFileSync(resolve(ROOT, TIMELINE), 'utf8'))
const states = JSON.parse(readFileSync(resolve(ROOT, 'public/states.json'), 'utf8'))
const markers = [...timeline.markers].sort((a, b) => a.time - b.time)
if (!markers.length) throw new Error('Timeline hat keine Marker.')
for (const m of markers) if (!states[m.state]) throw new Error(`Unbekannter Zustand: "${m.state}" (verfügbar: ${Object.keys(states).join(', ')})`)
const DURATION = timeline.duration ?? markers[markers.length - 1].time + 3
const FRAMES = Math.round(DURATION * FPS)

// ---------- WAV → RMS pro Frame (PCM 16-bit, mono/stereo) ----------
function wavRmsPerFrame(path, frames, fps) {
  const buf = readFileSync(path)
  if (buf.toString('ascii', 0, 4) !== 'RIFF') throw new Error('Keine WAV-Datei: ' + path)
  let off = 12
  let fmt = null, dataOff = -1, dataLen = 0
  while (off + 8 <= buf.length) {
    const id = buf.toString('ascii', off, off + 4)
    const len = buf.readUInt32LE(off + 4)
    if (id === 'fmt ') fmt = { channels: buf.readUInt16LE(off + 10), rate: buf.readUInt32LE(off + 12), bits: buf.readUInt16LE(off + 22) }
    if (id === 'data') { dataOff = off + 8; dataLen = len }
    off += 8 + len + (len % 2)
  }
  if (!fmt || dataOff < 0) throw new Error('WAV-Chunks nicht gefunden')
  if (fmt.bits !== 16) throw new Error('Nur 16-bit-PCM unterstützt (ist: ' + fmt.bits + ')')
  const samples = dataLen / 2 / fmt.channels
  const perFrame = fmt.rate / fps
  const rms = new Array(frames).fill(0)
  for (let f = 0; f < frames; f++) {
    const s0 = Math.floor(f * perFrame)
    const s1 = Math.min(samples, Math.floor((f + 1) * perFrame))
    if (s0 >= samples) break
    let sum = 0, n = 0
    for (let s = s0; s < s1; s++) {
      const v = buf.readInt16LE(dataOff + s * 2 * fmt.channels) / 32768
      sum += v * v
      n++
    }
    rms[f] = n ? Math.min(1, Math.sqrt(sum / n) * 3.2) : 0
  }
  return rms
}
const rms = AUDIO ? wavRmsPerFrame(resolve(ROOT, AUDIO), FRAMES, FPS) : new Array(FRAMES).fill(0)

// ---------- Per-Frame-Parameter (deterministisch) ----------
const hexToRgb = (h) => [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)]
const rgbToHex = (r, g, b) => '#' + [r, g, b].map((v) => Math.round(Math.max(0, Math.min(255, v))).toString(16).padStart(2, '0')).join('')
const lerp = (a, b, t) => a + (b - a) * t
const lerpColor = (a, b, t) => {
  const A = hexToRgb(a), B = hexToRgb(b)
  return rgbToHex(lerp(A[0], B[0], t), lerp(A[1], B[1], t), lerp(A[2], B[2], t))
}
const smoothstep = (x) => { const t = Math.max(0, Math.min(1, x)); return t * t * (3 - 2 * t) }

function mixParams(a, b, t) {
  const out = {}
  for (const k of ['speed', 'distortion', 'swirl', 'grainMixer', 'scale', 'soften', 'offsetX', 'rotationSpeed']) {
    out[k] = lerp(a[k] ?? 0, b[k] ?? 0, t)
  }
  out.colors = (b.colors ?? []).map((c, i) => lerpColor(a.colors?.[i] ?? '#FFFFFF', c, t))
  return out
}

function paramsAt(t) {
  let idx = 0
  for (let i = 0; i < markers.length; i++) if (markers[i].time <= t) idx = i
  const cur = states[markers[idx].state].p
  const trans = markers[idx].transition ?? 0.6
  if (idx === 0 || trans <= 0) return { ...cur, colors: [...cur.colors] }
  const prev = states[markers[idx - 1].state].p
  const x = smoothstep((t - markers[idx].time) / trans)
  return mixParams(prev, cur, x)
}

const AUDIO_STATES = new Set(['listening', 'speaking'])
function stateNameAt(t) {
  let idx = 0
  for (let i = 0; i < markers.length; i++) if (markers[i].time <= t) idx = i
  return markers[idx].state
}

const frames = []
let shaderFrame = 0
let rotationDeg = 0
const dtMs = 1000 / FPS
for (let f = 0; f < FRAMES; f++) {
  const t = f / FPS
  const p = paramsAt(t)
  shaderFrame += p.speed * dtMs
  rotationDeg = (rotationDeg + p.rotationSpeed * (1 / FPS)) % 360
  const boost = AUDIO_STATES.has(stateNameAt(t)) ? rms[f] * 0.22 : 0
  frames.push({ ...p, scale: p.scale + boost, shaderFrame, rotationDeg })
}

// ---------- Rendern ----------
console.log(`Rendere ${FRAMES} Frames @ ${FPS}fps, ${SIZE}px, Audio: ${AUDIO ?? '—'}`)
mkdirSync(OUT, { recursive: true })

const res = await fetch(`http://localhost:${PORT}/render`).catch(() => null)
if (!res || !res.ok) {
  console.error(`Dev-Server läuft nicht auf Port ${PORT}. Starte ihn mit: npm run dev`)
  process.exit(1)
}

const browser = await chromium.launch()
const page = await browser.newPage({
  viewport: { width: 520, height: 520 },
  deviceScaleFactor: SIZE / 480,
})
await page.goto(`http://localhost:${PORT}/render`, { waitUntil: 'networkidle' })
await page.waitForFunction(() => window.__renderReady === true, { timeout: 15000 })
const stage = page.locator('#render-stage')

const t0 = Date.now()
for (let f = 0; f < FRAMES; f++) {
  await page.evaluate((p) => window.__setRenderParams(p), frames[f])
  await page.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))))
  await stage.screenshot({
    path: `${OUT}/orb_${String(f).padStart(5, '0')}.png`,
    omitBackground: true,
  })
  if (f % 30 === 0) process.stdout.write(`\r${f}/${FRAMES} (${Math.round((Date.now() - t0) / 1000)}s)`)
}
await browser.close()
console.log(`\nFertig → ${OUT}`)
console.log(`
AE-Import: Datei > Importieren > orb_00000.png auswählen, „PNG-Sequenz" anhaken,
Framerate beim Interpretieren auf ${FPS} fps stellen. Alpha: Straight/Direkt.`)

writeFileSync(`${OUT}/render-info.json`, JSON.stringify({ timeline: TIMELINE, audio: AUDIO, fps: FPS, size: SIZE, frames: FRAMES, renderedAt: new Date().toISOString() }, null, 2))
