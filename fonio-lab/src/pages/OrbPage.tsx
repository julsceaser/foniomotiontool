import { useEffect, useState } from 'react'
import { MeshGradient, GrainGradient, Metaballs, Warp, SmokeRing } from '@paper-design/shaders-react'

/**
 * Fonio orb lab — 5 shader modes, extended ranges, deterministic frame
 * scrubbing. All settings persist in localStorage.
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
  ['mesh', 'Mesh'],
  ['grain', 'Grain'],
  ['metaballs', 'Metaballs'],
  ['warp', 'Warp'],
  ['smokering', 'Smoke Ring'],
] as const
type Mode = (typeof MODES)[number][0]
const GRAIN_SHAPES = ['blob', 'wave', 'ripple', 'dots', 'corners', 'truchet'] as const
const WARP_SHAPES = ['checks', 'stripes', 'edge'] as const

type Settings = {
  mode: Mode
  colors: string[]
  speed: number
  frame: number
  scale: number
  rotation: number
  offsetX: number
  offsetY: number
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

const DEFAULTS: Settings = {
  mode: 'mesh',
  colors: PRESETS['Grundfarben (4)'],
  speed: 0.18, frame: 0, scale: 1, rotation: 0, offsetX: 0, offsetY: 0, soften: 0.36,
  distortion: 0.6, swirl: 0.35, grainMixer: 0, grainOverlay: 0,
  softness: 0.6, intensity: 0.35, noise: 0.3, shape: 'blob',
  mbCount: 7, mbSize: 0.65,
  wProportion: 0.45, wSoftness: 0.85, wDistortion: 0.4, wSwirl: 0.7, wSwirlIterations: 8, wShape: 'edge',
  srNoiseScale: 1.4, srThickness: 0.55, srRadius: 0.5, srInnerShape: 0.6,
}

const LS_KEY = 'fonio-orb-tuning-v2'
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
        <span>{step >= 1 ? value.toFixed(0) : value.toFixed(2)}</span>
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

  const nonWhite = s.colors.filter((c) => c.toUpperCase() !== '#FFFFFF')
  const common = {
    className: 'orb-shader', width: '100%' as const, height: '100%' as const,
    speed: s.speed, frame: s.frame, scale: s.scale, rotation: s.rotation,
    offsetX: s.offsetX, offsetY: s.offsetY,
  }

  return (
    <main className="page">
      <div className="orb-stage">
        <div className="orb">
          {s.mode === 'mesh' && (
            <MeshGradient {...common} colors={s.colors} distortion={s.distortion}
              swirl={s.swirl} grainMixer={s.grainMixer} grainOverlay={s.grainOverlay} />
          )}
          {s.mode === 'grain' && (
            <GrainGradient {...common} colorBack="#FFFFFF" colors={nonWhite.slice(0, 7)}
              softness={s.softness} intensity={s.intensity} noise={s.noise} shape={s.shape} />
          )}
          {s.mode === 'metaballs' && (
            <Metaballs {...common} colorBack="#FFFFFF" colors={nonWhite.slice(0, 8)}
              count={s.mbCount} size={s.mbSize} />
          )}
          {s.mode === 'warp' && (
            <Warp {...common} colors={s.colors.slice(0, 10)} proportion={s.wProportion}
              softness={s.wSoftness} distortion={s.wDistortion} swirl={s.wSwirl}
              swirlIterations={s.wSwirlIterations} shape={s.wShape} />
          )}
          {s.mode === 'smokering' && (
            <SmokeRing {...common} colorBack="#FFFFFF" colors={nonWhite.slice(0, 8)}
              noiseScale={s.srNoiseScale} thickness={s.srThickness}
              radius={s.srRadius} innerShape={s.srInnerShape} />
          )}
          <div className="orb-overlay" style={{ opacity: s.soften }} />
          <div className="orb-highlight" />
        </div>
      </div>

      <aside className="controls">
        <h1 className="page-title">Orb / Tuning</h1>

        <div className="control has-tip" data-tip="5 Render-Verfahren: Mesh = weicher Verlauf (Original-Look) · Grain = körnig · Metaballs = verschmelzende Blobs · Warp = wabernde Muster (Wobble-Look) · Smoke Ring = leuchtender Rauchring.">
          <span className="control-label"><span>Shader</span>
            <button className="mini-btn" onClick={reset}>Zurücksetzen</button>
          </span>
          <div className="seg">
            {MODES.map(([m, label]) => (
              <button key={m} className={s.mode === m ? 'seg-btn active' : 'seg-btn'}
                onClick={() => patch({ mode: m })}>{label}</button>
            ))}
          </div>
        </div>

        <div className="control has-tip" data-tip="Setzt alle Farb-Stops auf ein vordefiniertes Set. Danach einzeln anpassbar.">
          <span className="control-label"><span>Farb-Preset</span></span>
          <div className="seg">
            {Object.keys(PRESETS).map((p) => (
              <button key={p} className="seg-btn" onClick={() => patch({ colors: [...PRESETS[p]] })}>{p}</button>
            ))}
          </div>
        </div>

        <div className="control has-tip" data-tip="Die Farb-Stops (max. 10). Mehr Weiß = pastelliger. Bei Metaballs/Smoke Ring wird Weiß als Hintergrund genutzt und aus den Stops gefiltert.">
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

        <Slider label="Speed" hint="Bewegungsgeschwindigkeit — jetzt bis 3× (stärker als vorher). 0 = eingefroren, dann wird der Frame-Scrubber aktiv." value={s.speed} min={0} max={3} onChange={(v) => patch({ speed: v })} />
        {s.speed === 0 && (
          <Slider label="Frame (Scrub)" hint="Bei Speed 0: spult die Animation deterministisch auf einen exakten Zeitpunkt — perfekt für reproduzierbare Standbilder/Exports." value={s.frame} min={0} max={20000} step={10} onChange={(v) => patch({ frame: v })} />
        )}
        <Slider label="Scale" hint="Zoom ins Muster — jetzt 0.1 bis 5 (extremer als vorher)." value={s.scale} min={0.1} max={5} onChange={(v) => patch({ scale: v })} />
        <Slider label="Rotation" hint="Dreht das gesamte Muster in Grad." value={s.rotation} min={0} max={360} step={1} onChange={(v) => patch({ rotation: v })} />
        <Slider label="Offset X" hint="Verschiebt das Muster horizontal — der sichtbare Ausschnitt wandert." value={s.offsetX} min={-1} max={1} onChange={(v) => patch({ offsetX: v })} />
        <Slider label="Offset Y" hint="Verschiebt das Muster vertikal." value={s.offsetY} min={-1} max={1} onChange={(v) => patch({ offsetY: v })} />

        {s.mode === 'mesh' && (
          <>
            <Slider label="Distortion" hint="Verformung der Farbflächen — Bereich jetzt bis 1.5 (übersteuert = sehr waberig)." value={s.distortion} min={0} max={1.5} onChange={(v) => patch({ distortion: v })} />
            <Slider label="Swirl" hint="Wirbel-Effekt — bis 1.5 übersteuert für extreme Spiralen." value={s.swirl} min={0} max={1.5} onChange={(v) => patch({ swirl: v })} />
            <Slider label="Grain Mixer" hint="Körnung in den Farbübergängen." value={s.grainMixer} min={0} max={1} onChange={(v) => patch({ grainMixer: v })} />
            <Slider label="Grain Overlay" hint="Körnung als Schicht über allem — Filmkorn." value={s.grainOverlay} min={0} max={1} onChange={(v) => patch({ grainOverlay: v })} />
          </>
        )}
        {s.mode === 'grain' && (
          <>
            <Slider label="Softness" hint="Wie weich die Farbzonen ineinander laufen." value={s.softness} min={0} max={1} onChange={(v) => patch({ softness: v })} />
            <Slider label="Intensity" hint="Wie kräftig die Körnung die Form modelliert." value={s.intensity} min={0} max={1} onChange={(v) => patch({ intensity: v })} />
            <Slider label="Noise" hint="Menge an Rauschen/Textur." value={s.noise} min={0} max={1} onChange={(v) => patch({ noise: v })} />
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
        {s.mode === 'metaballs' && (
          <>
            <Slider label="Count" hint="Anzahl der Blobs, die umeinander kreisen und verschmelzen." value={s.mbCount} min={1} max={15} step={1} onChange={(v) => patch({ mbCount: v })} />
            <Slider label="Size" hint="Größe der einzelnen Blobs — groß = sie verschmelzen zu einer Masse." value={s.mbSize} min={0.1} max={1} onChange={(v) => patch({ mbSize: v })} />
          </>
        )}
        {s.mode === 'warp' && (
          <>
            <Slider label="Proportion" hint="Mischverhältnis der Farben im Muster." value={s.wProportion} min={0} max={1} onChange={(v) => patch({ wProportion: v })} />
            <Slider label="Softness" hint="Weichheit der Kanten zwischen den Farbflächen." value={s.wSoftness} min={0} max={1} onChange={(v) => patch({ wSoftness: v })} />
            <Slider label="Distortion" hint="Grundverformung des Musters." value={s.wDistortion} min={0} max={1} onChange={(v) => patch({ wDistortion: v })} />
            <Slider label="Swirl" hint="Wirbelstärke." value={s.wSwirl} min={0} max={1} onChange={(v) => patch({ wSwirl: v })} />
            <Slider label="Swirl-Iterationen" hint="Wie oft der Wirbel gefaltet wird — hoch = sehr komplexe Waber-Muster (Wobble-Video-Look)." value={s.wSwirlIterations} min={0} max={20} step={1} onChange={(v) => patch({ wSwirlIterations: v })} />
            <div className="control has-tip" data-tip="Ausgangsmuster, das verwirbelt wird — edge ist am organischsten.">
              <span className="control-label"><span>Muster</span></span>
              <div className="seg">
                {WARP_SHAPES.map((sh) => (
                  <button key={sh} className={s.wShape === sh ? 'seg-btn active' : 'seg-btn'} onClick={() => patch({ wShape: sh })}>{sh}</button>
                ))}
              </div>
            </div>
          </>
        )}
        {s.mode === 'smokering' && (
          <>
            <Slider label="Noise Scale" hint="Größe der Rauch-Verwirbelungen im Ring." value={s.srNoiseScale} min={0} max={4} onChange={(v) => patch({ srNoiseScale: v })} />
            <Slider label="Thickness" hint="Dicke des Rings." value={s.srThickness} min={0} max={1} onChange={(v) => patch({ srThickness: v })} />
            <Slider label="Radius" hint="Größe des Rings im Bild." value={s.srRadius} min={0} max={1} onChange={(v) => patch({ srRadius: v })} />
            <Slider label="Inner Shape" hint="Wie stark die Innenkante definiert ist — niedrig = offener Nebel, hoch = klarer Ring." value={s.srInnerShape} min={0} max={4} onChange={(v) => patch({ srInnerShape: v })} />
          </>
        )}

        <Slider label="Soften (weißes Overlay)" hint="Weiß über allem — der Pastell-Regler. Hoch drehen, wenn es zu satt wirkt." value={s.soften} min={0} max={0.8} onChange={(v) => patch({ soften: v })} />

        <p className="control-hint">
          Alle Einstellungen speichern sich automatisch. Speed 0 + Frame-Scrubber
          = exakt reproduzierbare Standbilder für Exports.
        </p>
      </aside>
    </main>
  )
}
