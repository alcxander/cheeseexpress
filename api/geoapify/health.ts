import type { VercelRequest, VercelResponse } from '@vercel/node'

const GEOAPIFY_API_KEY = process.env.GEOAPIFY_API_KEY

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
  if (!GEOAPIFY_API_KEY) {
    res.status(200).json({ ok: false, tokenPresent: false })
    return
  }

  res.status(200).json({
    ok: true,
    tokenPresent: true,
    tokenLength: GEOAPIFY_API_KEY.length,
    tokenMasked: maskToken(GEOAPIFY_API_KEY),
  })
}
