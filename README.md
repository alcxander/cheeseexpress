# CheeseExpress Driver Routing POC

## Overview
Mobile-first proof of concept for delivery drivers:
- Enter up to 30 addresses
- Generate an optimized route starting from GPS (or fallback)
- Visual navigation with auto-advance
- Local persistence
- Admin live tracking view

## Requirements
- Node.js 18+
- Vercel account for serverless functions
- Mapbox account with public (`pk...`) and secret (`sk...`) tokens

## Local Development
Install dependencies:
```
npm install
```

Run local Vercel dev server (recommended so `/api/*` works):
```
vercel dev
```

The app will run on the URL printed by Vercel (usually `http://localhost:3000`).

## Environment Variables
Client-side (Vercel env or `.env.local`):
```
VITE_MAPBOX_TOKEN=pk_...
VITE_MAPBOX_PROXY_URL=/api/mapbox
VITE_API_BASE=
```

Server-side (Vercel env):
```
MAPBOX_SECRET_TOKEN=sk_...
```

Notes:
- `VITE_MAPBOX_TOKEN` is required for Mapbox GL maps.
- `MAPBOX_SECRET_TOKEN` is required for geocoding/routing proxy calls.
- After changing Vercel env vars, redeploy to apply.

## Key Pages
- Driver app: `/`
- Admin tracking: `/admin/tracking`

## Import Route Endpoint
Endpoint:
```
POST /api/route/import
```

Example payload:
```
{
  "totalStops": 2,
  "VanDriver": 1,
  "Addresses": {
    "address1": {
      "addressLine1": "1 Main Street",
      "addressLine2": "Clondalkin",
      "addressLine3": "Dublin",
      "addressLine4": "",
      "eircode": "D12 P978"
    },
    "address2": {
      "addressLine1": "Malahide Castle",
      "addressLine2": "Malahide",
      "addressLine3": "Dublin",
      "addressLine4": "",
      "eircode": "K36"
    }
  },
  "title": "Delivery Route for 2026-02-01"
}
```

Behavior:
- Each address is geocoded.
- Unresolved addresses are added with a failure note and are editable in the UI.
- If all addresses resolve, the route generates automatically.

## Mapbox Proxy Endpoints
- `GET /api/mapbox/geocoding`
- `GET /api/mapbox/optimize`
- `GET /api/mapbox/directions`
- `GET /api/mapbox/health` (debug token presence only)

## Troubleshooting
- If the map is blank, verify `VITE_MAPBOX_TOKEN` is set and starts with `pk`.
- If geocoding returns 403, verify `MAPBOX_SECRET_TOKEN` is set in Vercel and redeploy.
- Vercel deployments need env vars set for the correct environment (Production/Preview).

