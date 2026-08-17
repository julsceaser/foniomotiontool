import { useEffect, useRef, useState } from 'react'

/**
 * DOTS — Dot-Morph-Playground.
 * Formen sind PFADE (Polylines) oder WOLKEN (Punktmengen).
 * Pfade werden nach Bogenlänge verteilt: gleichmäßige Abstände ENTLANG
 * der Linie — wahlweise über Anzahl oder festen Pixel-Abstand.
 * SVG-Drop: Dots folgen dem echten SVG-Pfad. PNG/JPG-Drop: Punktwolke.
 * Export als AE-JSON (baked/slim) + PNG. Import in AE: ae/dots_import.jsx
 */

// ---------- CI-Farben (fonio-tokens) ----------
const CI = {
  ink: '#09090b',
  brand: '#585dfe',
  cyan: '#58e8fe',
  green: '#58fe85',
  muted: '#71717a',
  white: '#ffffff',
}
const PALETTE = [CI.ink, CI.brand, CI.cyan, CI.green, CI.muted, CI.white]

const THEMES = {
  hell: { bg: '#ffffff', label: 'Hell' },
  dunkel: { bg: '#0f0f16', label: 'Dunkel' },
  pastell: { bg: '#eef7fd', label: 'Orb-Pastell' },
} as const
type ThemeKey = keyof typeof THEMES

const FORMATS = { '16:9': [1280, 720], '1:1': [900, 900], '9:16': [540, 960] } as const
type FormatKey = keyof typeof FORMATS

