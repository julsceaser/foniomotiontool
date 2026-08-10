import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { MeshGradient } from '@paper-design/shaders-react'
import gsap from 'gsap'
import { Flip } from 'gsap/Flip'
import { loadStates, STATE_UI_COLORS, UI_COLOR_FALLBACK } from '../orbStates'
// @ts-expect-error – shared JS engine (same file the renderer uses)
import { buildFrames, clipsToMarkers, AUTO_TRANSITIONS, DEFAULT_CLIP_DURATION } from '../engine/orbTimeline.mjs'

gsap.registerPlugin(Flip)

/**
 * Export-Tab V4 — Clip-Editor mit vollständiger Transportsteuerung:
 * - Zeitlineal mit Sekunden-Ticks, Playhead über alle Spuren, ziehbar + anklickbar
 * - Transport: Anfang · Clipgrenze · Frame · Play/Pause · Stop · Frame · Clipgrenze · Ende
 * - Tastenkürzel (Leertaste, Pfeile, Shift/Alt+Pfeile, Home/End, Entf)
 * - Abspielgeschwindigkeit, framegenaue Anzeige, Snapping an Clipgrenzen
 * Drag-UX aus V3 bleibt: Kante ziehen = trimmen, Mitte ziehen = umsortieren (GSAP Flip).
 */

type Clip = { id: number; state: string; duration: number }
let nextId = 1

type Drag = { idx: number; x: number; grabDX: number; insert: number; widthPct: number }

/** Ein fertig gerechnetes Bild aus der Engine — identisch mit dem, was der Renderer schießt. */
type Frame = {
  colors: string[]; speed: number; distortion: number; swirl: number
  grainMixer: number; scale: number; soften: number; offsetX: number
  rotationSpeed: number; shaderFrame: number; rotationDeg: number
}

const SPEEDS = [0.25, 0.5, 1, 2]
const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v))

/** Auto-Sicherung: die Clip-Arbeit darf einen Reload nicht überleben müssen. */
const TL_LS_KEY = 'fonio-timeline-v1'
type SavedTimeline = { clips: Clip[]; fps: number; size: number; loop: boolean; name: string }
const loadTimeline = (): SavedTimeline | null => {
  try {
    const raw = localStorage.getItem(TL_LS_KEY)
    if (!raw) return null
    const d = JSON.parse(raw)
    if (!Array.isArray(d?.clips)) return null
    nextId = Math.max(1, ...d.clips.map((c: Clip) => (c.id ?? 0) + 1))
    return d
  } catch { return null }
}
const SAVED = typeof localStorage !== 'undefined' ? loadTimeline() : null

