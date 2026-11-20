// Original line art: a one-point-perspective NYC street lined with walk-up apartment buildings
// (windows, fire escapes, rooftop water towers).
// Geometry is projected from simple 3D coordinates so everything converges on one vanishing point.

const WIDTH = 1440
const HEIGHT = 560
const VANISH_X = 760
const HORIZON = 250
const FOCAL = 620
const EYE = 1.7        // camera height, metres
const STREET = 9       // facade distance from the centre of the street
const STORY = 3.2

type Point = [number, number]
const project = (x: number, y: number, z: number): Point =>
  [VANISH_X + FOCAL * x / z, HORIZON + FOCAL * (EYE - y) / z]
const line = (a: Point, b: Point) => `M${a[0].toFixed(1)} ${a[1].toFixed(1)}L${b[0].toFixed(1)} ${b[1].toFixed(1)}`
const quad = (points: Point[]) => 'M' + points.map(([x, y]) => `${x.toFixed(1)} ${y.toFixed(1)}`).join('L') + 'Z'

function random(seed: number) {
  return () => (seed = (seed * 16807) % 2147483647) / 2147483647
}

type Building = { side: -1 | 1; start: number; end: number; stories: number; tower: boolean; fireEscape: boolean }

function street(): Building[] {
  const next = random(29)
  const buildings: Building[] = []
  for (const side of [-1, 1] as const) {
    let z = 3.5
    while (z < 150) {
      if (z > 40 && z < 52) { z = 52; continue }   // a cross street
      const depth = 6 + next() * 6
      buildings.push({ side, start: z, end: z + depth, stories: 4 + Math.floor(next() * 3), tower: next() > .55, fireEscape: next() > .4 })
      z += depth + (next() > .8 ? 1.5 : 0)
    }
  }
  return buildings
}

function drawBuilding(b: Building) {
  const x = b.side * STREET
  const height = b.stories * STORY + 1
  const parts: string[] = []
  const corner = (y: number, z: number) => project(x, y, z)
  // Facade outline and cornice
  parts.push(quad([corner(0, b.start), corner(height, b.start), corner(height, b.end), corner(0, b.end)]))
  parts.push(line(corner(height + .5, b.start), corner(height + .5, b.end)))
  parts.push(line(corner(height, b.start), corner(height + .5, b.start)))
  // Floor lines and windows
  const bays = Math.max(2, Math.round((b.end - b.start) / 2.4))
  const bay = (b.end - b.start) / bays
  for (let story = 0; story < b.stories; story++) {
    const base = story * STORY + 1
    if (story > 0) parts.push(line(corner(base, b.start), corner(base, b.end)))
    for (let i = 0; i < bays; i++) {
      const z0 = b.start + i * bay + bay * .3, z1 = z0 + bay * .4
      parts.push(quad([project(x, base + .9, z0), project(x, base + 2.4, z0), project(x, base + 2.4, z1), project(x, base + .9, z1)]))
    }
  }
  // Fire escape: a platform per floor with a ladder zig-zagging up the front
  if (b.fireEscape && b.end - b.start > 7) {
    const z0 = b.start + 1.2, z1 = b.start + 4.4, out = x - b.side * .9
    for (let story = 1; story < b.stories; story++) {
      const y = story * STORY + 1
      parts.push(line(project(out, y, z0), project(out, y, z1)))
      parts.push(line(project(out, y + 1, z0), project(out, y + 1, z1)))
      const [from, to] = story % 2 ? [z0, z1] : [z1, z0]
      if (story < b.stories - 1) parts.push(line(project(out, y, from), project(out, y + STORY, to)))
    }
  }
  // Rooftop water tower, set back from the street
  if (b.tower) {
    const tx = x + b.side * 3.5, tz = (b.start + b.end) / 2, top = height + .5
    for (const dx of [-1, 1]) parts.push(line(project(tx + dx, top, tz), project(tx + dx * .8, top + 2.2, tz)))
    parts.push(quad([project(tx - 1.3, top + 2.2, tz), project(tx - 1.3, top + 4.6, tz), project(tx + 1.3, top + 4.6, tz), project(tx + 1.3, top + 2.2, tz)]))
    parts.push(quad([project(tx - 1.5, top + 4.6, tz), project(tx, top + 5.8, tz), project(tx + 1.5, top + 4.6, tz)]))
  }
  return parts.join('')
}

const buildings = street()
const near = buildings.filter(b => b.start < 30).map(drawBuilding).join('')
const far = buildings.filter(b => b.start >= 30).map(drawBuilding).join('')

// Street surface: curbs, centre line and a distant row of buildings closing the view
const ground = [
  line(project(-STREET + 3, 0, 2.5), project(-STREET + 3, 0, 400)),
  line(project(STREET - 3, 0, 2.5), project(STREET - 3, 0, 400)),
  ...Array.from({ length: 22 }, (_, i) => line(project(0, 0, 4 + i * i * .55), project(0, 0, 5.2 + i * i * .55))),
].join('')
const distant = (() => {
  const next = random(7), parts: string[] = []
  for (let x = -60; x < 60;) {
    const width = 8 + next() * 14, height = 25 + next() * 70
    parts.push(quad([project(x, 0, 300), project(x, height, 300), project(x + width, height, 300), project(x + width, 0, 300)]))
    x += width
  }
  return parts.join('')
})()

export function StreetScene({ className }: { className?: string }) {
  return <svg className={className} viewBox={`0 0 ${WIDTH} ${HEIGHT}`} preserveAspectRatio="xMidYMax slice" aria-hidden="true">
    <g className="street-lines" fill="none" stroke="currentColor" strokeWidth="1.2" strokeLinejoin="round">
      <path className="street-far" d={distant + far} />
      <path className="street-ground" d={ground} />
      <path className="street-near" d={near} />
    </g>
  </svg>
}
