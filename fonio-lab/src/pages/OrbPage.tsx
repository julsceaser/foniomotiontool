import { useState } from 'react'
import { MeshGradient } from '@paper-design/shaders-react'

/**
 * Fonio orb — soft pastel sphere built from the 4 brand base colors.
 * White is weighted heavily in the color array and a white overlay sits on
 * top so the mesh reads pastel (reference tones: #DCFAFC, #B1E4F7, #85B2F5)
 * instead of neon-saturated. Mint (#58FE85) appears once only, as a hint.
 */

const BRAND_COLORS = [
  '#FFFFFF', // white — highlight mass
  '#585DFE', // blue main
  '#FFFFFF',
  '#58E8FE', // cyan
  '#585DFE',
  '#FFFFFF',
  '#58E8FE',
  '#FFFFFF',
  '#58FE85', // green — single entry of 10: mint stays a small accent
  '#FFFFFF',
]

export default function OrbPage() {
  const [speed, setSpeed] = useState(0.18)
  const [distortion, setDistortion] = useState(0.6)
  const [swirl, setSwirl] = useState(0.35)
  const [soften, setSoften] = useState(0.36)

  return (
    <main className="page">
      <div className="orb-stage">
        <div className="orb">
          <MeshGradient
            className="orb-shader"
            width="100%"
            height="100%"
            colors={BRAND_COLORS}
            speed={speed}
            distortion={distortion}
            swirl={swirl}
            grainMixer={0}
            grainOverlay={0}
          />
          <div className="orb-overlay" style={{ opacity: soften }} />
          <div className="orb-highlight" />
        </div>
      </div>

      <aside className="controls">
        <h1 className="page-title">Orb / Tuning</h1>

        <label className="control">
          <span className="control-label">
            <span>Speed</span>
            <span>{speed.toFixed(2)}</span>
          </span>
          <input
            type="range"
            min={0}
            max={1}
            step={0.01}
            value={speed}
            onChange={(e) => setSpeed(Number(e.target.value))}
          />
        </label>

        <label className="control">
          <span className="control-label">
            <span>Distortion</span>
            <span>{distortion.toFixed(2)}</span>
          </span>
          <input
            type="range"
            min={0}
            max={1}
            step={0.01}
            value={distortion}
            onChange={(e) => setDistortion(Number(e.target.value))}
          />
        </label>

        <label className="control">
          <span className="control-label">
            <span>Swirl</span>
            <span>{swirl.toFixed(2)}</span>
          </span>
          <input
            type="range"
            min={0}
            max={1}
            step={0.01}
            value={swirl}
            onChange={(e) => setSwirl(Number(e.target.value))}
          />
        </label>

        <label className="control">
          <span className="control-label">
            <span>Soften (white overlay)</span>
            <span>{soften.toFixed(2)}</span>
          </span>
          <input
            type="range"
            min={0}
            max={0.8}
            step={0.01}
            value={soften}
            onChange={(e) => setSoften(Number(e.target.value))}
          />
        </label>

        <p className="control-hint">
          Target look: pastel and soft — every pixel a blend of blue, cyan,
          green and white. Highlight top-left, periwinkle body bottom-right,
          mint only as a small accent. Raise “Soften” if the mesh gets too
          saturated.
        </p>
      </aside>
    </main>
  )
}
