// Original NYC-style skyline art: walk-ups and towers with rooftop water towers and lit windows.
// Generated from a fixed seed so it renders identically on every visit.

export function WaterTowerIcon({ size = 18 }: { size?: number }) {
  return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9"
    strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M6 7.5 12 3l6 4.5" />
    <rect x="6" y="7.5" width="12" height="8" rx="1.2" />
    <path d="M8 15.5 6.5 21M16 15.5l1.5 5.5M12 15.5V21M7.3 18.5h9.4" />
  </svg>
}

function random(seed: number) {
  return () => {
    seed = (seed * 16807) % 2147483647
    return seed / 2147483647
  }
}

type Building = { x: number; width: number; height: number; tower: boolean; spire: boolean }

function layout(): Building[] {
  const next = random(11)
  const buildings: Building[] = []
  let x = -10
  while (x < 1450) {
    const tall = next() > .78
    const width = tall ? 46 + next() * 34 : 38 + next() * 52
    const height = tall ? 120 + next() * 85 : 42 + next() * 78
    buildings.push({ x, width, height, tower: !tall && next() > .45, spire: tall && next() > .55 })
    x += width + (next() > .7 ? 4 : 0)
  }
  return buildings
}

const buildings = layout()

function windows(building: Building, index: number) {
  const next = random(index * 97 + 5)
  const cells = []
  const top = 220 - building.height + 12
  for (let y = top; y < 210; y += 13) {
    for (let x = building.x + 7; x < building.x + building.width - 9; x += 11) {
      const lit = next()
      if (lit > .62) cells.push(<rect key={`${x}-${y}`} x={x} y={y} width="4.5" height="6" rx=".6" opacity={lit > .9 ? .95 : .55} />)
    }
  }
  return cells
}

function waterTower(building: Building, index: number) {
  const cx = building.x + building.width * (index % 2 ? .3 : .68)
  const base = 220 - building.height
  return <g key={'tower-' + index}>
    <path d={`M${cx - 7} ${base} L${cx - 5} ${base - 9} M${cx + 7} ${base} L${cx + 5} ${base - 9} M${cx} ${base} V${base - 9}`} stroke="currentColor" strokeWidth="1.6" />
    <rect x={cx - 8} y={base - 23} width="16" height="14" rx="1.5" />
    <path d={`M${cx - 9} ${base - 23} L${cx} ${base - 31} L${cx + 9} ${base - 23} Z`} />
  </g>
}

export function Skyline({ className }: { className?: string }) {
  return <svg className={className} viewBox="0 0 1440 220" preserveAspectRatio="xMidYMax slice" aria-hidden="true">
    <g className="skyline-buildings" fill="currentColor">
      {buildings.map((building, index) => <g key={index}>
        <rect x={building.x} y={220 - building.height} width={building.width} height={building.height} />
        {building.spire && <path d={`M${building.x + building.width * .3} ${220 - building.height}
          L${building.x + building.width * .5} ${220 - building.height - 34} L${building.x + building.width * .7} ${220 - building.height} Z`} />}
        {building.tower && waterTower(building, index)}
      </g>)}
    </g>
    <g className="skyline-windows">{buildings.map(windows)}</g>
  </svg>
}
