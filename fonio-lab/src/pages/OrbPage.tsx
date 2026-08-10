import { useEffect, useRef, useState } from 'react'
import { MeshGradient, GrainGradient, Metaballs, Warp, SmokeRing } from '@paper-design/shaders-react'
import { DEFAULT_STATES, loadStates, saveStateParams, deepCopy, type StateParams } from '../orbStates'
// @ts-expect-error – shared JS engine (same file the renderer uses)
import { envStep, DEFAULT_VOICE } from '../engine/orbTimeline.mjs'

/**
 * Orb EDITOR — the dropdown at the top selects what is being edited:
 * the free playground or one of the 8 Lena states. Changes are drafts
 * until "Speichern". The states page is the preview counterpart.
 */

const PRESETS: Record<string, string[]> = {
  'Grundfarben (4)': [
    '#FFFFFF', '#585DFE', '#FFFFFF', '#58E8FE', '#585DFE',
    '#FFFFFF', '#58E8FE', '#FFFFFF', '#58FE85', '#FFFFFF',
  ],
  'Pastell (Orb-Töne)': [
    '#DCFAFC', '#B1E4F7', '#85B2F5', '#98D1F9', '#FFFFFF',
    '#BDF5F3', '#6B98E8', '#A6EEC9', '#FFFFFF', '#B2D4F9',
  ],
  'Kräftig (ohne Weiß)': ['#585DFE', '#58E8FE', '#58FE85', '#85B2F5'],
}

const MODES = [
  ['mesh', 'Mesh'], ['grain', 'Grain'], ['metaballs', 'Metaballs'],
  ['warp', 'Warp'], ['smokering', 'Smoke Ring'],
] as const
type Mode = (typeof MODES)[number][0]
const GRAIN_SHAPES = ['blob', 'wave', 'ripple', 'dots', 'corners', 'truchet'] as const
const WARP_SHAPES = ['checks', 'stripes', 'edge'] as const

type Playground = {
  mode: Mode
  colors: string[]
  speed: number
  frame: number
  scale: number
  rotation: number
  offsetX: number
  offsetY: number
  rotSpeed: number
  soften: number
  distortion: number
  swirl: number
  grainMixer: number
  grainOverlay: number
  softness: number
  intensity: number
  noise: number
  shape: (typeof GRAIN_SHAPES)[number]
  mbCount: number
  mbSize: number
  wProportion: number
  wSoftness: number
  wDistortion: number
  wSwirl: number
  wSwirlIterations: number
  wShape: (typeof WARP_SHAPES)[number]
  srNoiseScale: number
  srThickness: number
  srRadius: number
  srInnerShape: number
}

const PG_DEFAULTS: Playground = {
  mode: 'mesh',
  colors: PRESETS['Grundfarben (4)'],
  speed: 0.18, frame: 0, scale: 1, rotation: 0, offsetX: 0, offsetY: 0, rotSpeed: 0, soften: 0.36,
  distortion: 0.6, swirl: 0.35, grainMixer: 0, grainOverlay: 0,
  softness: 0.6, intensity: 0.35, noise: 0.3, shape: 'blob',
  mbCount: 7, mbSize: 0.65,
  wProportion: 0.45, wSoftness: 0.85, wDistortion: 0.4, wSwirl: 0.7, wSwirlIterations: 8, wShape: 'edge',
  srNoiseScale: 1.4, srThickness: 0.55, srRadius: 0.5, srInnerShape: 0.6,
}

const PG_LS_KEY = 'fonio-orb-tuning-v2'
const loadPg = (): Playground => {
  try {
    const raw = localStorage.getItem(PG_LS_KEY)
    if (raw) return { ...PG_DEFAULTS, ...JSON.parse(raw) }
  } catch { /* ignore */ }
  return deepCopy(PG_DEFAULTS)
}

