import type { VercelRequest, VercelResponse } from '@vercel/node'

type DriverLocation = {
  name: string
  lat: number
  lng: number
  updatedAt: number
}

const withCors = (res: VercelResponse) => {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'POST,OPTIONS')
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
  if (req.method !== 'POST') {
    res.status(405).json({ message: 'Method not allowed' })
    return
  }
  const body = typeof req.body === 'string' ? JSON.parse(req.body) : req.body
  const { name, lat, lng, updatedAt } = body || {}
  if (!name || typeof lat !== 'number' || typeof lng !== 'number') {
    res.status(400).json({ message: 'Invalid payload' })
    return
  }
  const store = getStore()
  store[name] = {
    name,
    lat,
    lng,
    updatedAt: typeof updatedAt === 'number' ? updatedAt : Date.now(),
  }
  res.status(200).json({ ok: true })
}
