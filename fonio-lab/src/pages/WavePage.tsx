import { useEffect, useRef, useState } from 'react'
import WaveSurfer from 'wavesurfer.js'

/**
 * Fonio soundwave — wavesurfer.js bars with a horizontal gradient across
 * the 3 brand base colors (blue -> cyan -> green).
 */

function makeGradient(height: number): CanvasGradient {
  const canvas = document.createElement('canvas')
  const ctx = canvas.getContext('2d')!
  // Horizontal gradient across the visible waveform. Wavesurfer scales the
  // gradient to its own canvas, coordinates just need a direction + stops.
  const gradient = ctx.createLinearGradient(0, 0, 1080 * devicePixelRatio, 0)
  gradient.addColorStop(0, '#585DFE') // blue main
  gradient.addColorStop(0.5, '#58E8FE') // cyan
  gradient.addColorStop(1, '#58FE85') // green
  void height
  return gradient
}

export default function WavePage() {
  const containerRef = useRef<HTMLDivElement>(null)
  const wsRef = useRef<WaveSurfer | null>(null)
  const [ready, setReady] = useState(false)
  const [playing, setPlaying] = useState(false)
  const [duration, setDuration] = useState(0)

  useEffect(() => {
    if (!containerRef.current) return

    const ws = WaveSurfer.create({
      container: containerRef.current,
      url: '/demo.wav',
      height: 280,
      barWidth: 12,
      barGap: 14,
      barRadius: 6,
      waveColor: makeGradient(280),
      progressColor: 'rgba(88, 93, 254, 0.35)',
      cursorColor: '#585DF5',
      cursorWidth: 2,
      normalize: true,
    })

    ws.on('ready', (d) => {
      setReady(true)
      setDuration(d)
    })
    ws.on('play', () => setPlaying(true))
    ws.on('pause', () => setPlaying(false))
    ws.on('finish', () => setPlaying(false))

    wsRef.current = ws
    return () => {
      ws.destroy()
      wsRef.current = null
    }
  }, [])

  return (
    <main className="page">
      <div className="wave-wrap">
        <h1 className="page-title">Soundwave / demo.wav</h1>
        <div className="wave-card">
          <div id="waveform" ref={containerRef} />
          <div className="wave-toolbar">
            <button
              className="btn"
              disabled={!ready}
              onClick={() => wsRef.current?.playPause()}
            >
              {playing ? 'Pause' : 'Play'}
            </button>
            <span className="wave-meta">
              {ready
                ? `${duration.toFixed(1)} s · barWidth 12 · barGap 14 · barRadius 6`
                : 'Loading audio…'}
            </span>
          </div>
        </div>
      </div>
    </main>
  )
}