// ---------- Deterministischer Zufall ----------
function mulberry(seed: number) {
  let s = seed >>> 0
  return () => {
    s |= 0; s = (s + 0x6d2b79f5) | 0
    let t = Math.imul(s ^ (s >>> 15), 1 | s)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

// ---------- Shapes: Pfade (Polylines) & Wolken ----------
type Pt = [number, number]
type ShapeDef =
  | { kind: 'path'; paths: Pt[][] }
  | { kind: 'cloud'; gen: (n: number) => Pt[] }
  | { kind: 'grid'; size: number; cells: number[] } // gemalte Zustände (Zell-Indizes)
const GA = Math.PI * (3 - Math.sqrt(5))

function curve(fn: (t: number) => Pt, samples = 160): Pt[] {
  return Array.from({ length: samples + 1 }, (_, i) => fn(i / samples))
}

const BASE_SHAPES: Record<string, ShapeDef> = {
  Linie: { kind: 'path', paths: [[[0.08, 0.5], [0.92, 0.5]]] },
  Diagonale: { kind: 'path', paths: [[[0.12, 0.88], [0.88, 0.12]]] },
  Welle: { kind: 'path', paths: [curve((t) => [0.06 + t * 0.88, 0.5 + Math.sin(t * Math.PI * 3) * 0.18])] },
  Kreis: { kind: 'path', paths: [curve((t) => {
    const a = -Math.PI / 2 + t * Math.PI * 2
    return [0.5 + Math.cos(a) * 0.36, 0.5 + Math.sin(a) * 0.36]
  })] },
  Spirale: { kind: 'path', paths: [curve((t) => {
    const a = t * Math.PI * 5
    const r = 0.05 + t * 0.36
    return [0.5 + Math.cos(a) * r, 0.5 + Math.sin(a) * r]
  }, 220)] },
  Herz: { kind: 'path', paths: [curve((t) => {
    const u = t * Math.PI * 2
    const x = 16 * Math.sin(u) ** 3
    const y = 13 * Math.cos(u) - 5 * Math.cos(2 * u) - 2 * Math.cos(3 * u) - Math.cos(4 * u)
    return [0.5 + x * 0.022, 0.47 - y * 0.022]
  })] },
  // Ecken-Formen: kuratierte 8×8-Patterns (werden auf andere Grids skaliert)
  Check: { kind: 'grid', size: 8, cells: [25, 34, 43, 36, 29, 22, 15] },
  Pfeil: { kind: 'grid', size: 8, cells: [24, 25, 26, 27, 28, 29, 13, 22, 31, 38, 45] },
  X: { kind: 'grid', size: 8, cells: [0, 9, 18, 27, 36, 45, 54, 63, 7, 14, 21, 28, 35, 42, 49, 56] },
  Zickzack: { kind: 'grid', size: 8, cells: [40, 33, 26, 35, 44, 37, 30, 39] },
  Scheibe: { kind: 'cloud', gen: (n) => Array.from({ length: n }, (_, i) => {
    const a = i * GA
    const r = 0.4 * Math.sqrt((i + 0.5) / n)
    return [0.5 + Math.cos(a) * r, 0.5 + Math.sin(a) * r] as Pt
  }) },
  Raster: { kind: 'cloud', gen: (n) => {
    const side = Math.max(1, Math.round(Math.sqrt(n)))
    const out: Pt[] = []
    for (let r = 0; r < side; r++)
      for (let c = 0; c < side; c++)
        out.push([0.5 + (c - (side - 1) / 2) * (0.72 / Math.max(1, side)), 0.5 + (r - (side - 1) / 2) * (0.72 / Math.max(1, side))])
    return out
  } },
  Streu: { kind: 'cloud', gen: (n) => {
    const rnd = mulberry(7777)
    return Array.from({ length: n }, () => [0.12 + rnd() * 0.76, 0.12 + rnd() * 0.76] as Pt)
  } },
  Orbit: { kind: 'cloud', gen: (n) => {
    const inner = Math.min(8, Math.floor(n / 3))
    const outer = Math.max(0, n - inner - 1)
    const out: Pt[] = [[0.5, 0.5]]
    for (let i = 0; i < inner; i++) {
      const a = (i * Math.PI * 2) / Math.max(1, inner)
      out.push([0.5 + Math.cos(a) * 0.18, 0.5 + Math.sin(a) * 0.13])
    }
    for (let i = 0; i < outer; i++) {
      const a = (i * Math.PI * 2) / Math.max(1, outer) + 0.4
      out.push([0.5 + Math.cos(a) * 0.38, 0.5 + Math.sin(a) * 0.28])
    }
    return out
  } },
}

// ---------- Bogenlängen-Verteilung entlang von Pfaden ----------
type SegCache = { poly: Pt[]; cum: number[]; L: number }
function segCache(poly: Pt[]): SegCache {
  const cum = [0]
  let L = 0
  for (let i = 1; i < poly.length; i++) {
    L += Math.hypot(poly[i][0] - poly[i - 1][0], poly[i][1] - poly[i - 1][1])
    cum.push(L)
  }
  return { poly, cum, L }
}
function pointAt(s: SegCache, d: number): Pt {
  const { poly, cum } = s
  if (d <= 0) return poly[0]
  if (d >= s.L) return poly[poly.length - 1]
  let lo = 0
  while (cum[lo + 1] < d) lo++
  const t = (d - cum[lo]) / Math.max(1e-9, cum[lo + 1] - cum[lo])
  return [
    poly[lo][0] + (poly[lo + 1][0] - poly[lo][0]) * t,
    poly[lo][1] + (poly[lo + 1][1] - poly[lo][1]) * t,
  ]
}
/** n Punkte gleichmäßig über alle Subpfade (nach Bogenlänge, Reihenfolge bleibt). */
function samplePathsByCount(paths: Pt[][], n: number): Pt[] {
  const segs = paths.map(segCache).filter((s) => s.L > 1e-9)
  if (!segs.length) return [[0.5, 0.5]]
  const total = segs.reduce((a, s) => a + s.L, 0)
  // Punkte proportional zur Länge auf die Subpfade verteilen
  const counts = segs.map((s) => Math.max(1, Math.round((n * s.L) / total)))
  let diff = n - counts.reduce((a, b) => a + b, 0)
  for (let i = 0; diff !== 0 && i < counts.length; i++) {
    counts[i] += Math.sign(diff)
    diff -= Math.sign(diff)
  }
  const out: Pt[] = []
  segs.forEach((s, k) => {
    const m = counts[k]
    for (let i = 0; i < m; i++) {
      const d = m === 1 ? s.L / 2 : (i / (m - 1)) * s.L
      out.push(pointAt(s, d))
    }
  })
  return out
}
/** Punkte mit festem Abstand (normiert) entlang jedes Subpfads. */
function samplePathsBySpacing(paths: Pt[][], spacing: number): Pt[] {
  const out: Pt[] = []
  for (const poly of paths) {
    const s = segCache(poly)
    if (s.L < 1e-9) continue
    const m = Math.max(2, Math.floor(s.L / Math.max(1e-6, spacing)) + 1)
    const step = s.L / (m - 1)
    for (let i = 0; i < m; i++) out.push(pointAt(s, i * step))
  }
  return out.length ? out : [[0.5, 0.5]]
}

// ---------- Farb-Logik ----------
type PatternKey = 'zufall' | 'jede3' | 'rand' | 'zentrum' | 'letzte'
const PATTERNS: Record<PatternKey, string> = {
  zufall: 'Zufall', jede3: 'Jede 3.', rand: 'Rand', zentrum: 'Zentrum', letzte: 'Die Letzten',
}
type StateColors = { base: string; accent: string; amount: number; pattern: PatternKey }

type Dot = {
  a: Pt; b: Pt; seed: number
  accentA: boolean; accentB: boolean
  brushA: 0 | 1 | -1; brushB: 0 | 1 | -1
}

type Verteilung = 'anzahl' | 'abstand'
type Params = {
  weg: number; organik: number; ruecksicht: number; welle: number
  tempo: number; groesse: number; anzahl: number
  raster: boolean; gridSize: number; fuellung: number; ensemble: number
  verteilung: Verteilung; abstandPx: number
  colorsA: StateColors; colorsB: StateColors
  flug: boolean; flugFarbe: string
  blitz: boolean; blitzFarbe: string
  theme: ThemeKey; format: FormatKey
  shapeA: string; shapeB: string
  seed: number
}
const DEFAULTS: Params = {
  weg: 0.35, organik: 0.25, ruecksicht: 0.3, welle: 0.4,
  tempo: 1.6, groesse: 9, anzahl: 120,
  raster: true, gridSize: 8, fuellung: 1.02, ensemble: 16,
  verteilung: 'anzahl', abstandPx: 40,
  colorsA: { base: CI.ink, accent: CI.brand, amount: 0.15, pattern: 'zufall' },
  colorsB: { base: CI.ink, accent: CI.green, amount: 0.25, pattern: 'letzte' },
  flug: false, flugFarbe: CI.cyan,
  blitz: true, blitzFarbe: CI.green,
  theme: 'hell', format: '16:9',
  shapeA: 'Streu', shapeB: 'Welle',
  seed: 1,
}

function hexLerp(h1: string, h2: string, t: number): string {
  const p = (h: string) => [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)]
  const [r1, g1, b1] = p(h1); const [r2, g2, b2] = p(h2)
  const c = (a: number, b: number) => Math.round(a + (b - a) * t)
  return `rgb(${c(r1, r2)},${c(g1, g2)},${c(b1, b2)})`
}
const smooth = (t: number) => t * t * (3 - 2 * t)
function rgbToHex(c: string): string {
  if (c.startsWith('#')) return c
  const m = c.match(/rgb\((\d+),(\d+),(\d+)\)/)
  if (!m) return '#000000'
  return '#' + [m[1], m[2], m[3]].map((v) => (+v).toString(16).padStart(2, '0')).join('')
}

function resample(pts: Pt[], n: number): Pt[] {
  if (pts.length === 0) return [[0.5, 0.5]]
  if (pts.length === n) return pts
  const out: Pt[] = []
  for (let i = 0; i < n; i++) out.push(pts[Math.floor((i * pts.length) / n) % pts.length])
  return out
}

// ---------- Grid-Logik: alles snappt auf Zellmitten ----------
const GRID_AREA = 0.8 // Grid nimmt 80 % der kurzen Bühnenseite ein
function cellCenter(idx: number, g: number): Pt {
  const c = idx % g; const r = Math.floor(idx / g)
  return [0.5 - GRID_AREA / 2 + ((c + 0.5) * GRID_AREA) / g,
          0.5 - GRID_AREA / 2 + ((r + 0.5) * GRID_AREA) / g]
}
function snapCell(q: Pt, g: number): number {
  const c = Math.min(g - 1, Math.max(0, Math.floor(((q[0] - (0.5 - GRID_AREA / 2)) / GRID_AREA) * g)))
  const r = Math.min(g - 1, Math.max(0, Math.floor(((q[1] - (0.5 - GRID_AREA / 2)) / GRID_AREA) * g)))
  return r * g + c
}
/** Form aufs Grid rastern → Zellmitten in stabiler Reihenfolge (dedupe). */
function rasterize(def: ShapeDef, g: number): Pt[] {
  let raw: Pt[] = []
  if (def.kind === 'grid') {
    const scale = def.size === g ? null : g / def.size
    const cells = scale === null
      ? def.cells
      : Array.from(new Set(def.cells.map((i) => {
          const c = i % def.size; const r = Math.floor(i / def.size)
          const nc = Math.min(g - 1, Math.round(((c + 0.5) * g) / def.size - 0.5))
          const nr = Math.min(g - 1, Math.round(((r + 0.5) * g) / def.size - 0.5))
          return nr * g + nc
        })))
    return cells.map((i) => cellCenter(i, g))
  }
  // Kurven-Formen: Punkte sitzen AUF dem Pfad, Schrittmaß = Zellgröße
  // (konsistente Abstände, aber ein Kreis bleibt wirklich rund).
  if (def.kind === 'path') return samplePathsBySpacing(def.paths, GRID_AREA / g)
  // Wolken (Bilder, Streu …): aufs Grid gesnappt = Pixel-Look
  raw = def.gen(g * g)
  const seen = new Set<number>()
  const out: Pt[] = []
  for (const q of raw) {
    const idx = snapCell(q, g)
    if (seen.has(idx)) continue
    seen.add(idx)
    out.push(cellCenter(idx, g))
  }
  return out.length ? out : [cellCenter(Math.floor((g * g) / 2), g)]
}
/** Effektive Punktgröße in px: im Grid aus der Zelle, sonst frei. */
function effSize(p: Params, S: number): number {
  if (!p.raster) return p.groesse
  return ((S * GRID_AREA) / p.gridSize) * p.fuellung
}

function pointsFor(def: ShapeDef, p: Params, S: number): Pt[] {
  if (p.raster) return rasterize(def, p.gridSize)
  if (def.kind === 'grid') return def.cells.map((i) => cellCenter(i, def.size))
  if (def.kind === 'cloud') return def.gen(Math.max(1, p.anzahl))
  if (p.verteilung === 'abstand') return samplePathsBySpacing(def.paths, p.abstandPx / S)
  return samplePathsByCount(def.paths, Math.max(1, p.anzahl))
}

function buildDots(p: Params, registry: Record<string, ShapeDef>): { dots: Dot[]; nA: number; nB: number } {
  const defA = registry[p.shapeA] || BASE_SHAPES.Kreis
  const defB = registry[p.shapeB] || BASE_SHAPES.Kreis
  const [W, H] = FORMATS[p.format]
  const S = Math.min(W, H)
  let A: Pt[]; let B: Pt[]
  let nA: number; let nB: number
  if (p.raster) {
    // ENSEMBLE: feste Truppe — jede Form hat EXAKT N sichtbare Plätze.
    // Zu kleine Patterns werden mit Nachbarzellen aufgefüllt (Form wird
    // minimal dicker), zu große gleichmäßig ausgedünnt — nie gestapelt.
    const N = Math.max(1, p.ensemble)
    const g = p.gridSize
    const padGridCells = (cells: number[], target: number): number[] => {
      if (cells.length > target) {
        const r: number[] = []
        for (let i = 0; i < target; i++) r.push(cells[Math.floor((i * cells.length) / target)])
        return r
      }
      const out = cells.slice()
      const used = new Set(out)
      let k = 0
      while (out.length < target && k < 600) {
        const pos = k % out.length
        const src = out[pos]
        const c = src % g; const r = Math.floor(src / g)
        let placed = false
        for (let ring = 1; ring <= 3 && !placed; ring++) {
          for (let dr = -ring; dr <= ring && !placed; dr++) {
            for (let dc = -ring; dc <= ring && !placed; dc++) {
              if (Math.max(Math.abs(dr), Math.abs(dc)) !== ring) continue
              const nr = r + dr; const nc = c + dc
              if (nr < 0 || nc < 0 || nr >= g || nc >= g) continue
              const idx = nr * g + nc
              if (used.has(idx)) continue
              used.add(idx)
              out.splice(pos + 1, 0, idx)
              placed = true
            }
          }
        }
        k++
      }
      return out
    }
    const ptsExact = (def: ShapeDef): Pt[] => {
      if (def.kind === 'path') return samplePathsByCount(def.paths, N)
      const cells = rasterize(def, g).map((q) => snapCell(q, g))
      return padGridCells(Array.from(new Set(cells)), N).map((i) => cellCenter(i, g))
    }
    A = ptsExact(defA); B = ptsExact(defB)
    nA = N; nB = N
  } else {
    A = pointsFor(defA, p, S)
    B = pointsFor(defB, p, S)
    nA = A.length; nB = B.length
    const n = Math.max(A.length, B.length)
    A = resample(A, n); B = resample(B, n)
  }
  // Matching: Pfad→Pfad folgt der Pfad-Reihenfolge (schöne Wellen),
  // sobald eine Wolke beteiligt ist, wird nach Winkel gepaart (kurze Wege).
  const bothPaths = defA.kind !== 'cloud' && defB.kind !== 'cloud'
  let pairsA = A.map((q, i) => ({ q, i }))
  let pairsB = B.map((q, i) => ({ q, i }))
  if (!bothPaths) {
    const cent = (pts: Pt[]): Pt => [
      pts.reduce((s, q) => s + q[0], 0) / pts.length,
      pts.reduce((s, q) => s + q[1], 0) / pts.length,
    ]
    const ca = cent(A); const cb = cent(B)
    pairsA = A.map((q, i) => ({ q, i, a: Math.atan2(q[1] - ca[1], q[0] - ca[0]) }))
      .sort((u, v) => (u as { a: number }).a - (v as { a: number }).a)
    pairsB = B.map((q, i) => ({ q, i, a: Math.atan2(q[1] - cb[1], q[0] - cb[0]) }))
      .sort((u, v) => (u as { a: number }).a - (v as { a: number }).a)
  }
  // Seed aus den Positionen: deckungsgleiche Duplikate fliegen identisch
  // und liegen dadurch immer exakt übereinander (unsichtbar statt doppelt).
  const dots = pairsA.map((ea, k) => {
    const q1 = ea.q; const q2 = pairsB[k].q
    const h = Math.abs(Math.round(q1[0] * 99730 + q1[1] * 88871 + q2[0] * 77410 + q2[1] * 65530 + p.seed * 101))
    return {
      a: q1, b: q2, seed: h,
      accentA: false, accentB: false, brushA: 0 as const, brushB: 0 as const,
    }
  })
  return { dots, nA, nB }
}

function applyPattern(dots: Dot[], which: 'A' | 'B', cfg: StateColors, seed: number) {
  const pts = dots.map((d) => (which === 'A' ? d.a : d.b))
  const c: Pt = [
    pts.reduce((s, q) => s + q[0], 0) / pts.length,
    pts.reduce((s, q) => s + q[1], 0) / pts.length,
  ]
  const dist = pts.map((q) => Math.hypot(q[0] - c[0], q[1] - c[1]))
  const maxD = Math.max(...dist, 1e-9)
  const rnd = mulberry(seed * 31337 + (which === 'A' ? 1 : 2))
  dots.forEach((d, i) => {
    let on = false
    switch (cfg.pattern) {
      case 'zufall': on = rnd() < cfg.amount; break
      case 'jede3': on = i % 3 === 0 && rnd() < cfg.amount * 3; break
      case 'rand': on = dist[i] > maxD * (1 - cfg.amount); break
      case 'zentrum': on = dist[i] < maxD * cfg.amount; break
      case 'letzte': on = i > dots.length * (1 - cfg.amount); break
    }
    if (which === 'A') d.accentA = on
    else d.accentB = on
  })
}

// Deterministische Position eines Dots zur Zeit tt (0..1)
function dotPos(d: Dot, tt: number, p: Params, all: Dot[], idx: number): Pt {
  const r1 = mulberry(d.seed)
  const sway = (r1() - 0.5) * 2
  const swirl = (r1() - 0.5) * 2
  const mx = (d.a[0] + d.b[0]) / 2; const my = (d.a[1] + d.b[1]) / 2
  const dx = d.b[0] - d.a[0]; const dy = d.b[1] - d.a[1]
  const len = Math.hypot(dx, dy) || 0.0001
  const px = -dy / len; const py = dx / len
  const randAmp = Math.max(0, p.weg - 0.5) * 2
  const cx = mx + px * sway * p.weg * 0.45 + swirl * randAmp * 0.25
  const cy = my + py * sway * p.weg * 0.45 + (r1() - 0.5) * randAmp * 0.5
  const u = 1 - tt
  let x = u * u * d.a[0] + 2 * u * tt * cx + tt * tt * d.b[0]
  let y = u * u * d.a[1] + 2 * u * tt * cy + tt * tt * d.b[1]
  const bell = Math.sin(Math.PI * Math.min(1, Math.max(0, tt)))
  const w1 = Math.sin(tt * 6.2 + d.seed % 7) * 0.5 + Math.sin(tt * 11.7 + (d.seed % 13)) * 0.5
  const w2 = Math.cos(tt * 5.1 + d.seed % 11) * 0.5 + Math.sin(tt * 9.3 + (d.seed % 5)) * 0.5
  x += w1 * p.organik * 0.05 * bell
  y += w2 * p.organik * 0.05 * bell
  if (p.ruecksicht > 0.01 && bell > 0.05) {
    let ox = 0; let oy = 0
    const gsz = p.raster ? (GRID_AREA / p.gridSize) * p.fuellung * 900 : p.groesse
    const R = Math.max(0.05, (gsz * 1.4) / 900)
    const step = all.length > 220 ? 2 : 1
    for (let j = 0; j < all.length; j += step) {
      if (j === idx) continue
      const o = all[j]
      const ax = u * u * o.a[0] + 2 * u * tt * ((o.a[0] + o.b[0]) / 2) + tt * tt * o.b[0]
      const ay = u * u * o.a[1] + 2 * u * tt * ((o.a[1] + o.b[1]) / 2) + tt * tt * o.b[1]
      const ddx = x - ax; const ddy = y - ay
      const dd = Math.hypot(ddx, ddy)
      if (dd < R && dd > 0.0001) {
        const f = ((R - dd) / R) ** 2
        ox += (ddx / dd) * f; oy += (ddy / dd) * f
      }
    }
    x += ox * p.ruecksicht * 0.03 * bell
    y += oy * p.ruecksicht * 0.03 * bell
  }
  return [x, y]
}

function dotColor(d: Dot, tt: number, dir: 1 | -1, p: Params): string {
  const isAccentA = d.brushA !== 0 ? d.brushA === 1 : d.accentA
  const isAccentB = d.brushB !== 0 ? d.brushB === 1 : d.accentB
  const colA = isAccentA ? p.colorsA.accent : p.colorsA.base
  const colB = isAccentB ? p.colorsB.accent : p.colorsB.base
  let col = hexLerp(colA, colB, smooth(tt))
  if (p.flug) {
    const bell = Math.sin(Math.PI * tt)
    col = hexLerp(rgbToHex(col), p.flugFarbe, bell * 0.85)
  }
  if (p.blitz) {
    const target = dir === 1 ? 1 : 0
    const dist = Math.abs(tt - target)
    if (dist < 0.12) col = hexLerp(rgbToHex(col), p.blitzFarbe, 1 - dist / 0.12)
  }
  return col
}

const HOLD = 0.55
function loopT(time: number, tempo: number): { tt: number; dir: 1 | -1 } {
  const cycle = tempo * 2 + HOLD * 2
  const m = time % cycle
  if (m < tempo) return { tt: m / tempo, dir: 1 }
  if (m < tempo + HOLD) return { tt: 1, dir: 1 }
  if (m < tempo * 2 + HOLD) return { tt: 1 - (m - tempo - HOLD) / tempo, dir: -1 }
  return { tt: 0, dir: -1 }
}
const easeInOut = (t: number) => (t < 0.5 ? 2 * t * t : 1 - (-2 * t + 2) ** 2 / 2)
function localT(tt: number, i: number, n: number, welle: number): number {
  if (welle <= 0.01) return easeInOut(tt)
  const spread = welle * 0.6
  const delay = (i / Math.max(1, n)) * spread
  const t = Math.min(1, Math.max(0, (tt - delay) / (1 - spread)))
  return easeInOut(t)
}

type Variant = { name: string; params: Params }

// SVG-Datei → Pfad-Shape (Dots folgen dem echten Path)
async function svgToShape(file: File): Promise<ShapeDef | null> {
  const text = await file.text()
  const holder = document.createElement('div')
  holder.style.position = 'absolute'
  holder.style.left = '-99999px'
  holder.innerHTML = text
  document.body.appendChild(holder)
  try {
    const svg = holder.querySelector('svg')
    if (!svg) return null
    const geo = svg.querySelectorAll<SVGGeometryElement>('path, circle, rect, line, polyline, polygon, ellipse')
    if (!geo.length) return null
    const raw: Pt[][] = []
    geo.forEach((el) => {
      let L = 0
      try { L = el.getTotalLength() } catch { return }
      if (L <= 0) return
      const samples = Math.max(24, Math.min(400, Math.round(L)))
      const poly: Pt[] = []
      for (let i = 0; i <= samples; i++) {
        const pt = el.getPointAtLength((i / samples) * L)
        poly.push([pt.x, pt.y])
      }
      raw.push(poly)
    })
    if (!raw.length) return null
    // normalisieren auf 0..1 (zentriert, 76 % Fläche)
    const all = raw.flat()
    const xs = all.map((q) => q[0]); const ys = all.map((q) => q[1])
    const minX = Math.min(...xs); const maxX = Math.max(...xs)
    const minY = Math.min(...ys); const maxY = Math.max(...ys)
    const span = Math.max(maxX - minX, maxY - minY) || 1
    const paths = raw.map((poly) => poly.map((q) => [
      0.5 + (q[0] - (minX + maxX) / 2) / span * 0.76,
      0.5 + (q[1] - (minY + maxY) / 2) / span * 0.76,
    ] as Pt))
    return { kind: 'path', paths }
  } finally {
    document.body.removeChild(holder)
  }
}

export default function DotsPage() {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const [params, setParams] = useState<Params>(() => {
    try {
      const raw = localStorage.getItem('fonio-dots-v2')
      if (raw) return { ...DEFAULTS, ...JSON.parse(raw) }
    } catch { /* ignore */ }
    return DEFAULTS
  })
  const [playing, setPlaying] = useState(true)
  const [scrub, setScrub] = useState(0)
  const [brushMode, setBrushMode] = useState<'aus' | 'A' | 'B'>('aus')
  const [brushErase, setBrushErase] = useState(false)
  const [activeSlot, setActiveSlot] = useState<'A' | 'B'>('B')
  const [counts, setCounts] = useState<{ nA: number; nB: number }>({ nA: 0, nB: 0 })
  const [variants, setVariants] = useState<Variant[]>(() => {
    try { return JSON.parse(localStorage.getItem('fonio-dots-variants-v1') || '[]') } catch { return [] }
  })
  const [customShapes, setCustomShapes] = useState<Record<string, ShapeDef>>({})
  const [customGrids, setCustomGrids] = useState<Record<string, { size: number; cells: number[] }>>(() => {
    try { return JSON.parse(localStorage.getItem('fonio-dots-grids-v1') || '{}') } catch { return {} }
  })
  const [editing, setEditing] = useState<number[] | null>(null)
  const [exportMode, setExportMode] = useState<'baked' | 'slim'>('baked')

  const gridDefs: Record<string, ShapeDef> = Object.fromEntries(
    Object.entries(customGrids).map(([k, v]) => [k, { kind: 'grid', size: v.size, cells: v.cells } as ShapeDef]),
  )
  const registry: Record<string, ShapeDef> = { ...BASE_SHAPES, ...gridDefs, ...customShapes }

  const dotsRef = useRef<Dot[]>([])
  const paramsRef = useRef(params)
  const timeRef = useRef(0)
  const playRef = useRef(true)
  const scrubRef = useRef(0)
  const brushRef = useRef<{ mode: 'aus' | 'A' | 'B'; erase: boolean }>({ mode: 'aus', erase: false })
  const editingRef = useRef<number[] | null>(null)

  paramsRef.current = params
  playRef.current = playing
  scrubRef.current = scrub
  brushRef.current = { mode: brushMode, erase: brushErase }
  editingRef.current = editing

  useEffect(() => {
    const { dots, nA, nB } = buildDots(params, registry)
    applyPattern(dots, 'A', params.colorsA, params.seed)
    applyPattern(dots, 'B', params.colorsB, params.seed)
    dotsRef.current = dots
    setCounts({ nA, nB })
  }, [params.shapeA, params.shapeB, params.anzahl, params.seed,
      params.verteilung, params.abstandPx, params.format,
      params.raster, params.gridSize, params.ensemble,
      params.colorsA.amount, params.colorsA.pattern, params.colorsB.amount, params.colorsB.pattern,
      customShapes])

  useEffect(() => {
    localStorage.setItem('fonio-dots-v2', JSON.stringify(params))
  }, [params])

  useEffect(() => {
    let raf = 0
    let last = performance.now()
    const draw = () => {
      raf = requestAnimationFrame(draw)
      const now = performance.now()
      const dt = (now - last) / 1000
      last = now
      if (playRef.current) timeRef.current += dt
      const p = paramsRef.current
      const canvas = canvasRef.current
      if (!canvas) return
      const [W, H] = FORMATS[p.format]
      if (canvas.width !== W) { canvas.width = W; canvas.height = H }
      const ctx = canvas.getContext('2d')!
      ctx.fillStyle = THEMES[p.theme].bg
      ctx.fillRect(0, 0, W, H)
      const S = Math.min(W, H)
      const ox = (W - S) / 2; const oy = (H - S) / 2
      const size = effSize(p, S)
      // Mal-Editor: Grid + belegte Zellen statt Animation
      const ed = editingRef.current
      if (ed) {
        const g = p.gridSize
        ctx.strokeStyle = 'rgba(113,113,122,0.25)'
        ctx.lineWidth = 1
        const a0 = 0.5 - GRID_AREA / 2
        for (let i = 0; i <= g; i++) {
          const t = a0 + (i * GRID_AREA) / g
          ctx.beginPath(); ctx.moveTo(ox + a0 * S, oy + t * S); ctx.lineTo(ox + (a0 + GRID_AREA) * S, oy + t * S); ctx.stroke()
          ctx.beginPath(); ctx.moveTo(ox + t * S, oy + a0 * S); ctx.lineTo(ox + t * S, oy + (a0 + GRID_AREA) * S); ctx.stroke()
        }
        for (let idx = 0; idx < g * g; idx++) {
          const [x, y] = cellCenter(idx, g)
          const on = ed.includes(idx)
          ctx.fillStyle = on ? p.colorsB.base : 'rgba(113,113,122,0.14)'
          ctx.beginPath()
          ctx.arc(ox + x * S, oy + y * S, on ? size / 2 : 3, 0, Math.PI * 2)
          ctx.fill()
        }
        return
      }
      const { tt, dir } = playRef.current
        ? loopT(timeRef.current, p.tempo)
        : { tt: scrubRef.current, dir: 1 as const }
      const dots = dotsRef.current
      for (let i = 0; i < dots.length; i++) {
        const lt = localT(tt, i, dots.length, p.welle)
        const [x, y] = dotPos(dots[i], lt, p, dots, i)
        ctx.fillStyle = dotColor(dots[i], lt, dir, p)
        ctx.beginPath()
        ctx.arc(ox + x * S, oy + y * S, size / 2, 0, Math.PI * 2)
        ctx.fill()
      }
    }
    raf = requestAnimationFrame(draw)
    return () => cancelAnimationFrame(raf)
  }, [])

  // Pinsel
  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    let down = false
    let paintOn = true
    const paint = (e: PointerEvent) => {
      const p = paramsRef.current
      const rect = canvas.getBoundingClientRect()
      const [W, H] = FORMATS[p.format]
      const mx = ((e.clientX - rect.left) / rect.width) * W
      const my = ((e.clientY - rect.top) / rect.height) * H
      const S = Math.min(W, H)
      const ox = (W - S) / 2; const oy = (H - S) / 2
      // Mal-Editor: Zellen setzen/löschen
      const ed = editingRef.current
      if (ed) {
        const q: Pt = [(mx - ox) / S, (my - oy) / S]
        const a0 = 0.5 - GRID_AREA / 2
        if (q[0] < a0 || q[0] > a0 + GRID_AREA || q[1] < a0 || q[1] > a0 + GRID_AREA) return
        const idx = snapCell(q, p.gridSize)
        const has = ed.includes(idx)
        if (e.type === 'pointerdown') paintOn = !has
        if (paintOn && !has) editingRef.current = [...ed, idx]
        if (!paintOn && has) editingRef.current = ed.filter((i) => i !== idx)
        setEditing(editingRef.current)
        return
      }
      const br = brushRef.current
      if (br.mode === 'aus') return
      const R = Math.max(34, effSize(p, S))
      for (const d of dotsRef.current) {
        const q = br.mode === 'A' ? d.a : d.b
        const qx = ox + q[0] * S; const qy = oy + q[1] * S
        if (Math.hypot(qx - mx, qy - my) < R) {
          if (br.mode === 'A') d.brushA = br.erase ? -1 : 1
          else d.brushB = br.erase ? -1 : 1
        }
      }
    }
    const onDown = (e: PointerEvent) => { down = true; paint(e) }
    const onMove = (e: PointerEvent) => { if (down) paint(e) }
    const onUp = () => { down = false }
    canvas.addEventListener('pointerdown', onDown)
    window.addEventListener('pointermove', onMove)
    window.addEventListener('pointerup', onUp)
    return () => {
      canvas.removeEventListener('pointerdown', onDown)
      window.removeEventListener('pointermove', onMove)
      window.removeEventListener('pointerup', onUp)
    }
  }, [])

  // Drop: SVG → Pfad-Shape, PNG/JPG → Punktwolke
  const handleFile = async (file: File) => {
    if (file.type === 'image/svg+xml' || file.name.toLowerCase().endsWith('.svg')) {
      const def = await svgToShape(file)
      if (!def) { alert('Im SVG wurde kein Pfad gefunden.'); return }
      const name = `SVG: ${file.name.slice(0, 14)}`
      setCustomShapes((s) => ({ ...s, [name]: def }))
      setParams((p) => ({ ...p, [activeSlot === 'A' ? 'shapeA' : 'shapeB']: name }))
      return
    }
    const img = new Image()
    img.onload = () => {
      const c = document.createElement('canvas')
      const size = 96
      c.width = size; c.height = size
      const cx = c.getContext('2d')!
      cx.drawImage(img, 0, 0, size, size)
      const data = cx.getImageData(0, 0, size, size).data
      const pts: Pt[] = []
      for (let y = 0; y < size; y++) {
        for (let x = 0; x < size; x++) {
          const k = (y * size + x) * 4
          const a = data[k + 3]
          const lum = (data[k] * 0.3 + data[k + 1] * 0.59 + data[k + 2] * 0.11) / 255
          if (a > 128 && lum < 0.62) pts.push([x / size, y / size])
        }
      }
      if (pts.length < 10) { alert('Zu wenig dunkle Fläche erkannt — dunkles Logo auf hellem Grund funktioniert am besten.'); return }
      const xs = pts.map((q) => q[0]); const ys = pts.map((q) => q[1])
      const minX = Math.min(...xs); const maxX = Math.max(...xs)
      const minY = Math.min(...ys); const maxY = Math.max(...ys)
      const span = Math.max(maxX - minX, maxY - minY) || 1
      const norm = pts.map((q) => [
        0.5 + (q[0] - (minX + maxX) / 2) / span * 0.76,
        0.5 + (q[1] - (minY + maxY) / 2) / span * 0.76,
      ] as Pt)
      const name = `Bild: ${file.name.slice(0, 14)}`
      setCustomShapes((s) => ({ ...s, [name]: { kind: 'cloud', gen: (n) => resample(norm, n) } }))
      setParams((p) => ({ ...p, [activeSlot === 'A' ? 'shapeA' : 'shapeB']: name }))
    }
    img.src = URL.createObjectURL(file)
  }

  // Export
  const doExport = () => {
    const p = paramsRef.current
    const dots = dotsRef.current
    const [W, H] = FORMATS[p.format]
    const S0 = Math.min(W, H)
    const fps = 30
    const frames = Math.round(p.tempo * fps)
    const out: Record<string, unknown> = {
      tool: 'fonio-dots', version: 2, mode: exportMode,
      width: W, height: H, fps, durationSec: p.tempo,
      bg: THEMES[p.theme].bg, dotSize: Math.round(effSize(p, S0) * 10) / 10,
      params: { weg: p.weg, organik: p.organik, ruecksicht: p.ruecksicht, welle: p.welle },
    }
    const S = Math.min(W, H)
    const ox = (W - S) / 2; const oy = (H - S) / 2
    if (exportMode === 'baked') {
      out.dots = dots.map((d, i) => {
        const pos: number[] = []
        const col: string[] = []
        for (let f = 0; f <= frames; f++) {
          const lt = localT(f / frames, i, dots.length, p.welle)
          const [x, y] = dotPos(d, lt, p, dots, i)
          pos.push(Math.round((ox + x * S) * 10) / 10, Math.round((oy + y * S) * 10) / 10)
          col.push(rgbToHex(dotColor(d, lt, 1, p)))
        }
        return { pos, col }
      })
    } else {
      out.dots = dots.map((d, i) => {
        const delay = (i / dots.length) * p.welle * 0.6 * p.tempo
        const isA = d.brushA !== 0 ? d.brushA === 1 : d.accentA
        const isB = d.brushB !== 0 ? d.brushB === 1 : d.accentB
        return {
          a: [ox + d.a[0] * S, oy + d.a[1] * S],
          b: [ox + d.b[0] * S, oy + d.b[1] * S],
          delay: Math.round(delay * 1000) / 1000,
          dur: Math.round((p.tempo - p.welle * 0.6 * p.tempo) * 1000) / 1000,
          colA: isA ? p.colorsA.accent : p.colorsA.base,
          colB: isB ? p.colorsB.accent : p.colorsB.base,
          blitz: p.blitz ? p.blitzFarbe : null,
        }
      })
    }
    const blob = new Blob([JSON.stringify(out)], { type: 'application/json' })
    const aTag = document.createElement('a')
    aTag.href = URL.createObjectURL(blob)
    aTag.download = `fonio-dots-${exportMode}.json`
    aTag.click()
  }
  const doPng = () => {
    const canvas = canvasRef.current
    if (!canvas) return
    const aTag = document.createElement('a')
    aTag.href = canvas.toDataURL('image/png')
    aTag.download = 'fonio-dots.png'
    aTag.click()
  }

  const saveVariant = () => {
    const v: Variant = { name: `${params.shapeA}→${params.shapeB} #${variants.length + 1}`, params: JSON.parse(JSON.stringify(params)) }
    const next = [...variants, v].slice(-12)
    setVariants(next)
    localStorage.setItem('fonio-dots-variants-v1', JSON.stringify(next))
  }

  const set = <K extends keyof Params>(k: K, v: Params[K]) => setParams((p) => ({ ...p, [k]: v }))
  const setCol = (which: 'A' | 'B', patch: Partial<StateColors>) =>
    setParams((p) => ({ ...p, [which === 'A' ? 'colorsA' : 'colorsB']: { ...(which === 'A' ? p.colorsA : p.colorsB), ...patch } }))

  const shapeNames = Object.keys(registry)

  const Slider = (label: string, k: 'weg' | 'organik' | 'ruecksicht' | 'welle', lo: string, hi: string) => (
    <label className="dots-field">
      <span className="dots-label">{label}</span>
      <input type="range" min={0} max={1} step={0.01} value={params[k]}
        onChange={(e) => set(k, parseFloat(e.target.value))} />
      <span className="dots-minmax"><i>{lo}</i><i>{hi}</i></span>
    </label>
  )

  const Swatches = (value: string, onPick: (c: string) => void) => (
    <div className="dots-swatches">
      {PALETTE.map((c) => (
        <button key={c} className={`dots-swatch${value === c ? ' on' : ''}`}
          style={{ background: c, borderColor: c === '#ffffff' ? '#ddd' : c }}
          onClick={() => onPick(c)} title={c} />
      ))}
    </div>
  )

  const ColorBlock = (which: 'A' | 'B') => {
    const cfg = which === 'A' ? params.colorsA : params.colorsB
    return (
      <div className="dots-colorblock">
        <div className="dots-subhead">Form {which}</div>
        <span className="dots-label">Basis</span>
        {Swatches(cfg.base, (c) => setCol(which, { base: c }))}
        <span className="dots-label">Akzent</span>
        {Swatches(cfg.accent, (c) => setCol(which, { accent: c }))}
        <label className="dots-field">
          <span className="dots-label">Akzent-Anteil {(cfg.amount * 100) | 0} %</span>
          <input type="range" min={0} max={1} step={0.05} value={cfg.amount}
            onChange={(e) => setCol(which, { amount: parseFloat(e.target.value) })} />
        </label>
        <div className="dots-chips">
          {(Object.keys(PATTERNS) as PatternKey[]).map((k) => (
            <button key={k} className={`dots-chip${cfg.pattern === k ? ' on' : ''}`}
              onClick={() => setCol(which, { pattern: k })}>{PATTERNS[k]}</button>
          ))}
        </div>
      </div>
    )
  }

  return (
    <div className="dots-page">
      <aside className="dots-left">
        <div className="dots-subhead">Formen</div>
        <div className="dots-slots">
          <button className={`dots-slot${activeSlot === 'A' ? ' on' : ''}`}
            onClick={() => setActiveSlot('A')}>
            <span className="dots-slot-tag">Start A</span>
            <b>{params.shapeA}</b>
          </button>
          <button className="dots-btn" title="A und B tauschen"
            onClick={() => setParams((p) => ({ ...p, shapeA: p.shapeB, shapeB: p.shapeA }))}>⇄</button>
          <button className={`dots-slot${activeSlot === 'B' ? ' on' : ''}`}
            onClick={() => setActiveSlot('B')}>
            <span className="dots-slot-tag">Ziel B</span>
            <b>{params.shapeB}</b>
          </button>
        </div>
        <div className="dots-hint">1. Slot antippen (A oder B) · 2. Form unten wählen</div>
        <div className="dots-shapes">
          {shapeNames.map((n) => (
            <button key={n}
              className={`dots-shape${params.shapeA === n ? ' isA' : ''}${params.shapeB === n ? ' isB' : ''}`}
              onClick={() => set(activeSlot === 'A' ? 'shapeA' : 'shapeB', n)}
              title={`Wird Form ${activeSlot}`}>
              {n}
            </button>
          ))}
        </div>
        <label className="dots-drop"
          onDragOver={(e) => e.preventDefault()}
          onDrop={(e) => { e.preventDefault(); const f = e.dataTransfer.files[0]; if (f) void handleFile(f) }}>
          SVG / Logo / Bild hier reinziehen
          <input type="file" accept="image/*,.svg" hidden
            onChange={(e) => { const f = e.target.files?.[0]; if (f) void handleFile(f) }} />
          <span className="dots-hint">SVG = Dots folgen dem Pfad · PNG/JPG = Punktwolke</span>
        </label>

        <div className="dots-subhead">Raster</div>
        <div className="dots-chips">
          {[6, 8, 12, 16].map((g) => (
            <button key={g} className={`dots-chip${params.raster && params.gridSize === g ? ' on' : ''}`}
              onClick={() => setParams((p) => ({ ...p, raster: true, gridSize: g }))}>{g}×{g}</button>
          ))}
          <button className={`dots-chip${!params.raster ? ' on' : ''}`}
            onClick={() => set('raster', false)}>Frei</button>
        </div>
        {params.raster && (
          <>
            <label className="dots-field">
              <span className="dots-label">Ensemble: {params.ensemble} Dots — bleibt in JEDER Form gleich</span>
              <div className="dots-numrow">
                <input type="range" min={4} max={64} step={1} value={params.ensemble}
                  onChange={(e) => set('ensemble', parseInt(e.target.value))} />
                <input className="dots-num" type="number" min={1} max={128} value={params.ensemble}
                  onChange={(e) => set('ensemble', Math.max(1, Math.min(128, parseInt(e.target.value) || 1)))} />
              </div>
            </label>
            <label className="dots-field">
              <span className="dots-label">Füllung: {(params.fuellung * 100) | 0} % der Zelle</span>
              <input type="range" min={0.5} max={1.35} step={0.01} value={params.fuellung}
                onChange={(e) => set('fuellung', parseFloat(e.target.value))} />
              <span className="dots-minmax"><i>luftig</i><i>überlappend</i></span>
            </label>
            <div className="dots-hint">Keiner kommt, keiner geht: hat eine Form weniger Plätze, teilen sich Dots exakt deckungsgleich einen Platz — und trennen sich erst wieder im Flug.</div>
            <button className="dots-btn" onClick={() => {
              const def = registry[params.shapeB]
              const pts = def ? rasterize(def, params.gridSize) : []
              setEditing(pts.map((q) => snapCell(q, params.gridSize)))
              setPlaying(false)
            }}>✎ Form malen (Zellen anklicken)</button>
          </>
        )}
        {!params.raster && (
        <>
        <div className="dots-subhead">Verteilung</div>
        <div className="dots-chips">
          <button className={`dots-chip${params.verteilung === 'anzahl' ? ' on' : ''}`}
            onClick={() => set('verteilung', 'anzahl')}>Nach Anzahl</button>
          <button className={`dots-chip${params.verteilung === 'abstand' ? ' on' : ''}`}
            onClick={() => set('verteilung', 'abstand')}>Fester Abstand</button>
        </div>
        {params.verteilung === 'anzahl' ? (
          <label className="dots-field">
            <span className="dots-label">Punkte (1–600)</span>
            <div className="dots-numrow">
              <input type="range" min={1} max={600} step={1} value={params.anzahl}
                onChange={(e) => set('anzahl', parseInt(e.target.value))} />
              <input className="dots-num" type="number" min={1} max={600} value={params.anzahl}
                onChange={(e) => set('anzahl', Math.max(1, Math.min(600, parseInt(e.target.value) || 1)))} />
            </div>
          </label>
        ) : (
          <label className="dots-field">
            <span className="dots-label">Abstand entlang Pfad (px)</span>
            <div className="dots-numrow">
              <input type="range" min={4} max={240} step={1} value={params.abstandPx}
                onChange={(e) => set('abstandPx', parseInt(e.target.value))} />
              <input className="dots-num" type="number" min={2} max={600} value={params.abstandPx}
                onChange={(e) => set('abstandPx', Math.max(2, Math.min(600, parseInt(e.target.value) || 2)))} />
            </div>
            <span className="dots-hint">ergibt A: {counts.nA} · B: {counts.nB} Punkte (gleichmäßig nach Pfadlänge; Wolken-Formen nutzen die Anzahl)</span>
          </label>
        )}
        <label className="dots-field">
          <span className="dots-label">Punktgröße (px)</span>
          <div className="dots-numrow">
            <input type="range" min={1} max={120} step={1} value={Math.min(params.groesse, 120)}
              onChange={(e) => set('groesse', parseInt(e.target.value))} />
            <input className="dots-num" type="number" min={1} max={400} value={params.groesse}
              onChange={(e) => set('groesse', Math.max(1, Math.min(400, parseInt(e.target.value) || 1)))} />
          </div>
        </label>
        </>
        )}
      </aside>

      <main className="dots-stage">
        <canvas ref={canvasRef} className="dots-canvas"
          style={{ background: THEMES[params.theme].bg, cursor: brushMode === 'aus' ? 'default' : 'crosshair' }} />
        {editing ? (
          <div className="dots-transport">
            <button className="dots-btn dots-primary" onClick={() => {
              if (!editing.length) { alert('Mal erst ein paar Zellen an.'); return }
              const name = window.prompt('Name für diese Form:', 'Meine Form')
              if (!name) return
              const next = { ...customGrids, [name]: { size: params.gridSize, cells: editing } }
              setCustomGrids(next)
              localStorage.setItem('fonio-dots-grids-v1', JSON.stringify(next))
              setParams((p) => ({ ...p, [activeSlot === 'A' ? 'shapeA' : 'shapeB']: name }))
              setEditing(null)
              setPlaying(true)
            }}>✓ Als Form speichern</button>
            <button className="dots-btn" onClick={() => setEditing([])}>Leeren</button>
            <button className="dots-btn" onClick={() => { setEditing(null); setPlaying(true) }}>✕ Abbrechen</button>
            <span className="dots-hint">Zellen anklicken oder ziehen — {editing.length} belegt (Ziel: {params.ensemble}) · wird Form {activeSlot}</span>
          </div>
        ) : (
        <div className="dots-transport">
          <button className="dots-btn" onClick={() => setPlaying((v) => !v)}>{playing ? '⏸' : '▶'}</button>
          {!playing && (
            <input type="range" min={0} max={1} step={0.005} value={scrub}
              style={{ flex: 1 }} onChange={(e) => setScrub(parseFloat(e.target.value))} />
          )}
          <button className="dots-btn" title="Neue Zufallsvariante"
            onClick={() => set('seed', Math.floor(Math.random() * 1e6))}>🎲</button>
          <div className="dots-chips">
            {(Object.keys(FORMATS) as FormatKey[]).map((f) => (
              <button key={f} className={`dots-chip${params.format === f ? ' on' : ''}`}
                onClick={() => set('format', f)}>{f}</button>
            ))}
            {(Object.keys(THEMES) as ThemeKey[]).map((t) => (
              <button key={t} className={`dots-chip${params.theme === t ? ' on' : ''}`}
                onClick={() => set('theme', t)}>{THEMES[t].label}</button>
            ))}
          </div>
        </div>
        )}
        <div className="dots-variants">
          <button className="dots-btn" onClick={saveVariant}>+ Variante merken</button>
          {variants.map((v, i) => (
            <button key={i} className="dots-chip" onClick={() => setParams({ ...DEFAULTS, ...v.params })}>{v.name}</button>
          ))}
        </div>
      </main>

      <aside className="dots-right">
        <div className="dots-subhead">Bewegung</div>
        {Slider('Weg', 'weg', 'gerade', 'verspielt')}
        {Slider('Organik', 'organik', 'exakt', 'lebendig')}
        {Slider('Rücksicht', 'ruecksicht', 'stur', 'Schwarm')}
        {Slider('Welle', 'welle', 'gleichzeitig', 'nacheinander')}
        <label className="dots-field">
          <span className="dots-label">Tempo: {params.tempo.toFixed(1)}s</span>
          <input type="range" min={0.5} max={4} step={0.1} value={params.tempo}
            onChange={(e) => set('tempo', parseFloat(e.target.value))} />
        </label>

        <div className="dots-subhead">Farben (CI)</div>
        {ColorBlock('A')}
        {ColorBlock('B')}
        <label className="dots-check">
          <input type="checkbox" checked={params.flug} onChange={(e) => set('flug', e.target.checked)} />
          <span>Im Flug färben</span>
        </label>
        {params.flug && Swatches(params.flugFarbe, (c) => set('flugFarbe', c))}
        <label className="dots-check">
          <input type="checkbox" checked={params.blitz} onChange={(e) => set('blitz', e.target.checked)} />
          <span>Ankunfts-Blitz</span>
        </label>
        {params.blitz && Swatches(params.blitzFarbe, (c) => set('blitzFarbe', c))}

        <div className="dots-subhead">Pinsel (einzelne Punkte)</div>
        <div className="dots-chips">
          {(['aus', 'A', 'B'] as const).map((m) => (
            <button key={m} className={`dots-chip${brushMode === m ? ' on' : ''}`}
              onClick={() => setBrushMode(m)}>{m === 'aus' ? 'Aus' : `Auf Form ${m}`}</button>
          ))}
          <button className={`dots-chip${brushErase ? ' on' : ''}`}
            onClick={() => setBrushErase((v) => !v)}>Radierer</button>
        </div>
        <div className="dots-hint">Pause drücken, dann über Punkte malen — sie bekommen die Akzent-Farbe.</div>

        <div className="dots-subhead">Export</div>
        <div className="dots-chips">
          <button className={`dots-chip${exportMode === 'baked' ? ' on' : ''}`}
            onClick={() => setExportMode('baked')} title="Exakt wie hier — viele Keyframes">Exakt (baked)</button>
          <button className={`dots-chip${exportMode === 'slim' ? ' on' : ''}`}
            onClick={() => setExportMode('slim')} title="2 Keys + Kurven — in AE editierbar">Editierbar (slim)</button>
        </div>
        <button className="dots-btn dots-primary" onClick={doExport}>Nach AE exportieren (JSON)</button>
        <button className="dots-btn" onClick={doPng}>PNG-Standbild</button>
        <div className="dots-hint">In AE: Datei &gt; Skripte &gt; <b>ae/dots_import.jsx</b> ausführen, JSON wählen.</div>
      </aside>
    </div>
  )
}
