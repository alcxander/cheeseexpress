import type { AddressEntry, RouteLeg, Stop } from '../types'

export const MAPBOX_TOKEN = import.meta.env.VITE_MAPBOX_TOKEN as string | undefined
export const MAPBOX_PROXY_URL = import.meta.env
  .VITE_MAPBOX_PROXY_URL as string | undefined

type MapboxFeature = {
  id: string
  place_name: string
  center: [number, number]
}

type OptimizationResponse = {
  code?: string
  message?: string
  trips: Array<{
    geometry: GeoJSON.LineString
    legs: Array<{ distance: number; duration: number }>
    distance: number
    duration: number
  }>
  waypoints: Array<{
    waypoint_index: number
    location: [number, number]
  }>
}

const fetchJson = async <T>(url: string): Promise<T> => {
  const response = await fetch(url)
  if (!response.ok) {
    throw new Error('Network error')
  }
  return (await response.json()) as T
}

export const fetchAutocomplete = async (query: string) => {
  if (!MAPBOX_TOKEN && !MAPBOX_PROXY_URL) {
    throw new Error('Mapbox token missing')
  }
  const encoded = encodeURIComponent(query)
  const url = MAPBOX_PROXY_URL
    ? `${MAPBOX_PROXY_URL.replace(/\/$/, '')}/geocoding?query=${encoded}&autocomplete=true&limit=5&country=ie`
    : `https://api.mapbox.com/geocoding/v5/mapbox.places/${encoded}.json?autocomplete=true&limit=5&country=ie&access_token=${MAPBOX_TOKEN}`
  const data = await fetchJson<{ features: MapboxFeature[] }>(url)
  return data.features.map((feature) => ({
    id: feature.id,
    label: feature.place_name,
    coords: feature.center,
  }))
}

export const geocodeAddress = async (query: string) => {
  if (!MAPBOX_TOKEN && !MAPBOX_PROXY_URL) {
    throw new Error('Mapbox token missing')
  }
  const encoded = encodeURIComponent(query)
  const url = MAPBOX_PROXY_URL
    ? `${MAPBOX_PROXY_URL.replace(/\/$/, '')}/geocoding?query=${encoded}&limit=1&country=ie`
    : `https://api.mapbox.com/geocoding/v5/mapbox.places/${encoded}.json?limit=1&country=ie&access_token=${MAPBOX_TOKEN}`
  const data = await fetchJson<{ features: MapboxFeature[] }>(url)
  const feature = data.features[0]
  if (!feature) return null
  return {
    label: feature.place_name,
    coords: feature.center,
  }
}

export const optimizeRoute = async (
  start: [number, number],
  addresses: AddressEntry[]
) => {
  if (!MAPBOX_TOKEN && !MAPBOX_PROXY_URL) {
    throw new Error('Mapbox token missing')
  }
  const coords = [start, ...addresses.map((entry) => entry.coords!)].join(';')
  const url = MAPBOX_PROXY_URL
    ? `${MAPBOX_PROXY_URL.replace(/\/$/, '')}/optimize?coordinates=${encodeURIComponent(
        coords
      )}&roundtrip=false&source=first&geometries=geojson&overview=full&steps=false`
    : `https://api.mapbox.com/optimized-trips/v1/mapbox/driving/${coords}?roundtrip=false&source=first&geometries=geojson&overview=full&steps=false&access_token=${MAPBOX_TOKEN}`
  const data = await fetchJson<OptimizationResponse>(url)
  if (data.code && data.code !== 'Ok') {
    throw new Error(
      data.message || 'Mapbox optimization is unavailable for this token'
    )
  }
  if (!data.trips?.length) throw new Error('No route found')

  const waypointOrder = data.waypoints
    .map((waypoint, inputIndex) => ({
      inputIndex,
      order: waypoint.waypoint_index,
      location: waypoint.location,
    }))
    .sort((a, b) => a.order - b.order)

  const orderedStops = waypointOrder
    .filter((item) => item.inputIndex !== 0)
    .map((item) => {
      const address = addresses[item.inputIndex - 1]
      return {
        id: address.id,
        label: address.label,
        coords: item.location,
      } as Stop
    })

  const legs: RouteLeg[] =
    data.trips[0].legs?.map((leg) => ({
      distance: leg.distance,
      duration: leg.duration,
    })) ?? []

  return {
    geometry: data.trips[0].geometry,
    stops: orderedStops,
    legs,
    totalDistance: data.trips[0].distance,
    totalDuration: data.trips[0].duration,
  }
}

export const fetchNextLegGeometry = async (
  start: [number, number],
  end: [number, number]
) => {
  if (!MAPBOX_TOKEN && !MAPBOX_PROXY_URL) {
    throw new Error('Mapbox token missing')
  }
  const coords = `${start[0]},${start[1]};${end[0]},${end[1]}`
  const url = MAPBOX_PROXY_URL
    ? `${MAPBOX_PROXY_URL.replace(/\/$/, '')}/directions?coordinates=${encodeURIComponent(
        coords
      )}&geometries=geojson&overview=full&steps=false`
    : `https://api.mapbox.com/directions/v5/mapbox/driving/${coords}?geometries=geojson&overview=full&steps=false&access_token=${MAPBOX_TOKEN}`
  const data = await fetchJson<{
    routes: Array<{ geometry: GeoJSON.LineString }>
  }>(url)
  if (!data.routes?.length) return null
  return data.routes[0].geometry
}

export const formatDuration = (seconds: number) => {
  if (!Number.isFinite(seconds) || seconds <= 0) return '0 min'
  const minutes = Math.round(seconds / 60)
  if (minutes < 60) return `${minutes} min`
  const hours = Math.floor(minutes / 60)
  const rem = minutes % 60
  return `${hours} hr ${rem} min`
}

export const formatDistance = (meters: number) => {
  if (!Number.isFinite(meters) || meters <= 0) return '0 mi'
  const miles = meters / 1609.34
  if (miles < 0.1) return `${(meters).toFixed(0)} m`
  return `${miles.toFixed(1)} mi`
}
