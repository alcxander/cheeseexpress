import type { VercelRequest, VercelResponse } from '@vercel/node'

const MAPBOX_SECRET_TOKEN = process.env.MAPBOX_SECRET_TOKEN

const withCors = (res: VercelResponse) => {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type')
}

const maskToken = (token: string) => {
  if (token.length <= 8) return 'redacted'
  return `${token.slice(0, 4)}...${token.slice(-4)}`
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
  if (!MAPBOX_SECRET_TOKEN) {
    res.status(200).json({ ok: false, tokenPresent: false })
    return
  }

  res.status(200).json({
    ok: true,
    tokenPresent: true,
    tokenLength: MAPBOX_SECRET_TOKEN.length,
    tokenMasked: maskToken(MAPBOX_SECRET_TOKEN),
  })
}
