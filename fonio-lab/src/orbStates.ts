/**
 * Shared orb state definitions + storage.
 * Edited on the Orb page (editor), previewed on the States page.
 */

export type StateParams = {
  colors: string[]
  speed: number
  distortion: number
  swirl: number
  grainMixer: number
  scale: number
  soften: number
  offsetX: number
  rotationSpeed: number
}
export type StateDef = { label: string; hint: string; p: StateParams }

const W = '#FFFFFF'
const BLUE = '#585DFE'
const CYAN = '#58E8FE'
const MINT = '#58FE85'

export const STATES_LS_KEY = 'fonio-orb-states-v1'

export const DEFAULT_STATES: Record<string, StateDef> = {
  idle: {
    label: 'Ruhe', hint: 'Langsame Atmung — Grundzustand in der App.',
    p: { colors: [W, BLUE, W, CYAN, BLUE, W, CYAN, W, MINT, W], speed: 0.12, distortion: 0.5, swirl: 0.3, grainMixer: 0, scale: 1, soften: 0.38, offsetX: 0, rotationSpeed: 0 },
  },
  listening: {
    label: 'Zuhören', hint: 'Reagiert auf DEINE Stimme (Mikrofon einschalten!). Cyan-lastig.',
    p: { colors: [W, CYAN, W, CYAN, BLUE, W, CYAN, W, CYAN, W], speed: 0.2, distortion: 0.45, swirl: 0.25, grainMixer: 0, scale: 1.02, soften: 0.3, offsetX: 0, rotationSpeed: 0 },
  },
  thinking: {
    label: 'Nachdenken', hint: 'Swirl zirkuliert nach innen, Gedankenrauschen über Grain.',
    p: { colors: [BLUE, W, BLUE, CYAN, BLUE, W, BLUE, CYAN, BLUE, W], speed: 0.55, distortion: 0.75, swirl: 0.95, grainMixer: 0.28, scale: 0.96, soften: 0.24, offsetX: 0, rotationSpeed: 14 },
  },
  speaking: {
    label: 'Sprechen', hint: 'Pulsiert zur eigenen Stimme (spielt Demo-Audio).',
    p: { colors: [W, BLUE, MINT, CYAN, BLUE, W, CYAN, MINT, BLUE, W], speed: 0.3, distortion: 0.6, swirl: 0.4, grainMixer: 0, scale: 1.04, soften: 0.28, offsetX: 0, rotationSpeed: 0 },
  },
  success: {
    label: 'Verstanden', hint: 'Einmaliger Mint-Puls, kehrt danach zur Ruhe zurück.',
    p: { colors: [MINT, W, MINT, CYAN, MINT, W, MINT, W, MINT, W], speed: 0.4, distortion: 0.55, swirl: 0.45, grainMixer: 0, scale: 1.1, soften: 0.22, offsetX: 0, rotationSpeed: 0 },
  },
  unsure: {
    label: 'Unsicher', hint: 'Wobbelt langsam — wie ein schief gelegter Kopf.',
    p: { colors: [W, BLUE, W, W, BLUE, W, CYAN, W, W, W], speed: 0.07, distortion: 0.95, swirl: 0.15, grainMixer: 0.12, scale: 0.98, soften: 0.42, offsetX: 0, rotationSpeed: 0 },
  },
  transfer: {
    label: 'Durchstellen', hint: 'Der Orb reist zur Seite — er bringt den Anruf woanders hin.',
    p: { colors: [W, BLUE, W, CYAN, BLUE, W, CYAN, W, MINT, W], speed: 0.35, distortion: 0.5, swirl: 0.6, grainMixer: 0, scale: 0.55, soften: 0.3, offsetX: 0.55, rotationSpeed: 0 },
  },
  offline: {
    label: 'Offline', hint: 'Entsättigt, fast eingefroren.',
    p: { colors: ['#F4F4F5', '#D4D4D8', '#F4F4F5', '#A1A1AA', '#E4E4E7', '#F4F4F5', '#D4D4D8', '#F4F4F5', '#D4D4D8', '#F4F4F5'], speed: 0.02, distortion: 0.35, swirl: 0.1, grainMixer: 0.18, scale: 0.92, soften: 0.5, offsetX: 0, rotationSpeed: 0 },
  },
}

export const deepCopy = <T,>(x: T): T => JSON.parse(JSON.stringify(x))

export function loadStates(): Record<string, StateDef> {
  try {
    const raw = localStorage.getItem(STATES_LS_KEY)
    if (raw) {
      const saved = JSON.parse(raw)
      const merged = deepCopy(DEFAULT_STATES)
      for (const k of Object.keys(merged)) if (saved[k]?.p) merged[k].p = { ...merged[k].p, ...saved[k].p }
      return merged
    }
  } catch { /* fall through */ }
  return deepCopy(DEFAULT_STATES)
}

export function saveStateParams(key: string, p: StateParams): void {
  const all = loadStates()
  if (!all[key]) return
  all[key] = { ...all[key], p: deepCopy(p) }
  const json = JSON.stringify(all)
  localStorage.setItem(STATES_LS_KEY, json)
  // Single source of truth on disk (dev server writes public/states.json) —
  // the headless AE renderer reads exactly this file.
  void fetch('/__save-states', { method: 'POST', body: json }).catch(() => {})
}

/**
 * On app start: seed localStorage from public/states.json (if present),
 * so browser cache and the on-disk source stay in sync.
 */
export async function syncStatesFromFile(): Promise<void> {
  try {
    const res = await fetch('/states.json', { cache: 'no-store' })
    if (!res.ok) return
    const fileStates = await res.json()
    if (fileStates && typeof fileStates === 'object' && fileStates.idle) {
      localStorage.setItem(STATES_LS_KEY, JSON.stringify(fileStates))
    }
  } catch { /* file may not exist yet — defaults apply */ }
}

export function resetStates(): void {
  localStorage.removeItem(STATES_LS_KEY)
}
