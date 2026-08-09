#!/usr/bin/env node
/**
 * Orb-Renderer für After Effects: Timeline-Job → PNG-Sequenz mit Alpha.
 *
 *   node scripts/render-orb.mjs --timeline renders/<job>.json \
 *        [--audio voice.wav] [--out out-render] [--fps 30] [--size 480]
 *
 * Nimmt Jobs aus dem Lab-Export-Tab (inkl. eingebettetem audioRms + loop)
 * ODER schlichte AE-Marker-Exporte (dann --audio als WAV für die
 * Reaktivität). Loop-Modus rendert einen Tail und blendet ihn per
 * Pixel-Crossfade in den Anfang — nahtloser Schluss garantiert.
 * Interpolation kommt aus src/engine/orbTimeline.mjs — derselben Engine,
 * die auch die Lab-Preview nutzt (WYSIWYG).
 */
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { chromium } from 'playwright'
import { PNG } from 'pngjs'
import { buildFrames } from '../src/engine/orbTimeline.mjs'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')

const args = Object.fromEntries(
  process.argv.slice(2).map((a, i, all) => (a.startsWith('--') ? [a.slice(2), all[i + 1]] : null)).filter(Boolean),
)
const TIMELINE = args.timeline ?? 'renders/timeline-demo.json'
const OUT = resolve(ROOT, args.out ?? 'out-render')
const PORT = Number(args.port ?? 5173)

const job = JSON.parse(readFileSync(resolve(ROOT, TIMELINE), 'utf8'))
job.fps = Number(args.fps ?? job.fps ?? 30)
job.duration = job.duration ?? Math.max(...job.markers.map((m) => m.time)) + 3
const SIZE = Number(args.size ?? job.size ?? 480)
const states = JSON.parse(readFileSync(resolve(ROOT, 'public/states.json'), 'utf8'))
for (const m of job.markers) if (!states[m.state]) throw new Error(`Unbekannter Zustand "${m.state}" (verfügbar: ${Object.keys(states).join(', ')})`)

// ---------- Audio: eingebettetes RMS (Lab-Export) oder WAV-Datei (AE-Weg) ----------
function wavRmsPerFrame(path, frames, fps) {
  const buf = readFileSync(path)
  if (buf.toString('ascii', 0, 4) !== 'RIFF') throw new Error('Keine WAV-Datei: ' + path)
  let off = 12, fmt = null, dataOff = -1, dataLen = 0
  while (off + 8 <= buf.length) {
    const id = buf.toString('ascii', off, off + 4)
    const len = buf.readUInt32LE(off + 4)
    if (id === 'fmt ') fmt = { channels: buf.readUInt16LE(off + 10), rate: buf.readUInt32LE(off + 12), bits: buf.readUInt16LE(off + 22) }
    if (id === 'data') { dataOff = off + 8; dataLen = len }
    off += 8 + len + (len % 2)
  }
  if (!fmt || dataOff < 0) throw new Error('WAV-Chunks nicht gefunden')
  if (fmt.bits !== 16) throw new Error('Nur 16-bit-PCM (ist: ' + fmt.bits + ')')
  const samples = dataLen / 2 / fmt.channels
  const perFrame = fmt.rate / fps
  const rms = new Array(frames).fill(0)
  for (let f = 0; f < frames; f++) {
    const s0 = Math.floor(f * perFrame), s1 = Math.min(samples, Math.floor((f + 1) * perFrame))
    if (s0 >= samples) break
    let sum = 0, n = 0
    for (let s = s0; s < s1; s++) { const v = buf.readInt16LE(dataOff + s * 2 * fmt.channels) / 32768; sum += v * v; n++ }
    rms[f] = n ? Math.min(1, Math.sqrt(sum / n) * 3.2) : 0
  }
  return rms
}
const FRAMES = Math.round(job.duration * job.fps)
if (!job.audioRms && args.audio) job.audioRms = wavRmsPerFrame(resolve(ROOT, args.audio), FRAMES, job.fps)

// ---------- Frames berechnen (gemeinsame Engine) ----------
const FADE_SEC = job.loop ? Math.min(1, job.duration / 4) : 0
const FADE = Math.round(FADE_SEC * job.fps)
const frames = buildFrames(job, states, FADE)

console.log(`Rendere ${FRAMES} Frames @ ${job.fps}fps, ${SIZE}px, Loop: ${job.loop ? `ja (Crossfade ${FADE_SEC}s)` : 'nein'}, Audio: ${job.audioRms ? 'ja' : '—'}`)
mkdirSync(OUT, { recursive: true })

const ping = await fetch(`http://localhost:${PORT}/render`).catch(() => null)
if (!ping || !ping.ok) { console.error(`Dev-Server läuft nicht auf Port ${PORT}. Starte: npm run dev`); process.exit(1) }

const browser = await chromium.launch()
const page = await browser.newPage({ viewport: { width: 520, height: 520 }, deviceScaleFactor: SIZE / 480 })
await page.goto(`http://localhost:${PORT}/render`, { waitUntil: 'networkidle' })
await page.waitForFunction(() => window.__renderReady === true, { timeout: 15000 })
const stage = page.locator('#render-stage')

const raw = [] // Buffers (nur benötigt für Loop-Fade-Bereich)
const t0 = Date.now()
for (let f = 0; f < frames.length; f++) {
  await page.evaluate((p) => window.__setRenderParams(p), frames[f])
  await page.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))))
  const isHead = f < FADE
  const isTail = f >= FRAMES
  if (isHead || isTail) {
    raw[f] = await stage.screenshot({ omitBackground: true })
  } else {
    await stage.screenshot({ path: `${OUT}/orb_${String(f).padStart(5, '0')}.png`, omitBackground: true })
  }
  if (f % 30 === 0) process.stdout.write(`\r${f}/${frames.length} (${Math.round((Date.now() - t0) / 1000)}s)`)
}
await browser.close()

// ---------- Loop-Crossfade: Tail (hinter duration) in den Anfang blenden ----------
if (FADE > 0) {
  process.stdout.write('\nBlende Loop-Naht… ')
  for (let f = 0; f < FADE; f++) {
    const head = PNG.sync.read(raw[f])
    const tail = PNG.sync.read(raw[FRAMES + f])
    const mix = f / FADE // 0 → reiner Tail (nahtlos an letztes Frame), 1 → reiner Head
    const out = new PNG({ width: head.width, height: head.height })
    for (let i = 0; i < head.data.length; i++) {
      out.data[i] = Math.round(tail.data[i] * (1 - mix) + head.data[i] * mix)
    }
    writeFileSync(`${OUT}/orb_${String(f).padStart(5, '0')}.png`, PNG.sync.write(out))
  }
  console.log('ok')
}

console.log(`\nFertig → ${OUT} (${FRAMES} Frames)`)
console.log(`AE-Import: orb_00000.png als PNG-Sequenz importieren, ${job.fps} fps, Alpha: Straight/Direkt.${job.loop ? ' Loop: letzte + erste Frames schließen nahtlos.' : ''}`)
writeFileSync(`${OUT}/render-info.json`, JSON.stringify({ timeline: TIMELINE, fps: job.fps, size: SIZE, frames: FRAMES, loop: !!job.loop, renderedAt: new Date().toISOString() }, null, 2))
