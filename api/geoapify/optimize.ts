import type { VercelRequest, VercelResponse } from '@vercel/node'

const GEOAPIFY_API_KEY = process.env.GEOAPIFY_API_KEY

const withCors = (res: VercelResponse) => {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'POST,OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type')
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
  if (!GEOAPIFY_API_KEY) {
    res.status(500).json({ message: 'Geoapify API key not configured' })
    return
  }

  const body = typeof req.body === 'string' ? JSON.parse(req.body) : req.body
  const coordinates = body?.coordinates as Array<[number, number]>
  if (!coordinates?.length) {
    res.status(400).json({ message: 'Missing coordinates' })
    return
  }

  const [start, ...stops] = coordinates
  const payload = {
    mode: 'drive',
    agents: [{ start_location: start }],
    shipments: stops.map((location) => ({
      pickup: { location },
    })),
  }

  const url = `https://api.geoapify.com/v1/routeplanner?apiKey=${GEOAPIFY_API_KEY}`
  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  })
  const text = await response.text()
  res
    .status(response.status)
    .setHeader('Content-Type', response.headers.get('content-type') || 'application/json')
    .send(text)
}
