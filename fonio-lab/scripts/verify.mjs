// Screenshots "/" (orb) and "/wave" (soundwave) from the running dev server.
// Usage: node scripts/verify.mjs [baseUrl]   (default http://localhost:5199)
import { chromium } from 'playwright'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const base = process.argv[2] ?? 'http://localhost:5199'

const browser = await chromium.launch()
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } })

// Orb — give the shader a moment to render a few frames
await page.goto(`${base}/`, { waitUntil: 'networkidle' })
await page.waitForTimeout(2500)
await page.screenshot({ path: join(root, 'verify-orb.png') })
console.log('verify-orb.png written')

// Wave — wait until wavesurfer reports ready (toolbar shows duration)
await page.goto(`${base}/wave`, { waitUntil: 'networkidle' })
await page.waitForSelector('#waveform canvas', { timeout: 15000 })
await page.waitForTimeout(1200)
await page.screenshot({ path: join(root, 'verify-wave.png') })
console.log('verify-wave.png written')

await browser.close()
