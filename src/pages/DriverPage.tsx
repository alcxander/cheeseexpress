import { useEffect, useMemo, useRef, useState } from 'react'
import mapboxgl from 'mapbox-gl'
import {
  MAPBOX_TOKEN,
  fetchAutocomplete,
  fetchNextLegGeometry,
  formatDistance,
  formatDuration,
  geocodeAddress,
  optimizeRoute,
} from '../lib/mapbox'
import { getDebugEntries } from '../lib/debug'
import {
  clearRouteState,
  defaultRouteState,
  getOrCreateDriverName,
  loadRouteState,
  saveRouteState,
} from '../lib/storage'
import type { AddressEntry, RouteState, Stop } from '../types'

const MAX_ADDRESSES = 30
const ARRIVAL_THRESHOLD_METERS = 50
const API_BASE = (import.meta.env.VITE_API_BASE as string | undefined) ?? ''
const DEFAULT_CENTER: [number, number] = [-6.3941, 53.3242]

const getCurrentPosition = () =>
  new Promise<[number, number]>((resolve, reject) => {
    if (!navigator.geolocation) {
      reject(new Error('Unable to get location'))
      return
    }
    navigator.geolocation.getCurrentPosition(
      (position) => {
        resolve([position.coords.longitude, position.coords.latitude])
      },
      () => reject(new Error('Unable to get location')),
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 5000 }
    )
  })

const distanceMeters = (a: [number, number], b: [number, number]) => {
  const toRad = (value: number) => (value * Math.PI) / 180
  const [lng1, lat1] = a
  const [lng2, lat2] = b
  const dLat = toRad(lat2 - lat1)
  const dLng = toRad(lng2 - lng1)
  const startLat = toRad(lat1)
  const endLat = toRad(lat2)
  const radius = 6371000
  const haversine =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.sin(dLng / 2) *
      Math.sin(dLng / 2) *
      Math.cos(startLat) *
      Math.cos(endLat)
  return 2 * radius * Math.atan2(Math.sqrt(haversine), Math.sqrt(1 - haversine))
}

const ensureRouteLayer = (map: mapboxgl.Map) => {
  if (map.getSource('route-line')) return
  map.addSource('route-line', {
    type: 'geojson',
    data: {
      type: 'Feature',
      geometry: {
        type: 'LineString',
        coordinates: [],
      },
      properties: {},
    },
  })
  map.addLayer({
    id: 'route-line',
    type: 'line',
    source: 'route-line',
    layout: {
      'line-join': 'round',
      'line-cap': 'round',
    },
    paint: {
      'line-color': '#00d2ff',
      'line-width': 5,
    },
  })
}

const ensureNextLegLayer = (map: mapboxgl.Map) => {
  if (map.getSource('next-leg')) return
  map.addSource('next-leg', {
    type: 'geojson',
    data: {
      type: 'Feature',
      geometry: {
        type: 'LineString',
        coordinates: [],
      },
      properties: {},
    },
  })
  map.addLayer({
    id: 'next-leg',
    type: 'line',
    source: 'next-leg',
    layout: {
      'line-join': 'round',
      'line-cap': 'round',
    },
    paint: {
      'line-color': '#ffd400',
      'line-width': 6,
    },
  })
}

const updateLineSource = (
  map: mapboxgl.Map,
  id: string,
  geometry: GeoJSON.LineString | null
) => {
  const source = map.getSource(id) as mapboxgl.GeoJSONSource | undefined
  if (!source) return
  source.setData({
    type: 'Feature',
    geometry: geometry ?? { type: 'LineString', coordinates: [] },
    properties: {},
  })
}

const updateStopMarkers = (
  map: mapboxgl.Map,
  markersRef: React.MutableRefObject<mapboxgl.Marker[]>,
  stops: Stop[],
  currentStopIndex: number
) => {
  markersRef.current.forEach((marker) => marker.remove())
  markersRef.current = stops.map((stop, index) => {
    const el = document.createElement('div')
    el.className = 'stop-marker'
    el.textContent = `${index + 1}`
    if (index < currentStopIndex) el.classList.add('stop-marker--done')
    if (index === currentStopIndex) el.classList.add('stop-marker--next')
    return new mapboxgl.Marker({ element: el }).setLngLat(stop.coords).addTo(map)
  })
}

