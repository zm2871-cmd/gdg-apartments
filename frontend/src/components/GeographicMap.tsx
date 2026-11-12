import { useEffect, useRef, useState } from 'react'
import { LngLatBounds, Map, Marker, NavigationControl } from 'maplibre-gl'
import type { Coordinates, NearbyMarker } from '../domain'
import 'maplibre-gl/dist/maplibre-gl.css'

type PointMarker = NearbyMarker & { point: { kind: 'geographic' } & Coordinates }

export default function GeographicMap({ position, styleUrl, markers, selected, onSelect }: {
  position: Coordinates; styleUrl: string; markers: PointMarker[]; selected?: string; onSelect: (id: string) => void
}) {
  const host = useRef<HTMLDivElement>(null)
  const map = useRef<Map | null>(null)
  const issueMarkers = useRef<Marker[]>([])
  const [status, setStatus] = useState<'loading' | 'ready' | 'unavailable'>('loading')
  const { lng, lat } = position

  useEffect(() => {
    if (!host.current) return
    let instance: Map | undefined
    let loaded = false
    try {
      instance = new Map({
        container: host.current, style: styleUrl, center: [lng, lat], zoom: 15.5, scrollZoom: false,
        cooperativeGestures: true, dragRotate: false,
      })
      map.current = instance
      instance.addControl(new NavigationControl({ showCompass: false }), 'top-right')
      const building = document.createElement('span')
      building.className = 'geo-building'
      building.textContent = '●'
      building.title = 'Selected building'
      new Marker({ element: building }).setLngLat([lng, lat]).addTo(instance)
      instance.once('load', () => { loaded = true; setStatus('ready') })
      instance.on('error', () => { if (!loaded) setStatus('unavailable') })
    } catch {
      setStatus('unavailable')
    }
    return () => { instance?.remove(); map.current = null }
  }, [lat, lng, styleUrl])

  useEffect(() => {
    const instance = map.current
    if (!instance || status !== 'ready') return
    issueMarkers.current = markers.map(marker => {
      const element = document.createElement('button')
      element.type = 'button'
      element.className = 'geo-pin pin-' + marker.category
      element.setAttribute('aria-label', marker.title)
      element.onclick = () => onSelect(marker.id)
      return new Marker({ element }).setLngLat([marker.point.lng, marker.point.lat]).addTo(instance)
    })
    return () => { issueMarkers.current.forEach(marker => marker.remove()); issueMarkers.current = [] }
  }, [markers, onSelect, status])

  useEffect(() => {
    issueMarkers.current.forEach((marker, index) => {
      marker.getElement().setAttribute('aria-pressed', String(markers[index]?.id === selected))
    })
  }, [markers, selected, status])

  useEffect(() => {
    if (!map.current || status !== 'ready' || !markers.length) return
    const bounds = new LngLatBounds([lng, lat], [lng, lat])
    markers.forEach(marker => bounds.extend([marker.point.lng, marker.point.lat]))
    map.current.fitBounds(bounds, { padding: 38, maxZoom: 16, duration: 0 })
  }, [lat, lng, markers, status])

  return <div className="geo-map">
    <div ref={host} className="geo-canvas" aria-label="Neighborhood street map" />
    {status !== 'ready' && <div className="map-placeholder" role="status">{status === 'loading' ? 'Loading street map…' : 'Street map unavailable. Browse the records below.'}</div>}
  </div>
}