function Slider(props: {
  label: string; hint: string; value: number; min: number; max: number
  step?: number; onChange: (v: number) => void
}) {
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

export default function OrbPage() {
  const [target, setTarget] = useState<string>('playground')
  const [pg, setPg] = useState<Playground>(loadPg)
  const [stateDraft, setStateDraft] = useState<StateParams>(() => loadStates().idle.p)
  const [dirty, setDirty] = useState(false)
  const rotorRef = useRef<HTMLDivElement | null>(null)
  const [micOn, setMicOn] = useState(false)
  const [voicePlaying, setVoicePlaying] = useState(false)
  const [level, setLevel] = useState(0)
  const analyser = useRef<AnalyserNode | null>(null)
  const audioCtx = useRef<AudioContext | null>(null)
  const micStream = useRef<MediaStream | null>(null)
  const voiceEl = useRef<HTMLAudioElement | null>(null)
  const voiceConnected = useRef(false)
  const envR = useRef(0)
  const [savedMsg, setSavedMsg] = useState('')

  const isPg = target === 'playground'

  const switchTarget = (t: string) => {
    setTarget(t)
    setDirty(false)
    setSavedMsg('')
    if (t === 'playground') setPg(loadPg())
    else setStateDraft(deepCopy(loadStates()[t].p))
  }

  const patchPg = (p: Partial<Playground>) => { setPg((o) => ({ ...o, ...p })); setDirty(true) }
  const patchState = (p: Partial<StateParams>) => { setStateDraft((o) => ({ ...o, ...p })); setDirty(true) }

  const save = () => {
    if (isPg) localStorage.setItem(PG_LS_KEY, JSON.stringify(pg))
    else saveStateParams(target, stateDraft)
    setDirty(false)
    setSavedMsg('Gespeichert ✓')
    setTimeout(() => setSavedMsg(''), 2000)
  }

  // ---------- Stimme im Editor: Mikrofon + Demo, Pegel treibt die Preview ----------
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
  const toggleVoice = () => {
    const el = voiceEl.current
    if (!el) return
    if (voicePlaying) { el.pause(); setVoicePlaying(false); return }
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
    setVoicePlaying(true)
  }
  useEffect(() => {
    let raf = 0
    let lastRender = 0
    let last = performance.now()
    const data = new Uint8Array(256)
    const tick = (now: number) => {
      const dt = Math.min(0.1, (now - last) / 1000)
      last = now
      if (analyser.current && (micStream.current || voicePlaying)) {
        analyser.current.getByteTimeDomainData(data)
        let sum = 0
        for (let i = 0; i < data.length; i++) { const d = (data[i] - 128) / 128; sum += d * d }
        const raw = Math.min(1, Math.sqrt(sum / data.length) * 4)
        envR.current = envStep(envR.current, raw, DEFAULT_VOICE, dt)
        if (now - lastRender > 33) { lastRender = now; setLevel(envR.current) }
      } else if (level !== 0 && now - lastRender > 200) {
        envR.current = 0
        lastRender = now
        setLevel(0)
      }
      raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [voicePlaying])

  // continuous rotation (deg/s), negative = counterclockwise.
  // Applied as a direct DOM transform every frame — no React re-renders, no jank.
  const activeRotSpeed = isPg ? pg.rotSpeed : stateDraft.rotationSpeed
  const rotSpeedRef = useRef(activeRotSpeed)
  rotSpeedRef.current = activeRotSpeed
  useEffect(() => {
    let raf = 0
    let angle = 0
    let last = performance.now()
    const tick = (now: number) => {
      angle = (angle + rotSpeedRef.current * ((now - last) / 1000)) % 360
      last = now
      if (rotorRef.current) rotorRef.current.style.transform = `rotate(${angle}deg)`
      raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [])

  // warn about unsaved changes on tab close
  useEffect(() => {
    const h = (e: BeforeUnloadEvent) => { if (dirty) e.preventDefault() }
    window.addEventListener('beforeunload', h)
    return () => window.removeEventListener('beforeunload', h)
  }, [dirty])

  const colors = isPg ? pg.colors : stateDraft.colors
  const setColor = (i: number, v: string) => {
    const next = colors.map((x, j) => (j === i ? v : x))
    if (isPg) patchPg({ colors: next }); else patchState({ colors: next })
  }
  const removeColor = (i: number) => {
    const next = colors.filter((_, j) => j !== i)
    if (isPg) patchPg({ colors: next }); else patchState({ colors: next })
  }
  const addColor = () => {
    if (colors.length >= 10) return
    const next = [...colors, '#FFFFFF']
    if (isPg) patchPg({ colors: next }); else patchState({ colors: next })
  }

  const nonWhite = colors.filter((c) => c.toUpperCase() !== '#FFFFFF')
  // Stimme wirkt nur in den Zuständen, die wirklich zuhören oder sprechen
  const vEnv = !isPg && ['listening', 'speaking'].includes(target) ? level : 0
  const soften = isPg ? pg.soften : Math.max(0, Math.min(1, stateDraft.soften + vEnv * DEFAULT_VOICE.soften))

  return (
    <main className="page">
      <div className="orb-stage">
        <div className="orb" style={isPg ? undefined : { transform: `translateX(${stateDraft.offsetX * 260}px)` }}>
          <div className="orb-rotor" ref={rotorRef}>
          {isPg ? (
            <>
              {pg.mode === 'mesh' && (
                <MeshGradient className="orb-shader" width="100%" height="100%"
                  colors={pg.colors} speed={pg.speed} frame={pg.frame} scale={pg.scale}
                  rotation={pg.rotation} offsetX={pg.offsetX} offsetY={pg.offsetY}
                  distortion={pg.distortion} swirl={pg.swirl}
                  grainMixer={pg.grainMixer} grainOverlay={pg.grainOverlay} />
              )}
              {pg.mode === 'grain' && (
                <GrainGradient className="orb-shader" width="100%" height="100%"
                  colorBack="#FFFFFF" colors={nonWhite.slice(0, 7)}
                  speed={pg.speed} frame={pg.frame} scale={pg.scale} rotation={pg.rotation}
                  offsetX={pg.offsetX} offsetY={pg.offsetY}
                  softness={pg.softness} intensity={pg.intensity} noise={pg.noise} shape={pg.shape} />
              )}
              {pg.mode === 'metaballs' && (
                <Metaballs className="orb-shader" width="100%" height="100%"
                  colorBack="#FFFFFF" colors={nonWhite.slice(0, 8)}
                  speed={pg.speed} frame={pg.frame} scale={pg.scale} rotation={pg.rotation}
                  offsetX={pg.offsetX} offsetY={pg.offsetY}
                  count={pg.mbCount} size={pg.mbSize} />
              )}
              {pg.mode === 'warp' && (
                <Warp className="orb-shader" width="100%" height="100%"
                  colors={pg.colors.slice(0, 10)} speed={pg.speed} frame={pg.frame}
                  scale={pg.scale} rotation={pg.rotation} offsetX={pg.offsetX} offsetY={pg.offsetY}
                  proportion={pg.wProportion} softness={pg.wSoftness} distortion={pg.wDistortion}
                  swirl={pg.wSwirl} swirlIterations={pg.wSwirlIterations} shape={pg.wShape} />
              )}
              {pg.mode === 'smokering' && (
                <SmokeRing className="orb-shader" width="100%" height="100%"
                  colorBack="#FFFFFF" colors={nonWhite.slice(0, 8)}
                  speed={pg.speed} frame={pg.frame} scale={pg.scale} rotation={pg.rotation}
                  offsetX={pg.offsetX} offsetY={pg.offsetY}
                  noiseScale={pg.srNoiseScale} thickness={pg.srThickness}
                  radius={pg.srRadius} innerShape={pg.srInnerShape} />
              )}
            </>
          ) : (
            <MeshGradient className="orb-shader" width="100%" height="100%"
              colors={stateDraft.colors} speed={stateDraft.speed + vEnv * DEFAULT_VOICE.speed}
              scale={Math.max(0.1, stateDraft.scale * (1 + vEnv * DEFAULT_VOICE.scale))}
              distortion={Math.max(0, stateDraft.distortion + vEnv * DEFAULT_VOICE.distortion)}
              swirl={Math.max(0, stateDraft.swirl + vEnv * DEFAULT_VOICE.swirl)}
              grainMixer={stateDraft.grainMixer} grainOverlay={0} />
          )}
          </div>
          <div className="orb-overlay" style={{ opacity: soften }} />
          <div className="orb-highlight" />
        </div>
      </div>

      <aside className="controls">
        <h1 className="page-title">Orb / Editor</h1>

        <div className="control has-tip" data-tip="Was gerade bearbeitet wird: Playground = freies Experimentieren mit allen Shadern. Zustände = die Presets, die die Zustände-Seite (Preview) nutzt.">
          <span className="control-label"><span>Bearbeiten</span></span>
          <div className="edit-bar">
            <select className="edit-select" value={target} onChange={(e) => switchTarget(e.target.value)}>
              <option value="playground">Playground (frei)</option>
              {Object.keys(DEFAULT_STATES).map((k) => (
                <option key={k} value={k}>Zustand: {DEFAULT_STATES[k].label}</option>
              ))}
            </select>
            <button className={dirty ? 'save-btn dirty' : 'save-btn'} onClick={save}>
              {savedMsg || (dirty ? '● Speichern' : 'Speichern')}
            </button>
          </div>
        </div>

        {isPg && (
          <div className="control has-tip" data-tip="5 Render-Verfahren: Mesh = weicher Verlauf (Original-Look) · Grain = körnig · Metaballs = verschmelzende Blobs · Warp = wabernde Muster · Smoke Ring = leuchtender Rauchring.">
            <span className="control-label"><span>Shader</span></span>
            <div className="seg">
              {MODES.map(([m, label]) => (
                <button key={m} className={pg.mode === m ? 'seg-btn active' : 'seg-btn'}
                  onClick={() => patchPg({ mode: m })}>{label}</button>
              ))}
            </div>
          </div>
        )}

        <div className="control has-tip" data-tip="Setzt alle Farb-Stops auf ein vordefiniertes Set — wirkt NUR auf das aktuell gewählte Bearbeiten-Ziel. Achtung bei Zuständen: überschreibt deren eigene Farb-Gewichtung; ‚Standard' holt sie zurück.">
          <span className="control-label"><span>Farb-Preset</span>
            {!isPg && (
              <button className="mini-btn" onClick={() => { patchState(deepCopy(DEFAULT_STATES[target].p)) }}>↺ Standard</button>
            )}
          </span>
          <div className="seg">
            {Object.keys(PRESETS).map((p) => (
              <button key={p} className="seg-btn"
                onClick={() => (isPg ? patchPg({ colors: [...PRESETS[p]] }) : patchState({ colors: [...PRESETS[p]] }))}>{p}</button>
            ))}
          </div>
        </div>

        <div className="control has-tip" data-tip="Die Farb-Stops (max. 10). Mehr Weiß = pastelliger.">
          <span className="control-label">
            <span>Farben ({colors.length}/10)</span>
            <button className="mini-btn" onClick={addColor}>+ Farbe</button>
          </span>
          <div className="swatch-row">
            {colors.map((c, i) => (
              <span key={i} className="swatch">
                <input type="color" value={c} onChange={(e) => setColor(i, e.target.value)} />
                <button className="swatch-x" onClick={() => removeColor(i)}>×</button>
              </span>
            ))}
          </div>
        </div>

        {isPg ? (
          <>
            <Slider label="Speed" hint="Bewegungsgeschwindigkeit — bis 3×. Bei 0 erscheint der Frame-Scrubber." value={pg.speed} min={0} max={3} onChange={(v) => patchPg({ speed: v })} />
            {pg.speed === 0 && (
              <Slider label="Frame (Scrub)" hint="Spult die Animation deterministisch auf einen exakten Zeitpunkt — reproduzierbare Standbilder." value={pg.frame} min={0} max={20000} step={10} onChange={(v) => patchPg({ frame: v })} />
            )}
            <Slider label="Scale" hint="Zoom ins Muster (0.1–5)." value={pg.scale} min={0.1} max={5} onChange={(v) => patchPg({ scale: v })} />
            <Slider label="Rotation (Startwinkel)" hint="Statischer Startwinkel des Musters in Grad." value={pg.rotation} min={0} max={360} step={1} onChange={(v) => patchPg({ rotation: v })} />
            <Slider label="Drehung (°/s)" hint="Kontinuierliche Rotation wie auf der fonio.ai-Website. Plus = im Uhrzeigersinn, Minus = gegen den Uhrzeigersinn, 0 = aus." value={pg.rotSpeed} min={-120} max={120} step={1} onChange={(v) => patchPg({ rotSpeed: v })} />
            <Slider label="Offset X" hint="Verschiebt das Muster horizontal." value={pg.offsetX} min={-1} max={1} onChange={(v) => patchPg({ offsetX: v })} />
            <Slider label="Offset Y" hint="Verschiebt das Muster vertikal." value={pg.offsetY} min={-1} max={1} onChange={(v) => patchPg({ offsetY: v })} />
            {pg.mode === 'mesh' && (
              <>
                <Slider label="Distortion" hint="Verformung der Farbflächen — bis 1.5 übersteuerbar." value={pg.distortion} min={0} max={1.5} onChange={(v) => patchPg({ distortion: v })} />
                <Slider label="Swirl" hint="Wirbel — bis 1.5 übersteuerbar." value={pg.swirl} min={0} max={1.5} onChange={(v) => patchPg({ swirl: v })} />
                <Slider label="Grain Mixer" hint="Körnung in den Farbübergängen." value={pg.grainMixer} min={0} max={1} onChange={(v) => patchPg({ grainMixer: v })} />
                <Slider label="Grain Overlay" hint="Körnung als Schicht über allem — Filmkorn." value={pg.grainOverlay} min={0} max={1} onChange={(v) => patchPg({ grainOverlay: v })} />
              </>
            )}
            {pg.mode === 'grain' && (
              <>
                <Slider label="Softness" hint="Wie weich die Farbzonen ineinander laufen." value={pg.softness} min={0} max={1} onChange={(v) => patchPg({ softness: v })} />
                <Slider label="Intensity" hint="Wie kräftig die Körnung die Form modelliert." value={pg.intensity} min={0} max={1} onChange={(v) => patchPg({ intensity: v })} />
                <Slider label="Noise" hint="Menge an Rauschen/Textur." value={pg.noise} min={0} max={1} onChange={(v) => patchPg({ noise: v })} />
                <div className="control has-tip" data-tip="Grundform — blob kommt dem Orb am nächsten.">
                  <span className="control-label"><span>Shape</span></span>
                  <div className="seg">
                    {GRAIN_SHAPES.map((sh) => (
                      <button key={sh} className={pg.shape === sh ? 'seg-btn active' : 'seg-btn'} onClick={() => patchPg({ shape: sh })}>{sh}</button>
                    ))}
                  </div>
                </div>
              </>
            )}
            {pg.mode === 'metaballs' && (
              <>
                <Slider label="Count" hint="Anzahl der Blobs." value={pg.mbCount} min={1} max={15} step={1} onChange={(v) => patchPg({ mbCount: v })} />
                <Slider label="Size" hint="Blob-Größe — groß = verschmilzt zu einer Masse." value={pg.mbSize} min={0.1} max={1} onChange={(v) => patchPg({ mbSize: v })} />
              </>
            )}
            {pg.mode === 'warp' && (
              <>
                <Slider label="Proportion" hint="Mischverhältnis der Farben." value={pg.wProportion} min={0} max={1} onChange={(v) => patchPg({ wProportion: v })} />
                <Slider label="Softness" hint="Weichheit der Kanten." value={pg.wSoftness} min={0} max={1} onChange={(v) => patchPg({ wSoftness: v })} />
                <Slider label="Distortion" hint="Grundverformung." value={pg.wDistortion} min={0} max={1} onChange={(v) => patchPg({ wDistortion: v })} />
                <Slider label="Swirl" hint="Wirbelstärke." value={pg.wSwirl} min={0} max={1} onChange={(v) => patchPg({ wSwirl: v })} />
                <Slider label="Swirl-Iterationen" hint="Faltungen des Wirbels — hoch = Wobble-Video-Look." value={pg.wSwirlIterations} min={0} max={20} step={1} onChange={(v) => patchPg({ wSwirlIterations: v })} />
                <div className="control has-tip" data-tip="Ausgangsmuster — edge ist am organischsten.">
                  <span className="control-label"><span>Muster</span></span>
                  <div className="seg">
                    {WARP_SHAPES.map((sh) => (
                      <button key={sh} className={pg.wShape === sh ? 'seg-btn active' : 'seg-btn'} onClick={() => patchPg({ wShape: sh })}>{sh}</button>
                    ))}
                  </div>
                </div>
              </>
            )}
            {pg.mode === 'smokering' && (
              <>
                <Slider label="Noise Scale" hint="Größe der Rauch-Verwirbelungen." value={pg.srNoiseScale} min={0} max={4} onChange={(v) => patchPg({ srNoiseScale: v })} />
                <Slider label="Thickness" hint="Dicke des Rings." value={pg.srThickness} min={0} max={1} onChange={(v) => patchPg({ srThickness: v })} />
                <Slider label="Radius" hint="Größe des Rings." value={pg.srRadius} min={0} max={1} onChange={(v) => patchPg({ srRadius: v })} />
                <Slider label="Inner Shape" hint="Definition der Innenkante." value={pg.srInnerShape} min={0} max={4} onChange={(v) => patchPg({ srInnerShape: v })} />
              </>
            )}
            <Slider label="Soften (weißes Overlay)" hint="Weiß über allem — der Pastell-Regler." value={pg.soften} min={0} max={0.8} onChange={(v) => patchPg({ soften: v })} />
          </>
        ) : (
          <>
            <Slider label="Speed" hint="Bewegungsgeschwindigkeit dieses Zustands." value={stateDraft.speed} min={0} max={1} onChange={(v) => patchState({ speed: v })} />
            <Slider label="Distortion" hint="Verformung der Farbflächen." value={stateDraft.distortion} min={0} max={1} onChange={(v) => patchState({ distortion: v })} />
            <Slider label="Swirl" hint="Wirbel — hoch = ‚Nachdenken'-Look." value={stateDraft.swirl} min={0} max={1} onChange={(v) => patchState({ swirl: v })} />
            <Slider label="Grain" hint="Körnung — Gedankenrauschen." value={stateDraft.grainMixer} min={0} max={1} onChange={(v) => patchState({ grainMixer: v })} />
            <Slider label="Muster-Zoom" hint="Zoomt die INNERE Optik (das Muster) — nicht die Größe des Balls. Klein = mehr Struktur sichtbar, groß = ruhige Flächen." value={stateDraft.scale} min={0.4} max={2} onChange={(v) => patchState({ scale: v })} />
            <Slider label="Soften (Weiß)" hint="Pastell-Regler." value={stateDraft.soften} min={0} max={0.8} onChange={(v) => patchState({ soften: v })} />
            <Slider label="Versatz X" hint="Schiebt den Orb horizontal — z. B. für Durchstellen." value={stateDraft.offsetX} min={-1} max={1} onChange={(v) => patchState({ offsetX: v })} />
            <Slider label="Drehung (°/s)" hint="Kontinuierliche Rotation dieses Zustands. Plus = Uhrzeigersinn, Minus = dagegen, 0 = aus." value={stateDraft.rotationSpeed} min={-120} max={120} step={1} onChange={(v) => patchState({ rotationSpeed: v })} />
            <div className="control has-tip" data-tip="Zum Beurteilen der Stimm-Reaktion beim Tunen: Mikrofon = deine Stimme, Demo = Lenas Stimme. Wirkt in den Zuständen Zuhören und Sprechen auf die Preview.">
              <span className="control-label"><span>Stimme (Test)</span></span>
              <div className="seg">
                <button className={micOn ? 'seg-btn active' : 'seg-btn'} onClick={toggleMic}>{micOn ? 'Mikrofon aus' : 'Mikrofon an'}</button>
                <button className={voicePlaying ? 'seg-btn active' : 'seg-btn'} onClick={toggleVoice}>{voicePlaying ? 'Demo stoppen' : 'Lena spricht (Demo)'}</button>
              </div>
              <div className="level-track"><div className="level-fill" style={{ width: `${Math.round(level * 100)}%` }} /></div>
            </div>
          </>
        )}

        <p className="control-hint">
          {isPg
            ? 'Playground: frei experimentieren, „Speichern" sichert deinen Stand.'
            : `Du bearbeitest den Zustand „${DEFAULT_STATES[target].label}". „Speichern" übernimmt ihn — die Zustände-Seite (Preview) nutzt ihn dann sofort.`}
        </p>
      </aside>
      <audio ref={voiceEl} src="/demo.wav" preload="auto" />
    </main>
  )
}
