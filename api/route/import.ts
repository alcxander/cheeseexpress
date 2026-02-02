import type { VercelRequest, VercelResponse } from '@vercel/node'
import crypto from 'crypto'

const MAPBOX_SECRET_TOKEN = process.env.MAPBOX_SECRET_TOKEN

type RawAddress = Record<string, string | undefined>

const withCors = (res: VercelResponse) => {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'POST,OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type')
}

const buildAddressLabel = (raw: RawAddress) => {
  const parts: string[] = []
  Object.entries(raw).forEach(([key, value]) => {
    if (!value) return
    if (key.toLowerCase().includes('addressline')) {
      parts.push(value.trim())
    }
  })
  if (raw.eircode) parts.push(raw.eircode.trim())
  return parts.filter(Boolean).join(', ')
}

const geocode = async (query: string) => {
  const encoded = encodeURIComponent(query)
  const url = `https://api.mapbox.com/geocoding/v5/mapbox.places/${encoded}.json?limit=1&country=ie&access_token=${MAPBOX_SECRET_TOKEN}`
  const response = await fetch(url)
  if (!response.ok) return null
  const data = (await response.json()) as {
    features?: Array<{ place_name: string; center: [number, number] }>
  }
  const feature = data.features?.[0]
  if (!feature) return null
  return {
    label: feature.place_name,
    coords: feature.center,
  }
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
  if (!MAPBOX_SECRET_TOKEN) {
    res.status(500).json({ message: 'Mapbox secret token not configured' })
    return
  }

  const payload = typeof req.body === 'string' ? JSON.parse(req.body) : req.body
  const addresses = payload?.Addresses || payload?.addresses
  if (!addresses || typeof addresses !== 'object') {
    res.status(400).json({ message: 'Missing Addresses object' })
    return
  }

  const keys = Object.keys(addresses).sort()
  const results = []

  for (const key of keys) {
    const raw = addresses[key] as RawAddress
    const label = buildAddressLabel(raw)
    if (!label) {
      results.push({
        id: crypto.randomUUID(),
        label: 'Unknown address',
        manual: true,
        status: 'failed',
        note: 'No address fields provided',
      })
      continue
    }
    const resolved = await geocode(label)
    if (!resolved) {
      results.push({
        id: crypto.randomUUID(),
        label,
        manual: true,
        status: 'failed',
        note: 'Address not found. Edit to retry.',
      })
      continue
    }
    results.push({
      id: crypto.randomUUID(),
      label: resolved.label,
      manual: false,
      coords: resolved.coords,
      status: 'ok',
    })
  }

  res.status(200).json({ addresses: results })
}
