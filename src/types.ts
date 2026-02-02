export type AddressEntry = {
  id: string
  label: string
  manual: boolean
  coords?: [number, number]
  status?: 'ok' | 'failed'
  note?: string
}

export type Stop = {
  id: string
  label: string
  coords: [number, number]
}

export type RouteLeg = {
  distance: number
  duration: number
}

export type MapViewState = {
  center: [number, number]
  zoom: number
  bearing: number
  pitch: number
}

export type RouteState = {
  addresses: AddressEntry[]
  stopOrder: string[]
  stops: Stop[]
  currentStopIndex: number
  routeGeometry: GeoJSON.LineString | null
  legs: RouteLeg[]
  totalDistance: number
  totalDuration: number
  backupStartLabel: string
  backupStartCoords: [number, number] | null
  mapView: MapViewState | null
}
