import type { VercelRequest, VercelResponse } from '@vercel/node'

type DriverLocation = {
  name: string
  lat: number
  lng: number
  updatedAt: number
}

const ACTIVE_WINDOW_MS = 10 * 60 * 1000

const withCors = (res: VercelResponse) => {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type')
}

const getStore = () => {
  const globalStore = globalThis as typeof globalThis & {
    driverStore?: Record<string, DriverLocation>
  }
  if (!globalStore.driverStore) {
    globalStore.driverStore = {}
  }
  return globalStore.driverStore
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  withCors(res)
  if (req.method === 'OPTIONS') {
    res.status(204).send('')
    return
  }
  if (req.method !== 'GET') {
    res.status(405).json({ message: 'Method not allowed' })
    return
  }
  const store = getStore()
  const now = Date.now()
  const active = Object.values(store).filter(
    (driver) => now - driver.updatedAt <= ACTIVE_WINDOW_MS
  )
  res.status(200).json({ drivers: active })
}