export default function ExportPage() {
  const states = useMemo(loadStates, [])
  const stateColor = (k: string) => STATE_UI_COLORS[k] ?? UI_COLOR_FALLBACK
  const stateLabel = (k: string) => states[k]?.label ?? k

  const [clips, setClips] = useState<Clip[]>(SAVED?.clips ?? [])
  const [selected, setSelected] = useState<number | null>(null)
  const [pickerOpen, setPickerOpen] = useState(false)
  const [fps, setFps] = useState(SAVED?.fps ?? 30)
  const [size, setSize] = useState(SAVED?.size ?? 480)
  const [loop, setLoop] = useState(SAVED?.loop ?? true)
  const [name, setName] = useState(SAVED?.name ?? 'meine-timeline')
  const [past, setPast] = useState<Clip[][]>([])
  const [future, setFuture] = useState<Clip[][]>([])
  const [playhead, setPlayhead] = useState(0)
  const [playing, setPlaying] = useState(false)
  const [speed, setSpeed] = useState(1)
  const [audioName, setAudioName] = useState('')
  const [audioBuf, setAudioBuf] = useState<AudioBuffer | null>(null)
  const [audioRms, setAudioRms] = useState<number[] | undefined>()
  const [renderMsg, setRenderMsg] = useState('')
  const [drag, setDrag] = useState<Drag | null>(null)
  const [laneW, setLaneW] = useState(1000)

  const audioEl = useRef<HTMLAudioElement | null>(null)
  const rowRef = useRef<HTMLDivElement | null>(null)
  const waveRef = useRef<HTMLCanvasElement | null>(null)
  const resizing = useRef<{ idx: number; edge: 'l' | 'r'; startX: number; startDur: number } | null>(null)
  const pendingDrag = useRef<{ idx: number; startX: number; grabDX: number; widthPct: number } | null>(null)
  const flipState = useRef<ReturnType<typeof Flip.getState> | null>(null)
  const dragRef = useRef<Drag | null>(null)
  dragRef.current = drag
  const scrubbing = useRef(false)

  const duration = Math.max(0.1, clips.reduce((s, c) => s + c.duration, 0))
  const totalFrames = Math.max(1, Math.round(duration * fps))
  const curFrame = clamp(Math.round(playhead * fps), 0, totalFrames - 1)

  const job = useMemo(() => ({
    duration, fps, loop,
    markers: clips.length ? clipsToMarkers(clips) : [{ time: 0, state: 'idle' }],
    audioRms, audioSensitivity: 0.22,
  }), [clips, duration, fps, loop, audioRms])
  const jobRef = useRef(job)
  jobRef.current = job
  const playRef = useRef(playing)
  playRef.current = playing
  const speedRef = useRef(speed)
  speedRef.current = speed
  const fpsRef = useRef(fps)
  fpsRef.current = fps

  // ---------- Clips + Verlauf (Rückgängig/Wiederherstellen) ----------
  const snapshot = () => clipsRefValue().map((c) => ({ ...c }))
  const commit = () => { setPast((p) => [...p.slice(-49), snapshot()]); setFuture([]) }
  const commitRef = useRef(commit)
  commitRef.current = commit
  const undo = () => {
    if (!past.length) return
    setFuture((f) => [snapshot(), ...f])
    setClips(past[past.length - 1])
    setPast((p) => p.slice(0, -1))
    setSelected(null)
  }
  const redo = () => {
    if (!future.length) return
    setPast((p) => [...p, snapshot()])
    setClips(future[0])
    setFuture((f) => f.slice(1))
    setSelected(null)
  }

  const addClip = (state: string) => {
    commit()
    const dur = (DEFAULT_CLIP_DURATION as Record<string, number>)[state] ?? DEFAULT_CLIP_DURATION._default
    setClips((c) => [...c, { id: nextId++, state, duration: dur }])
    setPickerOpen(false)
  }
  const patchClip = (idx: number, p: Partial<Clip>) =>
    setClips((c) => c.map((x, i) => (i === idx ? { ...x, ...p } : x)))
  const deleteClip = (idx: number) => {
    commit()
    setClips((c) => c.filter((_, i) => i !== idx))
    setSelected(null)
  }
  const clearAll = () => { commit(); setClips([]); setSelected(null); setPlayhead(0) }

  // Auto-Sicherung nach jeder Änderung
  useEffect(() => {
    try { localStorage.setItem(TL_LS_KEY, JSON.stringify({ clips, fps, size, loop, name })) } catch { /* voll */ }
  }, [clips, fps, size, loop, name])

  // ---------- Transport ----------
  const pause = () => {
    setPlaying(false)
    audioEl.current?.pause()
  }
  const seekSec = (t: number) => {
    const v = clamp(t, 0, duration)
    setPlayhead(v)
    if (audioEl.current?.src) audioEl.current.currentTime = Math.min(v, audioEl.current.duration || v)
  }
  const seekFrame = (f: number) => seekSec(clamp(f, 0, totalFrames - 1) / fps)
  const togglePlay = () => {
    const next = !playing
    setPlaying(next)
    const el = audioEl.current
    if (el && el.src) {
      if (next) { el.currentTime = playhead; el.playbackRate = speed; void el.play().catch(() => {}) }
      else el.pause()
    }
  }
  const stop = () => { pause(); seekSec(0) }
  const stepFrames = (d: number) => { pause(); seekFrame(curFrame + d) }
  const toStart = () => { pause(); seekFrame(0) }
  const toEnd = () => { pause(); seekFrame(totalFrames - 1) }

  // Clipgrenzen (Start jedes Clips + Ende der Timeline)
  const boundaries = useMemo(() => {
    const out = [0]
    let t = 0
    for (const c of clips) { t += c.duration; out.push(Math.round(t * 1000) / 1000) }
    return out
  }, [clips])
  const toPrevBoundary = () => {
    pause()
    const prev = [...boundaries].reverse().find((b) => b < playhead - 0.02)
    seekSec(prev ?? 0)
  }
  const toNextBoundary = () => {
    pause()
    const next = boundaries.find((b) => b > playhead + 0.02)
    seekSec(next ?? duration)
  }

  // Playhead nie hinter das Ende laufen lassen, wenn Clips kürzer werden
  useEffect(() => { setPlayhead((p) => Math.min(p, Math.max(0, duration - 1 / fps))) }, [duration, fps])
  useEffect(() => { if (audioEl.current) audioEl.current.playbackRate = speed }, [speed])

  // ---------- Scrubbing (Lineal, Playhead-Griff, Waveform) ----------
  const timeFromX = (clientX: number, free: boolean) => {
    const r = rowRef.current?.getBoundingClientRect()
    if (!r) return 0
    const t = clamp(((clientX - r.left) / r.width) * duration, 0, duration)
    if (free) return t
    const snapSec = (10 / Math.max(1, r.width)) * duration // ~10px Fangbereich
    const near = boundaries.find((b) => Math.abs(b - t) < snapSec)
    return near ?? t
  }
  const timeFromXRef = useRef(timeFromX)
  timeFromXRef.current = timeFromX

  const beginScrub = (e: React.PointerEvent) => {
    e.preventDefault()
    e.stopPropagation()
    scrubbing.current = true
    pause()
    seekSec(timeFromX(e.clientX, e.altKey))
  }
  useEffect(() => {
    const move = (e: PointerEvent) => {
      if (!scrubbing.current) return
      const t = timeFromXRef.current(e.clientX, e.altKey)
      setPlayhead(t)
      if (audioEl.current?.src) audioEl.current.currentTime = Math.min(t, audioEl.current.duration || t)
    }
    const up = () => { scrubbing.current = false }
    window.addEventListener('pointermove', move)
    window.addEventListener('pointerup', up)
    return () => { window.removeEventListener('pointermove', move); window.removeEventListener('pointerup', up) }
  }, [])

  // ---------- Tastenkürzel ----------
  const actions = useRef<Record<string, (...a: never[]) => void>>({})
  actions.current = {
    togglePlay, stop, toStart, toEnd, toPrevBoundary, toNextBoundary,
    stepBack: () => stepFrames(-1), stepFwd: () => stepFrames(1),
    jumpBack: () => stepFrames(-10), jumpFwd: () => stepFrames(10),
    del: () => { if (selected !== null) deleteClip(selected) },
    undo, redo,
  }
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement | null
      if (el && /^(input|textarea|select)$/i.test(el.tagName)) return
      const a = actions.current
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'z') {
        e.preventDefault()
        ;(e.shiftKey ? a.redo : a.undo)()
        return
      }
      switch (e.key) {
        case ' ': e.preventDefault(); a.togglePlay(); break
        case 'ArrowLeft': e.preventDefault(); (e.altKey ? a.toPrevBoundary : e.shiftKey ? a.jumpBack : a.stepBack)(); break
        case 'ArrowRight': e.preventDefault(); (e.altKey ? a.toNextBoundary : e.shiftKey ? a.jumpFwd : a.stepFwd)(); break
        case 'Home': e.preventDefault(); a.toStart(); break
        case 'End': e.preventDefault(); a.toEnd(); break
        case 'Delete': case 'Backspace': e.preventDefault(); a.del(); break
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  // ---------- Pointer-Interaktion: Trimmen + Umsortieren ----------
  useEffect(() => {
    const move = (e: PointerEvent) => {
      const r = resizing.current
      if (r && rowRef.current) {
        const pxPerSec = rowRef.current.getBoundingClientRect().width / duration
        const dSec = (e.clientX - r.startX) / pxPerSec
        // auf ganze Bilder rasten — sonst liegen Clipgrenzen zwischen zwei Frames
        const f = fpsRef.current
        const raw = r.edge === 'r' ? r.startDur + dSec : r.startDur - dSec
        const nd = Math.max(Math.round(0.4 * f) / f, Math.round(raw * f) / f)
        patchClip(r.idx, { duration: nd })
        return
      }
      const pd = pendingDrag.current
      if (pd && !dragRef.current && Math.abs(e.clientX - pd.startX) > 6) {
        commitRef.current()
        setDrag({ idx: pd.idx, x: e.clientX, grabDX: pd.grabDX, insert: pd.idx, widthPct: pd.widthPct })
        return
      }
      const d = dragRef.current
      if (d && rowRef.current) {
        const rect = rowRef.current.getBoundingClientRect()
        const t = ((e.clientX - rect.left) / rect.width) * duration
        const rest = clipsRefValue().filter((_, i) => i !== d.idx)
        let acc = 0, insert = rest.length
        for (let i = 0; i < rest.length; i++) {
          if (t < acc + rest[i].duration / 2) { insert = i; break }
          acc += rest[i].duration
        }
        if (insert !== d.insert) {
          // FLIP: Zustand VOR der Umsortierung einfrieren, nach dem Re-Render animieren
          flipState.current = Flip.getState(rowRef.current.querySelectorAll('[data-flip-id]'))
          setDrag({ ...d, x: e.clientX, insert })
        } else {
          setDrag({ ...d, x: e.clientX })
        }
      }
    }
    const up = () => {
      resizing.current = null
      const d = dragRef.current
      if (d) {
        setClips((c) => {
          const arr = [...c]
          const [m] = arr.splice(d.idx, 1)
          arr.splice(d.insert, 0, m)
          return arr
        })
        setSelected(null)
        setDrag(null)
      } else if (pendingDrag.current) {
        setSelected(pendingDrag.current.idx) // war nur ein Klick
      }
      pendingDrag.current = null
    }
    window.addEventListener('pointermove', move)
    window.addEventListener('pointerup', up)
    return () => { window.removeEventListener('pointermove', move); window.removeEventListener('pointerup', up) }
  }, [duration])

  const clipsRef = useRef(clips)
  clipsRef.current = clips
  const clipsRefValue = () => clipsRef.current

  useLayoutEffect(() => {
    if (flipState.current) {
      Flip.from(flipState.current, { duration: 0.22, ease: 'power2.out' })
      flipState.current = null
    }
  }, [drag?.insert])

  // Spurbreite messen (für die Tick-Dichte im Lineal)
  useEffect(() => {
    const el = rowRef.current
    if (!el) return
    const ro = new ResizeObserver(([e]) => setLaneW(e.contentRect.width))
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  // ---------- Audio ----------
  const onAudioFile = async (f: File) => {
    const ctx = new AudioContext()
    const buf = await ctx.decodeAudioData(await f.arrayBuffer())
    setAudioBuf(buf)
    setAudioName(f.name)
    if (audioEl.current) audioEl.current.src = URL.createObjectURL(f)
    const frames = Math.round(buf.duration * fps)
    const ch = buf.getChannelData(0)
    const per = buf.sampleRate / fps
    const rms: number[] = []
    for (let i = 0; i < frames; i++) {
      let sum = 0, n = 0
      for (let s = Math.floor(i * per); s < Math.min(ch.length, Math.floor((i + 1) * per)); s++) { sum += ch[s] * ch[s]; n++ }
      rms.push(n ? Math.min(1, Math.sqrt(sum / n) * 3.2) : 0)
    }
    setAudioRms(rms)
    void ctx.close()
  }

  useEffect(() => {
    const cv = waveRef.current
    if (!cv) return
    const ctx2 = cv.getContext('2d')!
    ctx2.clearRect(0, 0, cv.width, cv.height)
    if (!audioBuf) return
    const ch = audioBuf.getChannelData(0)
    const audioFrac = Math.min(1, audioBuf.duration / duration)
    const usableW = cv.width * audioFrac
    const per = Math.floor(ch.length / usableW)
    ctx2.fillStyle = '#b9bcf6'
    for (let x = 0; x < usableW; x++) {
      let max = 0
      for (let s = x * per; s < (x + 1) * per; s += 16) max = Math.max(max, Math.abs(ch[s] ?? 0))
      const h = Math.max(1, max * cv.height)
      ctx2.fillRect(x, (cv.height - h) / 2, 1, h)
    }
  }, [audioBuf, duration])

  // ---------- Playback ----------
  useEffect(() => {
    let raf = 0
    let last = performance.now()
    const tick = (now: number) => {
      if (playRef.current && !scrubbing.current) {
        const el = audioEl.current
        if (el && el.src && !el.paused) setPlayhead(el.currentTime % jobRef.current.duration)
        else setPlayhead((p) => (p + ((now - last) / 1000) * speedRef.current) % jobRef.current.duration)
      }
      last = now
      raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [])

  /**
   * WYSIWYG: Die Vorschau zeigt exakt die Frames, die der Renderer ausgibt —
   * dieselbe buildFrames-Rechnung inklusive aufsummierter Shader-Zeit,
   * Drehwinkel und geglätteter Stimm-Hüllkurve. Bild 137 hier = orb_00137.png.
   */
  const frames = useMemo(() => {
    if (!clips.length) return [] as Frame[]
    try { return buildFrames(job, states) as Frame[] } catch { return [] as Frame[] }
  }, [job, states, clips.length])
  const preview = frames.length ? frames[Math.min(frames.length - 1, curFrame)] : null

  // Was läuft gerade am Playhead — Zustand oder Übergang?
  const atPlayhead = useMemo(() => {
    if (!clips.length) return null
    const markers = clipsToMarkers(clips) as { time: number; state: string; transition?: number }[]
    let idx = 0
    for (let i = 0; i < markers.length; i++) if (markers[i].time <= playhead + 1e-6) idx = i
    const m = markers[idx]
    const trans = m.transition ?? 0
    const inTrans = idx > 0 && playhead - m.time < trans
    return { cur: m.state, prev: idx > 0 ? markers[idx - 1].state : null, inTrans }
  }, [clips, playhead])

  // ---------- Transition-Balken ----------
  const junctions = useMemo(() => {
    const out: { at: number; len: number; label: string }[] = []
    let t = 0
    for (let i = 0; i < clips.length; i++) {
      if (i > 0) {
        const auto = AUTO_TRANSITIONS[clips[i].state] ?? { transition: 0.6 }
        out.push({ at: t, len: auto.transition, label: `${auto.transition}s` })
      }
      t += clips[i].duration
    }
    return out
  }, [clips])

  // ---------- Zeitlineal ----------
  const ticks = useMemo(() => {
    const steps = [0.1, 0.2, 0.5, 1, 2, 5, 10, 15, 30, 60]
    const pxPerSec = laneW / duration
    const step = steps.find((s) => s * pxPerSec >= 62) ?? 60
    const out: number[] = []
    for (let t = 0; t <= duration + 1e-6; t += step) out.push(Math.round(t * 100) / 100)
    return out
  }, [duration, laneW])

  // ---------- Export ----------
  const doExport = async () => {
    if (!clips.length) { setRenderMsg('Erst Zustände hinzufügen (+)'); return }
    setRenderMsg('speichere…')
    const save = await fetch('/__save-timeline', {
      method: 'POST',
      body: JSON.stringify({ name, job: { ...job, size, clips } }),
    }).then((r) => r.json())
    if (!save.ok) { setRenderMsg('Speichern fehlgeschlagen'); return }
    const start = await fetch('/__render', {
      method: 'POST',
      body: JSON.stringify({ timeline: save.file, out: `out-render-${name}`, size, fps }),
    }).then((r) => r.json()).catch(() => ({ ok: false }))
    if (!start.ok) { setRenderMsg('Render-Start fehlgeschlagen (läuft schon einer?)'); return }
    const poll = setInterval(async () => {
      const st = await fetch('/__render-status').then((r) => r.json())
      setRenderMsg(st.running ? `rendert… ${st.progress}` : st.ok ? `✓ fertig → fonio-lab/out-render-${name}` : 'Fehler — Details im Terminal')
      if (!st.running) clearInterval(poll)
    }, 800)
  }

  const scrubRow = (e: React.MouseEvent) => {
    if (!rowRef.current || !clips.length || drag) return
    pause()
    seekSec(timeFromX(e.clientX, e.altKey))
  }

  const sel = selected !== null ? clips[selected] : null

  // Renderliste beim Ziehen: Rest-Clips + Lücke am Einfüge-Index
  const renderList: (Clip | 'gap')[] = useMemo(() => {
    if (!drag) return clips
    const rest: (Clip | 'gap')[] = clips.filter((_, i) => i !== drag.idx)
    rest.splice(drag.insert, 0, 'gap')
    return rest
  }, [clips, drag])

  const rowRect = rowRef.current?.getBoundingClientRect()
  const phPct = (playhead / duration) * 100
  const hasClips = clips.length > 0

  const TBtn = (p: { tip: string; onClick: () => void; children: React.ReactNode; primary?: boolean }) => (
    <button className={p.primary ? 'tl-btn primary has-tip' : 'tl-btn has-tip'} data-tip={p.tip}
      onClick={p.onClick} disabled={!hasClips}>{p.children}</button>
  )

  return (
    <main className="page export-page">
      <div className="export-main">
        <div className="export-preview">
          {preview && hasClips && (
            {/* Versatz proportional wie im Renderer: dort 260px auf 480px Orb */}
            <div className="orb orb-small" style={{ transform: `translateX(${preview.offsetX * 260 * (280 / 480)}px)` }}>
              <div className="orb-rotor" style={{ transform: `rotate(${preview.rotationDeg}deg)` }}>
                <MeshGradient className="orb-shader" width="100%" height="100%"
                  colors={preview.colors} speed={0} frame={preview.shaderFrame} scale={preview.scale}
                  distortion={preview.distortion} swirl={preview.swirl}
                  grainMixer={preview.grainMixer} grainOverlay={0} />
              </div>
              <div className="orb-overlay" style={{ opacity: preview.soften }} />
              <div className="orb-highlight" />
            </div>
          )}
          {!hasClips && <p className="control-hint">Leere Timeline — unten mit ＋ den ersten Zustand hinzufügen.</p>}
        </div>

        <div className="tl-transport">
          <TBtn tip="Zum Anfang (Home)" onClick={toStart}>⏮</TBtn>
          <TBtn tip="Vorige Clipgrenze (Alt + ←)" onClick={toPrevBoundary}>⇤</TBtn>
          <TBtn tip="Ein Bild zurück (←) · 10 Bilder mit Shift" onClick={() => stepFrames(-1)}>◂</TBtn>
          <TBtn tip="Abspielen / Pause (Leertaste)" onClick={togglePlay} primary>{playing ? '⏸' : '▶'}</TBtn>
          <TBtn tip="Stopp — pausiert und springt an den Anfang" onClick={stop}>⏹</TBtn>
          <TBtn tip="Ein Bild vor (→) · 10 Bilder mit Shift" onClick={() => stepFrames(1)}>▸</TBtn>
          <TBtn tip="Nächste Clipgrenze (Alt + →)" onClick={toNextBoundary}>⇥</TBtn>
          <TBtn tip="Zum Ende (End)" onClick={toEnd}>⏭</TBtn>

          <span className="tl-div" />
          <button className="tl-btn has-tip" data-tip="Rückgängig (Cmd + Z) — auch Trimmen, Umsortieren und Löschen"
            onClick={undo} disabled={!past.length}>↶</button>
          <button className="tl-btn has-tip" data-tip="Wiederherstellen (Cmd + Shift + Z)"
            onClick={redo} disabled={!future.length}>↷</button>

          <span className="tl-readout has-tip" data-tip="Position: Sekunden · aktuelles Bild von insgesamt. Bildgenau — ein Bild = 1/FPS Sekunde.">
            <strong>{playhead.toFixed(2)}s</strong>
            <span className="tl-sep">/</span>{duration.toFixed(2)}s
            <span className="tl-frame">Bild {curFrame + 1} / {totalFrames}</span>
          </span>

          {atPlayhead && (
            <span className="tl-state has-tip" data-tip="Was der Orb an dieser Stelle gerade macht — bei einem Übergang stehen beide Zustände da.">
              <span className="tl-state-dot" style={{ background: stateColor(atPlayhead.cur) }} />
              {atPlayhead.inTrans && atPlayhead.prev
                ? `${stateLabel(atPlayhead.prev)} → ${stateLabel(atPlayhead.cur)}`
                : stateLabel(atPlayhead.cur)}
            </span>
          )}

          <span className="tl-spacer" />
          <span className="tl-speed has-tip" data-tip="Abspieltempo der Vorschau — langsam abspielen hilft beim Beurteilen der Übergänge. Ändert den Export nicht.">
            {SPEEDS.map((s) => (
              <button key={s} className={speed === s ? 'seg-btn active' : 'seg-btn'} onClick={() => setSpeed(s)}>{s}×</button>
            ))}
          </span>
        </div>

        <div className="tl-lanes">
          <div className="trans-row">
            {!drag && junctions.map((j, i) => (
              <div key={i} className="trans-bar has-tip"
                data-tip={`Automatische Transition: ${j.label} — wird später als Standard festgeschrieben.`}
                style={{
                  left: `calc(${((j.at - j.len / 2) / duration) * 100}%)`,
                  width: `${(j.len / duration) * 100}%`,
                }}>
                <span>{j.label}</span>
              </div>
            ))}
          </div>

          <div className="tl-ruler has-tip" onPointerDown={beginScrub}
            data-tip="Zeitlineal — klicken oder ziehen zum Spulen. Der Playhead rastet an Clipgrenzen ein; Alt gedrückt halten = frei.">
            {ticks.map((t) => (
              <span key={t} className="tl-tick" style={{ left: `${(t / duration) * 100}%` }}>
                <i /><em>{t % 1 === 0 ? `${t}s` : `${t.toFixed(1)}s`}</em>
              </span>
            ))}
          </div>

          <div className="clip-row-wrap">
            <div className={drag ? 'clip-row dragging' : 'clip-row'} ref={rowRef} onClick={scrubRow}>
              {renderList.map((c) =>
                c === 'gap' ? (
                  <div key="gap" data-flip-id="gap" className="clip-gap" style={{ width: `${drag!.widthPct}%` }} />
                ) : (
                  <div key={c.id} data-flip-id={c.id}
                    className={selected === clips.indexOf(c) && !drag ? 'clip selected' : 'clip'}
                    style={{ width: `${(c.duration / duration) * 100}%`, background: stateColor(c.state) }}
                    onPointerDown={(e) => {
                      const idx = clips.indexOf(c)
                      const rect = (e.currentTarget as HTMLElement).getBoundingClientRect()
                      pendingDrag.current = { idx, startX: e.clientX, grabDX: e.clientX - rect.left, widthPct: (c.duration / duration) * 100 }
                    }}
                    onClick={(e) => e.stopPropagation()}>
                    <span className="clip-edge l" onPointerDown={(e) => { e.stopPropagation(); commit(); resizing.current ={ idx: clips.indexOf(c), edge: 'l', startX: e.clientX, startDur: c.duration } }}><i /></span>
                    <span className="clip-label">{stateLabel(c.state)}</span>
                    <span className="clip-dur">{c.duration.toFixed(1)}s</span>
                    <button className="clip-x" onPointerDown={(e) => e.stopPropagation()} onClick={(e) => { e.stopPropagation(); deleteClip(clips.indexOf(c)) }}>×</button>
                    <span className="clip-edge r" onPointerDown={(e) => { e.stopPropagation(); commit(); resizing.current ={ idx: clips.indexOf(c), edge: 'r', startX: e.clientX, startDur: c.duration } }}><i /></span>
                  </div>
                ),
              )}
              {drag && rowRect && (
                <div className="clip floating" style={{
                  width: `${drag.widthPct}%`,
                  background: stateColor(clips[drag.idx].state),
                  left: Math.max(0, Math.min(rowRect.width * (1 - drag.widthPct / 100), drag.x - rowRect.left - drag.grabDX)),
                }}>
                  <span className="clip-label">{stateLabel(clips[drag.idx].state)}</span>
                  <span className="clip-dur">{clips[drag.idx].duration.toFixed(1)}s</span>
                </div>
              )}
            </div>
            <div className="plus-wrap">
              <button className="plus-btn" onClick={() => setPickerOpen(!pickerOpen)}>＋</button>
              {pickerOpen && (
                <div className="state-picker">
                  {Object.keys(states).map((k) => (
                    <button key={k} className="picker-item" onClick={() => addClip(k)}>
                      <span className="picker-dot" style={{ background: stateColor(k) }} />
                      {states[k].label}
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>

          <canvas ref={waveRef} className="tl-wave" width={1100} height={64} onPointerDown={beginScrub} />

          {hasClips && !drag && (
            <div className="tl-ph-layer">
              <div className="tl-ph" style={{ left: `${phPct}%` }}>
                <span className="tl-ph-grip" onPointerDown={beginScrub} />
              </div>
            </div>
          )}
        </div>

        <p className="control-hint">
          ＋ = Zustand anhängen · Mitte ziehen = umsortieren · Kante ziehen = Dauer trimmen · Lineal ziehen = spulen
          <br />
          Tasten: Leertaste = Play/Pause · ← → = ein Bild · Shift + ← → = zehn Bilder · Alt + ← → = Clipgrenze · Pos1 / Ende = Anfang / Ende · Entf = ausgewählten Block löschen
        </p>
      </div>

      <aside className="controls">
        <h1 className="page-title">Export / Timeline</h1>

        {sel ? (
          <div className="control marker-editor">
            <span className="control-label"><span>{stateLabel(sel.state)}</span>
              <button className="mini-btn" onClick={() => deleteClip(selected!)}>Löschen</button>
            </span>
            <select className="edit-select" value={sel.state} onChange={(e) => patchClip(selected!, { state: e.target.value })}>
              {Object.keys(states).map((k) => <option key={k} value={k}>{states[k].label}</option>)}
            </select>
            <label className="control has-tip" data-tip="Dauer dieses Blocks — geht auch per Kanten-Ziehen direkt am Block. Beim Ziehen rastet sie auf ganze Bilder.">
              <span className="control-label"><span>Dauer</span>
                <span>{sel.duration.toFixed(2)}s · {Math.round(sel.duration * fps)} B</span></span>
              <input type="range" min={0.4} max={15} step={0.1} value={sel.duration}
                onChange={(e) => patchClip(selected!, { duration: Number(e.target.value) })} />
            </label>
            <p className="control-hint">Transition in diesen Zustand: automatisch {(AUTO_TRANSITIONS[sel.state]?.transition ?? 0.6)}s.</p>
          </div>
        ) : (
          <p className="control-hint">Block anklicken zum Bearbeiten.</p>
        )}

        <div className="control has-tip" data-tip="Die Timeline wird laufend im Browser gesichert und beim Öffnen wiederhergestellt. ‚Leeren' lässt sich mit Cmd + Z zurücknehmen.">
          <span className="control-label"><span>Timeline</span>
            <button className="mini-btn" onClick={clearAll} disabled={!hasClips}>Leeren</button>
          </span>
          <p className="control-hint" style={{ marginTop: 0 }}>
            {hasClips ? `${clips.length} Blöcke · ${duration.toFixed(1)}s · ${totalFrames} Bilder · automatisch gesichert` : 'leer'}
          </p>
        </div>

        <div className="control has-tip" data-tip="Voice-Take laden: Waveform erscheint unter der Spur, Reaktivität wird beim Export eingebacken.">
          <span className="control-label"><span>Audio</span><span>{audioName || '—'}</span></span>
          <input type="file" accept="audio/*" onChange={(e) => e.target.files?.[0] && void onAudioFile(e.target.files[0])} />
        </div>

        <div className="control">
          <span className="control-label"><span>FPS / Größe</span></span>
          <div className="seg">
            {[24, 25, 30, 60].map((f) => (
              <button key={f} className={fps === f ? 'seg-btn active' : 'seg-btn'} onClick={() => setFps(f)}>{f}</button>
            ))}
          </div>
          <div className="seg" style={{ marginTop: 6 }}>
            {[480, 720, 1080].map((s) => (
              <button key={s} className={size === s ? 'seg-btn active' : 'seg-btn'} onClick={() => setSize(s)}>{s}px</button>
            ))}
          </div>
        </div>

        <label className="pulse-row has-tip" data-tip="Nahtloser Loop: Ende wird per Crossfade in den Anfang geblendet.">
          <input type="checkbox" checked={loop} onChange={(e) => setLoop(e.target.checked)} />
          <span>∞ Loop (nahtlos schließen)</span>
        </label>

        <div className="control">
          <span className="control-label"><span>Name</span></span>
          <input className="edit-select" value={name} onChange={(e) => setName(e.target.value)} />
        </div>

        <button className="save-btn dirty export-btn" onClick={doExport}>PNG-Sequenz exportieren</button>
        {renderMsg && <p className="control-hint">{renderMsg}</p>}
      </aside>
      <audio ref={audioEl} />
    </main>
  )
}
