export type DebugEntry = {
  time: string
  type: 'info' | 'error'
  message: string
  details?: Record<string, unknown>
}

const getStore = () => {
  const globalStore = window as typeof window & {
    __cheeseDebug?: DebugEntry[]
  }
  if (!globalStore.__cheeseDebug) {
    globalStore.__cheeseDebug = []
  }
  return globalStore.__cheeseDebug
}

export const logDebug = (entry: Omit<DebugEntry, 'time'>) => {
  const stored = getStore()
  const payload: DebugEntry = {
    ...entry,
    time: new Date().toISOString(),
  }
  stored.push(payload)
  if (stored.length > 50) stored.shift()
  window.dispatchEvent(new CustomEvent('cheese-debug', { detail: payload }))
}

export const getDebugEntries = () => {
  return getStore().slice().reverse()
}
