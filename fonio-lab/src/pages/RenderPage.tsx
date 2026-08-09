import { useEffect, useState } from 'react'
import { MeshGradient } from '@paper-design/shaders-react'
import type { StateParams } from '../orbStates'

/**
 * Headless render target for the AE pipeline. Transparent background,
 * nothing but the orb. The Node render script computes ALL per-frame
 * params (state machine, transitions, audio reactivity, shader time,
 * rotation) and pushes them in via window.__setRenderParams — this page
 * is a dumb, deterministic display.
 */

export type RenderParams = StateParams & { shaderFrame: number; rotationDeg: number }

declare global {
  interface Window {
    __setRenderParams?: (p: RenderParams) => void
    __renderReady?: boolean
  }
}

const INITIAL: RenderParams = {
  colors: ['#FFFFFF', '#585DFE', '#FFFFFF', '#58E8FE', '#585DFE', '#FFFFFF', '#58E8FE', '#FFFFFF', '#58FE85', '#FFFFFF'],
  speed: 0, distortion: 0.5, swirl: 0.3, grainMixer: 0, scale: 1, soften: 0.38,
  offsetX: 0, rotationSpeed: 0, shaderFrame: 0, rotationDeg: 0,
}

export default function RenderPage() {
  const [p, setP] = useState<RenderParams>(INITIAL)

  // page background must be fully transparent for alpha screenshots
  useEffect(() => {
    document.documentElement.style.background = 'transparent'
    document.body.style.background = 'transparent'
  }, [])

  if (!window.__setRenderParams) {
    window.__setRenderParams = (next: RenderParams) => setP(next)
    window.__renderReady = true
  }

  return (
    <div className="render-stage" id="render-stage">
      <div className="orb render-orb" style={{ transform: `translateX(${p.offsetX * 260}px) scale(${p.scale})` }}>
        <div className="orb-rotor" style={{ transform: `rotate(${p.rotationDeg}deg)` }}>
          <MeshGradient className="orb-shader" width="100%" height="100%"
            colors={p.colors} speed={0} frame={p.shaderFrame}
            distortion={p.distortion} swirl={p.swirl}
            grainMixer={p.grainMixer} grainOverlay={0} />
        </div>
        <div className="orb-overlay" style={{ opacity: p.soften }} />
        <div className="orb-highlight" />
      </div>
    </div>
  )
}
