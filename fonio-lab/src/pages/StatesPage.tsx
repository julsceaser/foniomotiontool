import { useEffect, useRef, useState } from 'react'
import { MeshGradient } from '@paper-design/shaders-react'

/**
 * Lena orb states — each state is a parameter preset; transitions lerp all
 * params (incl. colors) smoothly. Edit mode lets the designer tune every
 * state live; changes persist in localStorage and can be copied as JSON.
 */

type Params = {
  colors: string[]
  speed: number
  distortion: number
  swirl: number
  grainMixer: number
  scale: number
  soften: number
  offsetX: number
}
type StateDef = { label: string; hint: string; p: Params }

const W = '#FFFFFF'
const BLUE = '#585DFE'
const CYAN = '#58E8FE'
const MINT = '#58FE85'
const LS_KEY = 'fonio-orb-states-v1'

const DEFAULT_STATES: Record<string, StateDef> = {
  idle: {
    label: 'Ruhe', hint: 'Langsame Atmung — Grundzustand in der App.',
    p: { colors: [W, BLUE, W, CYAN, BLUE, W, CYAN, W, MINT, W], speed: 0.12, distortion: 0.5, swirl: 0.3, grainMixer: 0, scale: 1, soften: 0.38, offsetX: 0 },
  },
  listening: {
    label: 'Zuhören', hint: 'Reagiert auf DEINE Stimme (Mikrofon einschalten!). Cyan-lastig.',
    p: { colors: [W, CYAN, W, CYAN, BLUE, W, CYAN, W, CYAN, W], speed: 0.2, distortion: 0.45, swirl: 0.25, grainMixer: 0, scale: 1.02, soften: 0.3, offsetX: 0 },
  },
  thinking: {
    label: 'Nachdenken', hint: 'Swirl zirkuliert nach innen, Gedankenrauschen über Grain.',
    p: { colors: [BLUE, W, BLUE, CYAN, BLUE, W, BLUE, CYAN, BLUE, W], speed: 0.55, distortion: 0.75, swirl: 0.95, grainMixer: 0.28, scale: 0.96, soften: 0.24, offsetX: 0 },
  },
  speaking: {
    label: 'Sprechen', hint: 'Pulsiert zur eigenen Stimme (spielt Demo-Audio).',
    p: { colors: [W, BLUE, MINT, CYAN, BLUE, W, CYAN, MINT, BLUE, W], speed: 0.3, distortion: 0.6, swirl: 0.4, grainMixer: 0, scale: 1.04, soften: 0.28, offsetX: 0 },
  },
  success: {
    label: 'Verstanden ✓', hint: 'Einmaliger Mint-Puls, kehrt danach zur Ruhe zurück.',
    p: { colors: [MINT, W, MINT, CYAN, MINT, W, MINT, W, MINT, W], speed: 0.4, distortion: 0.55, swirl: 0.45, grainMixer: 0, scale: 1.1, soften: 0.22, offsetX: 0 },
  },
  unsure: {
    label: 'Unsicher', hint: 'Wobbelt langsam — wie ein schief gelegter Kopf.',
    p: { colors: [W, BLUE, W, W, BLUE, W, CYAN, W, W, W], speed: 0.07, distortion: 0.95, swirl: 0.15, grainMixer: 0.12, scale: 0.98, soften: 0.42, offsetX: 0 },
  },
  transfer: {
    label: 'Durchstellen', hint: 'Der Orb reist zur Seite — er bringt den Anruf woanders hin.',
    p: { colors: [W, BLUE, W, CYAN, BLUE, W, CYAN, W, MINT, W], speed: 0.35, distortion: 0.5, swirl: 0.6, grainMixer: 0, scale: 0.55, soften: 0.3, offsetX: 0.55 },
  },
  offline: {
    label: 'Offline', hint: 'Entsättigt, fast eingefroren.',
    p: { colors: ['#F4F4F5', '#D4D4D8', '#F4F4F5', '#A1A1AA', '#E4E4E7', '#F4F4F5', '#D4D4D8', '#F4F4F5', '#D4D4D8', '#F4F4F5'], speed: 0.02, distortion: 0.35, swirl: 0.1, grainMixer: 0.18, scale: 0.92, soften: 0.5, offsetX: 0 },
  },
}

