import { lazy, Suspense, useCallback, useMemo, useState } from 'react'
import { Bug, CircleHelp, House, MapPin, Volume2 } from 'lucide-react'
import { categories, categoryLabels, formatDate, type Building, type Coordinates, type GradeCategory, type NearbyMarker } from '../domain'
import { SourceLabel } from './Grades'
import { Skeleton } from './ui'

const GeographicMap = lazy(() => import('./GeographicMap'))
const starterFilters = ['noise', 'pests'] as const
type GeographicMarker = NearbyMarker & { point: { kind: 'geographic' } & Coordinates }

export default function NeighborhoodMap({ building, markers }: { building: Building; markers: NearbyMarker[] }) {
  const [filter, setFilter] = useState<GradeCategory | 'all'>('all')
  const [selected, setSelected] = useState<string>()
  const [buildingSelected, setBuildingSelected] = useState(false)
  const styleUrl = import.meta.env.VITE_MAP_STYLE_URL?.trim()
  const filters = categories.filter(category => !starterFilters.some(starter => starter === category) && markers.some(marker => marker.category === category))
  const filtered = useMemo(() => markers.filter(marker => filter === 'all' || marker.category === filter), [markers, filter])
  const geographic = useMemo(() => filtered.filter((marker): marker is GeographicMarker => marker.point.kind === 'geographic'), [filtered])
  const active = filtered.find(marker => marker.id === selected)
  const select = useCallback((id: string) => {
    setBuildingSelected(false)
    setSelected(previous => previous === id ? undefined : id)
  }, [])

  return <section className="panel neighborhood" aria-labelledby="nearby-title">
    {building.sample
      ? <div className="map-illustration" role="group" aria-label="Illustrated neighborhood map">
        <span className="map-caption">Illustrative block map · sample locations</span>
        <div className="map-block block-one" aria-hidden="true" /><div className="map-block block-two" aria-hidden="true" />
        <div className="map-block block-three" aria-hidden="true" /><div className="map-block block-four" aria-hidden="true" />
        <div className="map-block block-five" aria-hidden="true" /><div className="map-block block-six" aria-hidden="true" />
        <div className="map-road road-a" aria-hidden="true"><span>N 6TH ST</span></div>
        <div className="map-road road-b" aria-hidden="true"><span>N 4TH ST</span></div>
        <div className="map-road road-c" aria-hidden="true"><span>BERRY ST</span></div>
        <div className="map-road road-d" aria-hidden="true"><span>WYTHE AVE</span></div>
        <div className="map-road road-e" aria-hidden="true" />
        <div className="map-radius" aria-hidden="true" />
        <button className="map-building" aria-label={'Selected building: ' + building.address} aria-pressed={buildingSelected}
          onClick={() => { setSelected(undefined); setBuildingSelected(!buildingSelected) }}><House size={17} /></button>
        {filtered.map(marker => {
          if (marker.point.kind !== 'illustration') return null
          const Icon = marker.category === 'noise' ? Volume2 : marker.category === 'pests' ? Bug : CircleHelp
          return <button key={marker.id} className={'map-pin pin-' + marker.category} aria-pressed={selected === marker.id}
            aria-label={marker.title} onClick={() => select(marker.id)} style={{ left: marker.point.x + '%', top: marker.point.y + '%' }}>
            <Icon size={13} />
          </button>
        })}
      </div>
      : building.position && styleUrl
        ? <Suspense fallback={<Skeleton variant="map" count={1} label="Loading neighborhood map" />}>
          <GeographicMap position={building.position} styleUrl={styleUrl} markers={geographic} selected={selected} onSelect={select} />
        </Suspense>
        : <div className="map-placeholder"><MapPin size={20} /> Street map unavailable.</div>}
    <div className="neighborhood-body">
      <h2 id="nearby-title">What’s nearby?</h2>
      <p className="muted">{building.sample ? 'Explore sample issues around the building.' : 'Explore nearby issues with location data.'}</p>
      <div className="filter-row" role="group" aria-label="Filter nearby issues">
        {(['all', ...starterFilters, ...filters] as const).map(value => <button key={value} type="button" className="filter"
          aria-pressed={filter === value} onClick={() => { setFilter(value); setSelected(undefined); setBuildingSelected(false) }}>
          {value === 'all' ? 'All' : value === 'noise' ? 'Noise' : value === 'pests' ? 'Pests' : categoryLabels[value]}
        </button>)}
      </div>
      <div aria-live="polite">
        {buildingSelected && <div className="marker-detail"><strong>{building.address}</strong><p>Selected sample building</p></div>}
        {active && <div className="marker-detail"><strong>{active.title}</strong><p>{active.description}</p>
          <small><time dateTime={active.date}>{formatDate(active.date)}</time> · <SourceLabel source={active.source} /></small></div>}
        {!filtered.length && <p className="nearby-empty muted">No mapped issues were supplied for this selection.</p>}
      </div>
      {filtered.length > 0 && <details className="marker-list"><summary>Browse {filtered.length} mapped {filtered.length === 1 ? 'issue' : 'issues'}</summary>
        <ul>{filtered.map(marker => <li key={marker.id}><button aria-pressed={selected === marker.id}
          onClick={() => select(marker.id)}>{marker.title}</button></li>)}</ul>
      </details>}
    </div>
  </section>
}