const DriverPage = () => {
  const [routeState, setRouteState] = useState<RouteState>(() =>
    loadRouteState()
  )
  const [searchValue, setSearchValue] = useState('')
  const [suggestions, setSuggestions] = useState<
    Array<{ id: string; label: string; coords: [number, number] }>
  >([])
  const [manualValue, setManualValue] = useState('')
  const [manualMode, setManualMode] = useState(false)
  const [importValue, setImportValue] = useState('')
  const [importStatus, setImportStatus] = useState<string | null>(null)
  const [importOpen, setImportOpen] = useState(false)
  const [pendingImportGenerate, setPendingImportGenerate] = useState<
    AddressEntry[] | null
  >(null)
  const [backupStartValue, setBackupStartValue] = useState(
    routeState.backupStartLabel
  )
  const [statusMessage, setStatusMessage] = useState<string | null>(null)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)
  const [locationError, setLocationError] = useState<string | null>(null)
  const [isGenerating, setIsGenerating] = useState(false)
  const [currentPosition, setCurrentPosition] = useState<[number, number] | null>(
    null
  )
  const [nextLegGeometry, setNextLegGeometry] =
    useState<GeoJSON.LineString | null>(null)
  const [liveNextLegDuration, setLiveNextLegDuration] = useState<number | null>(
    null
  )
  const [debugOpen, setDebugOpen] = useState(false)
  const [debugEntries, setDebugEntries] = useState(getDebugEntries())
  const importHandledRef = useRef(false)

  const mapContainerRef = useRef<HTMLDivElement | null>(null)
  const mapRef = useRef<mapboxgl.Map | null>(null)
  const markersRef = useRef<mapboxgl.Marker[]>([])
  const currentMarkerRef = useRef<mapboxgl.Marker | null>(null)
  const routeRef = useRef(routeState)
  const driverName = useMemo(() => getOrCreateDriverName(), [])
  const lastFirebaseUpdate = useRef(0)
  const lastNextLegUpdate = useRef(0)

  useEffect(() => {
    routeRef.current = routeState
    saveRouteState(routeState)
  }, [routeState])

  useEffect(() => {
    const refresh = () => setDebugEntries(getDebugEntries())
    const handler = () => refresh()
    window.addEventListener('cheese-debug', handler as EventListener)
    return () => window.removeEventListener('cheese-debug', handler as EventListener)
  }, [])

  useEffect(() => {
    if (!MAPBOX_TOKEN || mapRef.current || !mapContainerRef.current) return
    mapboxgl.accessToken = MAPBOX_TOKEN
    const map = new mapboxgl.Map({
      container: mapContainerRef.current,
      style: 'mapbox://styles/mapbox/streets-v12',
      center: routeState.mapView?.center ?? DEFAULT_CENTER,
      zoom: routeState.mapView?.zoom ?? 12,
      bearing: routeState.mapView?.bearing ?? 0,
      pitch: routeState.mapView?.pitch ?? 0,
    })
    map.addControl(new mapboxgl.NavigationControl(), 'bottom-right')
    map.on('load', () => {
      ensureRouteLayer(map)
      ensureNextLegLayer(map)
      updateLineSource(map, 'route-line', routeState.routeGeometry)
      updateLineSource(map, 'next-leg', nextLegGeometry)
      if (routeState.stops.length) {
        updateStopMarkers(map, markersRef, routeState.stops, routeState.currentStopIndex)
      }
    })
    map.on('error', (event) => {
      const message = event?.error?.message || 'Unable to load map'
      setErrorMessage(message)
    })
    map.on('moveend', () => {
      const center = map.getCenter()
      setRouteState((prev) => ({
        ...prev,
        mapView: {
          center: [center.lng, center.lat],
          zoom: map.getZoom(),
          bearing: map.getBearing(),
          pitch: map.getPitch(),
        },
      }))
    })
    mapRef.current = map
    return () => map.remove()
  }, [])

  useEffect(() => {
    const map = mapRef.current
    if (!map || !map.isStyleLoaded()) return
    updateLineSource(map, 'route-line', routeState.routeGeometry)
    updateLineSource(map, 'next-leg', nextLegGeometry)
    updateStopMarkers(map, markersRef, routeState.stops, routeState.currentStopIndex)
  }, [nextLegGeometry, routeState.currentStopIndex, routeState.routeGeometry, routeState.stops])

  useEffect(() => {
    if (!searchValue.trim()) {
      setSuggestions([])
      return
    }
    if (searchValue.trim().length < 3) {
      setSuggestions([])
      return
    }
    const handler = window.setTimeout(async () => {
      try {
        const results = await fetchAutocomplete(searchValue.trim())
        setSuggestions(results)
      } catch {
        setSuggestions([])
      }
    }, 300)
    return () => window.clearTimeout(handler)
  }, [searchValue])

  useEffect(() => {
    if (!navigator.geolocation) {
      setLocationError('Unable to get location')
      return
    }
    const watchId = navigator.geolocation.watchPosition(
      async (position) => {
        const coords: [number, number] = [
          position.coords.longitude,
          position.coords.latitude,
        ]
        setCurrentPosition(coords)
        const map = mapRef.current
        if (map) {
          if (!currentMarkerRef.current) {
            const el = document.createElement('div')
            el.className = 'current-marker'
            currentMarkerRef.current = new mapboxgl.Marker({ element: el })
              .setLngLat(coords)
              .addTo(map)
          } else {
            currentMarkerRef.current.setLngLat(coords)
          }
          if (routeRef.current.stops.length) {
            map.easeTo({ center: coords, duration: 800 })
          }
        }
        if (Date.now() - lastFirebaseUpdate.current > 4000) {
          lastFirebaseUpdate.current = Date.now()
          try {
            await fetch(`${API_BASE}/api/driver/update`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                name: driverName,
                lat: coords[1],
                lng: coords[0],
                updatedAt: Date.now(),
              }),
            })
          } catch {
            // Ignore tracking errors to avoid blocking navigation updates.
          }
        }
        const { stops, currentStopIndex } = routeRef.current
        if (stops.length && currentStopIndex < stops.length) {
          const nextStop = stops[currentStopIndex]
          if (distanceMeters(coords, nextStop.coords) <= ARRIVAL_THRESHOLD_METERS) {
            setRouteState((prev) => ({
              ...prev,
              currentStopIndex: Math.min(prev.currentStopIndex + 1, prev.stops.length),
            }))
          } else if (Date.now() - lastNextLegUpdate.current > 6000) {
            lastNextLegUpdate.current = Date.now()
            try {
              const info = await fetchNextLegGeometry(coords, nextStop.coords)
              setNextLegGeometry(info.geometry)
              setLiveNextLegDuration(info.duration)
            } catch {
              setNextLegGeometry(null)
              setLiveNextLegDuration(null)
            }
          }
        } else {
          setNextLegGeometry(null)
          setLiveNextLegDuration(null)
        }
      },
      () => setLocationError('Unable to get location'),
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 5000 }
    )
    return () => navigator.geolocation.clearWatch(watchId)
  }, [driverName])

  useEffect(() => {
    setLiveNextLegDuration(null)
  }, [routeState.currentStopIndex])

  const addSuggestedAddress = (entry: {
    id: string
    label: string
    coords: [number, number]
  }) => {
    if (routeState.addresses.length >= MAX_ADDRESSES) return
    setRouteState((prev) => ({
      ...prev,
      addresses: [
        ...prev.addresses,
        { id: crypto.randomUUID(), label: entry.label, manual: false, coords: entry.coords },
      ],
    }))
    setSearchValue('')
    setSuggestions([])
  }

  const addManualAddress = () => {
    if (!manualValue.trim()) return
    if (routeState.addresses.length >= MAX_ADDRESSES) return
    setRouteState((prev) => ({
      ...prev,
      addresses: [
        ...prev.addresses,
        { id: crypto.randomUUID(), label: manualValue.trim(), manual: true },
      ],
    }))
    setManualValue('')
  }

  const removeAddress = (id: string) => {
    setRouteState((prev) => ({
      ...prev,
      addresses: prev.addresses.filter((entry) => entry.id !== id),
    }))
  }

  const handleGenerateRoute = async (override?: AddressEntry[]) => {
    setErrorMessage(null)
    setStatusMessage(null)
    if (!MAPBOX_TOKEN) {
      setErrorMessage('Mapbox token missing')
      return
    }
    const addressInput = override ?? routeState.addresses
    if (!addressInput.length) {
      setErrorMessage('Add at least one address')
      return
    }
    setIsGenerating(true)
    try {
      let startLocation: [number, number] | null = null
      let useFirstAddressAsStart = false
      try {
        startLocation = await getCurrentPosition()
      } catch {
        if (backupStartValue.trim()) {
          const backupResult = routeState.backupStartCoords
            ? { coords: routeState.backupStartCoords, label: backupStartValue.trim() }
            : await geocodeAddress(backupStartValue.trim())
          if (!backupResult) {
            setErrorMessage('Backup start address not found')
            setIsGenerating(false)
            return
          }
          startLocation = backupResult.coords
          setRouteState((prev) => ({
            ...prev,
            backupStartLabel: backupStartValue.trim(),
            backupStartCoords: backupResult.coords,
          }))
          setStatusMessage('Using backup start location')
        } else {
          useFirstAddressAsStart = true
        }
      }
      const geocoded: AddressEntry[] = []
      const failed: string[] = []

      for (const entry of addressInput) {
        if (entry.coords) {
          geocoded.push(entry)
          continue
        }
        const result = await geocodeAddress(entry.label)
        if (!result) {
          failed.push(entry.label)
        } else {
          geocoded.push({
            ...entry,
            label: result.label,
            coords: result.coords,
          })
        }
      }

      if (failed.length) {
        setErrorMessage(`Address not found: ${failed.join(', ')}`)
        setIsGenerating(false)
        return
      }

      if (useFirstAddressAsStart) {
        startLocation = geocoded[0].coords!
      }

      if (useFirstAddressAsStart && geocoded.length === 1) {
        setRouteState((prev) => ({
          ...prev,
          addresses: geocoded,
          stopOrder: [geocoded[0].id],
          stops: [
            {
              id: geocoded[0].id,
              label: geocoded[0].label,
              coords: geocoded[0].coords!,
            },
          ],
          currentStopIndex: 0,
          routeGeometry: null,
          legs: [],
          totalDistance: 0,
          totalDuration: 0,
        }))
        setStatusMessage('Route generated (start at first address)')
        setIsGenerating(false)
        return
      }

      const optimizationAddresses = useFirstAddressAsStart
        ? geocoded.slice(1)
        : geocoded
      const optimized = await optimizeRoute(startLocation!, optimizationAddresses)
      const startStop = useFirstAddressAsStart
        ? {
            id: geocoded[0].id,
            label: geocoded[0].label,
            coords: geocoded[0].coords!,
          }
        : null
      const stops = startStop ? [startStop, ...optimized.stops] : optimized.stops
      const legs = startStop
        ? [{ distance: 0, duration: 0 }, ...optimized.legs]
        : optimized.legs
      const stopOrder = stops.map((stop) => stop.id)
      setRouteState((prev) => ({
        ...prev,
        addresses: geocoded,
        stopOrder,
        stops,
        currentStopIndex: 0,
        routeGeometry: optimized.geometry,
        legs,
        totalDistance: optimized.totalDistance,
        totalDuration: optimized.totalDuration,
      }))
      setStatusMessage('Route generated')
      const map = mapRef.current
      if (map && optimized.geometry.coordinates.length) {
        const bounds = optimized.geometry.coordinates.reduce(
          (b, coord) => b.extend(coord as [number, number]),
          new mapboxgl.LngLatBounds(
            optimized.geometry.coordinates[0] as [number, number],
            optimized.geometry.coordinates[0] as [number, number]
          )
        )
        map.fitBounds(bounds, { padding: 40, duration: 800 })
      }
    } catch (error) {
      setErrorMessage((error as Error).message || 'Unable to generate route')
    } finally {
      setIsGenerating(false)
    }
  }

  const handleClearRoute = () => {
    setRouteState({ ...defaultRouteState })
    setBackupStartValue('')
    setNextLegGeometry(null)
    clearRouteState()
    setStatusMessage('Route cleared')
    const map = mapRef.current
    if (map) {
      updateLineSource(map, 'route-line', null)
      updateLineSource(map, 'next-leg', null)
      updateStopMarkers(map, markersRef, [], 0)
      map.easeTo({ center: DEFAULT_CENTER, zoom: 12, bearing: 0, pitch: 0 })
    }
  }

  const decodePayload = (payload: string) => {
    const normalized = payload.replace(/-/g, '+').replace(/_/g, '/')
    const pad = normalized.length % 4
    const padded = pad ? normalized + '='.repeat(4 - pad) : normalized
    const json = atob(padded)
    return JSON.parse(json)
  }

  const handleImportPayload = async (payload?: unknown) => {
    setImportStatus(null)
    setErrorMessage(null)
    try {
      const parsed = payload ?? JSON.parse(importValue)
      const response = await fetch(`${API_BASE}/api/route/import`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(parsed),
      })
      if (!response.ok) {
        const text = await response.text()
        throw new Error(text || 'Import failed')
      }
      const data = (await response.json()) as { addresses: AddressEntry[] }
      const imported = data.addresses ?? []
      const hasFailed = imported.some((entry) => entry.status === 'failed')
      setRouteState((prev) => ({
        ...prev,
        addresses: imported,
        routeGeometry: null,
        stops: [],
        legs: [],
        stopOrder: [],
        currentStopIndex: 0,
        totalDistance: 0,
        totalDuration: 0,
      }))
      if (hasFailed) {
        setImportStatus('Import completed with unresolved addresses.')
        return
      }
      setImportStatus('Import completed. Generating route...')
      setPendingImportGenerate(imported)
    } catch (error) {
      setImportStatus((error as Error).message)
    }
  }

  const handleRetryAddress = async (entry: AddressEntry) => {
    if (!entry.label.trim()) return
    try {
      const result = await geocodeAddress(entry.label.trim())
      if (!result) {
        setRouteState((prev) => ({
          ...prev,
          addresses: prev.addresses.map((addr) =>
            addr.id === entry.id
              ? { ...addr, status: 'failed', note: 'Address not found. Edit to retry.' }
              : addr
          ),
        }))
        return
      }
      setRouteState((prev) => ({
        ...prev,
        addresses: prev.addresses.map((addr) =>
          addr.id === entry.id
            ? {
                ...addr,
                label: result.label,
                coords: result.coords,
                status: 'ok',
                note: undefined,
              }
            : addr
        ),
      }))
    } catch (error) {
      setErrorMessage((error as Error).message)
    }
  }

  useEffect(() => {
    if (importHandledRef.current) return
    const url = new URL(window.location.href)
    const payload = url.searchParams.get('payload')
    if (!payload) return
    try {
      const decoded = decodePayload(payload)
      importHandledRef.current = true
      setImportValue(JSON.stringify(decoded, null, 2))
      setImportOpen(true)
      void handleImportPayload(decoded)
      url.searchParams.delete('payload')
      const nextPath = url.pathname === '/import' ? '/' : url.pathname
      window.history.replaceState(null, '', `${nextPath}${url.search}`)
    } catch (error) {
      setImportStatus('Invalid import payload')
      setImportOpen(true)
    }
  }, [])

  useEffect(() => {
    if (!pendingImportGenerate) return
    void handleGenerateRoute(pendingImportGenerate)
    setPendingImportGenerate(null)
  }, [pendingImportGenerate])

  const orderedStops = routeState.stops
  const totalTravelTime = formatDuration(routeState.totalDuration)
  const etaByStop = orderedStops.map((_, index) => {
    if (index < routeState.currentStopIndex) {
      return formatDuration(0)
    }
    const baseDuration =
      liveNextLegDuration ??
      routeState.legs[routeState.currentStopIndex]?.duration ??
      0
    if (index === routeState.currentStopIndex) {
      return formatDuration(baseDuration)
    }
    const remainingLegs = routeState.legs.slice(
      routeState.currentStopIndex + 1,
      index + 1
    )
    const remaining = remainingLegs.reduce((sum, leg) => sum + leg.duration, 0)
    return formatDuration(baseDuration + remaining)
  })

  return (
    <div className="app">
      <header className="app-header">
        <div>
          <h1>CheeseExpress Driver</h1>
          <p className="muted">Driver: {driverName}</p>
        </div>
        <div className="badge">Mobile Prototype</div>
      </header>

      {!MAPBOX_TOKEN && (
        <div className="alert alert-error">Mapbox token missing</div>
      )}
      {locationError && <div className="alert alert-error">{locationError}</div>}
      {errorMessage && <div className="alert alert-error">{errorMessage}</div>}
      {statusMessage && <div className="alert alert-ok">{statusMessage}</div>}

      <div className="map-container" ref={mapContainerRef} />

      <section className="panel">
        <div className="panel-row">
          <div>
            <label className="label">Add address</label>
            <input
              value={searchValue}
              onChange={(event) => setSearchValue(event.target.value)}
              placeholder="Search address"
              disabled={routeState.routeGeometry !== null}
            />
          </div>
          <button
            className="secondary"
            onClick={() => setManualMode((prev) => !prev)}
            disabled={routeState.routeGeometry !== null}
          >
            {manualMode ? 'Hide manual' : 'Enter manually'}
          </button>
        </div>

        <div className="import-panel">
          <div className="panel-row">
            <label className="label">Import route JSON</label>
            <button
              className="secondary import-toggle"
              onClick={() => setImportOpen((prev) => !prev)}
            >
              {importOpen ? 'Hide' : 'Show'}
            </button>
          </div>
          {importOpen && (
            <>
              <textarea
                className="textarea"
                rows={6}
                value={importValue}
                onChange={(event) => setImportValue(event.target.value)}
                placeholder="Paste JSON payload here"
              />
              <div className="panel-actions">
                <button className="secondary" onClick={handleImportPayload}>
                  Import & Generate
                </button>
                {importStatus && <div className="muted">{importStatus}</div>}
              </div>
            </>
          )}
        </div>

        {suggestions.length > 0 && (
          <div className="suggestions">
            {suggestions.map((entry) => (
              <button
                key={entry.id}
                className="suggestion"
                onClick={() => addSuggestedAddress(entry)}
              >
                {entry.label}
              </button>
            ))}
          </div>
        )}

        {manualMode && (
          <div className="panel-row">
            <input
              value={manualValue}
              onChange={(event) => setManualValue(event.target.value)}
              placeholder="Enter address manually"
              disabled={routeState.routeGeometry !== null}
            />
            <button
              onClick={addManualAddress}
              disabled={routeState.routeGeometry !== null}
            >
              Add Address
            </button>
          </div>
        )}

        <div>
          <label className="label">Backup start address</label>
          <input
            value={backupStartValue}
            onChange={(event) => {
              setBackupStartValue(event.target.value)
              setRouteState((prev) => ({
                ...prev,
                backupStartLabel: event.target.value,
                backupStartCoords: null,
              }))
            }}
            placeholder="Used if GPS is blocked"
          />
        </div>

        <div className="address-count">
          {routeState.addresses.length}/{MAX_ADDRESSES} stops
        </div>

        <div className="address-list">
          {routeState.addresses.length === 0 && (
            <p className="muted">No addresses added yet.</p>
          )}
          {routeState.addresses.map((entry, index) => (
            <div key={entry.id} className="address-item">
              <div>
                <div className="address-title">
                  {index + 1}. {entry.label}
                </div>
                {entry.status === 'failed' ? (
                  <>
                    <div className="muted">{entry.note ?? 'Needs review'}</div>
                    <input
                      value={entry.label}
                      onChange={(event) =>
                        setRouteState((prev) => ({
                          ...prev,
                          addresses: prev.addresses.map((addr) =>
                            addr.id === entry.id
                              ? { ...addr, label: event.target.value }
                              : addr
                          ),
                        }))
                      }
                      placeholder="Edit address and retry"
                    />
                    <button
                      className="secondary"
                      onClick={() => handleRetryAddress(entry)}
                    >
                      Retry
                    </button>
                  </>
                ) : (
                  entry.manual && <div className="muted">Manual entry</div>
                )}
              </div>
              <button
                className="danger"
                onClick={() => removeAddress(entry.id)}
                disabled={routeState.routeGeometry !== null}
              >
                Remove
              </button>
            </div>
          ))}
        </div>

        <div className="panel-actions">
          <button
            onClick={() => handleGenerateRoute()}
            disabled={isGenerating || routeState.addresses.length === 0}
          >
            {isGenerating ? 'Generating...' : 'Generate Route'}
          </button>
          <button className="danger" onClick={handleClearRoute}>
            Clear Route
          </button>
        </div>
      </section>

      <section className="panel">
        <h2>Route Progress</h2>
        {routeState.routeGeometry ? (
          <>
            <div className="stats">
              <div>Total travel time: {totalTravelTime}</div>
              <div>Total distance: {formatDistance(routeState.totalDistance)}</div>
            </div>
            <div className="address-list">
              {orderedStops.map((stop, index) => (
                <div key={stop.id} className="address-item">
                  <div>
                    <div className="address-title">
                      {index + 1}. {stop.label}
                    </div>
                    <div className="muted">
                      Total travel time: {totalTravelTime}
                    </div>
                    <div className="muted">
                      ETA: {etaByStop[index]}
                      {index < routeState.currentStopIndex ? ' • Completed' : ''}
                      {index === routeState.currentStopIndex ? ' • Next stop' : ''}
                    </div>
                  </div>
                </div>
              ))}
            </div>
            {routeState.currentStopIndex >= orderedStops.length && (
              <div className="alert alert-ok">Route complete</div>
            )}
          </>
        ) : (
          <p className="muted">Generate a route to start navigation.</p>
        )}
        {currentPosition && (
          <div className="muted">
            Current location: {currentPosition[1].toFixed(5)},{' '}
            {currentPosition[0].toFixed(5)}
          </div>
        )}
      </section>

      <section className="panel">
        <div className="panel-row">
          <h2>Debug</h2>
          <button
            className="secondary debug-toggle"
            onClick={() => setDebugOpen((prev) => !prev)}
          >
            {debugOpen ? 'Hide' : 'Show'}
          </button>
        </div>
        {debugOpen ? (
          <div className="debug-panel">
            {debugEntries.length === 0 && (
              <p className="muted">No debug events yet.</p>
            )}
            {debugEntries.map((entry) => (
              <div key={`${entry.time}-${entry.message}`} className="debug-entry">
                <div className={entry.type === 'error' ? 'debug-error' : 'debug-info'}>
                  {entry.type.toUpperCase()}
                </div>
                <div>
                  <div className="debug-message">{entry.message}</div>
                  <div className="muted">{entry.time}</div>
                  {entry.details && (
                    <pre className="debug-details">
                      {JSON.stringify(entry.details, null, 2)}
                    </pre>
                  )}
                </div>
              </div>
            ))}
          </div>
        ) : (
          <p className="muted">Open to see Mapbox request details.</p>
        )}
      </section>
    </div>
  )
}

export default DriverPage
