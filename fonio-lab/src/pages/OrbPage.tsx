import { useEffect, useState } from 'react'
import { MeshGradient, GrainGradient } from '@paper-design/shaders-react'

/**
 * Fonio orb — soft pastel sphere built from the 4 brand base colors.
 * All settings persist in localStorage; every slider has a hover tooltip.
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

type ShaderKind = 'mesh' | 'grain'
const GRAIN_SHAPES = ['blob', 'wave', 'ripple', 'dots', 'corners', 'truchet'] as const
type GrainShape = (typeof GRAIN_SHAPES)[number]

type Settings = {
  kind: ShaderKind
  colors: string[]
  speed: number
  scale: number
  rotation: number
  soften: number
  distortion: number
  swirl: number
  grainMixer: number
  grainOverlay: number
  softness: number
  intensity: number
  noise: number
  shape: GrainShape
}

const DEFAULTS: Settings = {
  kind: 'mesh',
  colors: PRESETS['Grundfarben (4)'],
  speed: 0.18, scale: 1, rotation: 0, soften: 0.36,
  distortion: 0.6, swirl: 0.35, grainMixer: 0, grainOverlay: 0,
  softness: 0.6, intensity: 0.35, noise: 0.3, shape: 'blob',
}

const LS_KEY = 'fonio-orb-tuning-v1'
const load = (): Settings => {
  try {
    const raw = localStorage.getItem(LS_KEY)
    if (raw) return { ...DEFAULTS, ...JSON.parse(raw) }
  } catch { /* ignore */ }
  return { ...DEFAULTS, colors: [...DEFAULTS.colors] }
}

function Slider(props: {
  label: string
  hint: string
  value: number
  min: number
  max: number
  step?: number
  onChange: (v: number) => void
}) {
  const { label, hint, value, min, max, step = 0.01, onChange } = props
  return (
    <label className="control has-tip" data-tip={hint}>
      <span className="control-label">
        <span>{label}</span>
        <span>{value.toFixed(2)}</span>
      </span>
      <input type="range" min={min} max={max} step={step} value={value}
        onChange={(e) => onChange(Number(e.target.value))} />
    </label>
  )
}

