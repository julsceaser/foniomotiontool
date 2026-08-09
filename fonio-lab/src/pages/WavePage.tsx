import { useEffect, useRef, useState } from 'react'

/**
 * Live soundwave in the orb style — rounded bars with the brand gradient,
 * organically moving up and down on their own, reacting to microphone or
 * the demo voice audio. No timeline: this is a living visual, not a player.
 */

const C1 = [88, 93, 254] // #585DFE
const C2 = [88, 232, 254] // #58E8FE
const C3 = [88, 254, 133] // #58FE85

const lerp = (a: number, b: number, t: number) => a + (b - a) * t
const colorAt = (t: number): string => {
  const mix = (a: number[], b: number[], x: number) =>
    `rgb(${Math.round(lerp(a[0], b[0], x))}, ${Math.round(lerp(a[1], b[1], x))}, ${Math.round(lerp(a[2], b[2], x))})`
  return t < 0.5 ? mix(C1, C2, t * 2) : mix(C2, C3, (t - 0.5) * 2)
}

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

export default function WavePage() {
  const canvasRef = useRef<HTMLCanvasElement | null>(null)
  const [micOn, setMicOn] = useState(false)
  const [playing, setPlaying] = useState(false)
  const [bars, setBars] = useState(36)
  const [sensitivity, setSensitivity] = useState(1.8)
  const [idleMotion, setIdleMotion] = useState(0.5)
  const [rounded, setRounded] = useState(6)

  const analyser = useRef<AnalyserNode | null>(null)
  const audioCtx = useRef<AudioContext | null>(null)
  const micStream = useRef<MediaStream | null>(null)
  const voiceEl = useRef<HTMLAudioElement | null>(null)
  const voiceConnected = useRef(false)
  const heights = useRef<number[]>([])
  const cfg = useRef({ bars, sensitivity, idleMotion, rounded, micOn, playing })
  cfg.current = { bars, sensitivity, idleMotion, rounded, micOn, playing }

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
      const { bars: N, sensitivity: sens, idleMotion: idle, rounded: rad, micOn: mic, playing: play } = cfg.current
      if (heights.current.length !== N) heights.current = new Array(N).fill(24)

      let hasAudio = false
      if (analyser.current && (mic || play)) {
        analyser.current.getByteFrequencyData(freq)
        hasAudio = true
      }

      ctx.clearRect(0, 0, W, H)
      const pitch = W / (N + 2)
      const barW = Math.min(14, pitch * 0.55)
      const center = (N - 1) / 2

      for (let i = 0; i < N; i++) {
        // idle: organische Eigenbewegung (zwei überlagerte Sinuswellen pro Balken)
        const idleH =
          26 +
          idle * 60 * (0.5 + 0.5 * Math.sin(now / 620 + i * 0.55)) *
          (0.6 + 0.4 * Math.sin(now / 1400 + i * 1.3))
        // audio: symmetrisch von der Mitte nach außen (Voice-Assistant-Look)
        let audioH = 0
        if (hasAudio) {
          const band = Math.min(freq.length - 1, Math.round((Math.abs(i - center) / center) * 46) + 2)
          audioH = (freq[band] / 255) * 300 * sens
        }
        const target = Math.min(H * 0.86, Math.max(idleH, audioH + idleH * 0.35))
        heights.current[i] = lerp(heights.current[i], target, 0.25)

        const h = heights.current[i]
        const x = pitch * (i + 1) - barW / 2
        const y = (H - h) / 2
        ctx.fillStyle = colorAt(i / (N - 1))
        ctx.beginPath()
        ctx.roundRect(x, y, barW, h, rad)
        ctx.fill()
      }
      raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [])

  return (
    <main className="page">
      <div className="orb-stage">
        <div className="wave-wrap">
          <div className="wave-glow" />
          <canvas ref={canvasRef} className="wave-canvas" style={{ width: 920, height: 420 }} />
        </div>
      </div>

      <aside className="controls">
        <h1 className="page-title">Soundwave / Live</h1>

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

        <Slider label="Balken" hint="Anzahl der Balken." value={bars} min={12} max={64} step={1} onChange={setBars} />
        <Slider label="Empfindlichkeit" hint="Wie stark die Welle auf Stimme ausschlägt." value={sensitivity} min={0.3} max={4} onChange={setSensitivity} />
        <Slider label="Eigenbewegung" hint="Wie lebendig die Welle ohne Stimme atmet — 0 = fast still." value={idleMotion} min={0} max={1} onChange={setIdleMotion} />
        <Slider label="Rundung" hint="Eckenradius der Balken." value={rounded} min={0} max={7} step={0.5} onChange={setRounded} />

        <p className="control-hint">
          Farbverlauf = die drei Grundfarben (Blau → Cyan → Mint), gleiche
          Logik wie beim Orb. Sprich einfach — die Mitte reagiert auf tiefe,
          die Ränder auf hohe Frequenzen.
        </p>
      </aside>
      <audio ref={voiceEl} src="/demo.wav" preload="auto" />
    </main>
  )
}
