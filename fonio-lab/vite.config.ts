import { writeFileSync, mkdirSync } from 'node:fs'
import { resolve } from 'node:path'
import { spawn } from 'node:child_process'
import { defineConfig, type Plugin } from 'vite'
import react from '@vitejs/plugin-react'

/**
 * Dev-only endpoints:
 *  POST /__save-states    → public/states.json   (Save-Button im Orb-Editor)
 *  POST /__save-timeline  → renders/<name>.json  (Export-Tab)
 *  POST /__render         → startet scripts/render-orb.mjs als Kindprozess
 *  GET  /__render-status  → { running, progress, log }
 */
function labBackendPlugin(): Plugin {
  let render: { running: boolean; progress: string; log: string[]; ok: boolean | null } = {
    running: false, progress: '', log: [], ok: null,
  }

  const readBody = (req: import('node:http').IncomingMessage): Promise<string> =>
    new Promise((res) => {
      let b = ''
      req.on('data', (c) => { b += c })
      req.on('end', () => res(b))
    })

  return {
    name: 'fonio-lab-backend',
    configureServer(server) {
      server.middlewares.use('/__save-states', (req, res) => {
        if (req.method !== 'POST') { res.statusCode = 405; res.end(); return }
        void readBody(req).then((body) => {
          try {
            JSON.parse(body)
            writeFileSync(resolve(__dirname, 'public/states.json'), body)
            res.setHeader('Content-Type', 'application/json'); res.end('{"ok":true}')
          } catch { res.statusCode = 400; res.end('{"ok":false}') }
        })
      })

      server.middlewares.use('/__save-timeline', (req, res) => {
        if (req.method !== 'POST') { res.statusCode = 405; res.end(); return }
        void readBody(req).then((body) => {
          try {
            const { name, job } = JSON.parse(body)
            const safe = String(name || 'timeline').replace(/[^a-z0-9-_]/gi, '_')
            mkdirSync(resolve(__dirname, 'renders'), { recursive: true })
            writeFileSync(resolve(__dirname, `renders/${safe}.json`), JSON.stringify(job, null, 2))
            res.setHeader('Content-Type', 'application/json')
            res.end(JSON.stringify({ ok: true, file: `renders/${safe}.json` }))
          } catch { res.statusCode = 400; res.end('{"ok":false}') }
        })
      })

      server.middlewares.use('/__render', (req, res) => {
        if (req.method !== 'POST') { res.statusCode = 405; res.end(); return }
        if (render.running) { res.statusCode = 409; res.end('{"ok":false,"error":"Render läuft bereits"}'); return }
        void readBody(req).then((body) => {
          try {
            const { timeline, out, size, fps } = JSON.parse(body)
            const outName = String(out || 'out-render').replace(/[^a-z0-9-_]/gi, '_')
            render = { running: true, progress: 'startet…', log: [], ok: null }
            const child = spawn('node', [
              'scripts/render-orb.mjs',
              '--timeline', timeline,
              '--out', outName,
              ...(size ? ['--size', String(size)] : []),
              ...(fps ? ['--fps', String(fps)] : []),
            ], { cwd: __dirname })
            const onData = (d: Buffer) => {
              const line = d.toString()
              render.log.push(line)
              const m = line.match(/(\d+)\/(\d+)/)
              if (m) render.progress = `${m[1]}/${m[2]} Frames`
            }
            child.stdout.on('data', onData)
            child.stderr.on('data', onData)
            child.on('close', (code) => { render.running = false; render.ok = code === 0; render.progress = code === 0 ? 'fertig' : 'Fehler' })
            res.setHeader('Content-Type', 'application/json')
            res.end(JSON.stringify({ ok: true, out: outName }))
          } catch { res.statusCode = 400; res.end('{"ok":false}') }
        })
      })

      server.middlewares.use('/__render-status', (_req, res) => {
        res.setHeader('Content-Type', 'application/json')
        res.end(JSON.stringify({ running: render.running, progress: render.progress, ok: render.ok, tail: render.log.slice(-3).join('') }))
      })
    },
  }
}

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), labBackendPlugin()],
})