export default function OrbPage() {
  const [s, setS] = useState<Settings>(load)
  const patch = (p: Partial<Settings>) => setS((old) => ({ ...old, ...p }))

  useEffect(() => { localStorage.setItem(LS_KEY, JSON.stringify(s)) }, [s])

  const setColor = (i: number, v: string) => patch({ colors: s.colors.map((x, j) => (j === i ? v : x)) })
  const removeColor = (i: number) => patch({ colors: s.colors.filter((_, j) => j !== i) })
  const addColor = () => { if (s.colors.length < 10) patch({ colors: [...s.colors, '#FFFFFF'] }) }
  const reset = () => { localStorage.removeItem(LS_KEY); setS({ ...DEFAULTS, colors: [...DEFAULTS.colors] }) }

  return (
    <main className="page">
      <div className="orb-stage">
        <div className="orb">
          {s.kind === 'mesh' ? (
            <MeshGradient className="orb-shader" width="100%" height="100%"
              colors={s.colors} speed={s.speed} distortion={s.distortion} swirl={s.swirl}
              grainMixer={s.grainMixer} grainOverlay={s.grainOverlay}
              scale={s.scale} rotation={s.rotation} />
          ) : (
            <GrainGradient className="orb-shader" width="100%" height="100%"
              colorBack="#FFFFFF"
              colors={s.colors.filter((c) => c.toUpperCase() !== '#FFFFFF').slice(0, 7)}
              speed={s.speed} softness={s.softness} intensity={s.intensity}
              noise={s.noise} shape={s.shape} scale={s.scale} rotation={s.rotation} />
          )}
          <div className="orb-overlay" style={{ opacity: s.soften }} />
          <div className="orb-highlight" />
        </div>
      </div>

      <aside className="controls">
        <h1 className="page-title">Orb / Tuning</h1>

        <div className="control has-tip" data-tip="Mesh = glatter Verlauf wie das Original. Grain = körnige, texturierte Variante mit wählbarer Grundform.">
          <span className="control-label"><span>Shader</span>
            <button className="mini-btn" onClick={reset}>Zurücksetzen</button>
          </span>
          <div className="seg">
            <button className={s.kind === 'mesh' ? 'seg-btn active' : 'seg-btn'} onClick={() => patch({ kind: 'mesh' })}>Mesh (glatt)</button>
            <button className={s.kind === 'grain' ? 'seg-btn active' : 'seg-btn'} onClick={() => patch({ kind: 'grain' })}>Grain (Textur)</button>
          </div>
        </div>

        <div className="control has-tip" data-tip="Setzt alle 10 Farb-Stops auf ein vordefiniertes Set. Danach einzeln anpassbar.">
          <span className="control-label"><span>Farb-Preset</span></span>
          <div className="seg">
            {Object.keys(PRESETS).map((p) => (
              <button key={p} className="seg-btn" onClick={() => patch({ colors: [...PRESETS[p]] })}>{p}</button>
            ))}
          </div>
        </div>

        <div className="control has-tip" data-tip="Die Farb-Stops des Verlaufs (max. 10). Mehr Weiß = pastelliger. Klick auf eine Farbe öffnet den Picker, × entfernt sie.">
          <span className="control-label">
            <span>Farben ({s.colors.length}/10)</span>
            <button className="mini-btn" onClick={addColor}>+ Farbe</button>
          </span>
          <div className="swatch-row">
            {s.colors.map((c, i) => (
              <span key={i} className="swatch">
                <input type="color" value={c} onChange={(e) => setColor(i, e.target.value)} />
                <button className="swatch-x" onClick={() => removeColor(i)}>×</button>
              </span>
            ))}
          </div>
        </div>

        <Slider label="Speed" hint="Wie schnell sich der Verlauf bewegt. 0 = eingefroren, gut für Standbilder." value={s.speed} min={0} max={1} onChange={(v) => patch({ speed: v })} />
        <Slider label="Scale" hint="Zoom ins Verlaufsmuster — kleiner = mehr Struktur sichtbar, größer = ruhiger." value={s.scale} min={0.3} max={3} onChange={(v) => patch({ scale: v })} />
        <Slider label="Rotation" hint="Dreht das gesamte Verlaufsmuster in Grad." value={s.rotation} min={0} max={360} step={1} onChange={(v) => patch({ rotation: v })} />

        {s.kind === 'mesh' ? (
          <>
            <Slider label="Distortion" hint="Verformt die Farbflächen — hoch = organischer und waberiger, niedrig = ruhige weiche Flächen." value={s.distortion} min={0} max={1} onChange={(v) => patch({ distortion: v })} />
            <Slider label="Swirl" hint="Wirbel-Effekt: zieht die Farben spiralförmig ineinander. Hoch = ‚Nachdenken'-Look." value={s.swirl} min={0} max={1} onChange={(v) => patch({ swirl: v })} />
            <Slider label="Grain Mixer" hint="Körnung IN den Farbübergängen — macht die Kanten der Flächen körnig-organisch." value={s.grainMixer} min={0} max={1} onChange={(v) => patch({ grainMixer: v })} />
            <Slider label="Grain Overlay" hint="Körnung als Schicht über allem — wie Filmkorn auf dem ganzen Orb." value={s.grainOverlay} min={0} max={1} onChange={(v) => patch({ grainOverlay: v })} />
          </>
        ) : (
          <>
            <Slider label="Softness" hint="Wie weich die Farbzonen ineinander laufen — hoch = nebelig, niedrig = klare Zonen." value={s.softness} min={0} max={1} onChange={(v) => patch({ softness: v })} />
            <Slider label="Intensity" hint="Wie kräftig die Körnung die Form modelliert — der Haupt-Charakterregler im Grain-Modus." value={s.intensity} min={0} max={1} onChange={(v) => patch({ intensity: v })} />
            <Slider label="Noise" hint="Menge an Rauschen/Textur im Bild." value={s.noise} min={0} max={1} onChange={(v) => patch({ noise: v })} />
            <div className="control has-tip" data-tip="Grundform des Grain-Verlaufs — blob kommt dem Orb am nächsten.">
              <span className="control-label"><span>Shape</span></span>
              <div className="seg">
                {GRAIN_SHAPES.map((sh) => (
                  <button key={sh} className={s.shape === sh ? 'seg-btn active' : 'seg-btn'} onClick={() => patch({ shape: sh })}>{sh}</button>
                ))}
              </div>
            </div>
          </>
        )}

        <Slider label="Soften (weißes Overlay)" hint="Legt Weiß über den ganzen Orb — der Pastell-Regler. Hoch drehen, wenn es zu satt/neon wirkt." value={s.soften} min={0} max={0.8} onChange={(v) => patch({ soften: v })} />

        <p className="control-hint">
          Alle Einstellungen werden automatisch gespeichert und überleben den
          Reload. „Zurücksetzen" holt die Standard-Werte zurück.
        </p>
      </aside>
    </main>
  )
}
