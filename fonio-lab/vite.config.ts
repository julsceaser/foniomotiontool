import { writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { defineConfig, type Plugin } from 'vite'
import react from '@vitejs/plugin-react'

/**
 * Dev-only endpoint: the orb editor's Save button POSTs the full state set
 * here and it lands in public/states.json — the single source of truth that
 * the lab, the headless renderer and (later) the product component share.
 */
function saveStatesPlugin(): Plugin {
  return {
    name: 'fonio-save-states',
    configureServer(server) {
      server.middlewares.use('/__save-states', (req, res) => {
        if (req.method !== 'POST') { res.statusCode = 405; res.end(); return }
        let body = ''
        req.on('data', (c) => { body += c })
        req.on('end', () => {
          try {
            JSON.parse(body) // validate
            writeFileSync(resolve(__dirname, 'public/states.json'), body)
            res.setHeader('Content-Type', 'application/json')
            res.end('{"ok":true}')
          } catch {
            res.statusCode = 400
            res.end('{"ok":false}')
          }
        })
      })
    },
  }
}

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), saveStatesPlugin()],
})
