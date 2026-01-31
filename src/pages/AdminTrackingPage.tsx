import { useEffect, useRef, useState } from 'react'
import mapboxgl from 'mapbox-gl'
import { MAPBOX_TOKEN } from '../lib/mapbox'

type DriverLocation = {
  name: string
  lat: number
  lng: number
  updatedAt: number
}

const ACTIVE_WINDOW_MS = 10 * 60 * 1000
const API_BASE = (import.meta.env.VITE_API_BASE as string | undefined) ?? ''
const DEFAULT_CENTER: [number, number] = [-6.3941, 53.3242]

const AdminTrackingPage = () => {
  const [errorMessage, setErrorMessage] = useState<string | null>(null)
  const mapContainerRef = useRef<HTMLDivElement | null>(null)
  const mapRef = useRef<mapboxgl.Map | null>(null)
  const markersRef = useRef<Record<string, mapboxgl.Marker>>({})

  useEffect(() => {
    if (!MAPBOX_TOKEN || mapRef.current || !mapContainerRef.current) return
    mapboxgl.accessToken = MAPBOX_TOKEN
    const map = new mapboxgl.Map({
      container: mapContainerRef.current,
      style: 'mapbox://styles/mapbox/streets-v12',
      center: DEFAULT_CENTER,
      zoom: 11,
    })
    map.addControl(new mapboxgl.NavigationControl(), 'bottom-right')
    map.on('error', (event) => {
      const message = event?.error?.message || 'Unable to load map'
      setErrorMessage(message)
    })
    mapRef.current = map
    return () => map.remove()
  }, [])

  useEffect(() => {
    let timer: number | null = null
    const pollDrivers = async () => {
      try {
        const response = await fetch(`${API_BASE}/api/driver/active`)
        if (!response.ok) throw new Error('Unable to load drivers')
        const data = (await response.json()) as { drivers: DriverLocation[] }
        const now = Date.now()
        const activeDrivers = data.drivers.filter(
          (driver) => now - driver.updatedAt <= ACTIVE_WINDOW_MS
        )
        const map = mapRef.current
        if (!map) return

        const nextMarkers: Record<string, mapboxgl.Marker> = {}
        activeDrivers.forEach((driver) => {
          const existing = markersRef.current[driver.name]
          if (existing) {
            existing.setLngLat([driver.lng, driver.lat])
            nextMarkers[driver.name] = existing
          } else {
            const marker = new mapboxgl.Marker({ color: '#00d2ff' })
              .setLngLat([driver.lng, driver.lat])
              .setPopup(
                new mapboxgl.Popup({ offset: 20 }).setText(
                  `${driver.name} (active)`
                )
              )
              .addTo(map)
            nextMarkers[driver.name] = marker
          }
        })

        Object.values(markersRef.current).forEach((marker) => {
          if (!Object.values(nextMarkers).includes(marker)) {
            marker.remove()
          }
        })
        markersRef.current = nextMarkers
      } catch (error) {
        setErrorMessage((error as Error).message)
      }
    }
    pollDrivers()
    timer = window.setInterval(pollDrivers, 5000)
    return () => {
      if (timer) window.clearInterval(timer)
    }
  }, [])

  return (
    <div className="app">
      <header className="app-header">
        <div>
          <h1>Admin Tracking</h1>
          <p className="muted">Active drivers (last 10 minutes)</p>
        </div>
        <div className="badge">Live Map</div>
      </header>
      {!MAPBOX_TOKEN && (
        <div className="alert alert-error">Mapbox token missing</div>
      )}
      {errorMessage && <div className="alert alert-error">{errorMessage}</div>}
      <div className="map-container" ref={mapContainerRef} />
    </div>
  )
}

export default AdminTrackingPage
