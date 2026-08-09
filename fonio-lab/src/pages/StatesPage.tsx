import { useEffect, useRef, useState } from 'react'
import { MeshGradient } from '@paper-design/shaders-react'
import { loadStates, deepCopy, type StateParams } from '../orbStates'

/**
 * States PREVIEW — switch between Lena's states and watch the transitions.
 * Editing happens on the Orb page (dropdown "Bearbeiten" → Zustand wählen).
 */

const W = '#FFFFFF'
const hexToRgb = (h: string): [number, number, number] => [
  parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16),
]
const rgbToHex = (r: number, g: number, b: number) =>
  '#' + [r, g, b].map((v) => Math.round(Math.max(0, Math.min(255, v))).toString(16).padStart(2, '0')).join('')
const lerp = (a: number, b: number, t: number) => a + (b - a) * t
const lerpColor = (a: string, b: string, t: number) => {
  const [ar, ag, ab] = hexToRgb(a)
  const [br, bg, bb] = hexToRgb(b)
  return rgbToHex(lerp(ar, br, t), lerp(ag, bg, t), lerp(ab, bb, t))
}

export default function StatesPage() {
  const [states] = useState(loadStates)
  const [stateKey, setStateKey] = useState<string>('idle')
  const [micOn, setMicOn] = useState(false)
  const [level, setLevel] = useState(0)
  const [rendered, setRendered] = useState<StateParams>(() => loadStates().idle.p)

  const current = useRef<StateParams>(deepCopy(rendered))
  const rotAngle = useRef(0)
  const rotorRef = useRef<HTMLDivElement | null>(null)
  const statesRef = useRef(states)
  statesRef.current = states
  const stateRef = useRef(stateKey)
  stateRef.current = stateKey
  const analyser = useRef<AnalyserNode | null>(null)
  const audioCtx = useRef<AudioContext | null>(null)
  const micStream = useRef<MediaStream | null>(null)
  const voiceEl = useRef<HTMLAudioElement | null>(null)
  const voiceConnected = useRef(false)

  useEffect(() => {
    if (stateKey === 'success') {
      const t = setTimeout(() => setStateKey('idle'), 1400)
      return () => clearTimeout(t)
    }
    if (stateKey === 'speaking') {
      const el = voiceEl.current
      if (el) {
        if (audioCtx.current && !voiceConnected.current) {
          const src = audioCtx.current.createMediaElementSource(el)
          src.connect(analyser.current!)
          analyser.current!.connect(audioCtx.current.destination)
          voiceConnected.current = true
        }
        el.currentTime = 0
        void el.play().catch(() => {})
      }
      return () => { voiceEl.current?.pause() }
    }
  }, [stateKey])

  const ensureAudioCtx = () => {
    if (!audioCtx.current) {
      audioCtx.current = new AudioContext()
      analyser.current = audioCtx.current.createAnalyser()
      analyser.current.fftSize = 512
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

  useEffect(() => {
    let raf = 0
    let lastRender = 0
    const data = new Uint8Array(256)
    const tick = (now: number) => {
      let lvl = 0
      if (analyser.current && (micStream.current || stateRef.current === 'speaking')) {
        analyser.current.getByteTimeDomainData(data)
        let sum = 0
        for (let i = 0; i < data.length; i++) { const d = (data[i] - 128) / 128; sum += d * d }
        lvl = Math.min(1, Math.sqrt(sum / data.length) * 4)
      }
      const c = current.current
      const t = statesRef.current[stateRef.current].p
      const k = 0.07
      c.speed = lerp(c.speed, t.speed, k)
      c.distortion = lerp(c.distortion, t.distortion, k)
      c.swirl = lerp(c.swirl, t.swirl, k)
      c.grainMixer = lerp(c.grainMixer, t.grainMixer, k)
      c.soften = lerp(c.soften, t.soften, k)
      c.offsetX = lerp(c.offsetX, t.offsetX, k)
      c.rotationSpeed = lerp(c.rotationSpeed, t.rotationSpeed, k)
      rotAngle.current = (rotAngle.current + c.rotationSpeed * (1 / 60)) % 360
      if (rotorRef.current) rotorRef.current.style.transform = `rotate(${rotAngle.current}deg)`
      const breath = stateRef.current === 'idle' ? Math.sin(now / 2200) * 0.015 : 0
      const audioBoost = (stateRef.current === 'listening' || stateRef.current === 'speaking') ? lvl * 0.22 : 0
      c.scale = lerp(c.scale, t.scale + breath + audioBoost, 0.12)
      c.colors = c.colors.map((col, i) => lerpColor(col, t.colors[i] ?? W, k))
      if (now - lastRender > 33) {
        lastRender = now
        setRendered({ ...c, colors: [...c.colors] })
        setLevel(lvl)
      }
      raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [])

  return (
    <main className="page">
      <div className="orb-stage">
        <div className="orb" style={{ transform: `translateX(${rendered.offsetX * 260}px) scale(${rendered.scale})` }}>
          <div className="orb-rotor" ref={rotorRef}>
          <MeshGradient className="orb-shader" width="100%" height="100%"
            colors={rendered.colors} speed={rendered.speed} distortion={rendered.distortion}
            swirl={rendered.swirl} grainMixer={rendered.grainMixer} grainOverlay={0} />
          </div>
          <div className="orb-overlay" style={{ opacity: rendered.soften }} />
          <div className="orb-highlight" />
        </div>
      </div>

      <aside className="controls">
        <h1 className="page-title">Orb / Zustände (Preview)</h1>

        <div className="control has-tip" data-tip="Klick = Zustand ansehen, Übergänge laufen weich. Bearbeitet werden die Zustände auf der Orb-Seite (Dropdown ‚Bearbeiten‘).">
          <span className="control-label"><span>Zustand</span></span>
          <div className="seg states-grid">
            {Object.keys(states).map((k) => (
              <button key={k} className={stateKey === k ? 'seg-btn active' : 'seg-btn'}
                onClick={() => { if (k === 'speaking') ensureAudioCtx(); setStateKey(k) }}>
                {states[k].label}
              </button>
            ))}
          </div>
        </div>

        <div className="control has-tip" data-tip="Mikrofon: ‚Zuhören‘ reagiert auf deine Stimme. Demo: ‚Sprechen‘ pulsiert zum Demo-Audio.">
          <span className="control-label"><span>Stimme</span></span>
          <div className="seg">
            <button className={micOn ? 'seg-btn active' : 'seg-btn'} onClick={toggleMic}>
              {micOn ? 'Mikrofon aus' : 'Mikrofon an'}
            </button>
            <button className="seg-btn" onClick={() => { ensureAudioCtx(); setStateKey('speaking') }}>Lena spricht (Demo)</button>
          </div>
          <div className="level-track"><div className="level-fill" style={{ width: `${Math.round(level * 100)}%` }} /></div>
        </div>

        <p className="control-hint">{states[stateKey].hint}</p>
        <p className="control-hint">
          Nur Preview — zum Anpassen eines Zustands: Orb-Seite → Dropdown
          „Bearbeiten" → Zustand wählen → tunen → Speichern. Danach hier neu laden.
        </p>
      </aside>
      <audio ref={voiceEl} src="/demo.wav" preload="auto" />
    </main>
  )
}