const deepCopy = <T,>(x: T): T => JSON.parse(JSON.stringify(x))
const loadStates = (): Record<string, StateDef> => {
  try {
    const raw = localStorage.getItem(LS_KEY)
    if (raw) {
      const saved = JSON.parse(raw)
      const merged = deepCopy(DEFAULT_STATES)
      for (const k of Object.keys(merged)) if (saved[k]?.p) merged[k].p = { ...merged[k].p, ...saved[k].p }
      return merged
    }
  } catch { /* fall through */ }
  return deepCopy(DEFAULT_STATES)
}

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

function Slider(props: { label: string; value: number; min: number; max: number; step?: number; onChange: (v: number) => void }) {
  const { label, value, min, max, step = 0.01, onChange } = props
  return (
    <label className="control">
      <span className="control-label"><span>{label}</span><span>{value.toFixed(2)}</span></span>
      <input type="range" min={min} max={max} step={step} value={value} onChange={(e) => onChange(Number(e.target.value))} />
    </label>
  )
}

export default function StatesPage() {
  const [states, setStates] = useState<Record<string, StateDef>>(loadStates)
  const [stateKey, setStateKey] = useState<string>('idle')
  const [editMode, setEditMode] = useState(false)
  const [micOn, setMicOn] = useState(false)
  const [level, setLevel] = useState(0)
  const [copied, setCopied] = useState('')
  const [rendered, setRendered] = useState<Params>(loadStates().idle.p)

  const current = useRef<Params>(deepCopy(rendered))
  const statesRef = useRef(states)
  statesRef.current = states
  const stateRef = useRef(stateKey)
  stateRef.current = stateKey
  const analyser = useRef<AnalyserNode | null>(null)
  const audioCtx = useRef<AudioContext | null>(null)
  const micStream = useRef<MediaStream | null>(null)
  const voiceEl = useRef<HTMLAudioElement | null>(null)
  const voiceConnected = useRef(false)

  // persist edits
  useEffect(() => { localStorage.setItem(LS_KEY, JSON.stringify(states)) }, [states])

  // one-shot success + speaking audio
  useEffect(() => {
    if (stateKey === 'success' && !editMode) {
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
  }, [stateKey, editMode])

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

  // animation loop
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

  const cur = states[stateKey]
  const patch = (partial: Partial<Params>) =>
    setStates((s) => ({ ...s, [stateKey]: { ...s[stateKey], p: { ...s[stateKey].p, ...partial } } }))
  const setColor = (i: number, v: string) =>
    patch({ colors: cur.p.colors.map((c, j) => (j === i ? v : c)) })

  const copyJson = async (all: boolean) => {
    const data = all
      ? Object.fromEntries(Object.entries(states).map(([k, v]) => [k, v.p]))
      : { [stateKey]: cur.p }
    await navigator.clipboard.writeText(JSON.stringify(data, null, 2))
    setCopied(all ? 'Alle Zustände kopiert ✓' : `„${cur.label}" kopiert ✓`)
    setTimeout(() => setCopied(''), 2000)
  }
  const resetAll = () => {
    localStorage.removeItem(LS_KEY)
    setStates(deepCopy(DEFAULT_STATES))
    setCopied('Zurückgesetzt ✓')
    setTimeout(() => setCopied(''), 2000)
  }

  return (
    <main className="page">
      <div className="orb-stage">
        <div className="orb" style={{ transform: `translateX(${rendered.offsetX * 260}px) scale(${rendered.scale})` }}>
          <MeshGradient className="orb-shader" width="100%" height="100%"
            colors={rendered.colors} speed={rendered.speed} distortion={rendered.distortion}
            swirl={rendered.swirl} grainMixer={rendered.grainMixer} grainOverlay={0} />
          <div className="orb-overlay" style={{ opacity: rendered.soften }} />
          <div className="orb-highlight" />
        </div>
      </div>

      <aside className="controls">
        <h1 className="page-title">Orb / Zustände</h1>

        <div className="control">
          <span className="control-label">
            <span>Zustand</span>
            <button className={editMode ? 'mini-btn active-mini' : 'mini-btn'} onClick={() => setEditMode(!editMode)}>
              {editMode ? '✓ Bearbeiten aktiv' : '✎ Bearbeiten'}
            </button>
          </span>
          <div className="seg states-grid">
            {Object.keys(states).map((k) => (
              <button key={k} className={stateKey === k ? 'seg-btn active' : 'seg-btn'}
                onClick={() => { if (k === 'speaking') ensureAudioCtx(); setStateKey(k) }}>
                {states[k].label}
              </button>
            ))}
          </div>
        </div>

        {editMode && (
          <>
            <Slider label="Speed" value={cur.p.speed} min={0} max={1} onChange={(v) => patch({ speed: v })} />
            <Slider label="Distortion" value={cur.p.distortion} min={0} max={1} onChange={(v) => patch({ distortion: v })} />
            <Slider label="Swirl" value={cur.p.swirl} min={0} max={1} onChange={(v) => patch({ swirl: v })} />
            <Slider label="Grain" value={cur.p.grainMixer} min={0} max={1} onChange={(v) => patch({ grainMixer: v })} />
            <Slider label="Scale" value={cur.p.scale} min={0.3} max={1.5} onChange={(v) => patch({ scale: v })} />
            <Slider label="Soften (Weiß)" value={cur.p.soften} min={0} max={0.8} onChange={(v) => patch({ soften: v })} />
            <Slider label="Versatz X" value={cur.p.offsetX} min={-1} max={1} onChange={(v) => patch({ offsetX: v })} />
            <div className="control">
              <span className="control-label"><span>Farben dieses Zustands</span></span>
              <div className="swatch-row">
                {cur.p.colors.map((c, i) => (
                  <span key={i} className="swatch">
                    <input type="color" value={c} onChange={(e) => setColor(i, e.target.value)} />
                  </span>
                ))}
              </div>
            </div>
            <div className="control">
              <div className="seg">
                <button className="seg-btn" onClick={() => copyJson(false)}>Zustand kopieren</button>
                <button className="seg-btn" onClick={() => copyJson(true)}>Alle kopieren</button>
                <button className="seg-btn" onClick={resetAll}>Zurücksetzen</button>
              </div>
              {copied && <p className="control-hint">{copied}</p>}
            </div>
          </>
        )}

        <div className="control">
          <span className="control-label"><span>Stimme</span></span>
          <div className="seg">
            <button className={micOn ? 'seg-btn active' : 'seg-btn'} onClick={toggleMic}>
              {micOn ? 'Mikrofon aus' : 'Mikrofon an'}
            </button>
            <button className="seg-btn" onClick={() => { ensureAudioCtx(); setStateKey('speaking') }}>Lena spricht (Demo)</button>
          </div>
          <div className="level-track"><div className="level-fill" style={{ width: `${Math.round(level * 100)}%` }} /></div>
        </div>

        <p className="control-hint">{cur.hint}</p>
        {!editMode && (
          <p className="control-hint">
            „✎ Bearbeiten" öffnet die Regler für den gewählten Zustand — Änderungen
            wirken live, bleiben nach Reload erhalten und lassen sich als JSON kopieren.
          </p>
        )}
      </aside>
      <audio ref={voiceEl} src="/demo.wav" preload="auto" />
    </main>
  )
}
