import { useEffect, useMemo, useRef, useState } from 'react'
import { MeshGradient } from '@paper-design/shaders-react'
import { loadStates } from '../orbStates'
// @ts-expect-error – shared JS engine (same file the renderer uses)
import { paramsAt, stateNameAt, clipsToMarkers, AUTO_TRANSITIONS, DEFAULT_CLIP_DURATION } from '../engine/orbTimeline.mjs'

/**
 * Export-Tab V2 — Clip-Editor:
 * Zustände als Blöcke (Plus hängt an, Drag&Drop sortiert um, Kanten trimmen),
 * automatische Transitions als Balken über den Nahtstellen, Audio-Waveform
 * darunter. Preview + Renderer teilen sich dieselbe Engine (WYSIWYG).
 */

type Clip = { id: number; state: string; duration: number }

let nextId = 1

export default function ExportPage() {
  const states = useMemo(loadStates, [])
  const stateColor = (k: string) =>
    states[k]?.p.colors.find((c: string) => c.toUpperCase() !== '#FFFFFF') ?? '#A1A1AA'

  const [clips, setClips] = useState<Clip[]>([])
  const [selected, setSelected] = useState<number | null>(null)
  const [pickerOpen, setPickerOpen] = useState(false)
  const [fps, setFps] = useState(30)
  const [size, setSize] = useState(480)
  const [loop, setLoop] = useState(true)
  const [name, setName] = useState('meine-timeline')
  const [playhead, setPlayhead] = useState(0)
  const [playing, setPlaying] = useState(false)
  const [audioName, setAudioName] = useState('')
  const [audioBuf, setAudioBuf] = useState<AudioBuffer | null>(null)
  const [audioRms, setAudioRms] = useState<number[] | undefined>()
  const [renderMsg, setRenderMsg] = useState('')

  const audioEl = useRef<HTMLAudioElement | null>(null)
  const rowRef = useRef<HTMLDivElement | null>(null)
  const waveRef = useRef<HTMLCanvasElement | null>(null)
  const dragFrom = useRef<number | null>(null)
  const resizing = useRef<{ idx: number; edge: 'l' | 'r'; startX: number; startDur: number } | null>(null)

  const duration = Math.max(0.1, clips.reduce((s, c) => s + c.duration, 0))
  const job = useMemo(() => ({
    duration, fps, loop,
    markers: clips.length ? clipsToMarkers(clips) : [{ time: 0, state: 'idle' }],
    audioRms, audioSensitivity: 0.22,
  }), [clips, duration, fps, loop, audioRms])
  const jobRef = useRef(job)
  jobRef.current = job
  const playRef = useRef(playing)
  playRef.current = playing

  // ---------- Clips ----------
  const addClip = (state: string) => {
    const dur = (DEFAULT_CLIP_DURATION as Record<string, number>)[state] ?? DEFAULT_CLIP_DURATION._default
    setClips((c) => [...c, { id: nextId++, state, duration: dur }])
    setPickerOpen(false)
  }
  const patchClip = (idx: number, p: Partial<Clip>) =>
    setClips((c) => c.map((x, i) => (i === idx ? { ...x, ...p } : x)))
  const deleteClip = (idx: number) => {
    setClips((c) => c.filter((_, i) => i !== idx))
    setSelected(null)
  }
  const moveClip = (from: number, to: number) =>
    setClips((c) => {
      const arr = [...c]
      const [m] = arr.splice(from, 1)
      arr.splice(to > from ? to - 1 : to, 0, m)
      return arr
    })

  // Trimmen über Kanten (beide Richtungen)
  useEffect(() => {
    const move = (e: PointerEvent) => {
      const r = resizing.current
      if (!r || !rowRef.current) return
      const pxPerSec = rowRef.current.getBoundingClientRect().width / duration
      const dSec = (e.clientX - r.startX) / pxPerSec
      const nd = Math.max(0.4, Math.round((r.edge === 'r' ? r.startDur + dSec : r.startDur - dSec) * 10) / 10)
      patchClip(r.idx, { duration: nd })
    }
    const up = () => { resizing.current = null }
    window.addEventListener('pointermove', move)
    window.addEventListener('pointerup', up)
    return () => { window.removeEventListener('pointermove', move); window.removeEventListener('pointerup', up) }
  }, [duration])

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
    // Waveform im Timeline-Maßstab: Audio kann kürzer/länger als Timeline sein
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
      if (playRef.current) {
        const el = audioEl.current
        if (el && el.src && !el.paused) setPlayhead(el.currentTime % jobRef.current.duration)
        else setPlayhead((p) => (p + (now - last) / 1000) % jobRef.current.duration)
      }
      last = now
      raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [])

  const togglePlay = () => {
    const next = !playing
    setPlaying(next)
    const el = audioEl.current
    if (el && el.src) {
      if (next) { el.currentTime = playhead; void el.play().catch(() => {}) }
      else el.pause()
    }
  }

  const preview = useMemo(() => {
    try {
      const p = paramsAt(job, states, playhead)
      const fi = Math.floor(playhead * fps)
      const audible = ['listening', 'speaking'].includes(stateNameAt(job, playhead))
      const boost = audible ? (audioRms?.[fi] ?? 0) * 0.22 : 0
      return { ...p, scale: p.scale + boost }
    } catch { return null }
  }, [playhead, job, states, fps, audioRms])

  // ---------- Transitions (automatisch) für die Balken-Spur ----------
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

  const scrub = (e: React.MouseEvent) => {
    if (!rowRef.current || !clips.length) return
    const r = rowRef.current.getBoundingClientRect()
    setPlayhead(Math.max(0, Math.min(duration, ((e.clientX - r.left) / r.width) * duration)))
  }

  const sel = selected !== null ? clips[selected] : null

  return (
    <main className="page export-page">
      <div className="export-main">
        <div className="export-preview">
          {preview && clips.length > 0 && (
            <div className="orb orb-small" style={{ transform: `translateX(${preview.offsetX * 130}px) scale(${preview.scale})` }}>
              <MeshGradient className="orb-shader" width="100%" height="100%"
                colors={preview.colors} speed={preview.speed}
                distortion={preview.distortion} swirl={preview.swirl}
                grainMixer={preview.grainMixer} grainOverlay={0} />
              <div className="orb-overlay" style={{ opacity: preview.soften }} />
              <div className="orb-highlight" />
            </div>
          )}
          {!clips.length && <p className="control-hint">Leere Timeline — unten mit ＋ den ersten Zustand hinzufügen.</p>}
        </div>

        <div className="tl-bar">
          <button className="seg-btn" onClick={togglePlay} disabled={!clips.length}>{playing ? '⏸ Pause' : '▶ Play'}</button>
          <span className="tl-time">{playhead.toFixed(1)}s / {duration.toFixed(1)}s</span>
        </div>

        {/* Transition-Spur (Balken über den Nahtstellen, automatische Werte) */}
        <div className="trans-row">
          {junctions.map((j, i) => (
            <div key={i} className="trans-bar has-tip"
              data-tip={`Automatische Transition: ${j.label} — Werte werden später als Standard festgeschrieben.`}
              style={{
                left: `calc(${((j.at - j.len / 2) / duration) * 100}%)`,
                width: `${(j.len / duration) * 100}%`,
              }}>
              <span>{j.label}</span>
            </div>
          ))}
        </div>

        {/* Zustands-Spur: Clips + Plus */}
        <div className="clip-row-wrap">
          <div className="clip-row" ref={rowRef} onClick={scrub}>
            {clips.map((c, i) => (
              <div key={c.id}
                className={selected === i ? 'clip selected' : 'clip'}
                style={{ width: `${(c.duration / duration) * 100}%`, background: stateColor(c.state) }}
                draggable
                onDragStart={() => { dragFrom.current = i }}
                onDragOver={(e) => e.preventDefault()}
                onDrop={(e) => { e.preventDefault(); if (dragFrom.current !== null) moveClip(dragFrom.current, i); dragFrom.current = null }}
                onClick={(e) => { e.stopPropagation(); setSelected(i) }}>
                <span className="clip-edge l" onPointerDown={(e) => { e.stopPropagation(); resizing.current = { idx: i, edge: 'l', startX: e.clientX, startDur: c.duration } }} />
                <span className="clip-label">{states[c.state]?.label ?? c.state}</span>
                <span className="clip-dur">{c.duration.toFixed(1)}s</span>
                <button className="clip-x" onClick={(e) => { e.stopPropagation(); deleteClip(i) }}>×</button>
                <span className="clip-edge r" onPointerDown={(e) => { e.stopPropagation(); resizing.current = { idx: i, edge: 'r', startX: e.clientX, startDur: c.duration } }} />
              </div>
            ))}
            {clips.length > 0 && <div className="tl-playhead" style={{ left: `${(playhead / duration) * 100}%` }} />}
          </div>
          <div className="plus-wrap"
            onDragOver={(e) => e.preventDefault()}
            onDrop={(e) => { e.preventDefault(); if (dragFrom.current !== null) moveClip(dragFrom.current, clips.length); dragFrom.current = null }}>
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

        {/* Audio-Spur */}
        <canvas ref={waveRef} className="tl-wave" width={1100} height={64} />
        <p className="control-hint">＋ = Zustand anhängen · Block ziehen = umsortieren · Kanten ziehen = Dauer trimmen · Klick auf Spur = spulen</p>
      </div>

      <aside className="controls">
        <h1 className="page-title">Export / Timeline</h1>

        {sel ? (
          <div className="control marker-editor">
            <span className="control-label"><span>{states[sel.state]?.label}</span>
              <button className="mini-btn" onClick={() => deleteClip(selected!)}>Löschen</button>
            </span>
            <select className="edit-select" value={sel.state} onChange={(e) => patchClip(selected!, { state: e.target.value })}>
              {Object.keys(states).map((k) => <option key={k} value={k}>{states[k].label}</option>)}
            </select>
            <label className="control has-tip" data-tip="Dauer dieses Blocks in Sekunden — geht auch per Kanten-Ziehen direkt am Block.">
              <span className="control-label"><span>Dauer</span><span>{sel.duration.toFixed(1)}s</span></span>
              <input type="range" min={0.4} max={15} step={0.1} value={sel.duration}
                onChange={(e) => patchClip(selected!, { duration: Number(e.target.value) })} />
            </label>
            <p className="control-hint">Transition in diesen Zustand: automatisch {(AUTO_TRANSITIONS[sel.state]?.transition ?? 0.6)}s.</p>
          </div>
        ) : (
          <p className="control-hint">Block anklicken zum Bearbeiten.</p>
        )}

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
