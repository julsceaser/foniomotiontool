import { useEffect, useRef, useState } from 'react'

/**
 * Live soundwave in the orb style — reacting to microphone or the demo
 * voice audio, always organically moving on its own. No timeline: this is
 * a living visual, not a player.
 * Settings follow the editor draft model: changes are volatile until
 * "Speichern" (localStorage). Defaults = the original look.
 */

const BRAND = ['#585DFE', '#58E8FE', '#58FE85']
const PASTEL = ['#85B2F5', '#70B6EE', '#A6EEC9']

type WaveStyle = 'bars' | 'dots' | 'curve' | 'area'
type WaveAlign = 'center' | 'bottom'
type ColorMode = 'brand' | 'pastel' | 'single' | 'custom'
type GradDir = 'horizontal' | 'vertical'
type FreqFocus = 'full' | 'bass' | 'level'

type WaveSettings = {
  bars: number
  sensitivity: number
  idleMotion: number
  rounded: number
  barWidth: number
  minHeight: number
  amplitude: number
  falloff: number
  style: WaveStyle
  align: WaveAlign
  colorMode: ColorMode
  singleColor: string
  custom: [string, string, string]
  gradientDir: GradDir
  glow: number
  attack: number
  release: number
  idleSpeed: number
  freqFocus: FreqFocus
  peakHold: boolean
}

const WAVE_DEFAULTS: WaveSettings = {
  bars: 36, sensitivity: 1.8, idleMotion: 0.5, rounded: 6,
  barWidth: 0.55, minHeight: 0.06, amplitude: 0.86, falloff: 0, style: 'bars', align: 'center',
  colorMode: 'brand', singleColor: '#585DFE', custom: ['#585DFE', '#58E8FE', '#58FE85'],
  gradientDir: 'horizontal', glow: 0.7,
  attack: 0.25, release: 0.25, idleSpeed: 1, freqFocus: 'full', peakHold: false,
}
const WAVE_LS_KEY = 'fonio-wave-v1'
const loadWave = (): WaveSettings => {
  try {
    const raw = localStorage.getItem(WAVE_LS_KEY)
    if (raw) return { ...WAVE_DEFAULTS, ...JSON.parse(raw) }
  } catch { /* ignore */ }
  return { ...WAVE_DEFAULTS }
}

const lerp = (a: number, b: number, t: number) => a + (b - a) * t
const hexToRgb = (h: string): number[] => [
  parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16),
]
const mixHex = (a: string, b: string, x: number): string => {
  const A = hexToRgb(a), B = hexToRgb(b)
  return `rgb(${Math.round(lerp(A[0], B[0], x))}, ${Math.round(lerp(A[1], B[1], x))}, ${Math.round(lerp(A[2], B[2], x))})`
}
const colorAlong = (stops: string[], t: number): string =>
  t < 0.5 ? mixHex(stops[0], stops[1], t * 2) : mixHex(stops[1], stops[2], (t - 0.5) * 2)

function Slider(props: { label: string; hint: string; value: number; min: number; max: number; step?: number; onChange: (v: number) => void }) {
  const { label, hint, value, min, max, step = 0.01, onChange } = props
  return (
    <label className="control has-tip" data-tip={hint}>
      <span className="control-label">
        <span>{label}</span>
        <span>{step >= 1 ? value.toFixed(0) : value.toFixed(2)}</span>
      </span>
      <input type="range" min={min} max={max} step={step} value={value}
        onChange={(e) => onChange(Number(e.target.value))} />
    </label>
  )
}

function Seg<T extends string>(props: { options: [T, string][]; value: T; onChange: (v: T) => void }) {
  return (
    <div className="seg">
      {props.options.map(([v, label]) => (
        <button key={v} className={props.value === v ? 'seg-btn active' : 'seg-btn'}
          onClick={() => props.onChange(v)}>{label}</button>
      ))}
    </div>
  )
}

