/**
 * Gemeinsame Timeline-Engine für Orb-Zustände.
 * Wird von der Export-Preview (Browser) UND dem Headless-Renderer (Node)
 * importiert — dieselbe Mathematik, garantiert identisches Ergebnis.
 *
 * Job-Format:
 * {
 *   duration: 10,            // Sekunden
 *   fps: 30,
 *   loop: true,              // nahtlos schließen (Crossfade macht der Renderer)
 *   markers: [
 *     { time: 0,   state: 'idle' },
 *     { time: 2,   state: 'thinking', transition: 0.8, ease: 'smooth' },
 *     { time: 5,   state: 'success',  transition: 0.4, ease: 'spring', pulse: true, hold: 0.4 },
 *   ],
 *   audioRms: [0, 0.1, ...], // optional: RMS pro Frame (Browser berechnet beim Export)
 * }
 */

const clamp01 = (x) => Math.max(0, Math.min(1, x))
export const EASES = {
  smooth: (x) => { const t = clamp01(x); return t * t * (3 - 2 * t) },
  linear: (x) => clamp01(x),
  spring: (x) => { // easeOutBack: leichtes Überschwingen
    const t = clamp01(x)
    const c1 = 1.70158, c3 = c1 + 1
    return 1 + c3 * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2)
  },
}

const lerp = (a, b, t) => a + (b - a) * t
const hexToRgb = (h) => [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)]
const rgbToHex = (r, g, b) => '#' + [r, g, b].map((v) => Math.round(Math.max(0, Math.min(255, v))).toString(16).padStart(2, '0')).join('')
const lerpColor = (a, b, t) => {
  const A = hexToRgb(a), B = hexToRgb(b)
  return rgbToHex(lerp(A[0], B[0], t), lerp(A[1], B[1], t), lerp(A[2], B[2], t))
}

const NUM_KEYS = ['speed', 'distortion', 'swirl', 'grainMixer', 'scale', 'soften', 'offsetX', 'rotationSpeed']

export function mixParams(a, b, t) {
  const out = {}
  for (const k of NUM_KEYS) out[k] = lerp(a[k] ?? 0, b[k] ?? 0, t)
  const n = Math.max(a.colors?.length ?? 0, b.colors?.length ?? 0)
  out.colors = Array.from({ length: n }, (_, i) =>
    lerpColor(a.colors?.[i] ?? '#FFFFFF', b.colors?.[i] ?? '#FFFFFF', t))
  return out
}

/**
 * Expandiert Puls-Marker (state kurz anspielen, dann zurück) und sortiert.
 * Ein Puls {time, state, transition d, hold h} wird zu:
 *   {time, state, d} + {time + d + h, vorherigerState, d}
 */
export function expandMarkers(markers) {
  const sorted = [...markers].sort((a, b) => a.time - b.time)
  const out = []
  for (let i = 0; i < sorted.length; i++) {
    const m = sorted[i]
    out.push({ ...m })
    if (m.pulse) {
      const back = i > 0 ? out[out.length - 2] ?? sorted[i - 1] : sorted[0]
      const d = m.transition ?? 0.4
      out.push({ time: m.time + d + (m.hold ?? 0.4), state: back.state, transition: d, ease: m.ease ?? 'smooth' })
    }
  }
  return out.sort((a, b) => a.time - b.time)
}

/**
 * Parameter zum Zeitpunkt t. Loop-Modus: für die Interpolation wird die
 * Timeline zyklisch gedacht — der erste Marker gilt auch als "Rückkehrziel"
 * am Ende (der Renderer macht zusätzlich den Pixel-Crossfade).
 */
