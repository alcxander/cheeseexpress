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
  const query = String(req.query.query || '')
  if (!query) {
    res.status(400).json({ message: 'Missing query' })
    return
  }

  const params = new URLSearchParams()
  if (req.query.autocomplete) params.set('autocomplete', String(req.query.autocomplete))
  if (req.query.limit) params.set('limit', String(req.query.limit))
  if (req.query.country) params.set('country', String(req.query.country))
  params.set('access_token', MAPBOX_SECRET_TOKEN)

  const encoded = encodeURIComponent(query)
  const url = `https://api.mapbox.com/geocoding/v5/mapbox.places/${encoded}.json?${params.toString()}`

  const response = await fetch(url)
  const body = await response.text()
  res
    .status(response.status)
    .setHeader('Content-Type', response.headers.get('content-type') || 'application/json')
    .send(body)
}
