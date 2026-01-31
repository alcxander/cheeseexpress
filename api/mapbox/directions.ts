import type { VercelRequest, VercelResponse } from '@vercel/node'

const MAPBOX_SECRET_TOKEN = process.env.MAPBOX_SECRET_TOKEN

const withCors = (res: VercelResponse) => {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type')
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  withCors(res)
  if (req.method === 'OPTIONS') {
    res.status(204).send('')
    return
  }
  if (!MAPBOX_SECRET_TOKEN) {
    res.status(500).json({ message: 'Mapbox secret token not configured' })
    return
  }
  const coordinates = String(req.query.coordinates || '')
  if (!coordinates) {
    res.status(400).json({ message: 'Missing coordinates' })
    return
  }

  const params = new URLSearchParams()
  if (req.query.geometries) params.set('geometries', String(req.query.geometries))
  if (req.query.overview) params.set('overview', String(req.query.overview))
  if (req.query.steps) params.set('steps', String(req.query.steps))
  params.set('access_token', MAPBOX_SECRET_TOKEN)

  const url = `https://api.mapbox.com/directions/v5/mapbox/driving/${coordinates}?${params.toString()}`
  const response = await fetch(url)
  const body = await response.text()
  res
    .status(response.status)
    .setHeader('Content-Type', response.headers.get('content-type') || 'application/json')
    .send(body)
}
