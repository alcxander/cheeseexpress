import type { RouteState } from '../types'

const ROUTE_STORAGE_KEY = 'cheeseexpress.routeState'
const DRIVER_NAME_KEY = 'cheeseexpress.driverName'

export const defaultRouteState: RouteState = {
  addresses: [],
  stopOrder: [],
  stops: [],
  currentStopIndex: 0,
  routeGeometry: null,
  legs: [],
  totalDistance: 0,
  totalDuration: 0,
  backupStartLabel: '',
  backupStartCoords: null,
  mapView: null,
}

export const loadRouteState = (): RouteState => {
  try {
    const raw = localStorage.getItem(ROUTE_STORAGE_KEY)
    if (!raw) return { ...defaultRouteState }
    const parsed = JSON.parse(raw) as RouteState
    return {
      ...defaultRouteState,
      ...parsed,
    }
  } catch {
    return { ...defaultRouteState }
  }
}

export const saveRouteState = (state: RouteState) => {
  localStorage.setItem(ROUTE_STORAGE_KEY, JSON.stringify(state))
}

export const clearRouteState = () => {
  localStorage.removeItem(ROUTE_STORAGE_KEY)
}

export const getOrCreateDriverName = () => {
  const existing = localStorage.getItem(DRIVER_NAME_KEY)
  if (existing) return existing
  const name = `Driver-${Math.floor(1000 + Math.random() * 9000)}`
  localStorage.setItem(DRIVER_NAME_KEY, name)
  return name
}
