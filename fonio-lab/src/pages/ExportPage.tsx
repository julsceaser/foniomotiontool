import { useEffect, useMemo, useRef, useState } from 'react'
import { MeshGradient } from '@paper-design/shaders-react'
import { loadStates } from '../orbStates'
// @ts-expect-error – shared JS engine (same file the renderer uses)
import { paramsAt, stateNameAt, expandMarkers } from '../engine/orbTimeline.mjs'

/**
 * Export-Tab: Zustands-Timeline über der Audio-Waveform, Live-Preview mit
 * exakt derselben Engine wie der Headless-Renderer (WYSIWYG), Export als
 * PNG-Sequenz mit Alpha per Klick.
 */

type Marker = { time: number; state: string; transition?: number; ease?: string; pulse?: boolean; hold?: number }
type Job = {
  duration: number; fps: number; loop: boolean; markers: Marker[]
  audioRms?: number[]; audioSensitivity?: number; size?: number
}

const EASE_LABELS: Record<string, string> = { smooth: 'Weich', linear: 'Linear', spring: 'Federnd' }

export default function ExportPage() {
  const states = useMemo(loadStates, [])
  const stateColor = (k: string) =>
    states[k]?.p.colors.find((c: string) => c.toUpperCase() !== '#FFFFFF') ?? '#A1A1AA'

  const [job, setJob] = useState<Job>({
    duration: 10, fps: 30, loop: true,
    markers: [{ time: 0, state: 'idle' }, { time: 2, state: 'thinking', transition: 0.8 }],
    audioSensitivity: 0.22,
  })
  const [name, setName] = useState('meine-timeline')
  const [size, setSize] = useState(480)
  const [selected, setSelected] = useState<number | null>(null)
  const [playhead, setPlayhead] = useState(0)
  const [playing, setPlaying] = useState(false)
  const [audioName, setAudioName] = useState('')
  const [audioBuf, setAudioBuf] = useState<AudioBuffer | null>(null)
  const [renderMsg, setRenderMsg] = useState('')

  const audioEl = useRef<HTMLAudioElement | null>(null)
  const trackRef = useRef<HTMLDivElement | null>(null)
  const waveRef = useRef<HTMLCanvasElement | null>(null)
  const playRef = useRef(false)
  playRef.current = playing
  const jobRef = useRef(job)
  jobRef.current = job

  // ---------- Audio laden: Waveform + RMS pro Frame ----------
  const onAudioFile = async (f: File) => {
    const ctx = new AudioContext()
    const buf = await ctx.decodeAudioData(await f.arrayBuffer())
    setAudioBuf(buf)
    setAudioName(f.name)
    if (audioEl.current) audioEl.current.src = URL.createObjectURL(f)
    const frames = Math.round(buf.duration * job.fps)
    const ch = buf.getChannelData(0)
    const per = buf.sampleRate / job.fps
    const rms: number[] = []
    for (let i = 0; i < frames; i++) {
      let sum = 0, n = 0
      for (let s = Math.floor(i * per); s < Math.min(ch.length, Math.floor((i + 1) * per)); s++) { sum += ch[s] * ch[s]; n++ }
      rms.push(n ? Math.min(1, Math.sqrt(sum / n) * 3.2) : 0)
    }
    setJob((j) => ({ ...j, duration: Math.round(buf.duration * 10) / 10, audioRms: rms }))
    void ctx.close()
  }

  // Waveform zeichnen
  useEffect(() => {
    const cv = waveRef.current
    if (!cv) return
    const ctx = cv.getContext('2d')!
    const W = cv.width, H = cv.height
    ctx.clearRect(0, 0, W, H)
    if (!audioBuf) return
    const ch = audioBuf.getChannelData(0)
    const per = Math.floor(ch.length / W)
    ctx.fillStyle = '#c7c9f8'
    for (let x = 0; x < W; x++) {
      let max = 0
      for (let s = x * per; s < (x + 1) * per; s += 16) max = Math.max(max, Math.abs(ch[s] ?? 0))
      const h = Math.max(1, max * H)
      ctx.fillRect(x, (H - h) / 2, 1, h)
    }
  }, [audioBuf])

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

  // ---------- Preview-Parameter (gleiche Engine wie Renderer) ----------
  const preview = useMemo(() => {
    try {
      const p = paramsAt(job, states, playhead)
      const fi = Math.floor(playhead * job.fps)
      const audible = ['listening', 'speaking'].includes(stateNameAt(job, playhead))
      const boost = audible ? (job.audioRms?.[fi] ?? 0) * (job.audioSensitivity ?? 0.22) : 0
      return { ...p, scale: p.scale + boost }
    } catch { return null }
  }, [playhead, job, states])

  // ---------- Timeline-Interaktion ----------
  const timeFromEvent = (e: React.PointerEvent | React.MouseEvent) => {
    const r = trackRef.current!.getBoundingClientRect()
    return Math.max(0, Math.min(job.duration, ((e.clientX - r.left) / r.width) * job.duration))
  }
  const addMarker = (e: React.MouseEvent) => {
    const t = Math.round(timeFromEvent(e) * 10) / 10
    setJob((j) => ({ ...j, markers: [...j.markers, { time: t, state: 'speaking', transition: 0.6 }] }))
    setSelected(job.markers.length)
  }
  const patchMarker = (i: number, m: Partial<Marker>) =>
    setJob((j) => ({ ...j, markers: j.markers.map((x, k) => (k === i ? { ...x, ...m } : x)) }))
  const deleteMarker = (i: number) => {
    setJob((j) => ({ ...j, markers: j.markers.filter((_, k) => k !== i) }))
    setSelected(null)
  }
  const dragging = useRef<number | null>(null)
  const onTrackPointerMove = (e: React.PointerEvent) => {
    if (dragging.current === null) return
    patchMarker(dragging.current, { time: Math.round(timeFromEvent(e) * 20) / 20 })
  }

  // ---------- Segmente für die farbige Spur ----------
  const segments = useMemo(() => {
    const ms = expandMarkers(job.markers) as Marker[]
    const segs: { from: number; to: number; color: string; state: string }[] = []
    for (let i = 0; i < ms.length; i++) {
      segs.push({
        from: ms[i].time,
        to: i + 1 < ms.length ? ms[i + 1].time : job.duration,
        color: stateColor(ms[i].state),
        state: states[ms[i].state]?.label ?? ms[i].state,
      })
    }
    return segs
  }, [job, states])

  // ---------- Export ----------
  const doExport = async () => {
    setRenderMsg('speichere…')
    const save = await fetch('/__save-timeline', {
      method: 'POST',
      body: JSON.stringify({ name, job: { ...job, size } }),
    }).then((r) => r.json())
    if (!save.ok) { setRenderMsg('Speichern fehlgeschlagen'); return }
    const start = await fetch('/__render', {
      method: 'POST',
      body: JSON.stringify({ timeline: save.file, out: `out-render-${name}`, size, fps: job.fps }),
    }).then((r) => r.json()).catch(() => ({ ok: false }))
    if (!start.ok) { setRenderMsg('Render-Start fehlgeschlagen (läuft schon einer?)'); return }
    const poll = setInterval(async () => {
      const st = await fetch('/__render-status').then((r) => r.json())
      setRenderMsg(st.running ? `rendert… ${st.progress}` : st.ok ? `✓ fertig → fonio-lab/out-render-${name}` : 'Fehler — Details im Terminal')
      if (!st.running) clearInterval(poll)
    }, 800)
  }

  const sel = selected !== null ? job.markers[selected] : null

  return (
    <main className="page export-page">
      <div className="export-main">
        <div className="export-preview">
          {preview && (
            <div className="orb orb-small" style={{ transform: `translateX(${preview.offsetX * 130}px) scale(${preview.scale})` }}>
              <MeshGradient className="orb-shader" width="100%" height="100%"
                colors={preview.colors} speed={preview.speed}
                distortion={preview.distortion} swirl={preview.swirl}
                grainMixer={preview.grainMixer} grainOverlay={0} />
              <div className="orb-overlay" style={{ opacity: preview.soften }} />
              <div className="orb-highlight" />
            </div>
          )}
        </div>

        <div className="tl-bar">
          <button className="seg-btn" onClick={togglePlay}>{playing ? '⏸ Pause' : '▶ Play'}</button>
          <span className="tl-time">{playhead.toFixed(1)}s / {job.duration}s</span>
          <span className="control-hint" style={{ margin: 0 }}>Doppelklick auf die Spur = Wechsel hinzufügen · Marker ziehen = verschieben</span>
        </div>

        <div className="tl-track" ref={trackRef}
          onDoubleClick={addMarker}
          onPointerMove={onTrackPointerMove}
          onPointerUp={() => { dragging.current = null }}
          onClick={(e) => { if (dragging.current === null) setPlayhead(timeFromEvent(e)) }}>
          {segments.map((s, i) => (
            <div key={i} className="tl-seg" title={s.state}
              style={{ left: `${(s.from / job.duration) * 100}%`, width: `${((s.to - s.from) / job.duration) * 100}%`, background: s.color }} />
          ))}
          {job.markers.map((m, i) => (
            <div key={i}
              className={selected === i ? 'tl-marker selected' : 'tl-marker'}
              style={{ left: `${(m.time / job.duration) * 100}%` }}
              onPointerDown={(e) => { e.stopPropagation(); dragging.current = i; setSelected(i) }}
              title={`${states[m.state]?.label ?? m.state} @ ${m.time}s`}>
              {m.pulse ? '⚡' : ''}
            </div>
          ))}
          <div className="tl-playhead" style={{ left: `${(playhead / job.duration) * 100}%` }} />
        </div>
        <canvas ref={waveRef} className="tl-wave" width={1100} height={64} />
      </div>

      <aside className="controls">
        <h1 className="page-title">Export / Timeline</h1>

        {sel ? (
          <div className="control marker-editor">
            <span className="control-label"><span>Wechsel bei {sel.time.toFixed(1)}s</span>
              <button className="mini-btn" onClick={() => deleteMarker(selected!)}>Löschen</button>
            </span>
            <select className="edit-select" value={sel.state} onChange={(e) => patchMarker(selected!, { state: e.target.value })}>
              {Object.keys(states).map((k) => <option key={k} value={k}>{states[k].label}</option>)}
            </select>
            <label className="control has-tip" data-tip="Dauer des Übergangs in Sekunden.">
              <span className="control-label"><span>Transition</span><span>{(sel.transition ?? 0.6).toFixed(2)}s</span></span>
              <input type="range" min={0} max={3} step={0.05} value={sel.transition ?? 0.6}
                onChange={(e) => patchMarker(selected!, { transition: Number(e.target.value) })} />
            </label>
            <div className="seg">
              {Object.entries(EASE_LABELS).map(([k, label]) => (
                <button key={k} className={(sel.ease ?? 'smooth') === k ? 'seg-btn active' : 'seg-btn'}
                  onClick={() => patchMarker(selected!, { ease: k })}>{label}</button>
              ))}
            </div>
            <label className="pulse-row has-tip" data-tip="Puls: Zustand nur kurz anspielen, danach automatisch zurück zum vorherigen — für Momente wie ‚Verstanden'.">
              <input type="checkbox" checked={!!sel.pulse} onChange={(e) => patchMarker(selected!, { pulse: e.target.checked })} />
              <span>⚡ Puls (spielt an & kehrt zurück)</span>
            </label>
          </div>
        ) : (
          <p className="control-hint">Marker auf der Spur anklicken, um ihn zu bearbeiten — oder Doppelklick für einen neuen Wechsel.</p>
        )}

        <div className="control has-tip" data-tip="Voice-Take laden: Waveform erscheint unter der Spur, Dauer wird übernommen, Reaktivität wird beim Export eingebacken.">
          <span className="control-label"><span>Audio</span><span>{audioName || '—'}</span></span>
          <input type="file" accept="audio/*" onChange={(e) => e.target.files?.[0] && void onAudioFile(e.target.files[0])} />
        </div>

        <label className="control has-tip" data-tip="Gesamtlänge der Timeline (wird beim Audio-Laden automatisch gesetzt).">
          <span className="control-label"><span>Dauer</span><span>{job.duration}s</span></span>
          <input type="range" min={2} max={60} step={0.5} value={job.duration}
            onChange={(e) => setJob((j) => ({ ...j, duration: Number(e.target.value) }))} />
        </label>

        <div className="control">
          <span className="control-label"><span>FPS / Größe</span></span>
          <div className="seg">
            {[24, 25, 30, 60].map((f) => (
              <button key={f} className={job.fps === f ? 'seg-btn active' : 'seg-btn'} onClick={() => setJob((j) => ({ ...j, fps: f }))}>{f}</button>
            ))}
          </div>
          <div className="seg" style={{ marginTop: 6 }}>
            {[480, 720, 1080].map((s) => (
              <button key={s} className={size === s ? 'seg-btn active' : 'seg-btn'} onClick={() => setSize(s)}>{s}px</button>
            ))}
          </div>
        </div>

        <label className="pulse-row has-tip" data-tip="Nahtloser Loop: Ende wird per Crossfade in den Anfang geblendet — für Idle-Loops und Endlos-Einsatz.">
          <input type="checkbox" checked={job.loop} onChange={(e) => setJob((j) => ({ ...j, loop: e.target.checked }))} />
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