export default function WavePage() {
  const canvasRef = useRef<HTMLCanvasElement | null>(null)
  const [micOn, setMicOn] = useState(false)
  const [playing, setPlaying] = useState(false)
  const [ws, setWs] = useState<WaveSettings>(loadWave)
  const [dirty, setDirty] = useState(false)
  const [savedMsg, setSavedMsg] = useState('')

  const analyser = useRef<AnalyserNode | null>(null)
  const audioCtx = useRef<AudioContext | null>(null)
  const micStream = useRef<MediaStream | null>(null)
  const voiceEl = useRef<HTMLAudioElement | null>(null)
  const voiceConnected = useRef(false)
  const heights = useRef<number[]>([])
  const peaks = useRef<number[]>([])
  const cfg = useRef({ ws, micOn, playing })
  cfg.current = { ws, micOn, playing }

  const ensureAudioCtx = () => {
    if (!audioCtx.current) {
      audioCtx.current = new AudioContext()
      analyser.current = audioCtx.current.createAnalyser()
      analyser.current.fftSize = 256
      analyser.current.smoothingTimeConstant = 0.75
    }
    void audioCtx.current.resume()
  }

  const toggleMic = async () => {
    if (micOn) {
      micStream.current?.getTracks().forEach((t) => t.stop())
      micStream.current = null
      setMicOn(false)
      return
    }
    try {
      ensureAudioCtx()
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      micStream.current = stream
      audioCtx.current!.createMediaStreamSource(stream).connect(analyser.current!)
      setMicOn(true)
    } catch { alert('Mikrofon-Zugriff abgelehnt.') }
  }

  const toggleDemo = () => {
    const el = voiceEl.current
    if (!el) return
    if (playing) { el.pause(); setPlaying(false); return }
    ensureAudioCtx()
    if (!voiceConnected.current) {
      const src = audioCtx.current!.createMediaElementSource(el)
      src.connect(analyser.current!)
      analyser.current!.connect(audioCtx.current!.destination)
      voiceConnected.current = true
    }
    el.currentTime = 0
    el.loop = true
    void el.play().catch(() => {})
    setPlaying(true)
  }

  // Draft-Modell wie im Orb-Editor: Änderungen sind flüchtig bis „Speichern"
  const patch = (p: Partial<WaveSettings>) => { setWs((o) => ({ ...o, ...p })); setDirty(true) }
  const save = () => {
    localStorage.setItem(WAVE_LS_KEY, JSON.stringify(ws))
    setDirty(false)
    setSavedMsg('Gespeichert ✓')
    setTimeout(() => setSavedMsg(''), 2000)
  }
  const reset = () => { setWs({ ...WAVE_DEFAULTS, custom: [...WAVE_DEFAULTS.custom] }); setDirty(true) }
  useEffect(() => {
    const h = (e: BeforeUnloadEvent) => { if (dirty) e.preventDefault() }
    window.addEventListener('beforeunload', h)
    return () => window.removeEventListener('beforeunload', h)
  }, [dirty])

  useEffect(() => {
    const canvas = canvasRef.current!
    const ctx = canvas.getContext('2d')!
    const dpr = window.devicePixelRatio || 1
    const W = 920, H = 420
    canvas.width = W * dpr
    canvas.height = H * dpr
    ctx.scale(dpr, dpr)

    const freq = new Uint8Array(128)
    let raf = 0
    const tick = (now: number) => {
      const { ws: s, micOn: mic, playing: play } = cfg.current
      const N = s.bars
      if (heights.current.length !== N) { heights.current = new Array(N).fill(24); peaks.current = new Array(N).fill(0) }

      let hasAudio = false
      if (analyser.current && (mic || play)) {
        analyser.current.getByteFrequencyData(freq)
        hasAudio = true
      }
      let overall = 0
      if (hasAudio && s.freqFocus === 'level') {
        let sum = 0
        for (let k = 0; k < freq.length; k++) sum += freq[k]
        overall = sum / freq.length / 255
      }

      const stops = s.colorMode === 'pastel' ? PASTEL : s.colorMode === 'custom' ? s.custom : BRAND
      const barColor = (frac: number) => (s.colorMode === 'single' ? s.singleColor : colorAlong(stops, frac))

      ctx.clearRect(0, 0, W, H)
      const pitch = W / (N + 2)
      const barW = Math.max(2, pitch * s.barWidth)
      const center = (N - 1) / 2
      const minH = H * s.minHeight
      const maxH = H * s.amplitude
      const yBase = H - 6
      const cy = H / 2
      const tIdle = now * s.idleSpeed
      const pts: [number, number][] = [] // Balken-Mitten für Kurve/Fläche

      for (let i = 0; i < N; i++) {
        // idle: organische Eigenbewegung (zwei überlagerte Sinuswellen pro Balken)
        const idleH =
          minH +
          s.idleMotion * 60 * (0.5 + 0.5 * Math.sin(tIdle / 620 + i * 0.55)) *
          (0.6 + 0.4 * Math.sin(tIdle / 1400 + i * 1.3))
        // audio: symmetrisch von der Mitte nach außen (Voice-Assistant-Look)
        let audioH = 0
        if (hasAudio) {
          if (s.freqFocus === 'level') {
            audioH = overall * H * 0.72 * s.sensitivity
          } else {
            const span = s.freqFocus === 'bass' ? 16 : 46
            const band = Math.min(freq.length - 1, Math.round((Math.abs(i - center) / center) * span) + 2)
            audioH = (freq[band] / 255) * H * 0.72 * s.sensitivity
          }
        }
        let target = Math.min(maxH, Math.max(idleH, audioH + idleH * 0.35))
        // Rand-Abfall: Cosinus-Fenster dämpft die Höhe zu den Seiten hin
        if (s.falloff > 0) {
          const win = Math.cos((Math.abs(i - center) / center) * Math.PI / 2)
          target = Math.max(2, target * (1 - s.falloff * (1 - win)))
        }
        const k = target > heights.current[i] ? s.attack : s.release
        heights.current[i] = lerp(heights.current[i], target, k)
        const h = heights.current[i]
        if (h >= peaks.current[i]) peaks.current[i] = h
        else peaks.current[i] = Math.max(h, peaks.current[i] - H * 0.0035)

        const x = pitch * (i + 1) - barW / 2
        const xc = pitch * (i + 1)
        const yTop = s.align === 'center' ? cy - h / 2 : yBase - h
        pts.push([xc, yTop])

        if (s.style === 'bars' || s.style === 'dots') {
          if (s.colorMode !== 'single' && s.gradientDir === 'vertical') {
            const g = ctx.createLinearGradient(0, yTop, 0, yTop + h)
            stops.forEach((c, si) => g.addColorStop(si / (stops.length - 1), c))
            ctx.fillStyle = g
          } else {
            ctx.fillStyle = barColor(i / (N - 1))
          }
          if (s.style === 'bars') {
            ctx.beginPath()
            ctx.roundRect(x, yTop, barW, h, s.rounded)
            ctx.fill()
          } else {
            const count = Math.max(1, Math.round(h / (barW * 1.6)))
            for (let d = 0; d < count; d++) {
              const yy = yTop + (d + 0.5) * (h / count)
              ctx.beginPath()
              ctx.arc(xc, yy, barW * 0.42, 0, Math.PI * 2)
              ctx.fill()
            }
          }
          if (s.peakHold) {
            ctx.fillStyle = barColor(i / (N - 1))
            const pk = peaks.current[i]
            if (s.align === 'center') {
              ctx.beginPath(); ctx.roundRect(x, cy - pk / 2 - 8, barW, 3, 2); ctx.fill()
              ctx.beginPath(); ctx.roundRect(x, cy + pk / 2 + 5, barW, 3, 2); ctx.fill()
            } else {
              ctx.beginPath(); ctx.roundRect(x, yBase - pk - 8, barW, 3, 2); ctx.fill()
            }
          }
        }
      }

      // Kurve / Fläche: weicher Pfad durch die Balken-Spitzen
      if (s.style === 'curve' || s.style === 'area') {
        const paint = (): string | CanvasGradient => {
          if (s.colorMode === 'single') return s.singleColor
          const g = s.gradientDir === 'vertical'
            ? ctx.createLinearGradient(0, cy - maxH / 2, 0, cy + maxH / 2)
            : ctx.createLinearGradient(0, 0, W, 0)
          stops.forEach((c, si) => g.addColorStop(si / (stops.length - 1), c))
          return g
        }
        const smooth = (list: [number, number][]) => {
          ctx.moveTo(list[0][0], list[0][1])
          for (let i = 1; i < list.length - 1; i++) {
            const xm = (list[i][0] + list[i + 1][0]) / 2
            const ym = (list[i][1] + list[i + 1][1]) / 2
            ctx.quadraticCurveTo(list[i][0], list[i][1], xm, ym)
          }
          ctx.lineTo(list[list.length - 1][0], list[list.length - 1][1])
        }
        const bottomPts: [number, number][] = pts.map(([px], i) =>
          s.align === 'center' ? [px, cy + heights.current[i] / 2] : [px, yBase])
        if (s.style === 'curve') {
          ctx.strokeStyle = paint()
          ctx.lineWidth = 4
          ctx.lineJoin = 'round'
          ctx.lineCap = 'round'
          ctx.beginPath(); smooth(pts); ctx.stroke()
          if (s.align === 'center') { ctx.beginPath(); smooth(bottomPts); ctx.stroke() }
        } else {
          ctx.fillStyle = paint()
          ctx.beginPath()
          smooth(pts)
          const rev = [...bottomPts].reverse()
          ctx.lineTo(rev[0][0], rev[0][1])
          smooth(rev)
          ctx.closePath()
          ctx.fill()
        }
      }
      raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [])

  const setCustom = (i: number, v: string) => {
    const next = [...ws.custom] as [string, string, string]
    next[i] = v
    patch({ custom: next })
  }

  return (
    <main className="page">
      <div className="wave-stage">
        <div className="wave-wrap">
          <div className="wave-glow" style={{ opacity: ws.glow, display: ws.glow === 0 ? 'none' : undefined }} />
          <canvas ref={canvasRef} className="wave-canvas" />
        </div>
      </div>

      <aside className="controls">
        <h1 className="page-title">Soundwave / Live</h1>

        <div className="control has-tip" data-tip="Änderungen sind Entwürfe — ‚Speichern' merkt sie sich dauerhaft (überlebt Neuladen). ↺ Standard setzt auf die Ausgangswerte zurück.">
          <div className="edit-bar">
            <button className="mini-btn" onClick={reset}>↺ Standard</button>
            <button className={dirty ? 'save-btn dirty' : 'save-btn'} style={{ flex: 1 }} onClick={save}>
              {savedMsg || (dirty ? '● Speichern' : 'Speichern')}
            </button>
          </div>
        </div>

        <div className="control has-tip" data-tip="Die Welle bewegt sich immer organisch von selbst. Mit Mikrofon oder Demo-Stimme schlägt sie zusätzlich zur Lautstärke aus — symmetrisch von der Mitte nach außen.">
          <span className="control-label"><span>Stimme</span></span>
          <div className="seg">
            <button className={micOn ? 'seg-btn active' : 'seg-btn'} onClick={toggleMic}>
              {micOn ? 'Mikrofon aus' : 'Mikrofon an'}
            </button>
            <button className={playing ? 'seg-btn active' : 'seg-btn'} onClick={toggleDemo}>
              {playing ? 'Demo stoppen' : 'Lena spricht (Demo)'}
            </button>
          </div>
        </div>

        <p className="section-label">Form</p>
        <div className="control has-tip" data-tip="Darstellung: Balken (Original) · Punkte = Dot-Raster · Kurve = durchgehende Linie (Siri-Look) · Fläche = gefüllte Silhouette.">
          <span className="control-label"><span>Stil</span></span>
          <Seg options={[['bars', 'Balken'], ['dots', 'Punkte'], ['curve', 'Kurve'], ['area', 'Fläche']]}
            value={ws.style} onChange={(v) => patch({ style: v })} />
        </div>
        <div className="control has-tip" data-tip="Mitte = symmetrisch gespiegelt (Voice-Assistant) · Boden = wächst von unten (Equalizer).">
          <span className="control-label"><span>Ausrichtung</span></span>
          <Seg options={[['center', 'Mitte'], ['bottom', 'Boden']]}
            value={ws.align} onChange={(v) => patch({ align: v })} />
        </div>
        <Slider label="Balken" hint="Anzahl der Balken." value={ws.bars} min={12} max={64} step={1} onChange={(v) => patch({ bars: v })} />
        <Slider label="Balkenbreite" hint="Breite der Balken relativ zum Abstand — schmal = luftig, breit = massiv." value={ws.barWidth} min={0.2} max={0.95} onChange={(v) => patch({ barWidth: v })} />
        <Slider label="Min-Höhe" hint="Grundhöhe in Ruhe — wie flach die Welle mindestens ist. 0 = darf fast komplett flach werden." value={ws.minHeight} min={0} max={0.4} onChange={(v) => patch({ minHeight: v })} />
        <Slider label="Max-Höhe" hint="Wie hoch die Welle maximal ausschlagen darf (Anteil der Bühne)." value={ws.amplitude} min={0.3} max={1} onChange={(v) => patch({ amplitude: v })} />
        <Slider label="Rand-Abfall" hint="Flacht die Welle zu den Rändern hin ab — 0 = aus, 1 = läuft links und rechts komplett aus." value={ws.falloff} min={0} max={1} onChange={(v) => patch({ falloff: v })} />
        <Slider label="Rundung" hint="Eckenradius der Balken (wirkt bei Stil ‚Balken')." value={ws.rounded} min={0} max={7} step={0.5} onChange={(v) => patch({ rounded: v })} />

        <p className="section-label">Farbe</p>
        <div className="control has-tip" data-tip="Grundfarben = Blau→Cyan→Mint (Original) · Pastell = Orb-Töne · Einfarbig = eine Farbe · Eigene = drei frei wählbare Verlaufsfarben.">
          <span className="control-label"><span>Farbmodus</span></span>
          <Seg options={[['brand', 'Grundfarben'], ['pastel', 'Pastell'], ['single', 'Einfarbig'], ['custom', 'Eigene']]}
            value={ws.colorMode} onChange={(v) => patch({ colorMode: v })} />
        </div>
        {ws.colorMode === 'single' && (
          <div className="control">
            <span className="control-label"><span>Farbe</span></span>
            <div className="swatch-row">
              <span className="swatch"><input type="color" value={ws.singleColor} onChange={(e) => patch({ singleColor: e.target.value })} /></span>
            </div>
          </div>
        )}
        {ws.colorMode === 'custom' && (
          <div className="control">
            <span className="control-label"><span>Verlaufsfarben</span></span>
            <div className="swatch-row">
              {ws.custom.map((c, i) => (
                <span key={i} className="swatch"><input type="color" value={c} onChange={(e) => setCustom(i, e.target.value)} /></span>
              ))}
            </div>
          </div>
        )}
        {ws.colorMode !== 'single' && (
          <div className="control has-tip" data-tip="Horizontal = Verlauf über die Breite der Welle (Original) · Vertikal = Verlauf innerhalb jedes Balkens von oben nach unten.">
            <span className="control-label"><span>Verlaufsrichtung</span></span>
            <Seg options={[['horizontal', 'Horizontal'], ['vertical', 'Vertikal']]}
              value={ws.gradientDir} onChange={(v) => patch({ gradientDir: v })} />
          </div>
        )}
        <Slider label="Glow" hint="Weicher Schein hinter der Welle — 0 = aus." value={ws.glow} min={0} max={1} onChange={(v) => patch({ glow: v })} />

        <p className="section-label">Bewegung &amp; Stimme</p>
        <Slider label="Empfindlichkeit" hint="Wie stark die Welle auf Stimme ausschlägt." value={ws.sensitivity} min={0.3} max={4} onChange={(v) => patch({ sensitivity: v })} />
        <Slider label="Attack" hint="Wie schnell die Balken bei Lautstärke hochschnellen — hoch = zackig, tief = träge." value={ws.attack} min={0.05} max={0.8} onChange={(v) => patch({ attack: v })} />
        <Slider label="Release" hint="Wie schnell die Balken wieder absinken — tief = weiches Nachschwingen." value={ws.release} min={0.02} max={0.6} onChange={(v) => patch({ release: v })} />
        <Slider label="Eigenbewegung" hint="Wie lebendig die Welle ohne Stimme atmet — 0 = fast still." value={ws.idleMotion} min={0} max={1} onChange={(v) => patch({ idleMotion: v })} />
        <Slider label="Idle-Tempo" hint="Geschwindigkeit der Eigenbewegung — unabhängig von ihrer Stärke." value={ws.idleSpeed} min={0.3} max={3} step={0.05} onChange={(v) => patch({ idleSpeed: v })} />
        <div className="control has-tip" data-tip="Voll = alle Frequenzen (Original) · Bass = nur tiefe Frequenzen, ruhiger · Pegel = alle Balken folgen der Gesamtlautstärke.">
          <span className="control-label"><span>Frequenz-Fokus</span></span>
          <Seg options={[['full', 'Voll'], ['bass', 'Bass'], ['level', 'Pegel']]}
            value={ws.freqFocus} onChange={(v) => patch({ freqFocus: v })} />
        </div>
        <label className="pulse-row has-tip" data-tip="Kleine Kappen bleiben kurz auf dem Höchststand stehen und sinken langsam — klassischer Analyzer-Look (bei Balken und Punkten).">
          <input type="checkbox" checked={ws.peakHold} onChange={(e) => patch({ peakHold: e.target.checked })} />
          <span>Peak-Hold (Kappen)</span>
        </label>

        <p className="control-hint">
          Sprich einfach — die Mitte reagiert auf tiefe, die Ränder auf hohe
          Frequenzen (außer im Modus ‚Pegel').
        </p>
      </aside>
      <audio ref={voiceEl} src="/demo.wav" preload="auto" />
    </main>
  )
}