export function paramsAt(job, states, t) {
  const markers = expandMarkers(job.markers)
  if (!markers.length) throw new Error('Timeline hat keine Marker')
  let idx = -1
  for (let i = 0; i < markers.length; i++) if (markers[i].time <= t) idx = i
  if (idx === -1) { // vor dem ersten Marker: dessen Zustand statisch
    const p = states[markers[0].state].p
    return { ...p, colors: [...p.colors] }
  }
  const m = markers[idx]
  const cur = states[m.state].p
  const trans = m.transition ?? 0.6
  if (trans <= 0) return { ...cur, colors: [...cur.colors] }
  // Loop: Rückkehr aus dem Zustand, der am ENDE der Timeline wirklich aktiv ist
  // (nicht der letzte Listen-Marker — der kann hinter duration liegen)
  let prevState = m.state
  if (idx > 0) prevState = markers[idx - 1].state
  else if (job.loop) {
    let lastActive = markers[0].state
    for (const mk of markers) if (mk.time < job.duration) lastActive = mk.state
    prevState = lastActive
  }
  const prev = states[prevState].p
  const ease = EASES[m.ease ?? 'smooth'] ?? EASES.smooth
  const x = ease((t - m.time) / trans)
  return mixParams(prev, cur, x)
}

export function stateNameAt(job, t) {
  const markers = expandMarkers(job.markers)
  let idx = 0
  for (let i = 0; i < markers.length; i++) if (markers[i].time <= t) idx = i
  return markers[idx].state
}

const AUDIO_STATES = new Set(['listening', 'speaking'])

/**
 * Berechnet alle Frames eines Jobs (deterministisch).
 * Rückgabe: Array von RenderParams inkl. shaderFrame + rotationDeg.
 * extraFrames: zusätzliche Frames über duration hinaus (für Loop-Crossfade).
 */
export function buildFrames(job, states, extraFrames = 0) {
  const fps = job.fps ?? 30
  const total = Math.round(job.duration * fps) + extraFrames
  const rms = job.audioRms ?? []
  const frames = []
  let shaderFrame = 0
  let rotationDeg = 0
  const dtMs = 1000 / fps
  for (let f = 0; f < total; f++) {
    const t = (f / fps) % job.duration // hinter duration: zyklisch (Loop-Tail)
    const p = paramsAt(job, states, t)
    shaderFrame += p.speed * dtMs
    rotationDeg = (rotationDeg + p.rotationSpeed * (1 / fps)) % 360
    // Stimme bewegt die OBERFLÄCHE (Distortion + inneres Muster-Zoom), nie die Ball-Größe
    const lvl = AUDIO_STATES.has(stateNameAt(job, t)) ? (rms[f % Math.max(1, rms.length)] ?? 0) : 0
    frames.push({
      ...p,
      distortion: p.distortion + lvl * 0.4,
      scale: p.scale + lvl * 0.18,
      shaderFrame, rotationDeg,
    })
  }
  return frames
}

/**
 * Automatische Transitions (Übergang IN einen Zustand) + Default-Dauern.
 * Jetzt fix — später einstellbar und als Design-Standard festgeschrieben.
 */
export const AUTO_TRANSITIONS = {
  idle:      { transition: 0.8,  ease: 'smooth' },
  listening: { transition: 0.5,  ease: 'smooth' },
  thinking:  { transition: 0.8,  ease: 'smooth' },
  speaking:  { transition: 0.4,  ease: 'smooth' },
  success:   { transition: 0.35, ease: 'spring' },
  unsure:    { transition: 0.7,  ease: 'smooth' },
  transfer:  { transition: 0.6,  ease: 'smooth' },
  offline:   { transition: 1.0,  ease: 'smooth' },
}
export const DEFAULT_CLIP_DURATION = { success: 1.2, transfer: 2, _default: 3 }

/** Clip-Sequenz → Marker-Liste für die Engine (Startzeiten kumulativ). */
export function clipsToMarkers(clips) {
  const markers = []
  let t = 0
  for (let i = 0; i < clips.length; i++) {
    const auto = AUTO_TRANSITIONS[clips[i].state] ?? { transition: 0.6, ease: 'smooth' }
    markers.push({
      time: Math.round(t * 100) / 100,
      state: clips[i].state,
      ...(i > 0 ? { transition: auto.transition, ease: auto.ease } : {}),
    })
    t += clips[i].duration
  }
  return markers
}
