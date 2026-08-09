import { useState } from 'react'
import { MeshGradient, GrainGradient } from '@paper-design/shaders-react'

/**
 * Fonio orb — soft pastel sphere built from the 4 brand base colors.
 * Full parameter surface of both Paper Shaders exposed:
 *  - MeshGradient: colors (max 10), speed, distortion, swirl, grainMixer,
 *    grainOverlay, scale, rotation
 *  - GrainGradient: colors, speed, softness, intensity, noise, shape
 * Plus the lab-own white "Soften" overlay for the pastel look.
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

function Slider(props: {
  label: string
  value: number
  min: number
  max: number
  step?: number
  onChange: (v: number) => void
}) {
  const { label, value, min, max, step = 0.01, onChange } = props
  return (
    <label className="control">
      <span className="control-label">
        <span>{label}</span>
        <span>{value.toFixed(2)}</span>
      </span>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
      />
    </label>
  )
}

export default function OrbPage() {
  const [kind, setKind] = useState<ShaderKind>('mesh')
  const [colors, setColors] = useState<string[]>(PRESETS['Grundfarben (4)'])

  // shared
  const [speed, setSpeed] = useState(0.18)
  const [scale, setScale] = useState(1)
  const [rotation, setRotation] = useState(0)
  const [soften, setSoften] = useState(0.36)

  // mesh
  const [distortion, setDistortion] = useState(0.6)
  const [swirl, setSwirl] = useState(0.35)
  const [grainMixer, setGrainMixer] = useState(0)
  const [grainOverlay, setGrainOverlay] = useState(0)

  // grain gradient
  const [softness, setSoftness] = useState(0.6)
  const [intensity, setIntensity] = useState(0.35)
  const [noise, setNoise] = useState(0.3)
  const [shape, setShape] = useState<(typeof GRAIN_SHAPES)[number]>('blob')

  const setColor = (i: number, v: string) =>
    setColors((c) => c.map((x, j) => (j === i ? v : x)))
  const removeColor = (i: number) => setColors((c) => c.filter((_, j) => j !== i))
  const addColor = () => setColors((c) => (c.length < 10 ? [...c, '#FFFFFF'] : c))

  return (
    <main className="page">
      <div className="orb-stage">
        <div className="orb">
          {kind === 'mesh' ? (
            <MeshGradient
              className="orb-shader"
              width="100%"
              height="100%"
              colors={colors}
              speed={speed}
              distortion={distortion}
              swirl={swirl}
              grainMixer={grainMixer}
              grainOverlay={grainOverlay}
              scale={scale}
              rotation={rotation}
            />
          ) : (
            <GrainGradient
              className="orb-shader"
              width="100%"
              height="100%"
              colorBack="#FFFFFF"
              colors={colors.filter((c) => c.toUpperCase() !== '#FFFFFF').slice(0, 7)}
              speed={speed}
              softness={softness}
              intensity={intensity}
              noise={noise}
              shape={shape}
              scale={scale}
              rotation={rotation}
            />
          )}
          <div className="orb-overlay" style={{ opacity: soften }} />
          <div className="orb-highlight" />
        </div>
      </div>

      <aside className="controls">
        <h1 className="page-title">Orb / Tuning</h1>

        <div className="control">
          <span className="control-label"><span>Shader</span></span>
          <div className="seg">
            <button
              className={kind === 'mesh' ? 'seg-btn active' : 'seg-btn'}
              onClick={() => setKind('mesh')}
            >
              Mesh (glatt)
            </button>
            <button
              className={kind === 'grain' ? 'seg-btn active' : 'seg-btn'}
              onClick={() => setKind('grain')}
            >
              Grain (Textur)
            </button>
          </div>
        </div>

        <div className="control">
          <span className="control-label"><span>Farb-Preset</span></span>
          <div className="seg">
            {Object.keys(PRESETS).map((p) => (
              <button key={p} className="seg-btn" onClick={() => setColors(PRESETS[p])}>
                {p}
              </button>
            ))}
          </div>
        </div>

        <div className="control">
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

        <Slider label="Speed" value={speed} min={0} max={1} onChange={setSpeed} />
        <Slider label="Scale" value={scale} min={0.3} max={3} onChange={setScale} />
        <Slider label="Rotation" value={rotation} min={0} max={360} step={1} onChange={setRotation} />

        {kind === 'mesh' ? (
          <>
            <Slider label="Distortion" value={distortion} min={0} max={1} onChange={setDistortion} />
            <Slider label="Swirl" value={swirl} min={0} max={1} onChange={setSwirl} />
            <Slider label="Grain Mixer (Körnung im Verlauf)" value={grainMixer} min={0} max={1} onChange={setGrainMixer} />
            <Slider label="Grain Overlay (Körnung obendrauf)" value={grainOverlay} min={0} max={1} onChange={setGrainOverlay} />
          </>
        ) : (
          <>
            <Slider label="Softness" value={softness} min={0} max={1} onChange={setSoftness} />
            <Slider label="Intensity" value={intensity} min={0} max={1} onChange={setIntensity} />
            <Slider label="Noise" value={noise} min={0} max={1} onChange={setNoise} />
            <div className="control">
              <span className="control-label"><span>Shape</span></span>
              <div className="seg">
                {GRAIN_SHAPES.map((s) => (
                  <button
                    key={s}
                    className={shape === s ? 'seg-btn active' : 'seg-btn'}
                    onClick={() => setShape(s)}
                  >
                    {s}
                  </button>
                ))}
              </div>
            </div>
          </>
        )}

        <Slider label="Soften (weißes Overlay)" value={soften} min={0} max={0.8} onChange={setSoften} />

        <p className="control-hint">
          Ziel-Look: pastellig und weich — jeder Pixel eine Mischung aus Blau,
          Cyan, Grün und Weiß. „Grain" gibt dem Orb Textur wie im
          Original-Render. Presets oben wechseln die Farbwelt, jede Farbe ist
          einzeln editierbar.
        </p>
      </aside>
    </main>
  )
}
